import base64
import cgi
import json
import os
import re
import socket
import sqlite3
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from uuid import uuid4


HOST = "127.0.0.1"
PORT = 8000
ROOT_DIR = Path(__file__).parent
STATIC_DIR = ROOT_DIR / "webapp"
CONFIG_PATH = ROOT_DIR / "ai_provider_config.json"
DATA_DIR = ROOT_DIR / "local_data"
UPLOAD_DIR = DATA_DIR / "uploads"
DB_PATH = DATA_DIR / "assistant.db"
DEFAULT_PROVIDER_CONFIG = {
    "providerName": os.getenv("AI_PROVIDER_NAME", "MiniMax Token Plan").strip() or "MiniMax Token Plan",
    "apiBaseUrl": os.getenv("OPENAI_API_URL", "https://api.minimaxi.com/v1/chat/completions").strip()
    or "https://api.minimaxi.com/v1/chat/completions",
    "apiKey": os.getenv("OPENAI_API_KEY", "").strip(),
    "model": os.getenv("OPENAI_MODEL", "MiniMax-M2.7").strip() or "MiniMax-M2.7",
}
MAX_LOG_ENTRIES = 300
MAX_PROMPT_EVIDENCE_CHARS = 12000
REQUEST_LOGS: list[dict] = []


def now_ts() -> str:
    return time.strftime("%Y-%m-%d %H:%M:%S")


def add_log(level: str, stage: str, message: str, details: dict | None = None, request_id: str | None = None) -> dict:
    entry = {
        "ts": now_ts(),
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


def init_storage() -> None:
    DATA_DIR.mkdir(exist_ok=True)
    UPLOAD_DIR.mkdir(exist_ok=True)
    conn = sqlite3.connect(DB_PATH)
    try:
        conn.executescript(
            """
            CREATE TABLE IF NOT EXISTS sessions (
                id TEXT PRIMARY KEY,
                title TEXT NOT NULL,
                customer_name TEXT NOT NULL DEFAULT '',
                device_ip TEXT NOT NULL DEFAULT '',
                status TEXT NOT NULL DEFAULT 'open',
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS evidence (
                id TEXT PRIMARY KEY,
                session_id TEXT NOT NULL,
                kind TEXT NOT NULL,
                title TEXT NOT NULL,
                content_text TEXT NOT NULL DEFAULT '',
                file_name TEXT NOT NULL DEFAULT '',
                file_path TEXT NOT NULL DEFAULT '',
                meta_json TEXT NOT NULL DEFAULT '{}',
                created_at TEXT NOT NULL,
                FOREIGN KEY(session_id) REFERENCES sessions(id)
            );

            CREATE TABLE IF NOT EXISTS analyses (
                id TEXT PRIMARY KEY,
                session_id TEXT NOT NULL,
                request_text TEXT NOT NULL,
                result_json TEXT NOT NULL,
                raw_text TEXT NOT NULL DEFAULT '',
                created_at TEXT NOT NULL,
                FOREIGN KEY(session_id) REFERENCES sessions(id)
            );
            """
        )
        conn.commit()
    finally:
        conn.close()


def get_conn() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


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
    CONFIG_PATH.write_text(json.dumps(config, ensure_ascii=False, indent=2), encoding="utf-8")


def infer_api_mode(api_base_url: str) -> str:
    normalized = api_base_url.strip().lower()
    if normalized.endswith("/anthropic/v1/messages") or normalized.endswith("/v1/messages"):
        return "anthropic_messages"
    if normalized.endswith("/chat/completions"):
        return "chat_completions"
    return "responses"


def is_minimax_provider(provider_config: dict) -> bool:
    provider_name = provider_config.get("providerName", "").strip().lower()
    api_base_url = provider_config.get("apiBaseUrl", "").strip().lower()
    return "minimax" in provider_name or "api.minimaxi.com" in api_base_url or "api.minimax.io" in api_base_url


def provider_supports_vision(provider_config: dict) -> tuple[bool, str]:
    provider_name = provider_config.get("providerName", "").strip().lower()
    api_base_url = provider_config.get("apiBaseUrl", "").strip().lower()

    if "deepseek" in provider_name or "api.deepseek.com" in api_base_url:
        return (
            False,
            "当前配置的 DeepSeek chat/completions 接口按官方文档仅支持文本 content，不支持 image_url 多模态输入，所以不能直接做图像分析。",
        )

    if "minimax" in provider_name or "api.minimaxi.com" in api_base_url or "api.minimax.io" in api_base_url:
        return (
            True,
            "MiniMax 当前按官方 /v1/chat/completions 方案处理图像输入，图片会以内嵌 [图片base64:...] 的方式发送。",
        )

    return True, ""


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


def build_text_payload(prompt: str, provider_config: dict) -> tuple[str, str, str, dict]:
    api_base_url = provider_config.get("apiBaseUrl", "").strip()
    model = provider_config.get("model", "").strip()
    api_mode = infer_api_mode(api_base_url)
    effective_api_base_url = api_base_url
    effective_model = model

    if is_minimax_provider(provider_config):
        effective_api_base_url = "https://api.minimaxi.com/v1/chat/completions"
        api_mode = "chat_completions"

    if api_mode == "anthropic_messages":
        payload = {
            "model": effective_model,
            "max_tokens": 1600,
            "system": "You are a concise embedded debug analyst. Return only the requested result.",
            "messages": [
                {"role": "user", "content": [{"type": "text", "text": prompt}]},
            ],
        }
    elif api_mode == "chat_completions":
        payload = {
            "model": effective_model,
            "messages": [
                {"role": "system", "content": "You are a concise embedded debug analyst. Return only the requested result."},
                {"role": "user", "content": prompt},
            ],
            "stream": False,
        }
    else:
        payload = {
            "model": effective_model,
            "input": [
                {"role": "system", "content": [{"type": "input_text", "text": "You are a concise embedded debug analyst. Return only the requested result."}]},
                {"role": "user", "content": [{"type": "input_text", "text": prompt}]},
            ],
        }

    return effective_api_base_url, effective_model, api_mode, payload


def call_provider_text(prompt: str, provider_config: dict, request_id: str | None = None) -> str:
    api_key = provider_config.get("apiKey", "").strip()
    provider_name = provider_config.get("providerName", "").strip() or "Provider"
    if not api_key:
        raise RuntimeError("API Key is not configured.")

    effective_api_base_url, effective_model, api_mode, payload = build_text_payload(prompt, provider_config)
    add_log(
        "info",
        "provider",
        "Sending text analysis request to AI provider",
        {
            "providerName": provider_name,
            "apiBaseUrl": effective_api_base_url,
            "configuredApiBaseUrl": provider_config.get("apiBaseUrl", ""),
            "model": effective_model,
            "configuredModel": provider_config.get("model", ""),
            "apiMode": api_mode,
            "promptLength": len(prompt),
            "payloadPreview": json.dumps(payload, ensure_ascii=False)[:400],
            "payloadType": "text_analysis",
        },
        request_id,
    )

    request = urllib.request.Request(
        effective_api_base_url,
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
                    "responsePreview": json.dumps(response_payload, ensure_ascii=False)[:800],
                },
                request_id,
            )
    except urllib.error.HTTPError as exc:
        error_body = exc.read().decode("utf-8", errors="replace")
        add_log(
            "error",
            "provider",
            "AI provider HTTP error",
            {
                "status": exc.code,
                "body": error_body[:1000],
                "providerName": provider_name,
                "apiBaseUrl": effective_api_base_url,
                "model": effective_model,
            },
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
        return {"ok": False, "textOk": False, "visionSupported": False, "message": "API Key 未配置。"}
    if not api_base_url or not model:
        return {"ok": False, "textOk": False, "visionSupported": False, "message": "API Base URL 或 Model 未配置。"}

    supports_vision, reason = provider_supports_vision(provider_config)
    try:
        text = call_provider_text("Reply with exactly: PROVIDER_TEXT_OK", provider_config, "provider-validate")
        if "PROVIDER_TEXT_OK" not in text:
            return {
                "ok": False,
                "textOk": False,
                "visionSupported": supports_vision,
                "visionReason": reason,
                "message": f"{provider_name} 文本验证返回异常：{text}",
            }
        effective_api_base_url, effective_model, _, _ = build_text_payload("Reply with exactly: PROVIDER_TEXT_OK", provider_config)
        return {
            "ok": True,
            "textOk": True,
            "visionSupported": supports_vision,
            "visionReason": reason,
            "effectiveApiBaseUrl": effective_api_base_url,
            "effectiveModel": effective_model,
            "message": f"{provider_name} 文本接口验证成功。",
        }
    except Exception as exc:
        effective_api_base_url, effective_model, _, _ = build_text_payload("Reply with exactly: PROVIDER_TEXT_OK", provider_config)
        return {
            "ok": False,
            "textOk": False,
            "visionSupported": supports_vision,
            "visionReason": reason,
            "effectiveApiBaseUrl": effective_api_base_url,
            "effectiveModel": effective_model,
            "message": f"{provider_name} 验证失败：{exc}",
        }


def session_to_dict(row: sqlite3.Row) -> dict:
    return {
        "id": row["id"],
        "title": row["title"],
        "customerName": row["customer_name"],
        "deviceIp": row["device_ip"],
        "status": row["status"],
        "createdAt": row["created_at"],
        "updatedAt": row["updated_at"],
    }


def evidence_to_dict(row: sqlite3.Row) -> dict:
    return {
        "id": row["id"],
        "sessionId": row["session_id"],
        "kind": row["kind"],
        "title": row["title"],
        "contentText": row["content_text"],
        "fileName": row["file_name"],
        "filePath": row["file_path"],
        "meta": json.loads(row["meta_json"] or "{}"),
        "createdAt": row["created_at"],
    }


def analysis_to_dict(row: sqlite3.Row) -> dict:
    return {
        "id": row["id"],
        "sessionId": row["session_id"],
        "requestText": row["request_text"],
        "result": json.loads(row["result_json"] or "{}"),
        "rawText": row["raw_text"],
        "createdAt": row["created_at"],
    }


def create_session(title: str, customer_name: str, device_ip: str) -> dict:
    session_id = uuid4().hex
    now = now_ts()
    conn = get_conn()
    try:
        conn.execute(
            "INSERT INTO sessions (id, title, customer_name, device_ip, status, created_at, updated_at) VALUES (?, ?, ?, ?, 'open', ?, ?)",
            (session_id, title.strip() or "未命名会话", customer_name.strip(), device_ip.strip(), now, now),
        )
        conn.commit()
        row = conn.execute("SELECT * FROM sessions WHERE id = ?", (session_id,)).fetchone()
        return session_to_dict(row)
    finally:
        conn.close()


def list_sessions() -> list[dict]:
    conn = get_conn()
    try:
        rows = conn.execute("SELECT * FROM sessions ORDER BY updated_at DESC, created_at DESC").fetchall()
        return [session_to_dict(row) for row in rows]
    finally:
        conn.close()


def get_session(session_id: str) -> dict:
    conn = get_conn()
    try:
        row = conn.execute("SELECT * FROM sessions WHERE id = ?", (session_id,)).fetchone()
        if not row:
            raise KeyError("session not found")
        evidence_rows = conn.execute("SELECT * FROM evidence WHERE session_id = ? ORDER BY created_at DESC", (session_id,)).fetchall()
        analysis_rows = conn.execute("SELECT * FROM analyses WHERE session_id = ? ORDER BY created_at DESC", (session_id,)).fetchall()
        payload = session_to_dict(row)
        payload["evidence"] = [evidence_to_dict(item) for item in evidence_rows]
        payload["analyses"] = [analysis_to_dict(item) for item in analysis_rows]
        return payload
    finally:
        conn.close()


def touch_session(conn: sqlite3.Connection, session_id: str) -> None:
    conn.execute("UPDATE sessions SET updated_at = ? WHERE id = ?", (now_ts(), session_id))


def add_evidence(
    session_id: str,
    kind: str,
    title: str,
    content_text: str = "",
    file_name: str = "",
    file_path: str = "",
    meta: dict | None = None,
) -> dict:
    evidence_id = uuid4().hex
    now = now_ts()
    conn = get_conn()
    try:
        session_exists = conn.execute("SELECT 1 FROM sessions WHERE id = ?", (session_id,)).fetchone()
        if not session_exists:
            raise KeyError("session not found")
        conn.execute(
            """
            INSERT INTO evidence (id, session_id, kind, title, content_text, file_name, file_path, meta_json, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (evidence_id, session_id, kind, title, content_text, file_name, file_path, json.dumps(meta or {}, ensure_ascii=False), now),
        )
        touch_session(conn, session_id)
        conn.commit()
        row = conn.execute("SELECT * FROM evidence WHERE id = ?", (evidence_id,)).fetchone()
        return evidence_to_dict(row)
    finally:
        conn.close()


def save_uploaded_file(session_id: str, file_name: str, content: bytes) -> tuple[str, str]:
    target_dir = UPLOAD_DIR / session_id
    target_dir.mkdir(parents=True, exist_ok=True)
    safe_name = Path(file_name).name or f"upload-{uuid4().hex}"
    target_path = target_dir / f"{int(time.time())}-{safe_name}"
    target_path.write_bytes(content)
    return safe_name, str(target_path.resolve())


def extract_text_from_file(file_name: str, content: bytes) -> tuple[str, str]:
    suffix = Path(file_name).suffix.lower()
    if suffix in {".md", ".txt", ".log", ".json", ".csv", ".ini", ".yaml", ".yml"}:
        try:
            return content.decode("utf-8"), ""
        except UnicodeDecodeError:
            return content.decode("gbk", errors="replace"), "文件使用了非 UTF-8 编码，已按兼容方式解码。"
    if suffix == ".pdf":
        try:
            from pypdf import PdfReader  # type: ignore
        except Exception:
            return "", "当前环境未安装 PDF 文本提取依赖，文件已保存但未抽取正文。"
        try:
            import io

            reader = PdfReader(io.BytesIO(content))
            text = "\n".join((page.extract_text() or "") for page in reader.pages)
            return text.strip(), ""
        except Exception as exc:
            return "", f"PDF 文本提取失败：{exc}"
    return "", "当前仅自动提取 txt/md/log/json/csv/yaml/pdf 的文本内容，其他格式仅保存原文件。"


def fetch_camera_snapshot(device_ip: str, request_id: str | None = None) -> bytes:
    snapshot_url = f"http://{device_ip}/capture"
    add_log("info", "snapshot", "Start fetching snapshot", {"url": snapshot_url}, request_id)
    request = urllib.request.Request(snapshot_url, headers={"User-Agent": "AIEmbedWorkbench/0.6.0"})
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


def collect_snapshot_evidence(session_id: str, device_ip: str, request_id: str | None = None) -> dict:
    image_bytes = fetch_camera_snapshot(device_ip, request_id)
    saved_name, saved_path = save_uploaded_file(session_id, "snapshot.jpg", image_bytes)
    return add_evidence(
        session_id,
        "snapshot",
        f"设备抓拍 {now_ts()}",
        content_text="ESP32-CAM 当前画面抓拍。",
        file_name=saved_name,
        file_path=saved_path,
        meta={"deviceIp": device_ip, "bytes": len(image_bytes)},
    )


def trim_text(text: str, limit: int) -> str:
    normalized = (text or "").strip()
    if len(normalized) <= limit:
        return normalized
    return normalized[:limit] + "\n...[truncated]..."


def build_analysis_prompt(session_payload: dict, request_text: str) -> str:
    evidence = session_payload.get("evidence", [])
    selected_sections: list[str] = []
    used_chars = 0

    for item in evidence:
        body = item.get("contentText", "") or ""
        if not body and item.get("kind") == "snapshot":
            body = "图像证据已保存，本轮分析以文本资料、日志和人工备注为主。"
        if not body:
            continue
        section = (
            f"[{item.get('kind')}] {item.get('title')}\n"
            f"created_at: {item.get('createdAt')}\n"
            f"content:\n{trim_text(body, 1800)}"
        )
        if used_chars + len(section) > MAX_PROMPT_EVIDENCE_CHARS:
            break
        selected_sections.append(section)
        used_chars += len(section)

    if not selected_sections:
        selected_sections.append("当前会话还没有足够证据，请明确指出缺失信息。")

    schema = {
        "phenomenon_summary": "",
        "evidence_used": [{"evidence_title": "", "kind": "", "why_it_matters": ""}],
        "possible_causes": [{"label": "", "confidence": 0.0, "reasoning": "", "required_next_check": ""}],
        "validation_steps": [{"step_id": "V1", "goal": "", "instructions": "", "expected_result": "", "risk": "low"}],
        "missing_information": [""],
        "priority": "P1",
        "risk_level": "low",
        "suggested_commands_or_snippets": [{"kind": "serial", "content": ""}],
        "case_update_hint": {"should_promote_to_case": False, "candidate_root_cause_tags": [""]},
    }

    return (
        "你是嵌入式原型机联调分析助手。"
        "你必须只根据提供的资料、日志、人工备注和设备状态进行推断，禁止臆造。"
        "重点输出：现象总结、已用证据、可能原因、缺失信息、下一步验证步骤。"
        "如果证据不足，明确写入 missing_information。"
        "输出必须是纯 JSON，不能带 Markdown 代码块。\n\n"
        f"session:\n{json.dumps({k: session_payload.get(k) for k in ['id', 'title', 'customerName', 'deviceIp', 'status', 'createdAt', 'updatedAt']}, ensure_ascii=False, indent=2)}\n\n"
        f"user_request:\n{request_text.strip() or '请基于当前资料和日志自动分析。'}\n\n"
        f"selected_evidence:\n{'\n\n'.join(selected_sections)}\n\n"
        f"json_schema_example:\n{json.dumps(schema, ensure_ascii=False, indent=2)}"
    )


def try_parse_analysis_json(raw_text: str) -> dict:
    text = raw_text.strip()
    text = re.sub(r"^```(?:json)?\s*", "", text)
    text = re.sub(r"\s*```$", "", text)
    try:
        return json.loads(text)
    except Exception:
        pass

    match = re.search(r"\{.*\}", text, re.S)
    if not match:
        raise RuntimeError("AI 返回内容不是合法 JSON。")
    try:
        return json.loads(match.group(0))
    except Exception as exc:
        raise RuntimeError(f"AI 返回 JSON 解析失败：{exc}") from exc


def store_analysis(session_id: str, request_text: str, result_json: dict, raw_text: str) -> dict:
    analysis_id = uuid4().hex
    now = now_ts()
    conn = get_conn()
    try:
        conn.execute(
            "INSERT INTO analyses (id, session_id, request_text, result_json, raw_text, created_at) VALUES (?, ?, ?, ?, ?, ?)",
            (analysis_id, session_id, request_text, json.dumps(result_json, ensure_ascii=False), raw_text, now),
        )
        touch_session(conn, session_id)
        conn.commit()
        row = conn.execute("SELECT * FROM analyses WHERE id = ?", (analysis_id,)).fetchone()
        return analysis_to_dict(row)
    finally:
        conn.close()


def run_session_analysis(session_id: str, request_text: str, device_ip: str, capture_snapshot: bool, request_id: str) -> dict:
    session_payload = get_session(session_id)
    effective_device_ip = device_ip.strip() or session_payload.get("deviceIp", "").strip()
    if capture_snapshot and effective_device_ip:
        add_log("info", "snapshot", "Collecting snapshot evidence before analysis", {"deviceIp": effective_device_ip}, request_id)
        collect_snapshot_evidence(session_id, effective_device_ip, request_id)
        session_payload = get_session(session_id)

    prompt = build_analysis_prompt(session_payload, request_text)
    add_log(
        "info",
        "analysis",
        "Structured analysis prompt prepared",
        {"sessionId": session_id, "promptLength": len(prompt), "evidenceCount": len(session_payload.get("evidence", []))},
        request_id,
    )
    raw_text = call_provider_text(prompt, load_provider_config(), request_id)
    result_json = try_parse_analysis_json(raw_text)
    add_log("info", "analysis", "Structured analysis JSON parsed", {"keys": list(result_json.keys())}, request_id)
    return store_analysis(session_id, request_text, result_json, raw_text)


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

    def parse_json_body(self) -> dict:
        content_length = int(self.headers.get("Content-Length", "0"))
        raw_body = self.rfile.read(content_length)
        return json.loads(raw_body.decode("utf-8"))

    def parse_multipart(self) -> cgi.FieldStorage:
        env = {
            "REQUEST_METHOD": "POST",
            "CONTENT_TYPE": self.headers.get("Content-Type", ""),
            "CONTENT_LENGTH": self.headers.get("Content-Length", "0"),
        }
        return cgi.FieldStorage(fp=self.rfile, headers=self.headers, environ=env, keep_blank_values=True)

    def do_GET(self) -> None:
        parsed = urllib.parse.urlparse(self.path)
        path = parsed.path

        if path == "/api/config":
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

        if path == "/api/logs":
            self.send_json(200, {"logs": list(reversed(REQUEST_LOGS))})
            return

        if path == "/api/sessions":
            self.send_json(200, {"sessions": list_sessions()})
            return

        if path.startswith("/api/sessions/"):
            session_id = path.split("/")[3] if len(path.split("/")) > 3 else ""
            if not session_id:
                self.send_json(400, {"error": "session id is required"})
                return
            try:
                self.send_json(200, get_session(session_id))
            except KeyError:
                self.send_json(404, {"error": "session not found"})
            return

        super().do_GET()

    def do_POST(self) -> None:
        parsed = urllib.parse.urlparse(self.path)
        path = parsed.path

        if path == "/api/provider":
            try:
                payload = self.parse_json_body()
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

        if path == "/api/sessions":
            try:
                payload = self.parse_json_body()
                session = create_session(
                    str(payload.get("title", "")).strip() or "客户调试会话",
                    str(payload.get("customerName", "")).strip(),
                    str(payload.get("deviceIp", "")).strip(),
                )
                self.send_json(200, {"session": session})
            except Exception as exc:
                self.send_json(500, {"error": str(exc)})
            return

        if path == "/api/upload":
            try:
                form = self.parse_multipart()
                session_id = str(form.getfirst("sessionId", "")).strip()
                if not session_id:
                    self.send_json(400, {"error": "sessionId is required"})
                    return
                file_item = form["file"] if "file" in form else None
                if not file_item or not getattr(file_item, "file", None):
                    self.send_json(400, {"error": "file is required"})
                    return
                file_name = file_item.filename or "upload.bin"
                content = file_item.file.read()
                saved_name, saved_path = save_uploaded_file(session_id, file_name, content)
                extracted_text, note = extract_text_from_file(file_name, content)
                evidence = add_evidence(
                    session_id,
                    "material",
                    str(form.getfirst("title", "")).strip() or saved_name,
                    content_text=extracted_text or note,
                    file_name=saved_name,
                    file_path=saved_path,
                    meta={"bytes": len(content), "extractNote": note},
                )
                self.send_json(200, {"ok": True, "evidence": evidence})
            except KeyError:
                self.send_json(404, {"error": "session not found"})
            except Exception as exc:
                self.send_json(500, {"error": str(exc)})
            return

        if path.startswith("/api/sessions/"):
            parts = path.split("/")
            if len(parts) < 5:
                self.send_json(404, {"error": "Not found"})
                return
            session_id = parts[3]
            action = parts[4]

            try:
                payload = self.parse_json_body()
            except Exception:
                self.send_json(400, {"error": "Invalid JSON body"})
                return

            try:
                if action == "notes":
                    evidence = add_evidence(
                        session_id,
                        "manual_note",
                        str(payload.get("title", "")).strip() or "人工备注",
                        content_text=str(payload.get("content", "")).strip(),
                    )
                    self.send_json(200, {"ok": True, "evidence": evidence})
                    return

                if action == "logs":
                    evidence = add_evidence(
                        session_id,
                        "serial_log",
                        str(payload.get("title", "")).strip() or "串口日志",
                        content_text=str(payload.get("content", "")).strip(),
                    )
                    self.send_json(200, {"ok": True, "evidence": evidence})
                    return

                if action == "snapshot":
                    device_ip = str(payload.get("deviceIp", "")).strip()
                    if not device_ip:
                        self.send_json(400, {"error": "deviceIp is required"})
                        return
                    request_id = str(int(time.time() * 1000))
                    evidence = collect_snapshot_evidence(session_id, device_ip, request_id)
                    self.send_json(200, {"ok": True, "evidence": evidence, "requestId": request_id})
                    return

                if action == "analyze":
                    request_text = str(payload.get("requestText", "")).strip() or "请根据当前资料和收集到的信息自动分析。"
                    device_ip = str(payload.get("deviceIp", "")).strip()
                    capture_snapshot = bool(payload.get("captureSnapshot", False))
                    request_id = str(int(time.time() * 1000))
                    add_log(
                        "info",
                        "request",
                        "Session analysis started",
                        {"sessionId": session_id, "deviceIp": device_ip, "captureSnapshot": capture_snapshot},
                        request_id,
                    )
                    analysis = run_session_analysis(session_id, request_text, device_ip, capture_snapshot, request_id)
                    add_log("info", "request", "Session analysis completed", {"sessionId": session_id, "analysisId": analysis["id"]}, request_id)
                    self.send_json(200, {"ok": True, "analysis": analysis, "requestId": request_id})
                    return

            except KeyError:
                self.send_json(404, {"error": "session not found"})
                return
            except Exception as exc:
                request_id = str(int(time.time() * 1000))
                add_log("error", "request", "Session request failed", {"sessionId": session_id, "action": action, "error": str(exc)}, request_id)
                self.send_json(500, {"error": str(exc), "requestId": request_id})
                return

        self.send_json(404, {"error": "Not found"})


def main() -> int:
    if not STATIC_DIR.exists():
        print(f"Static directory not found: {STATIC_DIR}", file=sys.stderr)
        return 1

    init_storage()
    server = ThreadingHTTPServer((HOST, PORT), ViewerHandler)
    provider_config = load_provider_config()
    print(f"Local prototype workbench: http://{HOST}:{PORT}/")
    print(f"Provider: {provider_config.get('providerName', 'OpenAI-compatible')}")
    print(f"Model: {provider_config.get('model', '-')}")
    print(f"API configured: {'yes' if provider_config.get('apiKey', '').strip() else 'no'}")
    server.serve_forever()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
