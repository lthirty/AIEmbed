import base64
import ast
import cgi
import json
import mimetypes
import os
import re
import socket
import sqlite3
import sys
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from uuid import uuid4

import serial  # type: ignore
from serial.tools import list_ports  # type: ignore


HOST = "127.0.0.1"
PORT = 8000
APP_VERSION = "v0.22.6"
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
DEFAULT_PROVIDER_PROFILE_NAME = "默认配置"
DEFAULT_PROVIDER_PROFILE_ID = "default-profile"
MAX_LOG_ENTRIES = 300
MAX_PROMPT_EVIDENCE_CHARS = 7000
AI_PROVIDER_TIMEOUT_SECONDS = 180
REQUEST_LOGS: list[dict] = []
SERIAL_CAPTURE_STATE = {
    "running": False,
    "sessionId": "",
    "evidenceId": "",
    "port": "",
    "baud": 115200,
    "startedAt": "",
    "lines": 0,
    "bytes": 0,
    "lastError": "",
    "thread": None,
    "stopEvent": None,
}


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
                device_model TEXT NOT NULL DEFAULT '',
                serial_number TEXT NOT NULL DEFAULT '',
                device_ip TEXT NOT NULL DEFAULT '',
                issue_type TEXT NOT NULL DEFAULT '',
                severity TEXT NOT NULL DEFAULT 'P1',
                workflow_stage TEXT NOT NULL DEFAULT 'phenomenon',
                symptom TEXT NOT NULL DEFAULT '',
                owner TEXT NOT NULL DEFAULT '',
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

            CREATE TABLE IF NOT EXISTS session_steps (
                id TEXT PRIMARY KEY,
                session_id TEXT NOT NULL,
                step_key TEXT NOT NULL,
                data_json TEXT NOT NULL DEFAULT '{}',
                status TEXT NOT NULL DEFAULT 'pending',
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                FOREIGN KEY(session_id) REFERENCES sessions(id)
            );

            CREATE TABLE IF NOT EXISTS knowledge (
                id TEXT PRIMARY KEY,
                session_id TEXT NOT NULL DEFAULT '',
                case_code TEXT NOT NULL DEFAULT '',
                title TEXT NOT NULL,
                source_type TEXT NOT NULL DEFAULT 'manual',
                issue_type TEXT NOT NULL DEFAULT '',
                fault_type TEXT NOT NULL DEFAULT '',
                layer_hint TEXT NOT NULL DEFAULT '',
                symptom TEXT NOT NULL DEFAULT '',
                root_cause TEXT NOT NULL DEFAULT '',
                solution TEXT NOT NULL DEFAULT '',
                validation TEXT NOT NULL DEFAULT '',
                quick_checks_json TEXT NOT NULL DEFAULT '[]',
                related_cases_json TEXT NOT NULL DEFAULT '[]',
                references_json TEXT NOT NULL DEFAULT '[]',
                tags_json TEXT NOT NULL DEFAULT '[]',
                status TEXT NOT NULL DEFAULT 'draft',
                source_title TEXT NOT NULL DEFAULT '',
                source_url TEXT NOT NULL DEFAULT '',
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS test_cases (
                id TEXT PRIMARY KEY,
                case_code TEXT NOT NULL,
                name TEXT NOT NULL,
                category TEXT NOT NULL DEFAULT '',
                target TEXT NOT NULL DEFAULT '',
                steps_json TEXT NOT NULL,
                pass_rule TEXT NOT NULL DEFAULT 'all_steps_pass',
                enabled INTEGER NOT NULL DEFAULT 1,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS test_runs (
                id TEXT PRIMARY KEY,
                case_id TEXT NOT NULL,
                session_id TEXT NOT NULL DEFAULT '',
                generated_session_id TEXT NOT NULL DEFAULT '',
                device_model TEXT NOT NULL DEFAULT '',
                serial_number TEXT NOT NULL DEFAULT '',
                started_at TEXT NOT NULL,
                ended_at TEXT NOT NULL,
                result TEXT NOT NULL,
                fail_step TEXT NOT NULL DEFAULT '',
                report_json TEXT NOT NULL,
                created_at TEXT NOT NULL,
                FOREIGN KEY(case_id) REFERENCES test_cases(id)
            );
            """
        )
        existing_columns = {row[1] for row in conn.execute("PRAGMA table_info(sessions)").fetchall()}
        if "device_model" not in existing_columns:
            conn.execute("ALTER TABLE sessions ADD COLUMN device_model TEXT NOT NULL DEFAULT ''")
        if "serial_number" not in existing_columns:
            conn.execute("ALTER TABLE sessions ADD COLUMN serial_number TEXT NOT NULL DEFAULT ''")
        if "issue_type" not in existing_columns:
            conn.execute("ALTER TABLE sessions ADD COLUMN issue_type TEXT NOT NULL DEFAULT ''")
        if "severity" not in existing_columns:
            conn.execute("ALTER TABLE sessions ADD COLUMN severity TEXT NOT NULL DEFAULT 'P1'")
        if "workflow_stage" not in existing_columns:
            conn.execute("ALTER TABLE sessions ADD COLUMN workflow_stage TEXT NOT NULL DEFAULT 'phenomenon'")
        if "symptom" not in existing_columns:
            conn.execute("ALTER TABLE sessions ADD COLUMN symptom TEXT NOT NULL DEFAULT ''")
        if "owner" not in existing_columns:
            conn.execute("ALTER TABLE sessions ADD COLUMN owner TEXT NOT NULL DEFAULT ''")
        knowledge_columns = {row[1] for row in conn.execute("PRAGMA table_info(knowledge)").fetchall()}
        if "case_code" not in knowledge_columns:
            conn.execute("ALTER TABLE knowledge ADD COLUMN case_code TEXT NOT NULL DEFAULT ''")
        if "source_type" not in knowledge_columns:
            conn.execute("ALTER TABLE knowledge ADD COLUMN source_type TEXT NOT NULL DEFAULT 'manual'")
        if "issue_type" not in knowledge_columns:
            conn.execute("ALTER TABLE knowledge ADD COLUMN issue_type TEXT NOT NULL DEFAULT ''")
        if "fault_type" not in knowledge_columns:
            conn.execute("ALTER TABLE knowledge ADD COLUMN fault_type TEXT NOT NULL DEFAULT ''")
        if "layer_hint" not in knowledge_columns:
            conn.execute("ALTER TABLE knowledge ADD COLUMN layer_hint TEXT NOT NULL DEFAULT ''")
        if "symptom" not in knowledge_columns:
            conn.execute("ALTER TABLE knowledge ADD COLUMN symptom TEXT NOT NULL DEFAULT ''")
        if "quick_checks_json" not in knowledge_columns:
            conn.execute("ALTER TABLE knowledge ADD COLUMN quick_checks_json TEXT NOT NULL DEFAULT '[]'")
        if "references_json" not in knowledge_columns:
            conn.execute("ALTER TABLE knowledge ADD COLUMN references_json TEXT NOT NULL DEFAULT '[]'")
        if "status" not in knowledge_columns:
            conn.execute("ALTER TABLE knowledge ADD COLUMN status TEXT NOT NULL DEFAULT 'draft'")
        if "source_title" not in knowledge_columns:
            conn.execute("ALTER TABLE knowledge ADD COLUMN source_title TEXT NOT NULL DEFAULT ''")
        if "source_url" not in knowledge_columns:
            conn.execute("ALTER TABLE knowledge ADD COLUMN source_url TEXT NOT NULL DEFAULT ''")
        conn.commit()
    finally:
        conn.close()


def get_conn() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def _normalize_provider_profile(raw_profile: dict, fallback_name: str = DEFAULT_PROVIDER_PROFILE_NAME) -> dict:
    return {
        "id": str(raw_profile.get("id", "")).strip() or DEFAULT_PROVIDER_PROFILE_ID,
        "profileName": str(raw_profile.get("profileName", "")).strip() or fallback_name,
        "providerName": str(raw_profile.get("providerName", DEFAULT_PROVIDER_CONFIG["providerName"])).strip() or DEFAULT_PROVIDER_CONFIG["providerName"],
        "apiBaseUrl": str(raw_profile.get("apiBaseUrl", DEFAULT_PROVIDER_CONFIG["apiBaseUrl"])).strip() or DEFAULT_PROVIDER_CONFIG["apiBaseUrl"],
        "apiKey": str(raw_profile.get("apiKey", DEFAULT_PROVIDER_CONFIG["apiKey"])).strip(),
        "model": str(raw_profile.get("model", DEFAULT_PROVIDER_CONFIG["model"])).strip() or DEFAULT_PROVIDER_CONFIG["model"],
        "createdAt": str(raw_profile.get("createdAt", "")).strip() or now_ts(),
        "updatedAt": str(raw_profile.get("updatedAt", "")).strip() or now_ts(),
    }


def load_provider_profiles_state() -> dict:
    default_profile = _normalize_provider_profile({"id": DEFAULT_PROVIDER_PROFILE_ID, "profileName": DEFAULT_PROVIDER_PROFILE_NAME, **DEFAULT_PROVIDER_CONFIG})
    state = {"activeProfileId": default_profile["id"], "profiles": [default_profile]}
    if not CONFIG_PATH.exists():
        return state
    try:
        parsed = json.loads(CONFIG_PATH.read_text(encoding="utf-8"))
    except Exception:
        return state

    if isinstance(parsed, dict) and isinstance(parsed.get("profiles"), list):
        profiles = [_normalize_provider_profile(item) for item in parsed.get("profiles", []) if isinstance(item, dict)]
        if not profiles:
            profiles = [default_profile]
        active_profile_id = str(parsed.get("activeProfileId", "")).strip() or profiles[0]["id"]
        if not any(item["id"] == active_profile_id for item in profiles):
            active_profile_id = profiles[0]["id"]
        return {"activeProfileId": active_profile_id, "profiles": profiles}

    if isinstance(parsed, dict):
        migrated = _normalize_provider_profile({"id": DEFAULT_PROVIDER_PROFILE_ID, **DEFAULT_PROVIDER_CONFIG, **parsed})
        return {"activeProfileId": migrated["id"], "profiles": [migrated]}

    return state


def save_provider_profiles_state(state: dict) -> None:
    CONFIG_PATH.write_text(json.dumps(state, ensure_ascii=False, indent=2), encoding="utf-8")


def list_provider_profiles() -> list[dict]:
    state = load_provider_profiles_state()
    profiles = []
    for item in state.get("profiles", []):
        profile = dict(item)
        profile["apiConfigured"] = bool(profile.get("apiKey", "").strip())
        profiles.append(profile)
    return profiles


def load_provider_config() -> dict:
    state = load_provider_profiles_state()
    active_profile_id = state.get("activeProfileId", "")
    for item in state.get("profiles", []):
        if item.get("id") == active_profile_id:
            return dict(item)
    return dict(state.get("profiles", [{}])[0] or DEFAULT_PROVIDER_CONFIG)


def save_provider_config(config: dict) -> dict:
    state = load_provider_profiles_state()
    now = now_ts()
    incoming_id = str(config.get("id", "")).strip()
    profile_name = str(config.get("profileName", "")).strip() or str(config.get("providerName", "")).strip() or DEFAULT_PROVIDER_PROFILE_NAME
    normalized = _normalize_provider_profile({**config, "id": incoming_id, "profileName": profile_name, "updatedAt": now})
    profiles = state.get("profiles", [])
    existing_index = next((index for index, item in enumerate(profiles) if item.get("id") == normalized["id"]), -1)
    if existing_index >= 0:
        normalized["createdAt"] = profiles[existing_index].get("createdAt", normalized["createdAt"])
        profiles[existing_index] = normalized
    else:
        profiles.append(normalized)
    state["profiles"] = profiles
    state["activeProfileId"] = normalized["id"]
    save_provider_profiles_state(state)
    return normalized


def select_provider_profile(profile_id: str) -> dict:
    state = load_provider_profiles_state()
    for item in state.get("profiles", []):
        if item.get("id") == profile_id:
            state["activeProfileId"] = profile_id
            save_provider_profiles_state(state)
            return dict(item)
    raise KeyError("provider profile not found")


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


def build_text_payload(prompt: str, provider_config: dict, require_json: bool = False) -> tuple[str, str, str, dict]:
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
                {"role": "system", "content": "You are a concise embedded debug analyst. Return only the requested result." if not require_json else "You are a concise embedded debug analyst. Return only one valid JSON object. Do not add markdown, commentary, or trailing text."},
                {"role": "user", "content": prompt},
            ],
            "stream": False,
            "temperature": 0.1,
        }
        if require_json:
            payload["response_format"] = {"type": "json_object"}
    else:
        payload = {
            "model": effective_model,
            "input": [
                {"role": "system", "content": [{"type": "input_text", "text": "You are a concise embedded debug analyst. Return only the requested result." if not require_json else "You are a concise embedded debug analyst. Return only one valid JSON object. Do not add markdown, commentary, or trailing text."}]},
                {"role": "user", "content": [{"type": "input_text", "text": prompt}]},
            ],
        }

    return effective_api_base_url, effective_model, api_mode, payload


def call_provider_text(prompt: str, provider_config: dict, request_id: str | None = None, require_json: bool = False) -> str:
    api_key = provider_config.get("apiKey", "").strip()
    provider_name = provider_config.get("providerName", "").strip() or "Provider"
    if not api_key:
        raise RuntimeError("API Key is not configured.")

    effective_api_base_url, effective_model, api_mode, payload = build_text_payload(prompt, provider_config, require_json=require_json)
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
            "requireJson": require_json,
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
        with urllib.request.urlopen(request, timeout=AI_PROVIDER_TIMEOUT_SECONDS) as response:
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
        add_log("error", "provider", "AI provider timed out", {"timeoutSeconds": AI_PROVIDER_TIMEOUT_SECONDS, "providerName": provider_name}, request_id)
        raise RuntimeError(f"AI provider timed out after {AI_PROVIDER_TIMEOUT_SECONDS} seconds") from exc

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
        "deviceModel": row["device_model"],
        "serialNumber": row["serial_number"],
        "deviceIp": row["device_ip"],
        "issueType": row["issue_type"],
        "severity": row["severity"],
        "workflowStage": row["workflow_stage"],
        "symptom": row["symptom"],
        "owner": row["owner"],
        "status": row["status"],
        "createdAt": row["created_at"],
        "updatedAt": row["updated_at"],
    }


def evidence_to_dict(row: sqlite3.Row) -> dict:
    file_name = row["file_name"] or ""
    file_path = row["file_path"] or ""
    suffix = Path(file_name).suffix.lower()
    is_image = suffix in {".png", ".jpg", ".jpeg", ".webp", ".bmp", ".gif"}
    return {
        "id": row["id"],
        "sessionId": row["session_id"],
        "kind": row["kind"],
        "title": row["title"],
        "contentText": row["content_text"],
        "fileName": file_name,
        "filePath": file_path,
        "fileUrl": f"/api/evidence/{row['id']}/file" if file_path else "",
        "isImage": is_image,
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


def session_step_to_dict(row: sqlite3.Row) -> dict:
    return {
        "id": row["id"],
        "sessionId": row["session_id"],
        "step": row["step_key"],
        "data": json.loads(row["data_json"] or "{}"),
        "status": row["status"],
        "createdAt": row["created_at"],
        "updatedAt": row["updated_at"],
    }


def knowledge_to_dict(row: sqlite3.Row) -> dict:
    return {
        "id": row["id"],
        "sessionId": row["session_id"],
        "caseCode": row["case_code"],
        "title": row["title"],
        "sourceType": row["source_type"],
        "issueType": row["issue_type"],
        "faultType": row["fault_type"],
        "layerHint": row["layer_hint"],
        "symptom": row["symptom"],
        "rootCause": row["root_cause"],
        "solution": row["solution"],
        "validation": row["validation"],
        "quickChecks": json.loads(row["quick_checks_json"] or "[]"),
        "relatedCases": json.loads(row["related_cases_json"] or "[]"),
        "references": json.loads(row["references_json"] or "[]"),
        "tags": json.loads(row["tags_json"] or "[]"),
        "status": row["status"],
        "sourceTitle": row["source_title"],
        "sourceUrl": row["source_url"],
        "createdAt": row["created_at"],
        "updatedAt": row["updated_at"],
    }


def test_case_to_dict(row: sqlite3.Row) -> dict:
    return {
        "id": row["id"],
        "caseCode": row["case_code"],
        "name": row["name"],
        "category": row["category"],
        "target": row["target"],
        "steps": json.loads(row["steps_json"] or "[]"),
        "passRule": row["pass_rule"],
        "enabled": bool(row["enabled"]),
        "createdAt": row["created_at"],
        "updatedAt": row["updated_at"],
    }


def test_run_to_dict(row: sqlite3.Row) -> dict:
    return {
        "id": row["id"],
        "caseId": row["case_id"],
        "sessionId": row["session_id"],
        "generatedSessionId": row["generated_session_id"],
        "deviceModel": row["device_model"],
        "serialNumber": row["serial_number"],
        "startedAt": row["started_at"],
        "endedAt": row["ended_at"],
        "result": row["result"],
        "failStep": row["fail_step"],
        "report": json.loads(row["report_json"] or "{}"),
        "createdAt": row["created_at"],
    }


def create_session(
    title: str,
    customer_name: str,
    device_model: str,
    serial_number: str,
    device_ip: str = "",
    issue_type: str = "",
    severity: str = "P1",
    workflow_stage: str = "phenomenon",
    symptom: str = "",
    owner: str = "",
) -> dict:
    session_id = uuid4().hex
    now = now_ts()
    conn = get_conn()
    try:
        conn.execute(
            """
            INSERT INTO sessions
            (id, title, customer_name, device_model, serial_number, device_ip, issue_type, severity, workflow_stage, symptom, owner, status, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'open', ?, ?)
            """,
            (
                session_id,
                title.strip() or "未命名会话",
                customer_name.strip(),
                device_model.strip(),
                serial_number.strip(),
                device_ip.strip(),
                issue_type.strip(),
                severity.strip() or "P1",
                workflow_stage.strip() or "phenomenon",
                symptom.strip(),
                owner.strip(),
                now,
                now,
            ),
        )
        conn.commit()
        row = conn.execute("SELECT * FROM sessions WHERE id = ?", (session_id,)).fetchone()
        for step in default_session_steps():
            conn.execute(
                """
                INSERT INTO session_steps (id, session_id, step_key, data_json, status, created_at, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    uuid4().hex,
                    session_id,
                    step["step"],
                    json.dumps(step["data"], ensure_ascii=False),
                    step["status"],
                    now,
                    now,
                ),
            )
        result = session_to_dict(row)
        conn.commit()
    finally:
        conn.close()
    write_session_markdown(session_id)
    return result


def update_session(
    session_id: str,
    title: str,
    customer_name: str,
    device_model: str,
    serial_number: str,
    device_ip: str = "",
    issue_type: str = "",
    severity: str = "P1",
    workflow_stage: str = "phenomenon",
    symptom: str = "",
    owner: str = "",
) -> dict:
    conn = get_conn()
    try:
        exists = conn.execute("SELECT 1 FROM sessions WHERE id = ?", (session_id,)).fetchone()
        if not exists:
            raise KeyError("session not found")
        conn.execute(
            """
            UPDATE sessions
            SET title = ?, customer_name = ?, device_model = ?, serial_number = ?, device_ip = ?, issue_type = ?, severity = ?, workflow_stage = ?, symptom = ?, owner = ?, updated_at = ?
            WHERE id = ?
            """,
            (
                title.strip() or "未命名会话",
                customer_name.strip(),
                device_model.strip(),
                serial_number.strip(),
                device_ip.strip(),
                issue_type.strip(),
                severity.strip() or "P1",
                workflow_stage.strip() or "phenomenon",
                symptom.strip(),
                owner.strip(),
                now_ts(),
                session_id,
            ),
        )
        conn.commit()
        row = conn.execute("SELECT * FROM sessions WHERE id = ?", (session_id,)).fetchone()
        result = session_to_dict(row)
    finally:
        conn.close()
    write_session_markdown(session_id)
    return result


def delete_session(session_id: str) -> None:
    conn = get_conn()
    try:
        session = conn.execute("SELECT 1 FROM sessions WHERE id = ?", (session_id,)).fetchone()
        if not session:
            raise KeyError("session not found")
        evidence_rows = conn.execute("SELECT file_path FROM evidence WHERE session_id = ?", (session_id,)).fetchall()
        conn.execute("DELETE FROM analyses WHERE session_id = ?", (session_id,))
        conn.execute("DELETE FROM evidence WHERE session_id = ?", (session_id,))
        conn.execute("DELETE FROM sessions WHERE id = ?", (session_id,))
        conn.commit()
        for row in evidence_rows:
            file_path = (row["file_path"] or "").strip()
            if file_path:
                try:
                    path = Path(file_path)
                    if path.exists():
                        path.unlink()
                except Exception:
                    pass
        upload_dir = UPLOAD_DIR / session_id
        if upload_dir.exists():
            for child in upload_dir.iterdir():
                try:
                    child.unlink()
                except Exception:
                    pass
            try:
                upload_dir.rmdir()
            except Exception:
                pass
    finally:
        conn.close()


def delete_evidence(evidence_id: str) -> str:
    session_id = ""
    file_path = ""
    conn = get_conn()
    try:
        row = conn.execute("SELECT session_id, file_path FROM evidence WHERE id = ?", (evidence_id,)).fetchone()
        if not row:
            raise KeyError("evidence not found")
        session_id = row["session_id"]
        file_path = (row["file_path"] or "").strip()
        conn.execute("DELETE FROM evidence WHERE id = ?", (evidence_id,))
        if session_id:
            touch_session(conn, session_id)
        conn.commit()
    finally:
        conn.close()

    if file_path:
        try:
            path = Path(file_path)
            if path.exists():
                path.unlink()
        except Exception:
            pass
    if session_id:
        write_session_markdown(session_id)
    return session_id


def delete_analysis(analysis_id: str) -> str:
    session_id = ""
    conn = get_conn()
    try:
        row = conn.execute("SELECT session_id FROM analyses WHERE id = ?", (analysis_id,)).fetchone()
        if not row:
            raise KeyError("analysis not found")
        session_id = row["session_id"]
        conn.execute("DELETE FROM analyses WHERE id = ?", (analysis_id,))
        if session_id:
            touch_session(conn, session_id)
        conn.commit()
    finally:
        conn.close()

    if session_id:
        write_session_markdown(session_id)
    return session_id


def get_evidence_file_info(evidence_id: str) -> tuple[Path, str]:
    conn = get_conn()
    try:
        row = conn.execute("SELECT file_name, file_path FROM evidence WHERE id = ?", (evidence_id,)).fetchone()
        if not row:
            raise KeyError("evidence not found")
        file_path = Path((row["file_path"] or "").strip())
        if not file_path:
            raise FileNotFoundError("evidence file not found")
        if not file_path.exists():
            raise FileNotFoundError("evidence file not found")
        return file_path, row["file_name"] or file_path.name
    finally:
        conn.close()


def list_sessions() -> list[dict]:
    conn = get_conn()
    try:
        rows = conn.execute("SELECT * FROM sessions ORDER BY updated_at DESC, created_at DESC").fetchall()
        return [session_to_dict(row) for row in rows]
    finally:
        conn.close()


def list_test_cases() -> list[dict]:
    conn = get_conn()
    try:
        rows = conn.execute("SELECT * FROM test_cases ORDER BY updated_at DESC, created_at DESC").fetchall()
        return [test_case_to_dict(row) for row in rows]
    finally:
        conn.close()


def get_test_case(test_case_id: str) -> dict:
    conn = get_conn()
    try:
        row = conn.execute("SELECT * FROM test_cases WHERE id = ?", (test_case_id,)).fetchone()
        if not row:
            raise KeyError("test case not found")
        return test_case_to_dict(row)
    finally:
        conn.close()


def upsert_test_case(case_code: str, name: str, category: str, target: str, steps: list[dict], pass_rule: str, enabled: bool = True) -> dict:
    now = now_ts()
    normalized_code = case_code.strip() or f"CASE-{uuid4().hex[:8].upper()}"
    conn = get_conn()
    try:
        existing = conn.execute("SELECT id FROM test_cases WHERE case_code = ?", (normalized_code,)).fetchone()
        if existing:
            test_case_id = existing["id"]
            conn.execute(
                """
                UPDATE test_cases
                SET name = ?, category = ?, target = ?, steps_json = ?, pass_rule = ?, enabled = ?, updated_at = ?
                WHERE id = ?
                """,
                (
                    name.strip() or normalized_code,
                    category.strip(),
                    target.strip(),
                    json.dumps(steps, ensure_ascii=False),
                    pass_rule.strip() or "all_steps_pass",
                    1 if enabled else 0,
                    now,
                    test_case_id,
                ),
            )
        else:
            test_case_id = uuid4().hex
            conn.execute(
                """
                INSERT INTO test_cases (id, case_code, name, category, target, steps_json, pass_rule, enabled, created_at, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    test_case_id,
                    normalized_code,
                    name.strip() or normalized_code,
                    category.strip(),
                    target.strip(),
                    json.dumps(steps, ensure_ascii=False),
                    pass_rule.strip() or "all_steps_pass",
                    1 if enabled else 0,
                    now,
                    now,
                ),
            )
        conn.commit()
        row = conn.execute("SELECT * FROM test_cases WHERE id = ?", (test_case_id,)).fetchone()
        return test_case_to_dict(row)
    finally:
        conn.close()


def list_test_runs(limit: int = 30) -> list[dict]:
    conn = get_conn()
    try:
        rows = conn.execute("SELECT * FROM test_runs ORDER BY created_at DESC LIMIT ?", (limit,)).fetchall()
        return [test_run_to_dict(row) for row in rows]
    finally:
        conn.close()


def list_knowledge(search_text: str = "") -> list[dict]:
    conn = get_conn()
    try:
        if search_text.strip():
            like = f"%{search_text.strip()}%"
            rows = conn.execute(
                """
                SELECT * FROM knowledge
                WHERE title LIKE ? OR case_code LIKE ? OR source_type LIKE ? OR issue_type LIKE ? OR fault_type LIKE ?
                  OR layer_hint LIKE ? OR symptom LIKE ? OR root_cause LIKE ? OR solution LIKE ? OR validation LIKE ?
                  OR tags_json LIKE ? OR source_title LIKE ? OR source_url LIKE ?
                ORDER BY updated_at DESC, created_at DESC
                """,
                (like, like, like, like, like, like, like, like, like, like, like, like, like),
            ).fetchall()
        else:
            rows = conn.execute("SELECT * FROM knowledge ORDER BY updated_at DESC, created_at DESC").fetchall()
        return [knowledge_to_dict(row) for row in rows]
    finally:
        conn.close()


def unique_text_list(values) -> list[str]:
    seen: set[str] = set()
    result: list[str] = []
    for item in values or []:
        text = str(item or "").strip()
        if not text or text in seen:
            continue
        seen.add(text)
        result.append(text)
    return result


def normalize_reference_entries(values) -> list[dict]:
    normalized: list[dict] = []
    for item in values or []:
        if isinstance(item, dict):
            label = str(item.get("label") or "").strip()
            url = str(item.get("url") or "").strip()
            value = str(item.get("value") or "").strip()
            if label or url or value:
                normalized.append({"label": label, "url": url, "value": value})
            continue
        text = str(item or "").strip()
        if text:
            normalized.append({"label": text, "url": "", "value": ""})
    return normalized


def next_case_code(prefix: str = "CASE") -> str:
    return f"{prefix}-{time.strftime('%Y%m%d')}-{uuid4().hex[:4].upper()}"


def normalize_knowledge_payload(payload: dict, default_source_type: str = "manual") -> dict:
    source_type = str(payload.get("sourceType", default_source_type) or default_source_type).strip() or default_source_type
    tags = payload.get("tags", [])
    if isinstance(tags, str):
        tags = re.split(r"[,，\n]+", tags)
    quick_checks = payload.get("quickChecks", [])
    if isinstance(quick_checks, str):
        quick_checks = re.split(r"\n+", quick_checks)
    related_cases = payload.get("relatedCases", [])
    references = payload.get("references", [])
    if isinstance(references, str):
        references = [{"label": part.strip(), "url": "", "value": ""} for part in re.split(r"\n+", references) if part.strip()]
    source_url = str(payload.get("sourceUrl", "")).strip()
    source_title = str(payload.get("sourceTitle", "")).strip()
    normalized = {
        "id": str(payload.get("id", "")).strip(),
        "sessionId": str(payload.get("sessionId", "")).strip(),
        "caseCode": str(payload.get("caseCode", "")).strip() or next_case_code("CASE"),
        "title": str(payload.get("title", "")).strip() or "未命名案例",
        "sourceType": source_type,
        "issueType": str(payload.get("issueType", "")).strip(),
        "faultType": str(payload.get("faultType", "")).strip(),
        "layerHint": str(payload.get("layerHint", "")).strip(),
        "symptom": str(payload.get("symptom", "")).strip(),
        "rootCause": str(payload.get("rootCause", "")).strip(),
        "solution": str(payload.get("solution", "")).strip(),
        "validation": str(payload.get("validation", "")).strip(),
        "quickChecks": unique_text_list(quick_checks),
        "relatedCases": normalize_reference_entries(related_cases),
        "references": normalize_reference_entries(references),
        "tags": unique_text_list(tags),
        "status": str(payload.get("status", "draft")).strip() or "draft",
        "sourceTitle": source_title,
        "sourceUrl": source_url,
    }
    if source_url and not any(ref.get("url") == source_url for ref in normalized["references"]):
        normalized["references"].append({"label": source_title or "来源链接", "url": source_url, "value": ""})
    return normalized


def upsert_knowledge_entry(payload: dict, default_source_type: str = "manual") -> dict:
    normalized = normalize_knowledge_payload(payload, default_source_type)
    now = now_ts()
    knowledge_id = normalized["id"] or uuid4().hex
    conn = get_conn()
    try:
        existing = conn.execute("SELECT id FROM knowledge WHERE id = ?", (knowledge_id,)).fetchone()
        params = (
            normalized["sessionId"],
            normalized["caseCode"],
            normalized["title"],
            normalized["sourceType"],
            normalized["issueType"],
            normalized["faultType"],
            normalized["layerHint"],
            normalized["symptom"],
            normalized["rootCause"],
            normalized["solution"],
            normalized["validation"],
            json.dumps(normalized["quickChecks"], ensure_ascii=False),
            json.dumps(normalized["relatedCases"], ensure_ascii=False),
            json.dumps(normalized["references"], ensure_ascii=False),
            json.dumps(normalized["tags"], ensure_ascii=False),
            normalized["status"],
            normalized["sourceTitle"],
            normalized["sourceUrl"],
        )
        if existing:
            conn.execute(
                """
                UPDATE knowledge
                SET session_id = ?, case_code = ?, title = ?, source_type = ?, issue_type = ?, fault_type = ?,
                    layer_hint = ?, symptom = ?, root_cause = ?, solution = ?, validation = ?, quick_checks_json = ?,
                    related_cases_json = ?, references_json = ?, tags_json = ?, status = ?, source_title = ?, source_url = ?, updated_at = ?
                WHERE id = ?
                """,
                (*params, now, knowledge_id),
            )
        else:
            conn.execute(
                """
                INSERT INTO knowledge (
                    id, session_id, case_code, title, source_type, issue_type, fault_type, layer_hint, symptom,
                    root_cause, solution, validation, quick_checks_json, related_cases_json, references_json,
                    tags_json, status, source_title, source_url, created_at, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (knowledge_id, *params, now, now),
            )
        conn.commit()
        row = conn.execute("SELECT * FROM knowledge WHERE id = ?", (knowledge_id,)).fetchone()
        return knowledge_to_dict(row)
    finally:
        conn.close()


def delete_knowledge(knowledge_id: str) -> None:
    conn = get_conn()
    try:
        row = conn.execute("SELECT 1 FROM knowledge WHERE id = ?", (knowledge_id,)).fetchone()
        if not row:
            raise KeyError("knowledge not found")
        conn.execute("DELETE FROM knowledge WHERE id = ?", (knowledge_id,))
        conn.commit()
    finally:
        conn.close()


def get_session_steps(conn: sqlite3.Connection, session_id: str) -> list[dict]:
    rows = conn.execute(
        "SELECT * FROM session_steps WHERE session_id = ? ORDER BY created_at ASC",
        (session_id,),
    ).fetchall()
    if rows:
        return [session_step_to_dict(row) for row in rows]
    now = now_ts()
    for step in default_session_steps():
        conn.execute(
            """
            INSERT INTO session_steps (id, session_id, step_key, data_json, status, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            """,
            (
                uuid4().hex,
                session_id,
                step["step"],
                json.dumps(step["data"], ensure_ascii=False),
                step["status"],
                now,
                now,
            ),
        )
    conn.commit()
    rows = conn.execute(
        "SELECT * FROM session_steps WHERE session_id = ? ORDER BY created_at ASC",
        (session_id,),
    ).fetchall()
    return [session_step_to_dict(row) for row in rows]


def upsert_session_step(session_id: str, step_key: str, data: dict, status: str) -> dict:
    now = now_ts()
    conn = get_conn()
    try:
        exists = conn.execute(
            "SELECT id FROM session_steps WHERE session_id = ? AND step_key = ?",
            (session_id, step_key),
        ).fetchone()
        if exists:
            conn.execute(
                """
                UPDATE session_steps
                SET data_json = ?, status = ?, updated_at = ?
                WHERE id = ?
                """,
                (json.dumps(data, ensure_ascii=False), status, now, exists["id"]),
            )
            row_id = exists["id"]
        else:
            row_id = uuid4().hex
            conn.execute(
                """
                INSERT INTO session_steps (id, session_id, step_key, data_json, status, created_at, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, ?)
                """,
                (row_id, session_id, step_key, json.dumps(data, ensure_ascii=False), status, now, now),
            )
        touch_session(conn, session_id)
        conn.commit()
        row = conn.execute("SELECT * FROM session_steps WHERE id = ?", (row_id,)).fetchone()
        return session_step_to_dict(row)
    finally:
        conn.close()


def create_knowledge_from_payload(
    session_id: str,
    title: str,
    root_cause: str,
    solution: str,
    validation: str,
    related_cases: list,
    tags: list,
) -> dict:
    return upsert_knowledge_entry(
        {
            "sessionId": session_id,
            "title": title.strip() or "未命名知识条目",
            "rootCause": root_cause.strip(),
            "solution": solution.strip(),
            "validation": validation.strip(),
            "relatedCases": related_cases or [],
            "tags": tags or [],
        },
        default_source_type="session",
    )


def ensure_default_library_entries() -> None:
    title = "Awesome-Embedded 外部案例资源库"
    existing_id = ""
    conn = get_conn()
    try:
        exists = conn.execute("SELECT id FROM knowledge WHERE title = ?", (title,)).fetchone()
        if exists:
            existing_id = exists["id"]
    finally:
        conn.close()

    upsert_knowledge_entry(
        {
            "id": existing_id,
            "title": title,
            "caseCode": "REF-AWESOME-EMBEDDED",
            "sourceType": "external_reference",
            "issueType": "通用",
            "faultType": "外部参考库",
            "layerHint": "硬件→接口→驱动→系统→应用",
            "symptom": "当本地案例库缺少相似问题时，可先从外部嵌入式资源库扩展参考面。",
            "rootCause": (
                "这是一个面向嵌入式开发者的外部精选资源库，适合作为案例库里的通用参考入口。"
                "当用户遇到某类问题但本地知识库还不完善时，可以先从这个资源库里查找相关方向的资料、课程、驱动、工具链和调试经验。"
            ),
            "solution": (
                "适用方式：\n"
                "1. 先在当前 Session 明确问题类型，例如 UART / I2C / WIFI / Bootloader / RTOS。\n"
                "2. 再去这个外部资源库里按主题查找对应的资料。\n"
                "3. 将找到的参考资料继续导入本系统，作为当前分析的补充依据。\n"
                "4. 如果外部资料帮助定位了问题，再把结论沉淀回本地 Knowledge Library。"
            ),
            "validation": (
                "这个资源库覆盖了 Embedded Software Skill、MCU programming、Linux Kernel and device driver development、RTOS、"
                "Peripheral、Machine Learning & AI on MCU、Tips & tricks 等方向，适合在缺少内部案例时作为外部参考库。"
            ),
            "quickChecks": ["先按问题类型筛选主题，再把命中的资料导入当前 Session。"],
            "relatedCases": [
                {"label": "GitHub 项目", "url": "https://github.com/nhivp/Awesome-Embedded"},
                {"label": "资源定位建议", "value": "先按问题类型筛选，再把命中的资料导入当前 Session"},
            ],
            "references": [{"label": "Awesome-Embedded", "url": "https://github.com/nhivp/Awesome-Embedded", "value": "外部参考库"}],
            "tags": ["外部资源", "参考库", "Embedded", "案例扩展", "Awesome-Embedded"],
            "status": "published",
            "sourceTitle": "Awesome-Embedded",
            "sourceUrl": "https://github.com/nhivp/Awesome-Embedded",
        },
        default_source_type="external_reference",
    )


def create_knowledge_from_session(session_id: str, payload: dict | None = None) -> dict:
    session_data = get_session(session_id)
    latest_analysis = (session_data.get("analyses") or [None])[0] or {}
    analysis_result = latest_analysis.get("result") or {}
    request_title = (payload or {}).get("title") if payload else ""
    title = str(request_title or session_data.get("title") or "未命名知识条目").strip()
    root_cause = str((payload or {}).get("rootCause") or analysis_result.get("root_cause_summary") or analysis_result.get("phenomenon_summary") or "").strip()
    solution = str((payload or {}).get("solution") or "\n".join(
        [item.get("instructions", "") for item in analysis_result.get("validation_steps", [])[:3] if isinstance(item, dict)]
    )).strip()
    validation = str((payload or {}).get("validation") or "\n".join(
        [item.get("guidance", "") for item in analysis_result.get("workflow_guidance", [])[:3] if isinstance(item, dict)]
    )).strip()
    related_cases = (payload or {}).get("relatedCases") or (analysis_result.get("related_assets") or {}).get("recommended_test_cases") or []
    tags = (payload or {}).get("tags") or (analysis_result.get("case_update_hint") or {}).get("candidate_root_cause_tags") or []
    quick_checks = (payload or {}).get("quickChecks") or [
        item.get("action", "") for item in analysis_result.get("guidance_checklist", [])[:5] if isinstance(item, dict)
    ]
    references = (payload or {}).get("references") or [
        {"label": entry.get("evidence_title", ""), "value": entry.get("kind", ""), "url": ""}
        for entry in analysis_result.get("evidence_used", [])
        if isinstance(entry, dict) and (entry.get("evidence_title") or entry.get("kind"))
    ]
    return upsert_knowledge_entry(
        {
            "sessionId": session_id,
            "caseCode": (payload or {}).get("caseCode", ""),
            "title": title,
            "sourceType": (payload or {}).get("sourceType", "session"),
            "issueType": (payload or {}).get("issueType", session_data.get("issueType", "")),
            "faultType": (payload or {}).get("faultType", ""),
            "layerHint": (payload or {}).get("layerHint", "硬件→接口→驱动→系统→应用"),
            "symptom": (payload or {}).get("symptom", analysis_result.get("phenomenon_summary", "")),
            "rootCause": root_cause,
            "solution": solution,
            "validation": validation,
            "quickChecks": quick_checks if isinstance(quick_checks, list) else [str(quick_checks)],
            "relatedCases": related_cases if isinstance(related_cases, list) else [str(related_cases)],
            "references": references if isinstance(references, list) else [references],
            "tags": tags if isinstance(tags, list) else [str(tags)],
            "status": (payload or {}).get("status", "draft"),
            "sourceTitle": (payload or {}).get("sourceTitle", ""),
            "sourceUrl": (payload or {}).get("sourceUrl", ""),
        },
        default_source_type="session",
    )


WORKFLOW_STAGES = [
    {"key": "phenomenon", "label": "现象", "goal": "明确问题表现、影响范围和触发条件"},
    {"key": "layered_analysis", "label": "分层分析", "goal": "判断问题更像硬件、接口、驱动还是系统层"},
    {"key": "validation", "label": "验证方法", "goal": "选测试、补证据、执行验证步骤"},
    {"key": "root_cause", "label": "根因", "goal": "基于证据收敛并确认最可能根因"},
    {"key": "solution", "label": "解决方案", "goal": "记录 workaround、修复动作和回归建议"},
    {"key": "lessons", "label": "经验总结", "goal": "沉淀 Case、标签和可复用规则"},
]


def default_session_steps() -> list[dict]:
    defaults = []
    for stage in WORKFLOW_STAGES:
        defaults.append(
            {
                "step": stage["key"],
                "data": {},
                "status": "pending",
            }
        )
    return defaults


def build_workbench_overview() -> dict:
    conn = get_conn()
    try:
        counts = {
            "sessions": conn.execute("SELECT COUNT(1) FROM sessions").fetchone()[0],
            "openSessions": conn.execute("SELECT COUNT(1) FROM sessions WHERE status != 'closed'").fetchone()[0],
            "analyses": conn.execute("SELECT COUNT(1) FROM analyses").fetchone()[0],
            "testCases": conn.execute("SELECT COUNT(1) FROM test_cases").fetchone()[0],
            "testRuns": conn.execute("SELECT COUNT(1) FROM test_runs").fetchone()[0],
            "evidence": conn.execute("SELECT COUNT(1) FROM evidence").fetchone()[0],
            "knowledge": conn.execute("SELECT COUNT(1) FROM knowledge").fetchone()[0],
        }
        issue_type_rows = conn.execute(
            """
            SELECT issue_type, COUNT(1) AS count
            FROM sessions
            WHERE TRIM(issue_type) != ''
            GROUP BY issue_type
            ORDER BY count DESC, issue_type ASC
            LIMIT 6
            """
        ).fetchall()
        severity_rows = conn.execute(
            """
            SELECT severity, COUNT(1) AS count
            FROM sessions
            GROUP BY severity
            ORDER BY count DESC
            """
        ).fetchall()
        recent_sessions = conn.execute("SELECT * FROM sessions ORDER BY updated_at DESC LIMIT 5").fetchall()
        recent_runs = conn.execute("SELECT * FROM test_runs ORDER BY created_at DESC LIMIT 5").fetchall()
        recent_knowledge = conn.execute("SELECT * FROM knowledge ORDER BY updated_at DESC LIMIT 5").fetchall()
        return {
            "counts": counts,
            "issueTypes": [{"label": row["issue_type"], "count": row["count"]} for row in issue_type_rows],
            "severities": [{"label": row["severity"], "count": row["count"]} for row in severity_rows],
            "recentSessions": [session_to_dict(row) for row in recent_sessions],
            "recentTestRuns": [test_run_to_dict(row) for row in recent_runs],
            "recentKnowledge": [knowledge_to_dict(row) for row in recent_knowledge],
            "workflowStages": WORKFLOW_STAGES,
        }
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
        payload["steps"] = get_session_steps(conn, session_id)
        payload["workflowStages"] = WORKFLOW_STAGES
        payload["libraryContext"] = build_library_context(conn, session_id)
        return payload
    finally:
        conn.close()


def build_library_context(conn: sqlite3.Connection, session_id: str) -> dict:
    recent_session_rows = conn.execute(
        """
        SELECT * FROM sessions
        WHERE id != ?
        ORDER BY updated_at DESC
        LIMIT 6
        """,
        (session_id,),
    ).fetchall()
    recent_analysis_rows = conn.execute(
        """
        SELECT analyses.*, sessions.title AS session_title, sessions.issue_type AS issue_type
        FROM analyses
        JOIN sessions ON sessions.id = analyses.session_id
        WHERE analyses.session_id != ?
        ORDER BY analyses.created_at DESC
        LIMIT 6
        """,
        (session_id,),
    ).fetchall()
    test_case_rows = conn.execute("SELECT * FROM test_cases ORDER BY updated_at DESC LIMIT 8").fetchall()
    knowledge_rows = conn.execute("SELECT * FROM knowledge ORDER BY updated_at DESC LIMIT 8").fetchall()
    return {
        "recentSessions": [
            {
                **session_to_dict(row),
            }
            for row in recent_session_rows
        ],
        "recentAnalyses": [
            {
                "id": row["id"],
                "sessionId": row["session_id"],
                "sessionTitle": row["session_title"],
                "issueType": row["issue_type"],
                "createdAt": row["created_at"],
                "result": json.loads(row["result_json"] or "{}"),
            }
            for row in recent_analysis_rows
        ],
        "testCases": [test_case_to_dict(row) for row in test_case_rows],
        "knowledge": [knowledge_to_dict(row) for row in knowledge_rows],
    }


def suggest_test_cases_for_session(session_payload: dict) -> list[dict]:
    issue_type = (session_payload.get("issueType") or "").strip().lower()
    device_model = (session_payload.get("deviceModel") or "").strip().lower()
    recommendations = []
    for test_case in session_payload.get("libraryContext", {}).get("testCases", []):
        score = 0
        category = (test_case.get("category") or "").strip().lower()
        target = (test_case.get("target") or "").strip().lower()
        if issue_type and issue_type in category:
            score += 2
        if device_model and device_model in target:
            score += 1
        if score or not recommendations:
            recommendations.append(
                {
                    "id": test_case.get("id"),
                    "caseCode": test_case.get("caseCode"),
                    "name": test_case.get("name"),
                    "category": test_case.get("category"),
                    "target": test_case.get("target"),
                    "score": score,
                }
            )
    recommendations.sort(key=lambda item: (-item["score"], item["caseCode"] or ""))
    return recommendations[:5]


def detect_missing_info_for_session(session_payload: dict) -> list[str]:
    missing = []
    evidence = session_payload.get("evidence", [])
    has_problem_description = any(item.get("kind") == "imported_info" for item in evidence)
    has_serial_log = any(item.get("kind") == "serial_log" for item in evidence)
    if not (has_problem_description or has_serial_log):
        missing.append("请至少补充一段问题描述或一段串口 log 后再分析。")
    return missing


DEFAULT_ANALYSIS_DIMENSIONS = ["硬件", "软件", "固件", "OS", "器件", "生产", "工艺"]
CATEGORY_ALIASES = {
    "hardware": "硬件",
    "hw": "硬件",
    "software": "软件",
    "sw": "软件",
    "firmware": "固件",
    "fw": "固件",
    "os": "OS",
    "rtos": "OS",
    "device": "器件",
    "component": "器件",
    "production": "生产",
    "manufacturing": "生产",
    "process": "工艺",
}


def normalize_category_name(value: str) -> str:
    text = str(value or "").strip()
    if text in {"暂无分析结果", "无", "N/A", "n/a", "-"}:
        return ""
    lowered = text.lower()
    if lowered in CATEGORY_ALIASES:
        return CATEGORY_ALIASES[lowered]
    return text


def normalize_layered_validation_rows(result_json: dict) -> dict:
    raw_rows = result_json.get("layered_validation_rows")
    normalized_rows: list[dict] = []

    if isinstance(raw_rows, list):
        for row in raw_rows:
            if not isinstance(row, dict):
                continue
            normalized_rows.append(
                {
                    "category": str(row.get("category") or "").strip(),
                    "subtype": str(row.get("subtype") or "").strip(),
                    "owner": str(row.get("owner") or "").strip() or "待定",
                    "phenomenon": str(row.get("phenomenon") or "").strip(),
                    "reason": str(row.get("reason") or "").strip(),
                    "basis": str(row.get("basis") or "").strip(),
                    "method": str(row.get("method") or "").strip(),
                    "result": str(row.get("result") or "").strip(),
                }
            )

    if not normalized_rows:
        layered = result_json.get("layered_analysis") or []
        validations = result_json.get("validation_steps") or []
        for index, category in enumerate(DEFAULT_ANALYSIS_DIMENSIONS):
            layered_item = layered[index] if isinstance(layered, list) and index < len(layered) and isinstance(layered[index], dict) else {}
            validation_item = validations[index] if isinstance(validations, list) and index < len(validations) and isinstance(validations[index], dict) else {}
            reason_text = str(layered_item.get("judgement") or "").strip()
            why_text = str(layered_item.get("why") or "").strip()
            method_text = str(validation_item.get("instructions") or validation_item.get("goal") or "").strip()
            result_text = str(validation_item.get("expected_result") or "").strip()
            normalized_rows.append(
                {
                    "category": category,
                    "subtype": "",
                    "owner": "待定",
                    "phenomenon": "暂无分析结果",
                    "reason": "；".join([item for item in [reason_text, why_text] if item]) or "暂无分析结果",
                    "basis": why_text or "暂无分析结果",
                    "method": method_text or "暂无分析结果",
                    "result": result_text or "暂无分析结果",
                }
            )

    for row in normalized_rows:
        row["category"] = normalize_category_name(row.get("category", ""))
        if not row.get("category"):
            row["category"] = "未分类"
        if not row.get("owner"):
            row["owner"] = "待定"
        if not row.get("phenomenon"):
            row["phenomenon"] = "暂无分析结果"
        if not row.get("reason"):
            row["reason"] = "暂无分析结果"
        if not row.get("basis"):
            row["basis"] = "暂无分析结果"
        if not row.get("method"):
            row["method"] = "暂无分析结果"
        if not row.get("result"):
            row["result"] = "暂无分析结果"

    existing_categories = {row.get("category", "") for row in normalized_rows if row.get("category")}
    for category in DEFAULT_ANALYSIS_DIMENSIONS:
        if category not in existing_categories:
            normalized_rows.append(
                {
                    "category": category,
                    "subtype": "",
                    "owner": "待定",
                    "phenomenon": "暂无分析结果",
                    "reason": "暂无分析结果",
                    "basis": "暂无分析结果",
                    "method": "暂无分析结果",
                    "result": "暂无分析结果",
                }
            )

    grouped_rows: list[dict] = []
    for category in DEFAULT_ANALYSIS_DIMENSIONS:
        grouped_rows.extend([row for row in normalized_rows if row["category"] == category])
    grouped_rows.extend([row for row in normalized_rows if row["category"] not in DEFAULT_ANALYSIS_DIMENSIONS])

    result_json["layered_validation_rows"] = grouped_rows
    return result_json


def enforce_evidence_basis(result_json: dict, session_payload: dict) -> dict:
    evidence_titles = [str(item.get("title") or "").strip() for item in session_payload.get("evidence", []) if isinstance(item, dict)]
    knowledge_titles = [str(item.get("title") or "").strip() for item in session_payload.get("knowledge", []) if isinstance(item, dict)]
    markers = {
        "串口日志",
        "资料",
        "导入信息",
        "附件",
        "案例库",
        "知识库",
        "历史会话",
        "图片",
        "测试报告",
        "规格书",
        "datasheet",
        "spec",
        "log",
    }
    markers.update([item for item in evidence_titles + knowledge_titles if item])
    lowered_markers = [marker.lower() for marker in markers if marker]

    sanitized_rows: list[dict] = []
    for row in result_json.get("layered_validation_rows", []) or []:
        if not isinstance(row, dict):
            continue
        basis_text = str(row.get("basis") or "").strip()
        basis_lower = basis_text.lower()
        has_marker = basis_text == "暂无分析结果" or any(marker in basis_lower for marker in lowered_markers)
        if not has_marker:
            sanitized_rows.append(
                {
                    "category": row.get("category", "未分类"),
                    "owner": row.get("owner", "待定") or "待定",
                    "subtype": "",
                    "phenomenon": row.get("phenomenon", "暂无分析结果") or "暂无分析结果",
                    "reason": "暂无分析结果",
                    "basis": "暂无分析结果",
                    "method": "暂无分析结果",
                    "result": "暂无分析结果",
                }
            )
            continue
        sanitized_rows.append(row)

    result_json["layered_validation_rows"] = sanitized_rows
    return result_json


def create_fail_session_from_test_run(base_session: dict, test_case: dict, report: dict) -> dict:
    fail_session = create_session(
        title=f"FAIL {test_case.get('caseCode') or test_case.get('name')} {now_ts()}",
        customer_name=base_session.get("customerName", ""),
        device_model=base_session.get("deviceModel", ""),
        serial_number=base_session.get("serialNumber", ""),
        device_ip=base_session.get("deviceIp", ""),
    )
    latest_logs = [item for item in base_session.get("evidence", []) if item.get("kind") == "serial_log"][:1]
    for log_item in latest_logs:
        add_evidence(
            fail_session["id"],
            "serial_log",
            f"失败关联日志：{log_item.get('title')}",
            content_text=log_item.get("contentText", ""),
            file_name=log_item.get("fileName", ""),
            file_path=log_item.get("filePath", ""),
            meta=log_item.get("meta", {}),
        )
    add_evidence(
        fail_session["id"],
        "test_report",
        f"自动测试失败报告：{test_case.get('caseCode') or test_case.get('name')}",
        content_text=json.dumps(report, ensure_ascii=False, indent=2),
        meta={"source": "test_run", "caseId": test_case.get("id", "")},
    )
    return fail_session


def execute_test_case(test_case_id: str, session_id: str) -> dict:
    test_case = get_test_case(test_case_id)
    if not test_case.get("enabled", True):
        raise RuntimeError("该测试用例已禁用。")
    base_session = get_session(session_id)
    steps = test_case.get("steps", [])
    serial_logs = [item.get("contentText", "") for item in base_session.get("evidence", []) if item.get("kind") == "serial_log"]
    serial_text = "\n".join(serial_logs)
    started_at = now_ts()
    step_results: list[dict] = []
    overall_result = "pass"
    fail_step = ""
    for index, step in enumerate(steps, start=1):
        step_id = step.get("step_id") or f"step_{index}"
        step_type = step.get("type", "")
        result = {"stepId": step_id, "type": step_type, "pass": False, "detail": ""}
        if step_type == "serial_expect":
            pattern = str(step.get("pattern", "")).strip()
            matched = bool(pattern) and pattern in serial_text
            result["pass"] = matched
            result["detail"] = f"pattern={pattern}" if pattern else "缺少 pattern"
        elif step_type == "delay":
            result["pass"] = True
            result["detail"] = f"delay_ms={step.get('delay_ms', 0)}"
        else:
            result["pass"] = False
            result["detail"] = f"当前 MVP 尚未实现步骤类型：{step_type}"
        step_results.append(result)
        if not result["pass"] and not fail_step:
            overall_result = "fail"
            fail_step = step_id
            if test_case.get("passRule", "all_steps_pass") == "all_steps_pass":
                break

    ended_at = now_ts()
    report = {
        "caseCode": test_case.get("caseCode", ""),
        "caseName": test_case.get("name", ""),
        "sessionId": session_id,
        "deviceModel": base_session.get("deviceModel", ""),
        "serialNumber": base_session.get("serialNumber", ""),
        "startedAt": started_at,
        "endedAt": ended_at,
        "result": overall_result,
        "failStep": fail_step,
        "stepResults": step_results,
    }

    generated_session_id = ""
    if overall_result == "fail":
        fail_session = create_fail_session_from_test_run(base_session, test_case, report)
        generated_session_id = fail_session["id"]

    run_id = uuid4().hex
    conn = get_conn()
    try:
        conn.execute(
            """
            INSERT INTO test_runs
            (id, case_id, session_id, generated_session_id, device_model, serial_number, started_at, ended_at, result, fail_step, report_json, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                run_id,
                test_case_id,
                session_id,
                generated_session_id,
                base_session.get("deviceModel", ""),
                base_session.get("serialNumber", ""),
                started_at,
                ended_at,
                overall_result,
                fail_step,
                json.dumps(report, ensure_ascii=False),
                ended_at,
            ),
        )
        conn.commit()
        row = conn.execute("SELECT * FROM test_runs WHERE id = ?", (run_id,)).fetchone()
        run_payload = test_run_to_dict(row)
    finally:
        conn.close()
    return {"run": run_payload, "generatedSessionId": generated_session_id}


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
        result = evidence_to_dict(row)
    finally:
        conn.close()
    write_session_markdown(session_id)
    return result


def append_evidence_content(evidence_id: str, chunk_text: str) -> None:
    session_id = ""
    conn = get_conn()
    try:
        row = conn.execute("SELECT session_id, content_text FROM evidence WHERE id = ?", (evidence_id,)).fetchone()
        if not row:
            raise KeyError("evidence not found")
        session_id = row["session_id"]
        merged = (row["content_text"] or "") + chunk_text
        conn.execute("UPDATE evidence SET content_text = ? WHERE id = ?", (merged, evidence_id))
        touch_session(conn, session_id)
        conn.commit()
    finally:
        conn.close()
    if session_id:
        write_session_markdown(session_id)


def save_uploaded_file(session_id: str, file_name: str, content: bytes) -> tuple[str, str]:
    target_dir = UPLOAD_DIR / session_id
    target_dir.mkdir(parents=True, exist_ok=True)
    safe_name = Path(file_name).name or f"upload-{uuid4().hex}"
    target_path = target_dir / f"{int(time.time())}-{safe_name}"
    target_path.write_bytes(content)
    return safe_name, str(target_path.resolve())


def session_work_dir(session_id: str) -> Path:
    path = UPLOAD_DIR / session_id
    path.mkdir(parents=True, exist_ok=True)
    return path


def session_markdown_path(session_id: str) -> Path:
    return ROOT_DIR / "项目总文档.md"


DOC_AUTO_SECTION_START = "<!-- AUTO_ANALYSIS_START -->"
DOC_AUTO_SECTION_END = "<!-- AUTO_ANALYSIS_END -->"


def build_session_markdown(session_id: str) -> str:
    session_payload = get_session(session_id)
    lines: list[str] = []
    lines.append(f"## 最新分析内容与结果：{session_payload.get('title') or '未命名会话'}")
    lines.append("")
    lines.append("## 会话信息")
    lines.append("")
    lines.append(f"- 导出时间：{now_ts()}")
    lines.append(f"- 客户名称：{session_payload.get('customerName') or ''}")
    lines.append(f"- 设备型号：{session_payload.get('deviceModel') or ''}")
    lines.append(f"- 序号：{session_payload.get('serialNumber') or ''}")
    lines.append(f"- 设备 IP：{session_payload.get('deviceIp') or ''}")
    lines.append(f"- 问题类型：{session_payload.get('issueType') or ''}")
    lines.append(f"- 严重级别：{session_payload.get('severity') or ''}")
    lines.append(f"- 当前阶段：{session_payload.get('workflowStage') or ''}")
    lines.append(f"- 问题现象：{session_payload.get('symptom') or ''}")
    lines.append(f"- Owner：{session_payload.get('owner') or ''}")
    lines.append(f"- 会话状态：{session_payload.get('status') or ''}")
    lines.append("")

    serial_logs = [item for item in session_payload.get("evidence", []) if item.get("kind") == "serial_log"]
    imported_info = [
        item for item in session_payload.get("evidence", [])
        if item.get("kind") in {"imported_info", "material", "snapshot"}
    ]
    analyses = session_payload.get("analyses", [])

    lines.append("## 导入信息")
    lines.append("")
    if not imported_info:
        lines.append("暂无导入信息。")
        lines.append("")
    else:
        for item in reversed(imported_info):
            lines.append(f"### {item.get('title') or '未命名信息'}")
            lines.append("")
            lines.append(f"- 类型：{item.get('kind') or ''}")
            lines.append(f"- 记录时间：{item.get('createdAt') or ''}")
            if item.get("fileName"):
                lines.append(f"- 附件：{item.get('fileName')}")
            meta = item.get("meta") or {}
            if meta.get("mediaCategory"):
                lines.append(f"- 附件类别：{meta.get('mediaCategory')}")
            if meta.get("extractNote"):
                lines.append(f"- 抽取说明：{meta.get('extractNote')}")
            lines.append("")
            if item.get("contentText"):
                lines.append("```text")
                lines.append((item.get("contentText") or "").rstrip())
                lines.append("```")
                lines.append("")

    lines.append("## Log")
    lines.append("")
    if not serial_logs:
        lines.append("暂无串口日志。")
        lines.append("")
    else:
        for item in reversed(serial_logs):
            lines.append(f"### {item.get('title') or '未命名日志'}")
            lines.append("")
            lines.append(f"- 记录时间：{item.get('createdAt') or ''}")
            meta = item.get("meta") or {}
            if meta.get("port"):
                lines.append(f"- 串口：{meta.get('port')} @ {meta.get('baud')}")
            if item.get("fileName"):
                lines.append(f"- 来源文件：{item.get('fileName')}")
            lines.append("")
            lines.append("```text")
            lines.append((item.get("contentText") or "").rstrip())
            lines.append("```")
            lines.append("")

    lines.append("## 分析结果")
    lines.append("")
    if not analyses:
        lines.append("暂无分析结果。")
        lines.append("")
    else:
        for item in reversed(analyses):
            result = item.get("result") or {}
            lines.append(f"### {item.get('createdAt') or ''}")
            lines.append("")
            lines.append(f"- 分析目标：{item.get('requestText') or ''}")
            lines.append(f"- 测试时间：{result.get('test_time') or item.get('createdAt') or ''}")
            lines.append(f"- 设备型号：{result.get('device_model') or ''}")
            lines.append(f"- 序号：{result.get('serial_number') or ''}")
            lines.append(f"- 优先级：{result.get('priority') or ''}")
            lines.append(f"- 风险等级：{result.get('risk_level') or ''}")
            lines.append("")
            lines.append("#### 现象总结")
            lines.append("")
            lines.append(result.get("phenomenon_summary") or "无")
            lines.append("")
            lines.append("#### 分层分析")
            lines.append("")
            layered_items = result.get("layered_analysis") or []
            if layered_items:
                for entry in layered_items:
                    lines.append(f"- {entry.get('layer') or '未命名层'}：{entry.get('judgement') or ''}")
                    if entry.get("why"):
                        lines.append(f"  - 原因：{entry.get('why')}")
            else:
                lines.append("无")
            lines.append("")
            lines.append("#### 结构化 JSON")
            lines.append("")
            lines.append("```json")
            lines.append(json.dumps(result, ensure_ascii=False, indent=2))
            lines.append("```")
            lines.append("")
            raw_text = (item.get("rawText") or "").strip()
            if raw_text:
                lines.append("#### 原始返回")
                lines.append("")
                lines.append("```text")
                lines.append(raw_text)
                lines.append("```")
                lines.append("")

    return "\n".join(lines)


def write_session_markdown(session_id: str) -> None:
    path = session_markdown_path(session_id)
    auto_section = f"{DOC_AUTO_SECTION_START}\n{build_session_markdown(session_id).rstrip()}\n{DOC_AUTO_SECTION_END}"
    content = path.read_text(encoding="utf-8") if path.exists() else ""
    if DOC_AUTO_SECTION_START in content and DOC_AUTO_SECTION_END in content:
        content = re.sub(
            rf"{re.escape(DOC_AUTO_SECTION_START)}[\s\S]*?{re.escape(DOC_AUTO_SECTION_END)}",
            auto_section,
            content,
            count=1,
        )
    elif content.strip():
        content = content.rstrip() + "\n\n" + auto_section + "\n"
    else:
        content = auto_section + "\n"
    path.write_text(content, encoding="utf-8")


def refresh_master_document_from_latest_session() -> None:
    conn = get_conn()
    try:
        row = conn.execute("SELECT id FROM sessions ORDER BY updated_at DESC, created_at DESC LIMIT 1").fetchone()
    finally:
        conn.close()
    if row and row["id"]:
        write_session_markdown(row["id"])


def list_serial_port_dicts() -> list[dict]:
    ports = []
    for port in list_ports.comports():
        ports.append(
            {
                "device": port.device,
                "description": port.description,
                "hwid": port.hwid,
            }
        )
    return ports


def serial_capture_loop(port_name: str, baud_rate: int, evidence_id: str, stop_event: threading.Event) -> None:
    serial_obj = None
    try:
        serial_obj = serial.Serial(port=port_name, baudrate=baud_rate, timeout=1)
        add_log("info", "serial", "Serial capture started", {"port": port_name, "baud": baud_rate}, "serial-capture")
        buffer: list[str] = []
        last_flush = time.time()
        while not stop_event.is_set():
            line = serial_obj.readline()
            if not line:
                if buffer and time.time() - last_flush > 1.0:
                    chunk = "".join(buffer)
                    append_evidence_content(evidence_id, chunk)
                    SERIAL_CAPTURE_STATE["bytes"] += len(chunk.encode("utf-8", errors="replace"))
                    buffer.clear()
                    last_flush = time.time()
                continue
            decoded = line.decode("utf-8", errors="replace")
            buffer.append(decoded)
            SERIAL_CAPTURE_STATE["lines"] += 1
            if len(buffer) >= 20 or time.time() - last_flush > 0.8:
                chunk = "".join(buffer)
                append_evidence_content(evidence_id, chunk)
                SERIAL_CAPTURE_STATE["bytes"] += len(chunk.encode("utf-8", errors="replace"))
                buffer.clear()
                last_flush = time.time()
        if buffer:
            chunk = "".join(buffer)
            append_evidence_content(evidence_id, chunk)
            SERIAL_CAPTURE_STATE["bytes"] += len(chunk.encode("utf-8", errors="replace"))
        add_log(
            "info",
            "serial",
            "Serial capture stopped",
            {"port": port_name, "baud": baud_rate, "lines": SERIAL_CAPTURE_STATE["lines"], "bytes": SERIAL_CAPTURE_STATE["bytes"]},
            "serial-capture",
        )
    except Exception as exc:
        SERIAL_CAPTURE_STATE["lastError"] = str(exc)
        add_log("error", "serial", "Serial capture failed", {"port": port_name, "baud": baud_rate, "error": str(exc)}, "serial-capture")
    finally:
        if serial_obj is not None:
            try:
                serial_obj.close()
            except Exception:
                pass
        SERIAL_CAPTURE_STATE["running"] = False
        SERIAL_CAPTURE_STATE["thread"] = None
        SERIAL_CAPTURE_STATE["stopEvent"] = None


def start_serial_capture(session_id: str, port_name: str, baud_rate: int) -> dict:
    if SERIAL_CAPTURE_STATE["running"]:
        raise RuntimeError("已有串口采集任务在运行，请先停止当前采集。")
    evidence = add_evidence(
        session_id,
        "serial_log",
        f"自动串口采集 {port_name} @ {baud_rate}",
        content_text="",
        meta={"port": port_name, "baud": baud_rate, "mode": "live_capture"},
    )
    stop_event = threading.Event()
    worker = threading.Thread(
        target=serial_capture_loop,
        args=(port_name, baud_rate, evidence["id"], stop_event),
        daemon=True,
    )
    SERIAL_CAPTURE_STATE.update(
        {
            "running": True,
            "sessionId": session_id,
            "evidenceId": evidence["id"],
            "port": port_name,
            "baud": baud_rate,
            "startedAt": now_ts(),
            "lines": 0,
            "bytes": 0,
            "lastError": "",
            "thread": worker,
            "stopEvent": stop_event,
        }
    )
    worker.start()
    return evidence


def stop_serial_capture() -> dict:
    if not SERIAL_CAPTURE_STATE["running"]:
        return serial_capture_status()
    stop_event = SERIAL_CAPTURE_STATE.get("stopEvent")
    worker = SERIAL_CAPTURE_STATE.get("thread")
    if stop_event is not None:
        stop_event.set()
    if worker is not None:
        worker.join(timeout=2.5)
    return serial_capture_status()


def serial_capture_status() -> dict:
    return {
        "running": bool(SERIAL_CAPTURE_STATE["running"]),
        "sessionId": SERIAL_CAPTURE_STATE["sessionId"],
        "evidenceId": SERIAL_CAPTURE_STATE["evidenceId"],
        "port": SERIAL_CAPTURE_STATE["port"],
        "baud": SERIAL_CAPTURE_STATE["baud"],
        "startedAt": SERIAL_CAPTURE_STATE["startedAt"],
        "lines": SERIAL_CAPTURE_STATE["lines"],
        "bytes": SERIAL_CAPTURE_STATE["bytes"],
        "lastError": SERIAL_CAPTURE_STATE["lastError"],
    }


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


def summarize_library_context(session_payload: dict) -> dict:
    library_context = session_payload.get("libraryContext") or {}
    recent_sessions = []
    for item in library_context.get("recentSessions", [])[:4]:
        recent_sessions.append(
            {
                "title": item.get("title", ""),
                "issueType": item.get("issueType", ""),
                "severity": item.get("severity", ""),
                "stage": item.get("workflowStage", ""),
                "symptom": trim_text(item.get("symptom", ""), 160),
                "updatedAt": item.get("updatedAt", ""),
            }
        )
    recent_analyses = []
    for item in library_context.get("recentAnalyses", [])[:4]:
        result = item.get("result") or {}
        recent_analyses.append(
            {
                "sessionTitle": item.get("sessionTitle", ""),
                "issueType": item.get("issueType", ""),
                "phenomenonSummary": trim_text(result.get("phenomenon_summary", ""), 180),
                "priority": result.get("priority", ""),
                "riskLevel": result.get("risk_level", ""),
                "createdAt": item.get("createdAt", ""),
            }
        )
    test_cases = []
    for item in library_context.get("testCases", [])[:6]:
        test_cases.append(
            {
                "caseCode": item.get("caseCode", ""),
                "name": item.get("name", ""),
                "category": item.get("category", ""),
                "target": item.get("target", ""),
            }
        )
    knowledge_entries = []
    for item in library_context.get("knowledge", [])[:8]:
        knowledge_entries.append(
            {
                "caseCode": item.get("caseCode", ""),
                "title": item.get("title", ""),
                "sourceType": item.get("sourceType", ""),
                "issueType": item.get("issueType", ""),
                "faultType": item.get("faultType", ""),
                "layerHint": item.get("layerHint", ""),
                "symptom": trim_text(item.get("symptom", ""), 160),
                "rootCause": trim_text(item.get("rootCause", ""), 180),
                "solution": trim_text(item.get("solution", ""), 180),
                "quickChecks": item.get("quickChecks", [])[:5],
                "tags": item.get("tags", [])[:6],
                "references": item.get("references", [])[:4],
            }
        )
    return {
        "recentSessions": recent_sessions,
        "recentAnalyses": recent_analyses,
        "testCases": test_cases,
        "knowledge": knowledge_entries,
    }


def build_evidence_section(item: dict) -> str:
    body = item.get("contentText", "") or ""
    meta = item.get("meta") or {}
    if not body:
        summary_lines = []
        if item.get("fileName"):
            summary_lines.append(f"file_name: {item.get('fileName')}")
        if meta.get("mediaCategory"):
            summary_lines.append(f"media_category: {meta.get('mediaCategory')}")
        if meta.get("extractNote"):
            summary_lines.append(f"extract_note: {meta.get('extractNote')}")
        if item.get("kind") == "snapshot":
            summary_lines.append("图像证据已保存，本轮分析以文本资料、日志、导入信息和人工输入为主。")
        body = "\n".join(summary_lines)
    if not body:
        return ""
    return (
        f"[{item.get('kind')}] {item.get('title')}\n"
        f"created_at: {item.get('createdAt')}\n"
        f"content:\n{trim_text(body, 1000)}"
    )


def split_current_and_previous_evidence(session_payload: dict) -> tuple[list[dict], list[dict]]:
    evidence = session_payload.get("evidence", []) or []
    analyses = session_payload.get("analyses", []) or []
    if not evidence:
        return [], []
    latest_analysis_at = str(analyses[0].get("createdAt", "")).strip() if analyses else ""
    if latest_analysis_at:
        current_items = [item for item in evidence if str(item.get("createdAt", "")).strip() > latest_analysis_at]
        if current_items:
            previous_items = [item for item in evidence if item not in current_items]
            return current_items, previous_items
    current_items = evidence[: min(6, len(evidence))]
    previous_items = evidence[min(6, len(evidence)) :]
    return current_items, previous_items


def summarize_previous_evidence(previous_items: list[dict]) -> list[dict]:
    summary: list[dict] = []
    for item in previous_items[:8]:
        summary.append(
            {
                "kind": item.get("kind", ""),
                "title": item.get("title", ""),
                "fileName": item.get("fileName", ""),
                "createdAt": item.get("createdAt", ""),
            }
        )
    return summary


def build_analysis_prompt(session_payload: dict, request_text: str) -> str:
    current_evidence, previous_evidence = split_current_and_previous_evidence(session_payload)
    selected_sections: list[str] = []
    used_chars = 0

    for item in current_evidence:
        section = build_evidence_section(item)
        if not section:
            continue
        if used_chars + len(section) > MAX_PROMPT_EVIDENCE_CHARS:
            break
        selected_sections.append(section)
        used_chars += len(section)

    if not selected_sections:
        selected_sections.append("本次问题范围内还没有足够证据，请明确指出缺失信息。")

    protocol = {
        "workflow": [
            {"stage": "phenomenon", "label": "现象", "expectation": "总结症状、触发条件、影响范围"},
            {"stage": "layered_analysis", "label": "分层分析", "expectation": "判断更像硬件、接口、驱动或系统层问题"},
            {"stage": "validation", "label": "验证方法", "expectation": "给出最小验证动作和证据补充顺序"},
            {"stage": "root_cause", "label": "根因", "expectation": "说明当前最可疑的根因及证据强度"},
            {"stage": "solution", "label": "解决方案", "expectation": "给出 workaround、修复和回归建议"},
            {"stage": "lessons", "label": "经验总结", "expectation": "提炼为可复用规则和后续 case 方向"},
        ]
    }
    methodology = {
        "beginner_guidance": [
            "先确认现象，不要直接猜根因",
            "先读用户导入资料，再读日志和图片说明",
            "优先列出低层验证动作，让新手照着执行",
            "每个判断都必须给出判断依据；没有依据就写暂无分析结果",
            "优先引用案例库中的相似案例、快速检查项和验证路径",
        ],
        "fault_attributes": [
            "fault_type",
            "impact_scope",
            "trigger_condition",
            "frequency",
            "reproducibility",
            "evidence_types",
        ],
        "layer_order": ["硬件", "接口", "驱动", "系统", "应用"],
        "evidence_rules": [
            "事实必须绑定证据来源",
            "没有证据的结论只能写成待验证假设或暂无分析结果",
            "如果验证推翻当前判断，必须回到分层分析重新排序",
        ],
    }

    schema = {
        "phenomenon_summary": "",
        "phenomenon_items": [""],
        "layered_validation_rows": [{"category": "", "subtype": "", "owner": "", "phenomenon": "", "reason": "", "basis": "", "method": "", "result": ""}],
        "evidence_used": [{"evidence_title": "", "kind": "", "why_it_matters": ""}],
        "missing_information": [""],
        "priority": "P1",
        "risk_level": "low",
        "root_cause_items": [],
        "solution_items": [],
        "lessons_items": [],
    }

    return (
        "你是嵌入式自动测试与问题证据管理工作台里的分析助手。"
        "你的职责不是直接替工程师下最终结论，而是根据流程给出结构化分析和下一步引导。"
        "你必须只根据提供的资料、串口日志、导入信息、附件说明、历史沉淀和测试库进行推断，禁止臆造。"
        "请把整轮输出当作“新手问题定位指引”，而不是专家直接下结论。"
        "请优先遵循六步协议：现象、分层分析、验证方法、根因、解决方案、经验总结。"
        "本轮先只完成现象，以及“分层分析+验证方法”的合并条目。"
        "根因、解决方案、经验总结必须先留空，等待人工验证后再填写。"
        "重点输出：现象总结、现象列表、分层分析与验证合并列表、已用证据、缺失信息、优先级和风险等级。"
        "“02 分析与验证”列表中的每一条请显式给出 category、subtype、owner、reason、basis、method、result 七个字段。"
        "请优先从多个维度进行可能性分析，至少覆盖：硬件、软件、固件、OS、器件、生产、工艺。"
        "分析思路请参考硬件问题定位方法论：先整理现象与关键属性，再默认按 硬件→接口→驱动→系统→应用 的顺序排查。"
        "如果某个维度暂时没有足够结论，也必须在对应条目里写“暂无分析结果”。"
        "严禁为了填满表格而编造事实。所有判断都必须能回溯到用户提供的资料、日志或案例库内容。"
        "必须严格区分“本次问题证据”和“历史残留证据”：current_issue_evidence 是本次问题的主分析范围；previous_issue_reference_only 只能作为背景参考，不能覆盖本次结论。"
        "优先引用 knowledge_library 里的案例条目、快速检查项、验证方法和参考链接；如果案例库没有支撑，也要明确写出。"
        "basis 字段必须直接写明依据来源，例如“串口日志：...”“资料：...”“案例库：...”“外部参考：...”或“暂无分析结果”。"
        "如果当前证据不足以支持某一行，请把 reason、basis、method、result 写成“暂无分析结果”或明确缺少哪类证据。"
        "请优先帮助新手推进定位：每一行原因分析和验证方法都要写成可执行动作。"
        "如果证据不足，明确写入 missing_information。"
        "输出字段只能包含 json_schema_example 里列出的字段，不要额外增加无关字段。"
        "输出必须是纯 JSON，不能带 Markdown 代码块。\n\n"
        f"session:\n{json.dumps({k: session_payload.get(k) for k in ['id', 'title', 'customerName', 'deviceModel', 'serialNumber', 'deviceIp', 'issueType', 'severity', 'workflowStage', 'symptom', 'owner', 'status', 'createdAt', 'updatedAt']}, ensure_ascii=False, indent=2)}\n\n"
        f"workflow_protocol:\n{json.dumps(protocol, ensure_ascii=False, indent=2)}\n\n"
        f"methodology:\n{json.dumps(methodology, ensure_ascii=False, indent=2)}\n\n"
        f"knowledge_library:\n{json.dumps(summarize_library_context(session_payload), ensure_ascii=False, indent=2)}\n\n"
        f"user_request:\n{request_text.strip() or '请基于当前资料、日志和历史沉淀自动分析，并给出流程化引导。'}\n\n"
        f"current_issue_scope:\n{json.dumps({'currentEvidenceCount': len(current_evidence), 'previousEvidenceCount': len(previous_evidence), 'rule': '优先只分析最新一次分析之后新增的资料和日志；旧资料只作为背景参考。'}, ensure_ascii=False, indent=2)}\n\n"
        f"current_issue_evidence:\n{'\n\n'.join(selected_sections)}\n\n"
        f"previous_issue_reference_only:\n{json.dumps(summarize_previous_evidence(previous_evidence), ensure_ascii=False, indent=2)}\n\n"
        f"json_schema_example:\n{json.dumps(schema, ensure_ascii=False, indent=2)}"
    )


def _strip_model_wrappers(text: str) -> str:
    cleaned = text.strip().lstrip("\ufeff")
    cleaned = re.sub(r"^\s*```(?:json)?\s*", "", cleaned, flags=re.I)
    cleaned = re.sub(r"\s*```\s*$", "", cleaned)
    cleaned = re.sub(r"<think>[\s\S]*?</think>", "", cleaned, flags=re.I)
    return cleaned.strip()


def _extract_first_json_object(text: str) -> str:
    start = text.find("{")
    if start < 0:
        return ""
    depth = 0
    in_string = False
    escape = False
    for index in range(start, len(text)):
        char = text[index]
        if in_string:
            if escape:
                escape = False
            elif char == "\\":
                escape = True
            elif char == '"':
                in_string = False
            continue
        if char == '"':
            in_string = True
            continue
        if char == "{":
            depth += 1
        elif char == "}":
            depth -= 1
            if depth == 0:
                return text[start : index + 1]
    return text[start:].strip()


def _repair_common_json_issues(text: str) -> str:
    fixed = text.strip()
    fixed = fixed.replace("\r\n", "\n").replace("\r", "\n")
    fixed = fixed.replace("“", '"').replace("”", '"').replace("‘", "'").replace("’", "'")
    fixed = re.sub(r",\s*([}\]])", r"\1", fixed)
    fixed = re.sub(r"([{,]\s*)([A-Za-z_][A-Za-z0-9_]*)(\s*:)", r'\1"\2"\3', fixed)
    fixed = re.sub(r"([{,]\s*)'([^']+?)'(\s*:)", r'\1"\2"\3', fixed)
    fixed = re.sub(r":\s*'([^'\\]*(?:\\.[^'\\]*)*)'", lambda m: ': "' + m.group(1).replace('"', '\\"') + '"', fixed)
    return fixed


def _parse_with_literal_eval(candidate: str):
    pythonish = re.sub(r"\btrue\b", "True", candidate, flags=re.I)
    pythonish = re.sub(r"\bfalse\b", "False", pythonish, flags=re.I)
    pythonish = re.sub(r"\bnull\b", "None", pythonish, flags=re.I)
    return ast.literal_eval(pythonish)


def try_parse_analysis_json(raw_text: str) -> dict:
    text = _strip_model_wrappers(raw_text)
    attempts: list[str] = []
    if text:
        attempts.append(text)
    extracted = _extract_first_json_object(text)
    if extracted and extracted not in attempts:
        attempts.append(extracted)
    if extracted:
        repaired = _repair_common_json_issues(extracted)
        if repaired not in attempts:
            attempts.append(repaired)
    repaired_full = _repair_common_json_issues(text)
    if repaired_full and repaired_full not in attempts:
        attempts.append(repaired_full)

    last_error: Exception | None = None
    for candidate in attempts:
        try:
            parsed = json.loads(candidate)
            if isinstance(parsed, dict):
                return parsed
        except Exception as exc:
            last_error = exc
        try:
            parsed = _parse_with_literal_eval(candidate)
            if isinstance(parsed, dict):
                return parsed
        except Exception as exc:
            last_error = exc

    if not extracted:
        raise RuntimeError("AI 返回内容不是合法 JSON。")
    preview = trim_text(extracted, 240).replace("\n", " ")
    if last_error is not None:
        raise RuntimeError(f"AI 返回 JSON 解析失败：{last_error}；原文片段：{preview}") from last_error
    raise RuntimeError(f"AI 返回 JSON 解析失败；原文片段：{preview}")


def _extract_first_json_array(text: str) -> str:
    start = text.find("[")
    if start < 0:
        return ""
    depth = 0
    in_string = False
    escape = False
    for index in range(start, len(text)):
        char = text[index]
        if in_string:
            if escape:
                escape = False
            elif char == "\\":
                escape = True
            elif char == '"':
                in_string = False
            continue
        if char == '"':
            in_string = True
            continue
        if char == "[":
            depth += 1
        elif char == "]":
            depth -= 1
            if depth == 0:
                return text[start : index + 1]
    return text[start:].strip()


def try_parse_json_document(raw_text: str):
    text = _strip_model_wrappers(raw_text)
    object_candidate = _extract_first_json_object(text)
    array_candidate = _extract_first_json_array(text)
    attempts = [text]
    if object_candidate:
        attempts.append(object_candidate)
    if array_candidate:
        attempts.append(array_candidate)
    if object_candidate:
        attempts.append(_repair_common_json_issues(object_candidate))
    if array_candidate:
        attempts.append(_repair_common_json_issues(array_candidate))
    attempts.append(_repair_common_json_issues(text))
    last_error: Exception | None = None
    for candidate in attempts:
        if not candidate:
            continue
        try:
            return json.loads(candidate)
        except Exception as exc:
            last_error = exc
        try:
            return _parse_with_literal_eval(candidate)
        except Exception as exc:
            last_error = exc
    preview = trim_text(text, 240).replace("\n", " ")
    if last_error is not None:
        raise RuntimeError(f"AI 返回 JSON 解析失败：{last_error}；原文片段：{preview}") from last_error
    raise RuntimeError(f"AI 返回 JSON 解析失败；原文片段：{preview}")


def knowledge_schema_payload() -> dict:
    return {
        "requiredFields": [
            "caseCode",
            "title",
            "sourceType",
            "issueType",
            "faultType",
            "layerHint",
            "symptom",
            "rootCause",
            "solution",
            "validation",
            "quickChecks",
            "references",
            "tags",
            "status",
        ],
        "sourceTypes": ["manual", "session", "ai_import", "external_reference", "official_doc", "community_case"],
        "statuses": ["draft", "review", "approved", "deprecated"],
        "layerHints": ["硬件→接口→驱动→系统→应用", "硬件→接口→驱动", "系统→应用", "自定义"],
        "example": {
            "caseCode": "CASE-I2C-000123",
            "title": "冷启动后 I2C 首次读寄存器 NACK",
            "sourceType": "manual",
            "issueType": "I2C",
            "faultType": "时序/初始化",
            "layerHint": "硬件→接口→驱动→系统→应用",
            "symptom": "冷启动 0~50ms 内首次读寄存器返回 NACK，重试后恢复。",
            "rootCause": "器件上电 ready 时间晚于驱动首次读时序。",
            "solution": "增加 ready polling 或延时后首读，并补充回归测试。",
            "validation": "1. 延时 100ms 后再读；2. 轮询 ready bit；3. 冷启动 100 次回归。",
            "quickChecks": ["确认上电到首读的时间差", "检查是否存在 ready bit", "对比热启动与冷启动差异"],
            "references": [{"label": "官方 datasheet", "url": "https://example.com/datasheet", "value": "时序要求"}],
            "tags": ["I2C", "NACK", "cold_boot", "timing"],
            "status": "draft",
        },
    }


def build_knowledge_import_prompt(source_title: str, source_url: str, source_text: str) -> str:
    schema = knowledge_schema_payload()["example"]
    return (
        "你是嵌入式案例库的结构化整理助手。"
        "请只根据输入材料整理案例，禁止补造不存在的根因。"
        "如果材料不足，请把根因、解决方案、验证方法明确写成“暂无分析结果”或“待验证”。"
        "请按新手定位流程组织：现象 -> 分层分析线索 -> 验证方法 -> 根因 -> 解决方案 -> 经验总结/快速检查。"
        "输出必须是纯 JSON，格式为 {\"cases\": [...]}。"
        "cases 里的每个对象必须包含：caseCode,title,sourceType,issueType,faultType,layerHint,symptom,rootCause,solution,validation,quickChecks,references,tags,status。"
        "sourceType 固定写 ai_import。references 里至少保留来源标题和来源链接。"
        "如果材料里出现多个独立案例，可以输出多条；否则只输出一条。\n\n"
        f"source_title: {source_title or '未提供'}\n"
        f"source_url: {source_url or '未提供'}\n\n"
        f"source_text:\n{trim_text(source_text, 12000)}\n\n"
        f"json_example:\n{json.dumps({'cases': [schema]}, ensure_ascii=False, indent=2)}"
    )


def normalize_ai_import_cases(payload: dict) -> list[dict]:
    session_id = str(payload.get("sessionId", "")).strip()
    source_title = str(payload.get("sourceTitle", "")).strip()
    source_url = str(payload.get("sourceUrl", "")).strip()
    normalized_cases = payload.get("normalizedCases")
    if isinstance(normalized_cases, list) and normalized_cases:
        return [
            normalize_knowledge_payload(
                {**item, "sessionId": str(item.get("sessionId", "")).strip() or session_id, "sourceTitle": item.get("sourceTitle", "") or source_title, "sourceUrl": item.get("sourceUrl", "") or source_url},
                default_source_type="ai_import",
            )
            for item in normalized_cases
            if isinstance(item, dict)
        ]

    source_text = str(payload.get("sourceText", "")).strip()
    if not source_text:
        raise RuntimeError("sourceText 或 normalizedCases 至少提供一项")
    prompt = build_knowledge_import_prompt(source_title, source_url, source_text)
    raw_text = call_provider_text(prompt, load_provider_config(), str(int(time.time() * 1000)), require_json=True)
    parsed = try_parse_json_document(raw_text)
    if isinstance(parsed, list):
        cases = parsed
    elif isinstance(parsed, dict):
        cases = parsed.get("cases", [])
    else:
        raise RuntimeError("AI 导入没有返回可识别的案例数组")
    if not isinstance(cases, list) or not cases:
        raise RuntimeError("AI 导入没有生成案例条目")
    return [
        normalize_knowledge_payload(
            {**item, "sessionId": str(item.get("sessionId", "")).strip() or session_id, "sourceTitle": item.get("sourceTitle", "") or source_title, "sourceUrl": item.get("sourceUrl", "") or source_url},
            default_source_type="ai_import",
        )
        for item in cases
        if isinstance(item, dict)
    ]


def store_analysis(session_id: str, request_text: str, result_json: dict, raw_text: str) -> dict:
    analysis_id = uuid4().hex
    now = now_ts()
    session_payload = get_session(session_id)
    result_json.setdefault("test_time", now)
    result_json.setdefault("device_model", session_payload.get("deviceModel", ""))
    result_json.setdefault("serial_number", session_payload.get("serialNumber", ""))
    result_json.setdefault("phenomenon_summary", "")
    result_json.setdefault("phenomenon_items", [])
    result_json.setdefault("layered_validation_rows", [])
    result_json.setdefault("layered_analysis", [])
    result_json.setdefault("guidance_checklist", [])
    result_json.setdefault("evidence_checklist", [])
    result_json.setdefault("priority", "P1")
    result_json.setdefault("risk_level", "low")
    result_json.setdefault("workflow_guidance", [])
    result_json.setdefault("fishbone_diagram", {"problem": "", "branches": []})
    result_json.setdefault("mindmap_tree", {"root": "", "children": []})
    result_json.setdefault("related_assets", {"recommended_test_cases": [], "similar_session_hints": [], "reusable_patterns": []})
    result_json["root_cause_items"] = []
    result_json["solution_items"] = []
    result_json["lessons_items"] = []
    result_json["root_cause_summary"] = ""
    result_json["solution_summary"] = ""
    result_json["lessons_summary"] = ""
    conn = get_conn()
    try:
        conn.execute(
            "INSERT INTO analyses (id, session_id, request_text, result_json, raw_text, created_at) VALUES (?, ?, ?, ?, ?, ?)",
            (analysis_id, session_id, request_text, json.dumps(result_json, ensure_ascii=False), raw_text, now),
        )
        touch_session(conn, session_id)
        conn.commit()
        row = conn.execute("SELECT * FROM analyses WHERE id = ?", (analysis_id,)).fetchone()
        result = analysis_to_dict(row)
    finally:
        conn.close()
    write_session_markdown(session_id)
    return result


def update_analysis_result(analysis_id: str, result_json: dict) -> dict:
    session_id = ""
    conn = get_conn()
    try:
        row = conn.execute("SELECT session_id FROM analyses WHERE id = ?", (analysis_id,)).fetchone()
        if not row:
            raise KeyError("analysis not found")
        session_id = row["session_id"]
        conn.execute(
            "UPDATE analyses SET result_json = ? WHERE id = ?",
            (json.dumps(result_json, ensure_ascii=False), analysis_id),
        )
        touch_session(conn, session_id)
        conn.commit()
        updated = conn.execute("SELECT * FROM analyses WHERE id = ?", (analysis_id,)).fetchone()
        result = analysis_to_dict(updated)
    finally:
        conn.close()
    if session_id:
        write_session_markdown(session_id)
    return result


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
    raw_text = call_provider_text(prompt, load_provider_config(), request_id, require_json=True)
    result_json = try_parse_analysis_json(raw_text)
    result_json = normalize_layered_validation_rows(result_json)
    result_json = enforce_evidence_basis(result_json, session_payload)
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

    def send_file(self, file_path: Path, download_name: str = "") -> None:
        content = file_path.read_bytes()
        content_type = mimetypes.guess_type(file_path.name)[0] or "application/octet-stream"
        self.send_response(200)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(content)))
        if download_name:
            quoted = urllib.parse.quote(download_name)
            self.send_header("Content-Disposition", f"inline; filename*=UTF-8''{quoted}")
        self.end_headers()
        self.wfile.write(content)

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
            provider_profiles = list_provider_profiles()
            self.send_json(
                200,
                {
                    "appVersion": APP_VERSION,
                    "activeProfileId": provider_config.get("id", ""),
                    "profileName": provider_config.get("profileName", DEFAULT_PROVIDER_PROFILE_NAME),
                    "providerName": provider_config.get("providerName", ""),
                    "apiBaseUrl": provider_config.get("apiBaseUrl", ""),
                    "model": provider_config.get("model", ""),
                    "apiConfigured": bool(provider_config.get("apiKey", "").strip()),
                    "apiKeySaved": bool(provider_config.get("apiKey", "").strip()),
                    "visionSupported": provider_supports_vision(provider_config)[0],
                    "visionReason": provider_supports_vision(provider_config)[1],
                    "profiles": [
                        {
                            "id": item.get("id", ""),
                            "profileName": item.get("profileName", DEFAULT_PROVIDER_PROFILE_NAME),
                            "providerName": item.get("providerName", ""),
                            "apiBaseUrl": item.get("apiBaseUrl", ""),
                            "model": item.get("model", ""),
                            "apiConfigured": item.get("apiConfigured", False),
                        }
                        for item in provider_profiles
                    ],
                },
            )
            return

        if path == "/api/providers":
            profiles = list_provider_profiles()
            self.send_json(
                200,
                {
                    "activeProfileId": load_provider_config().get("id", ""),
                    "profiles": [
                        {
                            "id": item.get("id", ""),
                            "profileName": item.get("profileName", DEFAULT_PROVIDER_PROFILE_NAME),
                            "providerName": item.get("providerName", ""),
                            "apiBaseUrl": item.get("apiBaseUrl", ""),
                            "model": item.get("model", ""),
                            "apiConfigured": item.get("apiConfigured", False),
                        }
                        for item in profiles
                    ],
                },
            )
            return

        if path == "/api/provider/validate":
            provider_config = load_provider_config()
            validation = validate_provider_config(provider_config)
            self.send_json(
                200,
                {
                    "profileName": provider_config.get("profileName", DEFAULT_PROVIDER_PROFILE_NAME),
                    "providerName": provider_config.get("providerName", ""),
                    "apiConfigured": bool(provider_config.get("apiKey", "").strip()),
                    "validation": validation,
                },
            )
            return

        if path == "/api/serial/ports":
            self.send_json(200, {"ports": list_serial_port_dicts()})
            return

        if path == "/api/serial/status":
            self.send_json(200, {"status": serial_capture_status()})
            return

        if path == "/api/logs":
            self.send_json(200, {"logs": list(reversed(REQUEST_LOGS))})
            return

        if path == "/api/workbench/overview":
            self.send_json(200, build_workbench_overview())
            return

        if path == "/api/sessions":
            self.send_json(200, {"sessions": list_sessions()})
            return

        if path == "/api/test-cases":
            self.send_json(200, {"testCases": list_test_cases()})
            return

        if path == "/api/test-runs":
            self.send_json(200, {"testRuns": list_test_runs()})
            return

        if path == "/api/knowledge":
            query = urllib.parse.parse_qs(parsed.query)
            keyword = str(query.get("q", [""])[0]).strip()
            self.send_json(200, {"knowledge": list_knowledge(keyword)})
            return

        if path == "/api/knowledge/schema":
            self.send_json(200, knowledge_schema_payload())
            return

        if path == "/testcase/list":
            self.send_json(200, {"testcases": list_test_cases()})
            return

        if path == "/knowledge/search":
            query = urllib.parse.parse_qs(parsed.query)
            keyword = str(query.get("q", [""])[0]).strip()
            self.send_json(200, {"knowledge": list_knowledge(keyword)})
            return

        if path == "/evidence/by-session":
            query = urllib.parse.parse_qs(parsed.query)
            session_id = str(query.get("sessionId", [""])[0]).strip()
            if not session_id:
                self.send_json(400, {"error": "sessionId is required"})
                return
            try:
                payload = get_session(session_id)
                self.send_json(200, {"evidence": payload.get("evidence", [])})
            except KeyError:
                self.send_json(404, {"error": "session not found"})
            return

        if path.startswith("/api/evidence/") and path.endswith("/file"):
            parts = path.split("/")
            if len(parts) < 5 or not parts[3]:
                self.send_json(400, {"error": "evidence id is required"})
                return
            evidence_id = parts[3]
            try:
                file_path, file_name = get_evidence_file_info(evidence_id)
                self.send_file(file_path, file_name)
            except KeyError:
                self.send_json(404, {"error": "evidence not found"})
            except FileNotFoundError as exc:
                self.send_json(404, {"error": str(exc)})
            except Exception as exc:
                self.send_json(500, {"error": str(exc)})
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

        if path.startswith("/session/"):
            session_id = path.split("/")[2] if len(path.split("/")) > 2 else ""
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
                "id": str(payload.get("profileId", payload.get("id", ""))).strip(),
                "profileName": str(payload.get("profileName", "")).strip() or str(payload.get("providerName", "")).strip() or DEFAULT_PROVIDER_PROFILE_NAME,
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

            saved_profile = save_provider_config(provider_config)
            validation = validate_provider_config(saved_profile)
            self.send_json(
                200,
                {
                    "ok": True,
                    "profileId": saved_profile["id"],
                    "profileName": saved_profile["profileName"],
                    "providerName": saved_profile["providerName"],
                    "apiBaseUrl": saved_profile["apiBaseUrl"],
                    "model": saved_profile["model"],
                    "apiConfigured": bool(saved_profile["apiKey"]),
                    "apiKeySaved": bool(saved_profile["apiKey"]),
                    "validation": validation,
                },
            )
            return

        if path == "/api/provider/select":
            try:
                payload = self.parse_json_body()
            except Exception:
                self.send_json(400, {"error": "Invalid JSON body"})
                return
            profile_id = str(payload.get("profileId", "")).strip()
            if not profile_id:
                self.send_json(400, {"error": "profileId is required"})
                return
            try:
                selected = select_provider_profile(profile_id)
            except KeyError:
                self.send_json(404, {"error": "provider profile not found"})
                return
            validation = validate_provider_config(selected)
            self.send_json(
                200,
                {
                    "ok": True,
                    "profileId": selected["id"],
                    "profileName": selected["profileName"],
                    "providerName": selected["providerName"],
                    "apiBaseUrl": selected["apiBaseUrl"],
                    "model": selected["model"],
                    "apiConfigured": bool(selected["apiKey"]),
                    "apiKeySaved": bool(selected["apiKey"]),
                    "validation": validation,
                },
            )
            return

        if path == "/session/create":
            try:
                payload = self.parse_json_body()
                session = create_session(
                    str(payload.get("title", "")).strip() or "客户调试会话",
                    str(payload.get("customerName", "")).strip(),
                    str(payload.get("deviceModel", "")).strip(),
                    str(payload.get("serialNumber", "")).strip(),
                    str(payload.get("deviceIp", "")).strip(),
                    str(payload.get("issueType", "")).strip(),
                    str(payload.get("severity", "")).strip() or "P1",
                    str(payload.get("workflowStage", "")).strip() or "phenomenon",
                    str(payload.get("symptom", "")).strip(),
                    str(payload.get("owner", "")).strip(),
                )
                self.send_json(200, {"session": session})
            except Exception as exc:
                self.send_json(500, {"error": str(exc)})
            return

        if path == "/api/sessions":
            try:
                payload = self.parse_json_body()
                session = create_session(
                    str(payload.get("title", "")).strip() or "客户调试会话",
                    str(payload.get("customerName", "")).strip(),
                    str(payload.get("deviceModel", "")).strip(),
                    str(payload.get("serialNumber", "")).strip(),
                    str(payload.get("deviceIp", "")).strip(),
                    str(payload.get("issueType", "")).strip(),
                    str(payload.get("severity", "")).strip() or "P1",
                    str(payload.get("workflowStage", "")).strip() or "phenomenon",
                    str(payload.get("symptom", "")).strip(),
                    str(payload.get("owner", "")).strip(),
                )
                self.send_json(200, {"session": session})
            except Exception as exc:
                self.send_json(500, {"error": str(exc)})
            return

        if path == "/testcase":
            try:
                payload = self.parse_json_body()
                steps = payload.get("steps", [])
                if not isinstance(steps, list):
                    self.send_json(400, {"error": "steps must be a list"})
                    return
                test_case = upsert_test_case(
                    str(payload.get("caseCode", payload.get("id", ""))).strip(),
                    str(payload.get("name", "")).strip(),
                    str(payload.get("category", "")).strip(),
                    str(payload.get("target", "")).strip(),
                    steps,
                    str(payload.get("passRule", "all_steps_pass")).strip() or "all_steps_pass",
                    bool(payload.get("enabled", True)),
                )
                self.send_json(200, {"testcase": test_case})
            except Exception as exc:
                self.send_json(500, {"error": str(exc)})
            return

        if path == "/api/test-cases":
            try:
                payload = self.parse_json_body()
                steps = payload.get("steps", [])
                if not isinstance(steps, list):
                    self.send_json(400, {"error": "steps must be a list"})
                    return
                test_case = upsert_test_case(
                    str(payload.get("caseCode", "")).strip(),
                    str(payload.get("name", "")).strip(),
                    str(payload.get("category", "")).strip(),
                    str(payload.get("target", "")).strip(),
                    steps,
                    str(payload.get("passRule", "all_steps_pass")).strip() or "all_steps_pass",
                    bool(payload.get("enabled", True)),
                )
                self.send_json(200, {"ok": True, "testCase": test_case})
            except Exception as exc:
                self.send_json(500, {"error": str(exc)})
            return

        if path == "/testrun/execute":
            try:
                payload = self.parse_json_body()
                test_case_id = str(payload.get("testcaseId", payload.get("testCaseId", ""))).strip()
                session_id = str(payload.get("sessionId", "")).strip()
                if not test_case_id or not session_id:
                    self.send_json(400, {"error": "testcaseId and sessionId are required"})
                    return
                result = execute_test_case(test_case_id, session_id)
                self.send_json(200, {"testrun": result["run"], "generatedSessionId": result["generatedSessionId"]})
            except KeyError as exc:
                self.send_json(404, {"error": str(exc)})
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
                if "file" not in form:
                    self.send_json(400, {"error": "file is required"})
                    return
                file_item = form["file"]
                if getattr(file_item, "file", None) is None:
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

        if path == "/evidence/upload":
            try:
                form = self.parse_multipart()
                session_id = str(form.getfirst("sessionId", "")).strip()
                if not session_id:
                    self.send_json(400, {"error": "sessionId is required"})
                    return
                title = str(form.getfirst("title", "")).strip() or "上传证据"
                if "file" not in form:
                    self.send_json(400, {"error": "file is required"})
                    return
                file_item = form["file"]
                file_name = file_item.filename or "evidence.bin"
                content = file_item.file.read()
                saved_name, saved_path = save_uploaded_file(session_id, file_name, content)
                extracted_text, note = extract_text_from_file(file_name, content)
                suffix = Path(file_name).suffix.lower()
                evidence_type = "image" if suffix in {".png", ".jpg", ".jpeg", ".webp", ".bmp", ".gif"} else "log"
                evidence = add_evidence(
                    session_id,
                    evidence_type,
                    title,
                    content_text=extracted_text or note,
                    file_name=saved_name,
                    file_path=saved_path,
                    meta={"bytes": len(content), "extractNote": note, "source": "upload"},
                )
                self.send_json(200, {"evidence": evidence})
            except Exception as exc:
                self.send_json(500, {"error": str(exc)})
            return

        if path == "/knowledge/create":
            try:
                payload = self.parse_json_body()
                session_id = str(payload.get("sessionId", "")).strip()
                if not session_id:
                    self.send_json(400, {"error": "sessionId is required"})
                    return
                knowledge = create_knowledge_from_session(session_id, payload)
                self.send_json(200, {"knowledge": knowledge})
            except Exception as exc:
                self.send_json(500, {"error": str(exc)})
            return

        if path == "/api/knowledge":
            try:
                payload = self.parse_json_body()
                knowledge = upsert_knowledge_entry(payload, default_source_type=str(payload.get("sourceType", "manual") or "manual"))
                self.send_json(200, {"ok": True, "knowledge": knowledge})
            except Exception as exc:
                self.send_json(500, {"error": str(exc)})
            return

        if path == "/api/knowledge/import":
            try:
                payload = self.parse_json_body()
                cases = normalize_ai_import_cases(payload)
                stored = [upsert_knowledge_entry(item, default_source_type=item.get("sourceType", "ai_import")) for item in cases]
                self.send_json(200, {"ok": True, "knowledge": stored, "count": len(stored)})
            except Exception as exc:
                self.send_json(500, {"error": str(exc)})
            return

        if path == "/ai/suggest-testcase":
            try:
                payload = self.parse_json_body()
                session_id = str(payload.get("sessionId", "")).strip()
                if not session_id:
                    self.send_json(400, {"error": "sessionId is required"})
                    return
                session_payload = get_session(session_id)
                self.send_json(200, {"recommendations": suggest_test_cases_for_session(session_payload)})
            except Exception as exc:
                self.send_json(500, {"error": str(exc)})
            return

        if path == "/ai/missing-info":
            try:
                payload = self.parse_json_body()
                session_id = str(payload.get("sessionId", "")).strip()
                if not session_id:
                    self.send_json(400, {"error": "sessionId is required"})
                    return
                session_payload = get_session(session_id)
                self.send_json(200, {"missingInformation": detect_missing_info_for_session(session_payload)})
            except Exception as exc:
                self.send_json(500, {"error": str(exc)})
            return

        if path == "/ai/analyze":
            try:
                payload = self.parse_json_body()
                session_id = str(payload.get("sessionId", "")).strip()
                if not session_id:
                    self.send_json(400, {"error": "sessionId is required"})
                    return
                request_text = str(payload.get("requestText", "")).strip() or "请根据当前会话自动分析。"
                device_ip = str(payload.get("deviceIp", "")).strip()
                capture_snapshot = bool(payload.get("captureSnapshot", False))
                request_id = str(int(time.time() * 1000))
                analysis = run_session_analysis(session_id, request_text, device_ip, capture_snapshot, request_id)
                self.send_json(200, {"analysis": analysis, "requestId": request_id})
            except Exception as exc:
                self.send_json(500, {"error": str(exc)})
            return

        if path == "/api/log-upload":
            try:
                form = self.parse_multipart()
                session_id = str(form.getfirst("sessionId", "")).strip()
                if not session_id:
                    self.send_json(400, {"error": "sessionId is required"})
                    return
                if "file" not in form:
                    self.send_json(400, {"error": "file is required"})
                    return
                file_item = form["file"]
                if getattr(file_item, "file", None) is None:
                    self.send_json(400, {"error": "file is required"})
                    return
                file_name = file_item.filename or "serial.log"
                content = file_item.file.read()
                extracted_text, note = extract_text_from_file(file_name, content)
                evidence = add_evidence(
                    session_id,
                    "serial_log",
                    str(form.getfirst("title", "")).strip() or file_name,
                    content_text=extracted_text or content.decode("utf-8", errors="replace") or note,
                    file_name=file_name,
                    file_path="",
                    meta={"bytes": len(content), "importMode": "log_file", "extractNote": note},
                )
                self.send_json(200, {"ok": True, "evidence": evidence})
            except KeyError:
                self.send_json(404, {"error": "session not found"})
            except Exception as exc:
                self.send_json(500, {"error": str(exc)})
            return

        if path == "/api/info-upload":
            try:
                form = self.parse_multipart()
                session_id = str(form.getfirst("sessionId", "")).strip()
                if not session_id:
                    self.send_json(400, {"error": "sessionId is required"})
                    return
                title = str(form.getfirst("title", "")).strip() or "导入信息"
                content_text = str(form.getfirst("content", "")).strip()
                file_item = form["file"] if "file" in form else None
                file_name = ""
                saved_path = ""
                meta: dict = {}
                if file_item is not None and getattr(file_item, "file", None):
                    raw_name = file_item.filename or "upload.bin"
                    content = file_item.file.read()
                    file_name, saved_path = save_uploaded_file(session_id, raw_name, content)
                    extracted_text, note = extract_text_from_file(raw_name, content)
                    suffix = Path(raw_name).suffix.lower()
                    media_category = "image" if suffix in {".png", ".jpg", ".jpeg", ".webp", ".bmp", ".gif"} else "document"
                    meta.update({"bytes": len(content), "extractNote": note, "mediaCategory": media_category})
                    if extracted_text:
                        content_text = f"{content_text}\n\n{extracted_text}".strip()
                    elif note:
                        content_text = f"{content_text}\n\n{note}".strip()
                    elif not content_text:
                        content_text = f"已导入{media_category}附件：{file_name}"
                if not content_text and not file_name:
                    self.send_json(400, {"error": "content or file is required"})
                    return
                evidence = add_evidence(
                    session_id,
                    "imported_info",
                    title,
                    content_text=content_text,
                    file_name=file_name,
                    file_path=saved_path,
                    meta=meta,
                )
                self.send_json(200, {"ok": True, "evidence": evidence})
            except KeyError:
                self.send_json(404, {"error": "session not found"})
            except Exception as exc:
                self.send_json(500, {"error": str(exc)})
            return

        if path == "/api/serial/start":
            try:
                payload = self.parse_json_body()
                session_id = str(payload.get("sessionId", "")).strip()
                port_name = str(payload.get("port", "")).strip()
                baud_rate = int(payload.get("baud", 115200))
                if not session_id or not port_name:
                    self.send_json(400, {"error": "sessionId and port are required"})
                    return
                evidence = start_serial_capture(session_id, port_name, baud_rate)
                self.send_json(200, {"ok": True, "evidence": evidence, "status": serial_capture_status()})
            except Exception as exc:
                self.send_json(500, {"error": str(exc)})
            return

        if path == "/api/serial/stop":
            try:
                self.send_json(200, {"ok": True, "status": stop_serial_capture()})
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
                        "imported_info",
                        str(payload.get("title", "")).strip() or "导入信息",
                        content_text=str(payload.get("content", "")).strip(),
                    )
                    self.send_json(200, {"ok": True, "evidence": evidence})
                    return

                if action == "meta":
                    session = update_session(
                        session_id,
                        str(payload.get("title", "")).strip(),
                        str(payload.get("customerName", "")).strip(),
                        str(payload.get("deviceModel", "")).strip(),
                        str(payload.get("serialNumber", "")).strip(),
                        str(payload.get("deviceIp", "")).strip(),
                        str(payload.get("issueType", "")).strip(),
                        str(payload.get("severity", "")).strip() or "P1",
                        str(payload.get("workflowStage", "")).strip() or "phenomenon",
                        str(payload.get("symptom", "")).strip(),
                        str(payload.get("owner", "")).strip(),
                    )
                    self.send_json(200, {"ok": True, "session": session})
                    return

                if action == "step":
                    step_key = str(payload.get("step", "")).strip()
                    data = payload.get("data", {})
                    status = str(payload.get("status", "done")).strip() or "done"
                    if not step_key:
                        self.send_json(400, {"error": "step is required"})
                        return
                    if not isinstance(data, dict):
                        self.send_json(400, {"error": "data must be an object"})
                        return
                    step = upsert_session_step(session_id, step_key, data, status)
                    self.send_json(200, {"ok": True, "step": step})
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

                if action == "analysis-summary":
                    analysis_id = str(payload.get("analysisId", "")).strip()
                    result = payload.get("result", {})
                    if not analysis_id or not isinstance(result, dict):
                        self.send_json(400, {"error": "analysisId and result are required"})
                        return
                    analysis = update_analysis_result(analysis_id, result)
                    self.send_json(200, {"ok": True, "analysis": analysis})
                    return

            except KeyError:
                self.send_json(404, {"error": "session not found"})
                return
            except Exception as exc:
                request_id = str(int(time.time() * 1000))
                add_log("error", "request", "Session request failed", {"sessionId": session_id, "action": action, "error": str(exc)}, request_id)
                self.send_json(500, {"error": str(exc), "requestId": request_id})
                return

        if path.startswith("/session/") and path.endswith("/step"):
            parts = path.split("/")
            if len(parts) >= 4:
                session_id = parts[2]
                try:
                    payload = self.parse_json_body()
                    step_key = str(payload.get("step", "")).strip()
                    data = payload.get("data", {})
                    status = str(payload.get("status", "done")).strip() or "done"
                    if not step_key:
                        self.send_json(400, {"error": "step is required"})
                        return
                    if not isinstance(data, dict):
                        self.send_json(400, {"error": "data must be an object"})
                        return
                    step = upsert_session_step(session_id, step_key, data, status)
                    self.send_json(200, {"step": step})
                except Exception as exc:
                    self.send_json(500, {"error": str(exc)})
                return

        if path.startswith("/api/test-cases/"):
            parts = path.split("/")
            if len(parts) >= 5 and parts[4] == "run":
                test_case_id = parts[3]
                try:
                    payload = self.parse_json_body()
                    session_id = str(payload.get("sessionId", "")).strip()
                    if not session_id:
                        self.send_json(400, {"error": "sessionId is required"})
                        return
                    result = execute_test_case(test_case_id, session_id)
                    self.send_json(200, {"ok": True, **result})
                except KeyError as exc:
                    self.send_json(404, {"error": str(exc)})
                except Exception as exc:
                    self.send_json(500, {"error": str(exc)})
                return

        self.send_json(404, {"error": "Not found"})

    def do_DELETE(self) -> None:
        parsed = urllib.parse.urlparse(self.path)
        path = parsed.path
        if path.startswith("/api/evidence/"):
            parts = path.split("/")
            if len(parts) < 4 or not parts[3]:
                self.send_json(400, {"error": "evidence id is required"})
                return
            evidence_id = parts[3]
            try:
                session_id = delete_evidence(evidence_id)
                self.send_json(200, {"ok": True, "sessionId": session_id})
            except KeyError:
                self.send_json(404, {"error": "evidence not found"})
            except Exception as exc:
                self.send_json(500, {"error": str(exc)})
            return
        if path.startswith("/api/analyses/"):
            parts = path.split("/")
            if len(parts) < 4 or not parts[3]:
                self.send_json(400, {"error": "analysis id is required"})
                return
            analysis_id = parts[3]
            try:
                session_id = delete_analysis(analysis_id)
                self.send_json(200, {"ok": True, "sessionId": session_id})
            except KeyError:
                self.send_json(404, {"error": "analysis not found"})
            except Exception as exc:
                self.send_json(500, {"error": str(exc)})
            return
        if path.startswith("/api/knowledge/"):
            parts = path.split("/")
            if len(parts) < 4 or not parts[3]:
                self.send_json(400, {"error": "knowledge id is required"})
                return
            knowledge_id = parts[3]
            try:
                delete_knowledge(knowledge_id)
                self.send_json(200, {"ok": True})
            except KeyError:
                self.send_json(404, {"error": "knowledge not found"})
            except Exception as exc:
                self.send_json(500, {"error": str(exc)})
            return
        if path.startswith("/api/sessions/"):
            parts = path.split("/")
            if len(parts) < 4 or not parts[3]:
                self.send_json(400, {"error": "session id is required"})
                return
            session_id = parts[3]
            try:
                delete_session(session_id)
                self.send_json(200, {"ok": True})
            except KeyError:
                self.send_json(404, {"error": "session not found"})
            except Exception as exc:
                self.send_json(500, {"error": str(exc)})
            return
        self.send_json(404, {"error": "Not found"})


def main() -> int:
    if not STATIC_DIR.exists():
        print(f"Static directory not found: {STATIC_DIR}", file=sys.stderr)
        return 1

    init_storage()
    ensure_default_library_entries()
    refresh_master_document_from_latest_session()
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
