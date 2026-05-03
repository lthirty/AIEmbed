#include <Arduino.h>
#include <WiFi.h>
#include <WebServer.h>
#include <WiFiManager.h>
#include "esp_camera.h"

namespace {

// Firmware version history
// v0.1.0 - PlatformIO minimal serial heartbeat test
// v0.2.0 - ESP32-CAM SoftAP web viewer with /stream and /capture
// v0.3.0 - WiFiManager provisioning portal, router LAN access, WiFi reset endpoint
// v0.4.0 - Serial IP reporting improvements for customer setup and local AI viewer support
constexpr char kFirmwareVersion[] = "v0.4.0";

constexpr char kConfigApName[] = "ESP32-CAM-Setup";
constexpr char kConfigApPassword[] = "12345678";
constexpr uint32_t kConfigPortalTimeoutSeconds = 300;
constexpr uint32_t kSerialIpReportIntervalMs = 30000;

WebServer server(80);
WiFiManager wifiManager;
uint32_t lastSerialIpReportMs = 0;

static const char kIndexHtml[] PROGMEM = R"rawliteral(
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>ESP32-CAM Viewer</title>
  <style>
    :root {
      color-scheme: dark;
      --bg: #101418;
      --panel: #182028;
      --text: #f3f5f7;
      --muted: #99a5b3;
      --accent: #3fb950;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      min-height: 100vh;
      background: radial-gradient(circle at top, #203040, var(--bg) 60%);
      color: var(--text);
      font: 16px/1.5 "Segoe UI", sans-serif;
      display: grid;
      place-items: center;
      padding: 24px;
    }
    .panel {
      width: min(100%, 960px);
      background: rgba(24, 32, 40, 0.92);
      border: 1px solid rgba(255,255,255,0.08);
      border-radius: 18px;
      padding: 20px;
      box-shadow: 0 24px 60px rgba(0, 0, 0, 0.35);
    }
    h1 { margin: 0 0 8px; font-size: 28px; }
    p { margin: 0 0 16px; color: var(--muted); }
    .meta {
      display: flex;
      flex-wrap: wrap;
      gap: 12px;
      margin-bottom: 16px;
      color: var(--muted);
      font-size: 14px;
    }
    .badge {
      background: rgba(63, 185, 80, 0.12);
      color: #7ee787;
      border: 1px solid rgba(63,185,80,0.35);
      padding: 6px 10px;
      border-radius: 999px;
    }
    img {
      width: 100%;
      border-radius: 14px;
      display: block;
      background: #000;
      min-height: 240px;
      object-fit: cover;
    }
    .actions {
      display: flex;
      gap: 12px;
      margin-top: 16px;
      flex-wrap: wrap;
    }
    a {
      color: var(--text);
      text-decoration: none;
      background: #243242;
      border: 1px solid rgba(255,255,255,0.08);
      padding: 10px 14px;
      border-radius: 10px;
    }
  </style>
</head>
<body>
  <section class="panel">
    <h1>ESP32-CAM Live Viewer</h1>
    <p>Device connected through your router. The live stream is embedded below.</p>
    <div class="meta">
      <span class="badge">Firmware %VERSION%</span>
      <span class="badge">MJPEG stream</span>
      <span>Mode: <code>Wi-Fi STA</code></span>
      <span>IP: <code>%IP%</code></span>
      <span>Endpoint: <code>/stream</code></span>
      <span>Snapshot: <code>/capture</code></span>
    </div>
    <img src="/stream" alt="ESP32-CAM live stream">
    <div class="actions">
      <a href="/capture" target="_blank" rel="noopener">Open Snapshot</a>
      <a href="/stream" target="_blank" rel="noopener">Open Stream URL</a>
      <a href="/resetwifi" onclick="return confirm('Clear saved Wi-Fi and reboot into config mode?');">Reset Wi-Fi</a>
    </div>
  </section>
</body>
</html>
)rawliteral";

String buildIndexHtml() {
  String html(kIndexHtml);
  html.replace("%VERSION%", kFirmwareVersion);
  html.replace("%IP%", WiFi.localIP().toString());
  return html;
}

void printDeviceIpBanner() {
  Serial.println();
  Serial.println("========== DEVICE NETWORK INFO ==========");
  Serial.printf("Firmware: %s\n", kFirmwareVersion);
  Serial.printf("SSID: %s\n", WiFi.SSID().c_str());
  Serial.printf("IP: %s\n", WiFi.localIP().toString().c_str());
  Serial.printf("Viewer: http://%s/\n", WiFi.localIP().toString().c_str());
  Serial.printf("Stream: http://%s/stream\n", WiFi.localIP().toString().c_str());
  Serial.printf("Snapshot: http://%s/capture\n", WiFi.localIP().toString().c_str());
  Serial.printf("Reset Wi-Fi: http://%s/resetwifi\n", WiFi.localIP().toString().c_str());
  Serial.println("Type 'ip' or 'info' in the serial terminal to print this again.");
  Serial.println("=========================================");
}

void configureCamera() {
  camera_config_t config{};
  config.ledc_channel = LEDC_CHANNEL_0;
  config.ledc_timer = LEDC_TIMER_0;
  config.pin_d0 = 5;
  config.pin_d1 = 18;
  config.pin_d2 = 19;
  config.pin_d3 = 21;
  config.pin_d4 = 36;
  config.pin_d5 = 39;
  config.pin_d6 = 34;
  config.pin_d7 = 35;
  config.pin_xclk = 0;
  config.pin_pclk = 22;
  config.pin_vsync = 25;
  config.pin_href = 23;
  config.pin_sccb_sda = 26;
  config.pin_sccb_scl = 27;
  config.pin_pwdn = 32;
  config.pin_reset = -1;
  config.xclk_freq_hz = 20000000;
  config.pixel_format = PIXFORMAT_JPEG;

  if (psramFound()) {
    config.frame_size = FRAMESIZE_VGA;
    config.jpeg_quality = 12;
    config.fb_count = 2;
  } else {
    config.frame_size = FRAMESIZE_QVGA;
    config.jpeg_quality = 15;
    config.fb_count = 1;
  }

  const esp_err_t err = esp_camera_init(&config);
  if (err != ESP_OK) {
    Serial.printf("Camera init failed: 0x%x\n", err);
    while (true) {
      delay(1000);
    }
  }

  sensor_t *sensor = esp_camera_sensor_get();
  sensor->set_vflip(sensor, 1);
  sensor->set_brightness(sensor, 1);
  sensor->set_saturation(sensor, -1);
}

void handleRoot() {
  server.send(200, "text/html; charset=utf-8", buildIndexHtml());
}

void handleCapture() {
  camera_fb_t *fb = esp_camera_fb_get();
  if (!fb) {
    server.send(500, "text/plain", "Camera capture failed");
    return;
  }

  server.sendHeader("Content-Type", "image/jpeg");
  server.sendHeader("Content-Length", String(fb->len));
  server.send(200);
  WiFiClient client = server.client();
  client.write(fb->buf, fb->len);
  esp_camera_fb_return(fb);
}

void handleStream() {
  WiFiClient client = server.client();

  client.println("HTTP/1.1 200 OK");
  client.println("Content-Type: multipart/x-mixed-replace; boundary=frame");
  client.println("Cache-Control: no-cache");
  client.println("Connection: close");
  client.println("Access-Control-Allow-Origin: *");
  client.println();

  while (client.connected()) {
    camera_fb_t *fb = esp_camera_fb_get();
    if (!fb) {
      Serial.println("Camera capture failed during stream");
      break;
    }

    client.printf("--frame\r\nContent-Type: image/jpeg\r\nContent-Length: %u\r\n\r\n", fb->len);
    client.write(fb->buf, fb->len);
    client.print("\r\n");
    esp_camera_fb_return(fb);

    if (!client.connected()) {
      break;
    }

    delay(30);
  }
}

void handleNotFound() {
  server.send(404, "text/plain", "Not found");
}

void handleResetWifi() {
  server.send(200, "text/plain", "Wi-Fi credentials cleared. Rebooting into config mode...");
  delay(300);
  wifiManager.resetSettings();
  delay(300);
  ESP.restart();
}

void connectToRouter() {
  WiFi.mode(WIFI_STA);
  WiFi.setSleep(false);
  wifiManager.setClass("invert");
  wifiManager.setAPClientCheck(true);
  wifiManager.setMinimumSignalQuality(20);
  wifiManager.setConfigPortalTimeout(kConfigPortalTimeoutSeconds);

  Serial.println();
  Serial.println("Starting Wi-Fi provisioning flow...");
  Serial.printf("If needed, connect to setup AP: %s\n", kConfigApName);
  Serial.printf("Setup password: %s\n", kConfigApPassword);
  Serial.println("Open setup page: http://192.168.4.1/");

  const bool connected = wifiManager.autoConnect(kConfigApName, kConfigApPassword);
  if (!connected) {
    Serial.println("Wi-Fi provisioning timed out. Rebooting to retry...");
    delay(1000);
    ESP.restart();
  }

  Serial.println();
  Serial.println("Wi-Fi connected");
  printDeviceIpBanner();
}

void startWebServer() {
  server.on("/", HTTP_GET, handleRoot);
  server.on("/capture", HTTP_GET, handleCapture);
  server.on("/stream", HTTP_GET, handleStream);
  server.on("/resetwifi", HTTP_GET, handleResetWifi);
  server.onNotFound(handleNotFound);
  server.begin();
  Serial.println("HTTP server started");
}

}  // namespace

void setup() {
  Serial.begin(115200);
  delay(1500);
  Serial.println();
  Serial.println("Booting ESP32-CAM web viewer...");
  Serial.printf("Firmware version: %s\n", kFirmwareVersion);

  connectToRouter();
  configureCamera();
  startWebServer();
  lastSerialIpReportMs = millis();
}

void loop() {
  server.handleClient();

  while (Serial.available() > 0) {
    const String command = Serial.readStringUntil('\n');
    if (command.equalsIgnoreCase("ip") || command.equalsIgnoreCase("info")) {
      printDeviceIpBanner();
      lastSerialIpReportMs = millis();
    }
  }

  if (WiFi.status() == WL_CONNECTED && millis() - lastSerialIpReportMs >= kSerialIpReportIntervalMs) {
    printDeviceIpBanner();
    lastSerialIpReportMs = millis();
  }
}
