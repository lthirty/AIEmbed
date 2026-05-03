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
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY", "").strip()
OPENAI_MODEL = os.getenv("OPENAI_MODEL", "gpt-5.4-mini").strip() or "gpt-5.4-mini"
OPENAI_API_URL = "https://api.openai.com/v1/responses"


def fetch_camera_snapshot(device_ip: str) -> bytes:
    snapshot_url = f"http://{device_ip}/capture"
    request = urllib.request.Request(
        snapshot_url,
        headers={"User-Agent": "AIEmbedViewer/0.4.0"},
    )
    with urllib.request.urlopen(request, timeout=15) as response:
        return response.read()


def build_openai_payload(prompt: str, image_bytes: bytes, chat_history: list[dict[str, str]]) -> dict:
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
        "model": OPENAI_MODEL,
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


def call_openai(prompt: str, image_bytes: bytes, chat_history: list[dict[str, str]]) -> str:
    if not OPENAI_API_KEY:
        raise RuntimeError("OPENAI_API_KEY is not set in the local environment.")

    payload = build_openai_payload(prompt, image_bytes, chat_history)
    request = urllib.request.Request(
        OPENAI_API_URL,
        data=json.dumps(payload).encode("utf-8"),
        headers={
            "Authorization": f"Bearer {OPENAI_API_KEY}",
            "Content-Type": "application/json",
        },
        method="POST",
    )

    try:
        with urllib.request.urlopen(request, timeout=90) as response:
            response_payload = json.loads(response.read().decode("utf-8"))
    except urllib.error.HTTPError as exc:
        error_body = exc.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"OpenAI API error {exc.code}: {error_body}") from exc

    answer = parse_response_text(response_payload)
    if not answer:
        raise RuntimeError("OpenAI API returned no text output.")
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
            self.send_json(
                200,
                {
                    "model": OPENAI_MODEL,
                    "openaiConfigured": bool(OPENAI_API_KEY),
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
            image_bytes = fetch_camera_snapshot(device_ip)
            answer = call_openai(prompt, image_bytes, chat_history)
        except Exception as exc:
            self.send_json(500, {"error": str(exc)})
            return

        self.send_json(200, {"answer": answer})


def main() -> int:
    if not STATIC_DIR.exists():
        print(f"Static directory not found: {STATIC_DIR}", file=sys.stderr)
        return 1

    server = ThreadingHTTPServer((HOST, PORT), ViewerHandler)
    print(f"Local AI viewer: http://{HOST}:{PORT}/")
    print(f"OpenAI model: {OPENAI_MODEL}")
    print(f"OPENAI_API_KEY configured: {'yes' if OPENAI_API_KEY else 'no'}")
    server.serve_forever()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
