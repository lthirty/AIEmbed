# Changelog

All notable changes to this project should be recorded in this file.

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
