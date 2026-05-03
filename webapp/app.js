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
  apiKeyStatus: document.getElementById("api-key-status"),
  providerModelInput: document.getElementById("provider-model-input"),
  saveProviderBtn: document.getElementById("save-provider-btn"),
  providerSaveResult: document.getElementById("provider-save-result"),
  currentQuestion: document.getElementById("current-question"),
  workflowSteps: document.getElementById("workflow-steps"),
};

const state = {
  history: [],
  apiConfigured: false,
};

const workflowTemplate = [
  { key: "frame", name: "1. 获取当前视频画面", state: "pending", detail: "等待开始" },
  { key: "providerCheck", name: "2. 校验 AI 配置与能力", state: "pending", detail: "等待开始" },
  { key: "request", name: "3. 发送 AI 请求", state: "pending", detail: "等待开始" },
  { key: "response", name: "4. 解析 AI 返回", state: "pending", detail: "等待开始" },
];

let workflowState = [];

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

function capturePreviewFrameDataUrl() {
  const image = elements.streamFrame;
  const width = image.naturalWidth || image.width;
  const height = image.naturalHeight || image.height;

  if (!width || !height) {
    throw new Error("视频预览还没有可用帧。");
  }

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  ctx.drawImage(image, 0, 0, width, height);
  return canvas.toDataURL("image/jpeg", 0.85);
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
  elements.messages.prepend(message);
  elements.messages.scrollTop = 0;
}

function renderWorkflow() {
  elements.workflowSteps.innerHTML = "";
  for (const step of workflowState) {
    const item = document.createElement("article");
    item.className = `workflow-step ${step.state}`;

    const head = document.createElement("div");
    head.className = "step-head";

    const name = document.createElement("span");
    name.className = "step-name";
    name.textContent = step.name;

    const state = document.createElement("span");
    state.className = "step-state";
    state.textContent = step.state.toUpperCase();

    const detail = document.createElement("div");
    detail.className = "step-detail";
    detail.textContent = step.detail;

    head.append(name, state);
    item.append(head, detail);
    elements.workflowSteps.appendChild(item);
  }
}

function resetWorkflow() {
  workflowState = workflowTemplate.map((step) => ({ ...step }));
  renderWorkflow();
}

function updateWorkflow(key, state, detail) {
  const item = workflowState.find((step) => step.key === key);
  if (!item) return;
  item.state = state;
  item.detail = detail;
  renderWorkflow();
}

function resetChat() {
  state.history = [];
  elements.messages.innerHTML = "";
  elements.currentQuestion.textContent = "尚未提问";
  resetWorkflow();
  addMessage("system", "输入设备 IP，点击“连接设备”后，中间区域会显示实时视频。每次点击“分析当前画面”都会抓取最新一帧发给 AI。");
}

async function loadConfig() {
  const response = await fetch("/api/config");
  const data = await response.json();
  elements.providerName.value = data.providerName || "";
  elements.apiBaseUrl.value = data.apiBaseUrl || "";
  elements.apiKey.value = "";
  elements.providerModelInput.value = data.model || "";
  elements.providerModel.textContent = data.model || "-";
  state.apiConfigured = !!data.apiConfigured;
  elements.providerStatus.textContent = data.apiConfigured
    ? `${data.providerName || "Provider"} 已配置`
    : `${data.providerName || "Provider"} 未配置 API Key`;
  elements.providerStatus.classList.toggle("error", !data.apiConfigured);
  elements.apiKeyStatus.textContent = data.apiKeySaved ? "API Key 已保存，页面不显示具体值。" : "未保存 API Key";
  if (!data.apiKeySaved) {
    window.alert("当前还没有保存 API Key，请先填写并保存 AI 设置。");
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

  elements.currentQuestion.textContent = prompt;
  addMessage("user", prompt);
  elements.promptInput.value = "";
  elements.analyzeBtn.disabled = true;
  let imageDataUrl = "";
  resetWorkflow();

  try {
    imageDataUrl = capturePreviewFrameDataUrl();
    addMessage("system", "已从当前视频预览提取画面，正在发送给 AI 分析...");
    updateWorkflow("frame", "success", "已从当前视频预览提取一帧 JPEG 数据。");
  } catch (error) {
    addMessage("system", `无法直接从视频预览提取画面：${error.message}。将回退到设备 /capture 抓拍。`);
    updateWorkflow("frame", "error", `无法从当前视频预览提取图像：${error.message}。将回退到设备 /capture。`);
  }

  if (!state.apiConfigured) {
    updateWorkflow("providerCheck", "error", "未保存 API Key 或 AI 设置。");
    elements.analyzeBtn.disabled = false;
    window.alert("请先填写并保存 AI 设置，尤其是 API Key。");
    return;
  }

  updateWorkflow("providerCheck", "running", "正在检查当前 AI 提供方配置...");
  updateWorkflow("request", "running", "准备发送请求...");

  const response = await fetch("/api/analyze", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      deviceIp: ip,
      prompt,
      imageDataUrl,
      history: state.history.filter((item) => item.role !== "system").slice(-10),
    }),
  });
  const data = await response.json();
  elements.analyzeBtn.disabled = false;

  if (!response.ok) {
    const errorText = data.error || "unknown error";
    if (errorText.includes("不支持图像分析")) {
      updateWorkflow("providerCheck", "error", errorText);
      updateWorkflow("request", "error", "已在本地拦截，未向视觉接口发起有效图像分析。");
      updateWorkflow("response", "pending", "未进入返回解析阶段。");
    } else if (errorText.includes("Snapshot") || errorText.includes("/capture")) {
      updateWorkflow("request", "error", errorText);
      updateWorkflow("response", "pending", "抓图阶段失败，未进入返回解析阶段。");
    } else if (errorText.includes("Provider API error") || errorText.includes("Provider request failed") || errorText.includes("timed out")) {
      updateWorkflow("providerCheck", "success", "AI 配置存在且已进入请求阶段。");
      updateWorkflow("request", "error", errorText);
      updateWorkflow("response", "pending", "AI 提供方未返回可解析结果。");
    } else {
      updateWorkflow("request", "error", errorText);
      updateWorkflow("response", "pending", "请求异常终止。");
    }
    const requestId = data.requestId ? `，请求ID：${data.requestId}` : "";
    addMessage("system", `分析失败：${errorText}${requestId}。请打开日志页面查看抓拍、AI 请求和返回详情。`);
    return;
  }

  updateWorkflow("providerCheck", "success", "AI 配置通过，图像分析请求已发送。");
  updateWorkflow("request", "success", `请求已完成，请求ID：${data.requestId || "-"}`);
  updateWorkflow("response", "success", "已成功解析 AI 返回并显示。");
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
  state.apiConfigured = !!data.apiConfigured;
  elements.providerStatus.textContent = data.apiConfigured
    ? `${data.providerName || "Provider"} 已配置`
    : `${data.providerName || "Provider"} 未配置 API Key`;
  elements.providerStatus.classList.toggle("error", !data.apiConfigured);
  elements.apiKey.value = "";
  elements.apiKeyStatus.textContent = data.apiKeySaved ? "API Key 已保存，页面不显示具体值。" : "未保存 API Key";
  if (data.validation) {
    const validation = data.validation;
    const status = validation.ok ? "验证成功" : "验证失败";
    const visionLine = validation.visionSupported
      ? "支持图像分析。"
      : `不支持图像分析：${validation.visionReason || "当前配置不可用"}`;
    elements.providerSaveResult.textContent = `${data.providerName} 设置已保存，${status}。${validation.message} ${visionLine}`;
  }
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
