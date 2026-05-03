const elements = {
  providerStatus: document.getElementById("provider-status"),
  providerModel: document.getElementById("provider-model"),
  providerName: document.getElementById("provider-name"),
  apiBaseUrl: document.getElementById("api-base-url"),
  apiKey: document.getElementById("api-key"),
  apiKeyStatus: document.getElementById("api-key-status"),
  providerModelInput: document.getElementById("provider-model-input"),
  saveProviderBtn: document.getElementById("save-provider-btn"),
  providerSaveResult: document.getElementById("provider-save-result"),
  sessionTitle: document.getElementById("session-title"),
  sessionCustomer: document.getElementById("session-customer"),
  deviceIp: document.getElementById("device-ip"),
  createSessionBtn: document.getElementById("create-session-btn"),
  sessionsList: document.getElementById("sessions-list"),
  activeSessionLabel: document.getElementById("active-session-label"),
  materialTitle: document.getElementById("material-title"),
  materialFile: document.getElementById("material-file"),
  uploadMaterialBtn: document.getElementById("upload-material-btn"),
  materialResult: document.getElementById("material-result"),
  logTitle: document.getElementById("log-title"),
  logContent: document.getElementById("log-content"),
  saveLogBtn: document.getElementById("save-log-btn"),
  noteTitle: document.getElementById("note-title"),
  noteContent: document.getElementById("note-content"),
  saveNoteBtn: document.getElementById("save-note-btn"),
  captureSnapshotBtn: document.getElementById("capture-snapshot-btn"),
  snapshotResult: document.getElementById("snapshot-result"),
  evidenceCount: document.getElementById("evidence-count"),
  evidenceList: document.getElementById("evidence-list"),
  analysisRequest: document.getElementById("analysis-request"),
  captureBeforeAnalyze: document.getElementById("capture-before-analyze"),
  analyzeBtn: document.getElementById("analyze-btn"),
  workflowSteps: document.getElementById("workflow-steps"),
  analysisResult: document.getElementById("analysis-result"),
  analysisCount: document.getElementById("analysis-count"),
  analysisHistory: document.getElementById("analysis-history"),
};

const state = {
  apiConfigured: false,
  sessions: [],
  activeSessionId: "",
};

const workflowTemplate = [
  { key: "session", name: "1. 读取会话与证据", state: "pending", detail: "等待开始" },
  { key: "snapshot", name: "2. 可选抓拍补充证据", state: "pending", detail: "等待开始" },
  { key: "provider", name: "3. 校验 AI 配置", state: "pending", detail: "等待开始" },
  { key: "request", name: "4. 发送分析请求", state: "pending", detail: "等待开始" },
  { key: "response", name: "5. 解析结构化结果", state: "pending", detail: "等待开始" },
];

let workflowState = [];

function activeSession() {
  return state.sessions.find((item) => item.id === state.activeSessionId) || null;
}

function resetWorkflow() {
  workflowState = workflowTemplate.map((item) => ({ ...item }));
  renderWorkflow();
}

function updateWorkflow(key, nextState, detail) {
  const item = workflowState.find((step) => step.key === key);
  if (!item) return;
  item.state = nextState;
  item.detail = detail;
  renderWorkflow();
}

function renderWorkflow() {
  elements.workflowSteps.innerHTML = "";
  for (const step of workflowState) {
    const article = document.createElement("article");
    article.className = `workflow-step ${step.state}`;

    const head = document.createElement("div");
    head.className = "step-head";

    const title = document.createElement("span");
    title.className = "step-name";
    title.textContent = step.name;

    const status = document.createElement("span");
    status.className = "step-state";
    status.textContent = step.state.toUpperCase();

    const detail = document.createElement("div");
    detail.className = "step-detail";
    detail.textContent = step.detail;

    head.append(title, status);
    article.append(head, detail);
    elements.workflowSteps.appendChild(article);
  }
}

function requireSession() {
  if (!state.activeSessionId) {
    window.alert("请先创建或选择一个会话。");
    throw new Error("no active session");
  }
}

function renderSessions() {
  elements.sessionsList.innerHTML = "";
  if (!state.sessions.length) {
    const empty = document.createElement("p");
    empty.className = "helper";
    empty.textContent = "还没有会话。先创建一个客户调试会话。";
    elements.sessionsList.appendChild(empty);
    return;
  }

  for (const session of state.sessions) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `session-chip ${session.id === state.activeSessionId ? "active" : ""}`;
    button.textContent = `${session.title} · ${session.customerName || "未填客户"}`;
    button.addEventListener("click", () => {
      state.activeSessionId = session.id;
      loadSessionDetail(session.id).catch(showGenericError);
    });
    elements.sessionsList.appendChild(button);
  }
}

function renderEvidence(evidence) {
  elements.evidenceCount.textContent = `${evidence.length} 条`;
  elements.evidenceList.innerHTML = "";
  if (!evidence.length) {
    const empty = document.createElement("p");
    empty.className = "helper";
    empty.textContent = "当前会话还没有证据。先导入资料、日志或备注。";
    elements.evidenceList.appendChild(empty);
    return;
  }

  for (const item of evidence) {
    const article = document.createElement("article");
    article.className = "evidence-card";

    const title = document.createElement("div");
    title.className = "evidence-title";
    title.textContent = `${item.kind} · ${item.title}`;

    const meta = document.createElement("div");
    meta.className = "evidence-meta";
    meta.textContent = `${item.createdAt}${item.fileName ? ` · ${item.fileName}` : ""}`;

    const body = document.createElement("pre");
    body.className = "evidence-pre";
    body.textContent = item.contentText || JSON.stringify(item.meta || {}, null, 2);

    article.append(title, meta, body);
    elements.evidenceList.appendChild(article);
  }
}

function renderAnalyses(analyses) {
  elements.analysisCount.textContent = `${analyses.length} 条`;
  elements.analysisHistory.innerHTML = "";
  if (!analyses.length) {
    const empty = document.createElement("p");
    empty.className = "helper";
    empty.textContent = "还没有结构化分析结果。";
    elements.analysisHistory.appendChild(empty);
    elements.analysisResult.textContent = "尚未分析";
    return;
  }

  elements.analysisResult.textContent = JSON.stringify(analyses[0].result, null, 2);

  for (const analysis of analyses) {
    const article = document.createElement("article");
    article.className = "message assistant";

    const role = document.createElement("span");
    role.className = "role";
    role.textContent = `${analysis.createdAt} · ${analysis.requestText}`;

    const body = document.createElement("pre");
    body.className = "log-pre";
    body.textContent = JSON.stringify(analysis.result, null, 2);

    article.append(role, body);
    elements.analysisHistory.appendChild(article);
  }
}

function showGenericError(error) {
  console.error(error);
  window.alert(error.message || "操作失败");
}

async function apiGet(url) {
  const response = await fetch(url);
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "request failed");
  return data;
}

async function apiPost(url, payload) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "request failed");
  return data;
}

async function loadConfig() {
  const data = await apiGet("/api/config");
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

async function loadSessions() {
  const data = await apiGet("/api/sessions");
  state.sessions = data.sessions || [];
  if (!state.activeSessionId && state.sessions.length) {
    state.activeSessionId = state.sessions[0].id;
  }
  renderSessions();
  if (state.activeSessionId) {
    await loadSessionDetail(state.activeSessionId);
  } else {
    elements.activeSessionLabel.textContent = "未选择";
    renderEvidence([]);
    renderAnalyses([]);
  }
}

async function loadSessionDetail(sessionId) {
  const data = await apiGet(`/api/sessions/${sessionId}`);
  const index = state.sessions.findIndex((item) => item.id === data.id);
  if (index >= 0) {
    state.sessions[index] = { ...state.sessions[index], ...data };
  }
  elements.activeSessionLabel.textContent = data.title;
  elements.sessionTitle.value = data.title || "";
  elements.sessionCustomer.value = data.customerName || "";
  elements.deviceIp.value = data.deviceIp || "";
  renderSessions();
  renderEvidence(data.evidence || []);
  renderAnalyses(data.analyses || []);
}

async function createSession() {
  const data = await apiPost("/api/sessions", {
    title: elements.sessionTitle.value.trim(),
    customerName: elements.sessionCustomer.value.trim(),
    deviceIp: elements.deviceIp.value.trim(),
  });
  state.activeSessionId = data.session.id;
  await loadSessions();
}

async function saveProviderConfig() {
  elements.saveProviderBtn.disabled = true;
  elements.providerSaveResult.textContent = "保存中...";
  try {
    const data = await apiPost("/api/provider", {
      providerName: elements.providerName.value.trim(),
      apiBaseUrl: elements.apiBaseUrl.value.trim(),
      apiKey: elements.apiKey.value.trim(),
      model: elements.providerModelInput.value.trim(),
    });
    const validation = data.validation || {};
    state.apiConfigured = !!data.apiConfigured;
    elements.providerModel.textContent = data.model || "-";
    elements.providerStatus.textContent = state.apiConfigured
      ? `${data.providerName || "Provider"} 已配置`
      : `${data.providerName || "Provider"} 未配置 API Key`;
    elements.providerStatus.classList.toggle("error", !state.apiConfigured);
    elements.apiKey.value = "";
    elements.apiKeyStatus.textContent = data.apiKeySaved ? "API Key 已保存，页面不显示具体值。" : "未保存 API Key";
    elements.providerSaveResult.textContent = `${data.providerName} 设置已保存。${validation.message || ""}`;
  } catch (error) {
    elements.providerSaveResult.textContent = `保存失败：${error.message}`;
    elements.providerSaveResult.classList.add("error");
  } finally {
    elements.saveProviderBtn.disabled = false;
  }
}

async function uploadMaterial() {
  requireSession();
  const file = elements.materialFile.files[0];
  if (!file) {
    window.alert("请选择要上传的资料文件。");
    return;
  }

  const formData = new FormData();
  formData.append("sessionId", state.activeSessionId);
  formData.append("title", elements.materialTitle.value.trim());
  formData.append("file", file);

  elements.uploadMaterialBtn.disabled = true;
  elements.materialResult.textContent = "上传中...";
  try {
    const response = await fetch("/api/upload", { method: "POST", body: formData });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "upload failed");
    elements.materialResult.textContent = `资料已导入：${data.evidence.title}`;
    elements.materialTitle.value = "";
    elements.materialFile.value = "";
    await loadSessionDetail(state.activeSessionId);
  } finally {
    elements.uploadMaterialBtn.disabled = false;
  }
}

async function saveLog() {
  requireSession();
  const content = elements.logContent.value.trim();
  if (!content) {
    window.alert("请先粘贴串口日志。");
    return;
  }
  await apiPost(`/api/sessions/${state.activeSessionId}/logs`, {
    title: elements.logTitle.value.trim(),
    content,
  });
  elements.logTitle.value = "";
  elements.logContent.value = "";
  await loadSessionDetail(state.activeSessionId);
}

async function saveNote() {
  requireSession();
  const content = elements.noteContent.value.trim();
  if (!content) {
    window.alert("请先填写人工备注。");
    return;
  }
  await apiPost(`/api/sessions/${state.activeSessionId}/notes`, {
    title: elements.noteTitle.value.trim(),
    content,
  });
  elements.noteTitle.value = "";
  elements.noteContent.value = "";
  await loadSessionDetail(state.activeSessionId);
}

async function captureSnapshot() {
  requireSession();
  const deviceIp = elements.deviceIp.value.trim();
  if (!deviceIp) {
    window.alert("请先填写设备 IP。");
    return;
  }
  elements.snapshotResult.textContent = "抓拍中...";
  const data = await apiPost(`/api/sessions/${state.activeSessionId}/snapshot`, { deviceIp });
  elements.snapshotResult.textContent = `抓拍已保存：${data.evidence.title}`;
  await loadSessionDetail(state.activeSessionId);
}

async function runAnalysis() {
  requireSession();
  if (!state.apiConfigured) {
    window.alert("请先保存可用的 AI 设置。");
    return;
  }

  resetWorkflow();
  updateWorkflow("session", "running", "正在读取当前会话、资料、日志和备注...");
  updateWorkflow("provider", "running", "准备使用当前 AI 配置...");
  updateWorkflow("request", "pending", "等待提交");
  updateWorkflow("response", "pending", "等待返回");

  const captureSnapshot = elements.captureBeforeAnalyze.checked;
  const deviceIp = elements.deviceIp.value.trim();
  updateWorkflow("session", "success", `已选中会话 ${state.activeSessionId}。`);
  updateWorkflow("snapshot", captureSnapshot ? "running" : "success", captureSnapshot ? "分析前将补充一张设备抓拍。" : "本轮不补充抓拍。");

  elements.analyzeBtn.disabled = true;
  try {
    const data = await apiPost(`/api/sessions/${state.activeSessionId}/analyze`, {
      requestText: elements.analysisRequest.value.trim(),
      deviceIp,
      captureSnapshot,
    });
    updateWorkflow("snapshot", "success", captureSnapshot ? "抓拍成功并已入库。" : "未启用抓拍。");
    updateWorkflow("provider", "success", "AI 配置可用。");
    updateWorkflow("request", "success", `请求已发送，请求ID：${data.requestId}`);
    updateWorkflow("response", "success", "结构化 JSON 结果已解析并入库。");
    await loadSessionDetail(state.activeSessionId);
  } catch (error) {
    const message = error.message || "分析失败";
    if (message.includes("Snapshot")) {
      updateWorkflow("snapshot", "error", message);
      updateWorkflow("request", "pending", "因抓拍失败未继续。");
    } else if (message.includes("Provider") || message.includes("timed out")) {
      updateWorkflow("provider", "success", "配置已通过，本轮失败点在 AI 请求阶段。");
      updateWorkflow("request", "error", message);
    } else if (message.includes("JSON")) {
      updateWorkflow("provider", "success", "请求已返回。");
      updateWorkflow("request", "success", "AI 已返回文本。");
      updateWorkflow("response", "error", message);
    } else {
      updateWorkflow("request", "error", message);
    }
    window.alert(message);
  } finally {
    elements.analyzeBtn.disabled = false;
  }
}

elements.saveProviderBtn.addEventListener("click", () => saveProviderConfig().catch(showGenericError));
elements.createSessionBtn.addEventListener("click", () => createSession().catch(showGenericError));
elements.uploadMaterialBtn.addEventListener("click", () => uploadMaterial().catch(showGenericError));
elements.saveLogBtn.addEventListener("click", () => saveLog().catch(showGenericError));
elements.saveNoteBtn.addEventListener("click", () => saveNote().catch(showGenericError));
elements.captureSnapshotBtn.addEventListener("click", () => captureSnapshot().catch(showGenericError));
elements.analyzeBtn.addEventListener("click", () => runAnalysis().catch(showGenericError));

resetWorkflow();
Promise.all([loadConfig(), loadSessions()]).catch(showGenericError);
