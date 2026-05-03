import base64
import json
import os
import sys
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
    "providerName": os.getenv("AI_PROVIDER_NAME", "OpenAI-compatible").strip() or "OpenAI-compatible",
    "apiBaseUrl": os.getenv("OPENAI_API_URL", "https://api.openai.com/v1/responses").strip() or "https://api.openai.com/v1/responses",
    "apiKey": os.getenv("OPENAI_API_KEY", "").strip(),
    "model": os.getenv("OPENAI_MODEL", "gpt-5.4-mini").strip() or "gpt-5.4-mini",
}


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


def fetch_camera_snapshot(device_ip: str) -> bytes:
    snapshot_url = f"http://{device_ip}/capture"
    request = urllib.request.Request(
        snapshot_url,
        headers={"User-Agent": "AIEmbedViewer/0.4.0"},
    )
    with urllib.request.urlopen(request, timeout=15) as response:
        return response.read()


def build_openai_payload(prompt: str, image_bytes: bytes, chat_history: list[dict[str, str]], model: str) -> dict:
    image_data_url = "data:image/jpeg;base64," + base64.b64encode(image_bytes).decode("ascii")
    system_text = (
        "You are analyzing the latest frame from an ESP32-CAM video feed. "
        "Answer only from what is visible in the image and the user's question. "
        "If the frame is unclear, say so explicitly."
    )

    items: list[dict] = [
        {
            "role": "system",
            "content": [{"type": "input_text", "text": system_text}],
        }
    ]

    for message in chat_history[-8:]:
        role = message.get("role", "user")
        text = message.get("text", "").strip()
        if not text or role not in {"user", "assistant"}:
            continue
        items.append(
            {
                "role": role,
                "content": [{"type": "input_text", "text": text}],
            }
        )

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


def parse_response_text(payload: dict) -> str:
    if isinstance(payload.get("output_text"), str) and payload["output_text"].strip():
        return payload["output_text"].strip()

    chunks: list[str] = []
    for item in payload.get("output", []):
        for content in item.get("content", []):
            text = content.get("text")
            if isinstance(text, str) and text.strip():
                chunks.append(text.strip())
    return "\n".join(chunks).strip()


def call_openai(prompt: str, image_bytes: bytes, chat_history: list[dict[str, str]], provider_config: dict) -> str:
    api_key = provider_config.get("apiKey", "").strip()
    api_base_url = provider_config.get("apiBaseUrl", "").strip()
    model = provider_config.get("model", "").strip()

    if not api_key:
        raise RuntimeError("API Key is not configured.")
    if not api_base_url:
        raise RuntimeError("API Base URL is not configured.")
    if not model:
        raise RuntimeError("Model is not configured.")

    payload = build_openai_payload(prompt, image_bytes, chat_history, model)
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
        with urllib.request.urlopen(request, timeout=90) as response:
            response_payload = json.loads(response.read().decode("utf-8"))
    except urllib.error.HTTPError as exc:
        error_body = exc.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"Provider API error {exc.code}: {error_body}") from exc

    answer = parse_response_text(response_payload)
    if not answer:
        raise RuntimeError("Provider API returned no text output.")
    return answer


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
                image_bytes = fetch_camera_snapshot(device_ip)
            except Exception as exc:
                self.send_json(502, {"ok": False, "error": str(exc)})
                return

            self.send_json(200, {"ok": True, "bytes": len(image_bytes)})
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
            self.send_json(
                200,
                {
                    "ok": True,
                    "providerName": provider_config["providerName"],
                    "apiBaseUrl": provider_config["apiBaseUrl"],
                    "model": provider_config["model"],
                    "apiConfigured": bool(provider_config["apiKey"]),
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

        if not prompt:
            self.send_json(400, {"error": "prompt is required"})
            return
        if not device_ip:
            self.send_json(400, {"error": "deviceIp is required"})
            return

        try:
            provider_config = load_provider_config()
            image_bytes = fetch_camera_snapshot(device_ip)
            answer = call_openai(prompt, image_bytes, chat_history, provider_config)
        except Exception as exc:
            self.send_json(500, {"error": str(exc)})
            return

        self.send_json(200, {"answer": answer})


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
