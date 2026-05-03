# Changelog

All notable changes to this project should be recorded in this file.

## v0.9.0 - 2026-05-04

- Added `PRODUCT_REQUIREMENTS_MVP.md` to formally reposition the product from an AI-first debug page to an embedded auto-test, evidence, session, and case workflow.
- Refined the product mainline around `自动测试 + 证据采集 + session 管理 + case 沉淀`, with AI explicitly treated as an auxiliary capability.
- Defined MVP module boundaries, data models, page architecture, and phased implementation order for `device / test_case / test_run / evidence / session / case`.
- Bumped the local workbench version to `v0.9.0` to mark the product-direction milestone.

## v0.8.1 - 2026-05-03

- Fixed multipart upload handling for `资料导入` so file upload no longer throws `Cannot be converted to bool.`
- Fixed the same `FieldStorage` boolean-conversion bug for `导入串口文件`.
- Bumped the local workbench version to `v0.8.1` after the upload hotfix.

## v0.8.0 - 2026-05-03

- Split `资料导入` into its own top-level panel above `信息收集` for clearer workflow separation.
- Added visible UI version output and bumped the local workbench version to `v0.8.0`.
- Replaced the old `人工备注` flow with a unified `导入信息` panel that supports free-text notes plus optional image/document attachments.
- Added `/api/info-upload` so imported text, pictures, and documents are stored as one evidence type and can be analyzed together.
- Updated the structured analysis prompt so AI now synthesizes material imports, serial logs, imported info, and attachment metadata together.
- Added a live `最新的打印信息` preview area for the latest serial output inside the serial capture section.
- Removed the standalone `当前会话证据` panel from the main UI to reduce duplication.
- Moved `分析内容及结果.md` output to the project root and refresh it automatically whenever session info, logs, imported info, or analysis results change.
- Added `server_stdout.log` and `server_stderr.log` to `.gitignore` as local debug artifacts.

## v0.6.0 - 2026-05-03

- Repositioned the local web tool from camera-first chat to a session-centric prototype debugging workbench.
- Added local SQLite-backed storage for `session`, `evidence`, and `analysis` objects.
- Added customer material import with file persistence and basic text extraction for `txt/md/log/json/csv/yaml/pdf`.
- Added evidence collection flows for manual notes, pasted serial logs, and optional ESP32-CAM snapshot capture.
- Added structured AI analysis based on imported materials and collected evidence instead of image-only chat.
- Replaced the main page with a workbench UI focused on session creation, evidence collection, and structured analysis history.
- Added `local_data/` to `.gitignore` so local sessions and uploaded customer materials are not committed.

## v0.5.1 - 2026-05-03

- Changed the default MiniMax API route from the Anthropic-compatible path to the official `https://api.minimaxi.com/v1/chat/completions`.
- Kept the default MiniMax model at `MiniMax-M2.7` because the current Starter Token Plan rejects `MiniMax-Text-01`.
- Added richer AI request diagnostics, including effective endpoint/model, image byte size, image base64 length, `containsImageMarker`, payload preview, and provider response preview.
- Improved workflow details in the web page so image capture, image encoding, provider validation, request sending, and response parsing are separated more clearly.
- Added stronger failure detection for provider replies that indicate the model did not actually receive or understand the image payload.

## v0.5.0 - 2026-05-03

- Replaced the blocking Arduino `WebServer` camera service with `esp_http_server`.
- Fixed the architecture issue where `/stream` could monopolize the server and block `/` and `/capture`.
- Improved the device-side HTTP service for concurrent live view and snapshot access.
- Updated the local AI viewer to prefer the currently displayed browser frame instead of always calling `/capture`.
- Changed the default AI provider to MiniMax Token Plan and added Anthropic-compatible request support.
- Improved diagnostics to detect "text returned but image not actually received" as a workflow failure instead of false success.

## v0.4.0 - 2026-05-03

- Improved serial IP reporting for the ESP32-CAM firmware.
- Added serial `ip` / `info` commands to reprint the current LAN address.
- Added periodic serial IP banner output for easier customer setup.
- Added a local web viewer and AI analysis workflow design.
- Added web-based configuration for any OpenAI-compatible AI provider, not only OpenAI.
- Set the default provider to DeepSeek using its official `chat/completions` endpoint.
- Changed the AI panel to keep the current question at the top and prepend the newest result above older results.
- Added a dedicated log page and detailed backend stage logs for snapshot, provider request, and response parsing failures.

## v0.3.0 - 2026-05-03

- Replaced the fixed camera hotspot workflow with `WiFiManager` provisioning.
- Added setup hotspot `ESP32-CAM-Setup` with password `12345678`.
- Added captive portal based Wi-Fi configuration at `http://192.168.4.1/`.
- After Wi-Fi setup, the device switches to router LAN access and serves the viewer on its STA IP.
- Added `/resetwifi` endpoint to clear saved Wi-Fi credentials and reboot into setup mode.
- Updated the viewer page to display firmware version and current LAN IP.

## v0.2.0 - 2026-05-03

- Replaced the serial heartbeat test with an `ESP32-CAM` web viewer.
- Added `SoftAP` mode with SSID `ESP32-CAM-Viewer`.
- Added HTTP endpoints:
  - `/` for the viewer page
  - `/stream` for MJPEG live video
  - `/capture` for a single JPEG snapshot
- Added firmware version output to serial startup logs.
- Added firmware version badge to the web page.

## v0.1.0 - 2026-05-03

- Created the initial PlatformIO project for `AI Thinker ESP32-CAM`.
- Verified `upload + monitor` on `COM3`.
- Added a minimal serial heartbeat test firmware.
