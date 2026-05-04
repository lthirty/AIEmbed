# Changelog

All notable changes to this project should be recorded in this file.

## v0.14.2 - 2026-05-04

- Changed the analysis-page step explanation strip to a horizontal layout on larger screens so one screen can show more onboarding guidance at once.
- Kept the main troubleshooting flow order unchanged while allowing the explanatory `Step 1~4` cards to use space more efficiently.
- Bumped the local workbench version to `v0.14.2`.

## v0.14.1 - 2026-05-04

- Added `Awesome-Embedded` as a seeded external resource entry in the Library page, so the case library now includes a reusable GitHub-based embedded reference source.
- Updated the Library detail rendering to support clickable external links and richer resource-style related items.
- Bumped the local workbench version to `v0.14.1`.

## v0.14.0 - 2026-05-04

- Rebuilt the `Analysis Center` around a novice-friendly three-stage flow: `问题输入与资料准备 -> AI 分析与参考库引导 -> 人工修正与执行`.
- Moved the main problem statement / analysis target input to the top of the analysis page so users first describe the issue before triggering AI.
- Added a guided onboarding strip in the analysis page to teach new users the expected operating order step by step.
- Added an analysis-library preview area so AI guidance is visibly grounded in reusable knowledge entries, recent analyses, and existing testcases.
- Reframed the lower analysis workflow section as manual execution and correction, making it clearer that engineers should validate and revise AI suggestions before closing a session.
- Bumped the local workbench version to `v0.14.0`.

## v0.13.1 - 2026-05-04

- Adjusted the `Overview` page back to a dashboard-style mixed layout instead of strict single-column stacking.
- Kept `Test Center / Analysis Center / Library` in top-to-bottom logic order, while giving `Overview` a more suitable summary layout with horizontal plus vertical combinations.
- Bumped the local workbench version to `v0.13.1`.

## v0.13.0 - 2026-05-04

- Reordered the Analysis Center into strict top-to-bottom logic: `Evidence Panel -> Workflow Navigation -> Step Content -> AI Assistant -> 分析结果 -> 历史分析`.
- Added evidence-first gating so AI analysis now refuses to start until the current Session has evidence and a clear phenomenon description.
- Strengthened the guidance area to render in thought order, including missing-input checklist, evidence checklist, recommended testcases, workflow checklist, reusable assets, fishbone diagram, and mind map.
- Converted the major page grids to single-column stacking so each center page now reads from top to bottom instead of left-to-right panel hopping.
- Upgraded the Library page with tag-cloud navigation and one-click `应用到当前分析`, so existing knowledge can be pulled directly into the current analysis request.
- Expanded the AI prompt/result schema with `guidance_checklist`, `evidence_checklist`, `fishbone_diagram`, and `mindmap_tree` to make analysis output more guided and reusable.
- Bumped the local workbench version to `v0.13.0`.

## v0.12.0 - 2026-05-04

- Rebuilt the local web app into the four-page structure defined by `Embedded Evidence Workbench Web Spec v1.0`: `Overview / Test Center / Analysis Center / Library`.
- Replaced the old long single-page workflow with a sidebar-driven application shell and dedicated center pages for overview, test execution, analysis workflow, and knowledge reuse.
- Added `session_steps` storage so the Analysis Center now has a real step model instead of UI-only workflow labels.
- Added `knowledge` storage so completed sessions can now be promoted into reusable knowledge entries inside the Library page.
- Added normalized routes aligned with the spec, including `/session/create`, `/session/{id}/step`, `/testcase`, `/testcase/list`, `/testrun/execute`, `/knowledge/create`, `/knowledge/search`, `/ai/analyze`, `/ai/suggest-testcase`, `/ai/missing-info`, and `/evidence/by-session`.
- Added Analysis Center helpers for missing-info detection, testcase recommendation, step data saving, and knowledge generation from the current session.
- Kept `AI 设置` and `log 收集` intact, but moved them into the new four-center information architecture.
- Bumped the local workbench version to `v0.12.0`.

## v0.11.0 - 2026-05-04

- Refactored the local web UI from a feature pile into a `Session 流程工作台`, keeping `AI 设置` and `log 收集` while reorganizing the page around guided issue analysis.
- Added session workflow metadata fields: `issueType`, `severity`, `workflowStage`, `symptom`, and `owner`.
- Added a new `/api/workbench/overview` endpoint to summarize session, evidence, analysis, and test-library accumulation for the homepage overview cards.
- Added a guided workflow panel with six protocol stages: `现象 / 分层分析 / 验证方法 / 根因 / 解决方案 / 经验总结`.
- Added an `开放资产库` view in the Session detail response so the page can show recent sessions, recent analyses, and reusable test cases alongside the current workflow.
- Upgraded the AI analysis prompt to inject workflow protocol and historical library context, so the model now produces `layered_analysis`, `workflow_guidance`, and `related_assets` in addition to the earlier structured result.
- Updated the root `分析内容及结果.md` export to include the new session workflow fields and layered-analysis section.
- Bumped the local workbench version to `v0.11.0`.

## v0.10.0 - 2026-05-04

- Added `test_cases` and `test_runs` data models to the local SQLite store.
- Added a minimal auto-test execution flow with `serial_expect` step support.
- Added a new `自动测试` panel in the local web UI for saving test cases, running them against the current session, and reviewing recent PASS/FAIL results.
- Added `/api/test-cases` and `/api/test-runs` endpoints plus `POST /api/test-cases/{id}/run`.
- Added automatic failure session generation when a test run fails, including a copied latest serial log and a generated `test_report` evidence record.
- Reframed the local homepage copy toward `自动测试 + 证据采集 + session 闭环` instead of an AI-first description.
- Bumped the local workbench version to `v0.10.0`.

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
