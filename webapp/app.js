const elements = {
  deviceIp: document.getElementById("device-ip"),
  connectBtn: document.getElementById("connect-btn"),
  streamFrame: document.getElementById("stream-frame"),
  openHome: document.getElementById("open-home"),
  openStream: document.getElementById("open-stream"),
  openCapture: document.getElementById("open-capture"),
  probeBtn: document.getElementById("probe-btn"),
  probeResult: document.getElementById("probe-result"),
  messages: document.getElementById("messages"),
  promptInput: document.getElementById("prompt-input"),
  analyzeBtn: document.getElementById("analyze-btn"),
  clearChat: document.getElementById("clear-chat"),
  refreshStream: document.getElementById("refresh-stream"),
  providerStatus: document.getElementById("provider-status"),
  providerModel: document.getElementById("provider-model"),
  providerName: document.getElementById("provider-name"),
  apiBaseUrl: document.getElementById("api-base-url"),
  apiKey: document.getElementById("api-key"),
  providerModelInput: document.getElementById("provider-model-input"),
  saveProviderBtn: document.getElementById("save-provider-btn"),
  providerSaveResult: document.getElementById("provider-save-result"),
};

const state = {
  history: [],
};

function normalizeIp(value) {
  return value.trim().replace(/^https?:\/\//i, "").replace(/\/+$/, "");
}

function cameraUrl(path) {
  const ip = normalizeIp(elements.deviceIp.value);
  return ip ? `http://${ip}${path}` : "#";
}

function refreshCameraLinks() {
  elements.openHome.href = cameraUrl("/");
  elements.openStream.href = cameraUrl("/stream");
  elements.openCapture.href = cameraUrl("/capture");
  elements.streamFrame.src = `${cameraUrl("/stream")}?t=${Date.now()}`;
}

function addMessage(role, text) {
  state.history.push({ role, text });

  const message = document.createElement("article");
  message.className = `message ${role}`;

  const roleLabel = document.createElement("span");
  roleLabel.className = "role";
  roleLabel.textContent = role === "assistant" ? "AI" : role === "user" ? "User" : "System";

  const body = document.createElement("div");
  body.textContent = text;

  message.append(roleLabel, body);
  elements.messages.appendChild(message);
  elements.messages.scrollTop = elements.messages.scrollHeight;
}

function resetChat() {
  state.history = [];
  elements.messages.innerHTML = "";
  addMessage("system", "输入设备 IP，点击“连接设备”后，中间区域会显示实时视频。每次点击“分析当前画面”都会抓取最新一帧发给 AI。");
}

async function loadConfig() {
  const response = await fetch("/api/config");
  const data = await response.json();
  elements.providerName.value = data.providerName || "";
  elements.apiBaseUrl.value = data.apiBaseUrl || "";
  elements.providerModelInput.value = data.model || "";
  elements.providerModel.textContent = data.model || "-";
  elements.providerStatus.textContent = data.apiConfigured
    ? `${data.providerName || "Provider"} 已配置`
    : `${data.providerName || "Provider"} 未配置 API Key`;
  elements.providerStatus.classList.toggle("error", !data.apiConfigured);
}

async function probeDevice() {
  const ip = normalizeIp(elements.deviceIp.value);
  if (!ip) {
    elements.probeResult.textContent = "请先输入设备 IP。";
    elements.probeResult.classList.add("error");
    return;
  }

  elements.probeResult.textContent = "检测中...";
  elements.probeResult.classList.remove("error");

  const response = await fetch(`/api/probe?device_ip=${encodeURIComponent(ip)}`);
  const data = await response.json();
  if (!response.ok || !data.ok) {
    elements.probeResult.textContent = `设备不可用：${data.error || "unknown error"}`;
    elements.probeResult.classList.add("error");
    return;
  }

  elements.probeResult.textContent = `设备在线，抓拍大小 ${data.bytes} bytes。`;
}

async function analyzeCurrentFrame() {
  const ip = normalizeIp(elements.deviceIp.value);
  const prompt = elements.promptInput.value.trim();

  if (!ip) {
    addMessage("system", "请先输入设备 IP。");
    return;
  }
  if (!prompt) {
    addMessage("system", "请先输入要问 AI 的问题。");
    return;
  }

  addMessage("user", prompt);
  elements.promptInput.value = "";
  elements.analyzeBtn.disabled = true;
  addMessage("system", "正在抓取当前画面并发送给 AI 分析...");

  const response = await fetch("/api/analyze", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      deviceIp: ip,
      prompt,
      history: state.history.filter((item) => item.role !== "system").slice(-10),
    }),
  });
  const data = await response.json();
  elements.analyzeBtn.disabled = false;

  if (!response.ok) {
    addMessage("system", `分析失败：${data.error || "unknown error"}`);
    return;
  }

  addMessage("assistant", data.answer);
}

async function saveProviderConfig() {
  elements.saveProviderBtn.disabled = true;
  elements.providerSaveResult.textContent = "保存中...";
  elements.providerSaveResult.classList.remove("error");

  const response = await fetch("/api/provider", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      providerName: elements.providerName.value.trim(),
      apiBaseUrl: elements.apiBaseUrl.value.trim(),
      apiKey: elements.apiKey.value.trim(),
      model: elements.providerModelInput.value.trim(),
    }),
  });
  const data = await response.json();
  elements.saveProviderBtn.disabled = false;

  if (!response.ok) {
    elements.providerSaveResult.textContent = `保存失败：${data.error || "unknown error"}`;
    elements.providerSaveResult.classList.add("error");
    return;
  }

  elements.providerSaveResult.textContent = `${data.providerName} 设置已保存。`;
  elements.providerModel.textContent = data.model || "-";
  elements.providerStatus.textContent = data.apiConfigured
    ? `${data.providerName || "Provider"} 已配置`
    : `${data.providerName || "Provider"} 未配置 API Key`;
  elements.providerStatus.classList.toggle("error", !data.apiConfigured);
}

elements.connectBtn.addEventListener("click", refreshCameraLinks);
elements.refreshStream.addEventListener("click", refreshCameraLinks);
elements.probeBtn.addEventListener("click", probeDevice);
elements.analyzeBtn.addEventListener("click", analyzeCurrentFrame);
elements.clearChat.addEventListener("click", resetChat);
elements.deviceIp.addEventListener("change", refreshCameraLinks);
elements.saveProviderBtn.addEventListener("click", saveProviderConfig);

resetChat();
refreshCameraLinks();
loadConfig().catch((error) => {
  elements.providerStatus.textContent = `配置读取失败: ${error.message}`;
  elements.providerStatus.classList.add("error");
});
