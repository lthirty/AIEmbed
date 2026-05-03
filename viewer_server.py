import base64
import binascii
import json
import os
import socket
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path


HOST = "127.0.0.1"
PORT = 8000
STATIC_DIR = Path(__file__).parent / "webapp"
CONFIG_PATH = Path(__file__).parent / "ai_provider_config.json"
DEFAULT_PROVIDER_CONFIG = {
    "providerName": os.getenv("AI_PROVIDER_NAME", "MiniMax Token Plan").strip() or "MiniMax Token Plan",
    "apiBaseUrl": os.getenv("OPENAI_API_URL", "https://api.minimaxi.com/anthropic/v1/messages").strip() or "https://api.minimaxi.com/anthropic/v1/messages",
    "apiKey": os.getenv("OPENAI_API_KEY", "").strip(),
    "model": os.getenv("OPENAI_MODEL", "MiniMax-M2.7").strip() or "MiniMax-M2.7",
}
MAX_LOG_ENTRIES = 200
REQUEST_LOGS: list[dict] = []


def add_log(level: str, stage: str, message: str, details: dict | None = None, request_id: str | None = None) -> dict:
    entry = {
        "ts": time.strftime("%Y-%m-%d %H:%M:%S"),
        "level": level,
        "stage": stage,
        "message": message,
        "details": details or {},
        "requestId": request_id or "",
    }
    REQUEST_LOGS.append(entry)
    if len(REQUEST_LOGS) > MAX_LOG_ENTRIES:
        del REQUEST_LOGS[: len(REQUEST_LOGS) - MAX_LOG_ENTRIES]
    return entry


def load_provider_config() -> dict:
    config = dict(DEFAULT_PROVIDER_CONFIG)
    if CONFIG_PATH.exists():
        try:
            file_config = json.loads(CONFIG_PATH.read_text(encoding="utf-8"))
            if isinstance(file_config, dict):
                config.update({k: str(v) for k, v in file_config.items() if k in config})
        except Exception:
            pass
    return config


def save_provider_config(config: dict) -> None:
    CONFIG_PATH.write_text(
        json.dumps(config, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )


def fetch_camera_snapshot(device_ip: str, request_id: str | None = None) -> bytes:
    snapshot_url = f"http://{device_ip}/capture"
    add_log("info", "snapshot", "Start fetching snapshot", {"url": snapshot_url}, request_id)
    request = urllib.request.Request(
        snapshot_url,
        headers={"User-Agent": "AIEmbedViewer/0.4.0"},
    )
    started = time.time()
    try:
        with urllib.request.urlopen(request, timeout=15) as response:
            content_type = response.headers.get("Content-Type", "")
            body = response.read()
            elapsed_ms = int((time.time() - started) * 1000)
            add_log(
                "info",
                "snapshot",
                "Snapshot fetched successfully",
                {
                    "status": getattr(response, "status", 200),
                    "contentType": content_type,
                    "bytes": len(body),
                    "elapsedMs": elapsed_ms,
                },
                request_id,
            )
            if "image/jpeg" not in content_type.lower():
                raise RuntimeError(f"Unexpected snapshot content type: {content_type or 'unknown'}")
            return body
    except urllib.error.HTTPError as exc:
        error_body = exc.read().decode("utf-8", errors="replace")
        add_log("error", "snapshot", "Snapshot HTTP error", {"status": exc.code, "body": error_body[:500]}, request_id)
        raise RuntimeError(f"Snapshot HTTP error {exc.code}: {error_body}") from exc
    except urllib.error.URLError as exc:
        add_log("error", "snapshot", "Snapshot URL error", {"reason": str(exc.reason)}, request_id)
        raise RuntimeError(f"Snapshot request failed: {exc.reason}") from exc
    except socket.timeout as exc:
        add_log("error", "snapshot", "Snapshot timed out", {"timeoutSeconds": 15}, request_id)
        raise RuntimeError("Snapshot timed out after 15 seconds") from exc


def decode_image_data_url(image_data_url: str, request_id: str | None = None) -> bytes:
    add_log("info", "frame", "Decoding frame from browser preview", {"length": len(image_data_url)}, request_id)
    if not image_data_url.startswith("data:image/"):
        raise RuntimeError("Browser frame is not a valid image data URL.")

    try:
        _, encoded = image_data_url.split(",", 1)
        image_bytes = base64.b64decode(encoded, validate=True)
    except (ValueError, binascii.Error) as exc:
        add_log("error", "frame", "Failed to decode browser frame", {"error": str(exc)}, request_id)
        raise RuntimeError("Browser frame decoding failed.") from exc

    add_log("info", "frame", "Browser frame decoded successfully", {"bytes": len(image_bytes)}, request_id)
    return image_bytes


def infer_api_mode(api_base_url: str) -> str:
    normalized = api_base_url.strip().lower()
    if normalized.endswith("/anthropic/v1/messages") or normalized.endswith("/v1/messages"):
        return "anthropic_messages"
    if normalized.endswith("/chat/completions"):
        return "chat_completions"
    return "responses"


def provider_supports_vision(provider_config: dict) -> tuple[bool, str]:
    provider_name = provider_config.get("providerName", "").strip().lower()
    api_base_url = provider_config.get("apiBaseUrl", "").strip().lower()

    if "deepseek" in provider_name or "api.deepseek.com" in api_base_url:
        return (
            False,
            "当前配置的 DeepSeek chat/completions 接口按官方文档仅支持文本 content，不支持 image_url 多模态输入，所以不能直接做图像分析。",
        )

    if "api.minimaxi.com/anthropic" in api_base_url or "minimax" in provider_name:
        return (
            True,
            "MiniMax 当前按 Anthropic-compatible messages 接口处理图像输入。",
        )

    return True, ""


def build_openai_payload(prompt: str, image_bytes: bytes, chat_history: list[dict[str, str]], model: str, api_mode: str) -> dict:
    image_data_url = "data:image/jpeg;base64," + base64.b64encode(image_bytes).decode("ascii")
    system_text = (
        "You are analyzing the latest frame from an ESP32-CAM video feed. "
        "Answer only from what is visible in the image and the user's question. "
        "If the frame is unclear, say so explicitly."
    )

    if api_mode == "anthropic_messages":
        messages: list[dict] = []
        for message in chat_history[-8:]:
            role = message.get("role", "user")
            text = message.get("text", "").strip()
            if not text or role not in {"user", "assistant"}:
                continue
            messages.append(
                {
                    "role": role,
                    "content": [{"type": "text", "text": text}],
                }
            )

        messages.append(
            {
                "role": "user",
                "content": [
                    {"type": "text", "text": prompt},
                    {
                        "type": "image",
                        "source": {
                            "type": "base64",
                            "media_type": "image/jpeg",
                            "data": base64.b64encode(image_bytes).decode("ascii"),
                        },
                    },
                ],
            }
        )
        return {
            "model": model,
            "max_tokens": 1024,
            "system": system_text,
            "messages": messages,
        }

    if api_mode == "chat_completions":
        messages: list[dict] = [{"role": "system", "content": system_text}]
        for message in chat_history[-8:]:
            role = message.get("role", "user")
            text = message.get("text", "").strip()
            if not text or role not in {"user", "assistant"}:
                continue
            messages.append({"role": role, "content": text})

        messages.append(
            {
                "role": "user",
                "content": [
                    {"type": "text", "text": prompt},
                    {"type": "image_url", "image_url": {"url": image_data_url}},
                ],
            }
        )
        return {
            "model": model,
            "messages": messages,
            "stream": False,
        }

    items: list[dict] = [{"role": "system", "content": [{"type": "input_text", "text": system_text}]}]
    for message in chat_history[-8:]:
        role = message.get("role", "user")
        text = message.get("text", "").strip()
        if not text or role not in {"user", "assistant"}:
            continue
        items.append({"role": role, "content": [{"type": "input_text", "text": text}]})

    items.append(
        {
            "role": "user",
            "content": [
                {"type": "input_text", "text": prompt},
                {"type": "input_image", "image_url": image_data_url},
            ],
        }
    )

    return {
        "model": model,
        "input": items,
    }


def parse_response_text(payload: dict, api_mode: str) -> str:
    if api_mode == "anthropic_messages":
        chunks: list[str] = []
        for item in payload.get("content", []):
            text = item.get("text")
            if isinstance(text, str) and text.strip():
                chunks.append(text.strip())
        if chunks:
            return "\n".join(chunks)

    if api_mode == "chat_completions":
        choices = payload.get("choices", [])
        if choices:
            message = choices[0].get("message", {})
            content = message.get("content")
            if isinstance(content, str) and content.strip():
                return content.strip()
            if isinstance(content, list):
                chunks: list[str] = []
                for item in content:
                    text = item.get("text")
                    if isinstance(text, str) and text.strip():
                        chunks.append(text.strip())
                if chunks:
                    return "\n".join(chunks)

    if isinstance(payload.get("output_text"), str) and payload["output_text"].strip():
        return payload["output_text"].strip()

    chunks: list[str] = []
    for item in payload.get("output", []):
        for content in item.get("content", []):
            text = content.get("text")
            if isinstance(text, str) and text.strip():
                chunks.append(text.strip())
    return "\n".join(chunks).strip()


def call_openai(prompt: str, image_bytes: bytes, chat_history: list[dict[str, str]], provider_config: dict, request_id: str | None = None) -> str:
    api_key = provider_config.get("apiKey", "").strip()
    api_base_url = provider_config.get("apiBaseUrl", "").strip()
    model = provider_config.get("model", "").strip()
    provider_name = provider_config.get("providerName", "").strip() or "Provider"

    if not api_key:
        raise RuntimeError("API Key is not configured.")
    if not api_base_url:
        raise RuntimeError("API Base URL is not configured.")
    if not model:
        raise RuntimeError("Model is not configured.")

    supports_vision, reason = provider_supports_vision(provider_config)
    if not supports_vision:
        add_log(
            "error",
            "provider",
            "Provider does not support vision input for current configuration",
            {
                "providerName": provider_name,
                "apiBaseUrl": api_base_url,
                "reason": reason,
            },
            request_id,
        )
        raise RuntimeError(reason)

    api_mode = infer_api_mode(api_base_url)
    payload = build_openai_payload(prompt, image_bytes, chat_history, model, api_mode)
    add_log(
        "info",
        "provider",
        "Sending request to AI provider",
        {
            "providerName": provider_name,
            "apiBaseUrl": api_base_url,
            "model": model,
            "apiMode": api_mode,
            "promptLength": len(prompt),
            "imageBytes": len(image_bytes),
        },
        request_id,
    )
    request = urllib.request.Request(
        api_base_url,
        data=json.dumps(payload).encode("utf-8"),
        headers={
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
        },
        method="POST",
    )

    try:
        started = time.time()
        with urllib.request.urlopen(request, timeout=90) as response:
            response_payload = json.loads(response.read().decode("utf-8"))
            add_log(
                "info",
                "provider",
                "AI provider returned successfully",
                {
                    "status": getattr(response, "status", 200),
                    "elapsedMs": int((time.time() - started) * 1000),
                },
                request_id,
            )
    except urllib.error.HTTPError as exc:
        error_body = exc.read().decode("utf-8", errors="replace")
        add_log(
            "error",
            "provider",
            "AI provider HTTP error",
            {"status": exc.code, "body": error_body[:1000], "providerName": provider_name},
            request_id,
        )
        raise RuntimeError(f"Provider API error {exc.code}: {error_body}") from exc
    except urllib.error.URLError as exc:
        add_log("error", "provider", "AI provider URL error", {"reason": str(exc.reason), "providerName": provider_name}, request_id)
        raise RuntimeError(f"Provider request failed: {exc.reason}") from exc
    except socket.timeout as exc:
        add_log("error", "provider", "AI provider timed out", {"timeoutSeconds": 90, "providerName": provider_name}, request_id)
        raise RuntimeError("AI provider timed out after 90 seconds") from exc

    answer = parse_response_text(response_payload, api_mode)
    if not answer:
        add_log("error", "provider", "AI provider returned no text output", {"providerName": provider_name}, request_id)
        raise RuntimeError("Provider API returned no text output.")
    add_log("info", "provider", "AI response parsed successfully", {"answerLength": len(answer)}, request_id)
    return answer


def validate_provider_config(provider_config: dict) -> dict:
    provider_name = provider_config.get("providerName", "").strip() or "Provider"
    api_key = provider_config.get("apiKey", "").strip()
    api_base_url = provider_config.get("apiBaseUrl", "").strip()
    model = provider_config.get("model", "").strip()

    if not api_key:
      return {
          "ok": False,
          "textOk": False,
          "visionSupported": False,
          "message": "API Key 未配置。",
      }

    if not api_base_url or not model:
      return {
          "ok": False,
          "textOk": False,
          "visionSupported": False,
          "message": "API Base URL 或 Model 未配置。",
      }

    supports_vision, reason = provider_supports_vision(provider_config)
    api_mode = infer_api_mode(api_base_url)
    if api_mode == "anthropic_messages":
        request_payload = {
            "model": model,
            "max_tokens": 128,
            "system": "You are a concise assistant.",
            "messages": [
                {
                    "role": "user",
                    "content": [{"type": "text", "text": "Reply with exactly: PROVIDER_TEXT_OK"}],
                }
            ],
        }
    elif api_mode == "chat_completions":
        request_payload = {
            "model": model,
            "messages": [
                {"role": "system", "content": "You are a concise assistant."},
                {"role": "user", "content": "Reply with exactly: PROVIDER_TEXT_OK"},
            ],
            "stream": False,
        }
    else:
        request_payload = {
            "model": model,
            "input": [
                {"role": "system", "content": [{"type": "input_text", "text": "You are a concise assistant."}]},
                {"role": "user", "content": [{"type": "input_text", "text": "Reply with exactly: PROVIDER_TEXT_OK"}]},
            ],
        }

    request = urllib.request.Request(
        api_base_url,
        data=json.dumps(request_payload).encode("utf-8"),
        headers={
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
        },
        method="POST",
    )

    try:
        with urllib.request.urlopen(request, timeout=45) as response:
            response_payload = json.loads(response.read().decode("utf-8"))
        text = parse_response_text(response_payload, api_mode)
        if "PROVIDER_TEXT_OK" not in text:
            return {
                "ok": False,
                "textOk": False,
                "visionSupported": supports_vision,
                "visionReason": reason,
                "message": f"{provider_name} 文本验证返回异常：{text}",
            }
        return {
            "ok": True,
            "textOk": True,
            "visionSupported": supports_vision,
            "visionReason": reason,
            "message": (
                f"{provider_name} 文本接口验证成功。"
                if supports_vision
                else f"{provider_name} 文本接口验证成功，但当前配置不支持图像分析。{reason}"
            ),
        }
    except urllib.error.HTTPError as exc:
        error_body = exc.read().decode("utf-8", errors="replace")
        return {
            "ok": False,
            "textOk": False,
            "visionSupported": supports_vision,
            "visionReason": reason,
            "message": f"{provider_name} 验证失败，HTTP {exc.code}: {error_body}",
        }
    except Exception as exc:
        return {
            "ok": False,
            "textOk": False,
            "visionSupported": supports_vision,
            "visionReason": reason,
            "message": f"{provider_name} 验证失败：{exc}",
        }


class ViewerHandler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(STATIC_DIR), **kwargs)

    def send_json(self, status_code: int, payload: dict) -> None:
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status_code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self) -> None:
        parsed = urllib.parse.urlparse(self.path)
        if parsed.path == "/api/config":
            provider_config = load_provider_config()
            self.send_json(
                200,
                {
                    "providerName": provider_config.get("providerName", ""),
                    "apiBaseUrl": provider_config.get("apiBaseUrl", ""),
                    "model": provider_config.get("model", ""),
                    "apiConfigured": bool(provider_config.get("apiKey", "").strip()),
                    "apiKeySaved": bool(provider_config.get("apiKey", "").strip()),
                    "visionSupported": provider_supports_vision(provider_config)[0],
                    "visionReason": provider_supports_vision(provider_config)[1],
                },
            )
            return

        if parsed.path == "/api/probe":
            query = urllib.parse.parse_qs(parsed.query)
            device_ip = query.get("device_ip", [""])[0].strip()
            if not device_ip:
                self.send_json(400, {"error": "device_ip is required"})
                return

            try:
                image_bytes = fetch_camera_snapshot(device_ip, "probe")
            except Exception as exc:
                self.send_json(502, {"ok": False, "error": str(exc)})
                return

            self.send_json(200, {"ok": True, "bytes": len(image_bytes)})
            return

        if parsed.path == "/api/logs":
            self.send_json(200, {"logs": list(reversed(REQUEST_LOGS))})
            return

        super().do_GET()

    def do_POST(self) -> None:
        if self.path == "/api/provider":
            try:
                content_length = int(self.headers.get("Content-Length", "0"))
                raw_body = self.rfile.read(content_length)
                payload = json.loads(raw_body.decode("utf-8"))
            except Exception:
                self.send_json(400, {"error": "Invalid JSON body"})
                return

            provider_config = {
                "providerName": str(payload.get("providerName", "")).strip() or "OpenAI-compatible",
                "apiBaseUrl": str(payload.get("apiBaseUrl", "")).strip(),
                "apiKey": str(payload.get("apiKey", "")).strip(),
                "model": str(payload.get("model", "")).strip(),
            }

            if not provider_config["apiBaseUrl"]:
                self.send_json(400, {"error": "apiBaseUrl is required"})
                return
            if not provider_config["model"]:
                self.send_json(400, {"error": "model is required"})
                return

            save_provider_config(provider_config)
            validation = validate_provider_config(provider_config)
            self.send_json(
                200,
                {
                    "ok": True,
                    "providerName": provider_config["providerName"],
                    "apiBaseUrl": provider_config["apiBaseUrl"],
                    "model": provider_config["model"],
                    "apiConfigured": bool(provider_config["apiKey"]),
                    "apiKeySaved": bool(provider_config["apiKey"]),
                    "validation": validation,
                },
            )
            return

        if self.path != "/api/analyze":
            self.send_json(404, {"error": "Not found"})
            return

        try:
            content_length = int(self.headers.get("Content-Length", "0"))
            raw_body = self.rfile.read(content_length)
            payload = json.loads(raw_body.decode("utf-8"))
        except Exception:
            self.send_json(400, {"error": "Invalid JSON body"})
            return

        prompt = str(payload.get("prompt", "")).strip()
        device_ip = str(payload.get("deviceIp", "")).strip()
        chat_history = payload.get("history", [])
        image_data_url = str(payload.get("imageDataUrl", "")).strip()
        request_id = str(int(time.time() * 1000))

        if not prompt:
            self.send_json(400, {"error": "prompt is required"})
            return
        if not device_ip:
            self.send_json(400, {"error": "deviceIp is required"})
            return

        try:
            provider_config = load_provider_config()
            add_log("info", "request", "Analyze request started", {"deviceIp": device_ip, "providerName": provider_config.get("providerName", "")}, request_id)
            if image_data_url:
                image_bytes = decode_image_data_url(image_data_url, request_id)
                add_log("info", "request", "Using browser preview frame for AI analysis", {}, request_id)
            else:
                image_bytes = fetch_camera_snapshot(device_ip, request_id)
                add_log("info", "request", "Using device /capture endpoint for AI analysis", {}, request_id)
            answer = call_openai(prompt, image_bytes, chat_history, provider_config, request_id)
        except Exception as exc:
            add_log("error", "request", "Analyze request failed", {"error": str(exc)}, request_id)
            self.send_json(500, {"error": str(exc), "requestId": request_id})
            return

        add_log("info", "request", "Analyze request completed", {}, request_id)
        self.send_json(200, {"answer": answer, "requestId": request_id})


def main() -> int:
    if not STATIC_DIR.exists():
        print(f"Static directory not found: {STATIC_DIR}", file=sys.stderr)
        return 1

    server = ThreadingHTTPServer((HOST, PORT), ViewerHandler)
    provider_config = load_provider_config()
    print(f"Local AI viewer: http://{HOST}:{PORT}/")
    print(f"Provider: {provider_config.get('providerName', 'OpenAI-compatible')}")
    print(f"Model: {provider_config.get('model', '-')}")
    print(f"API configured: {'yes' if provider_config.get('apiKey', '').strip() else 'no'}")
    server.serve_forever()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
