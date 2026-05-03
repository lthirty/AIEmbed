# Changelog

All notable changes to this project should be recorded in this file.

## v0.4.0 - 2026-05-03

- Improved serial IP reporting for the ESP32-CAM firmware.
- Added serial `ip` / `info` commands to reprint the current LAN address.
- Added periodic serial IP banner output for easier customer setup.
- Added a local web viewer and AI analysis workflow design.
- Added web-based configuration for any OpenAI-compatible AI provider, not only OpenAI.
- Set the default provider to DeepSeek using its official `chat/completions` endpoint.

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
