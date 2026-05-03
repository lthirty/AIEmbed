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
  openaiStatus: document.getElementById("openai-status"),
  openaiModel: document.getElementById("openai-model"),
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
  elements.openaiModel.textContent = data.model || "-";
  elements.openaiStatus.textContent = data.openaiConfigured ? "已配置" : "未配置 OPENAI_API_KEY";
  if (!data.openaiConfigured) {
    elements.openaiStatus.classList.add("error");
  }
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

elements.connectBtn.addEventListener("click", refreshCameraLinks);
elements.refreshStream.addEventListener("click", refreshCameraLinks);
elements.probeBtn.addEventListener("click", probeDevice);
elements.analyzeBtn.addEventListener("click", analyzeCurrentFrame);
elements.clearChat.addEventListener("click", resetChat);
elements.deviceIp.addEventListener("change", refreshCameraLinks);

resetChat();
refreshCameraLinks();
loadConfig().catch((error) => {
  elements.openaiStatus.textContent = `配置读取失败: ${error.message}`;
  elements.openaiStatus.classList.add("error");
});
