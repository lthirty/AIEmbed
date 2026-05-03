const elements = {
  appVersion: document.getElementById("app-version"),
  heroAppVersion: document.getElementById("hero-app-version"),
  providerStatus: document.getElementById("provider-status"),
  providerModel: document.getElementById("provider-model"),
  providerName: document.getElementById("provider-name"),
  apiBaseUrl: document.getElementById("api-base-url"),
  apiKey: document.getElementById("api-key"),
  apiKeyStatus: document.getElementById("api-key-status"),
  providerModelInput: document.getElementById("provider-model-input"),
  saveProviderBtn: document.getElementById("save-provider-btn"),
  providerSaveResult: document.getElementById("provider-save-result"),
  aiSettingsPanel: document.getElementById("ai-settings-panel"),
  aiValidationBadge: document.getElementById("ai-validation-badge"),
  sessionTitle: document.getElementById("session-title"),
  sessionCustomer: document.getElementById("session-customer"),
  deviceModel: document.getElementById("device-model"),
  serialNumber: document.getElementById("serial-number"),
  deviceIp: document.getElementById("device-ip"),
  createSessionBtn: document.getElementById("create-session-btn"),
  saveSessionMetaBtn: document.getElementById("save-session-meta-btn"),
  deleteSessionBtn: document.getElementById("delete-session-btn"),
  historySessionsPanel: document.getElementById("history-sessions-panel"),
  sessionsList: document.getElementById("sessions-list"),
  activeSessionLabel: document.getElementById("active-session-label"),
  materialTitle: document.getElementById("material-title"),
  materialFile: document.getElementById("material-file"),
  uploadMaterialBtn: document.getElementById("upload-material-btn"),
  materialResult: document.getElementById("material-result"),
  logTitle: document.getElementById("log-title"),
  logContent: document.getElementById("log-content"),
  saveLogBtn: document.getElementById("save-log-btn"),
  logFileTitle: document.getElementById("log-file-title"),
  logFileInput: document.getElementById("log-file-input"),
  uploadLogFileBtn: document.getElementById("upload-log-file-btn"),
  logFileResult: document.getElementById("log-file-result"),
  serialPortSelect: document.getElementById("serial-port-select"),
  refreshSerialPortsBtn: document.getElementById("refresh-serial-ports-btn"),
  serialBaud: document.getElementById("serial-baud"),
  startSerialCaptureBtn: document.getElementById("start-serial-capture-btn"),
  stopSerialCaptureBtn: document.getElementById("stop-serial-capture-btn"),
  serialCaptureStatus: document.getElementById("serial-capture-status"),
  latestSerialOutput: document.getElementById("latest-serial-output"),
  infoTitle: document.getElementById("info-title"),
  infoContent: document.getElementById("info-content"),
  infoFile: document.getElementById("info-file"),
  saveInfoBtn: document.getElementById("save-info-btn"),
  infoResult: document.getElementById("info-result"),
  captureSnapshotBtn: document.getElementById("capture-snapshot-btn"),
  snapshotResult: document.getElementById("snapshot-result"),
  analysisRequest: document.getElementById("analysis-request"),
  captureBeforeAnalyze: document.getElementById("capture-before-analyze"),
  analyzeBtn: document.getElementById("analyze-btn"),
  workflowSteps: document.getElementById("workflow-steps"),
  analysisResult: document.getElementById("analysis-result"),
  saveAnalysisSummaryBtn: document.getElementById("save-analysis-summary-btn"),
  analysisCount: document.getElementById("analysis-count"),
  analysisHistory: document.getElementById("analysis-history"),
  compareSelectedBtn: document.getElementById("compare-selected-btn"),
  analysisCompare: document.getElementById("analysis-compare"),
};

const state = {
  apiConfigured: false,
  sessions: [],
  activeSessionId: "",
  serialStatus: null,
  latestAnalysis: null,
  selectedCompareIds: [],
};

const workflowTemplate = [
  { key: "session", name: "读取会话与证据", state: "pending", detail: "等待开始" },
  { key: "snapshot", name: "补充抓拍证据", state: "pending", detail: "等待开始" },
  { key: "provider", name: "校验 AI 配置", state: "pending", detail: "等待开始" },
  { key: "request", name: "发送分析请求", state: "pending", detail: "等待开始" },
  { key: "response", name: "解析分析结果", state: "pending", detail: "等待开始" },
];

let workflowState = [];
let serialPollTimer = null;

function showGenericError(error) {
  console.error(error);
  window.alert(error.message || "操作失败");
}

function requireSession() {
  if (!state.activeSessionId) {
    window.alert("请先创建或选择一个会话。");
    throw new Error("no active session");
  }
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
    article.innerHTML = `
      <div class="step-name">${step.name}</div>
      <div class="step-state">${step.state.toUpperCase()}</div>
      <div class="step-detail"></div>
    `;
    article.querySelector(".step-detail").textContent = step.detail;
    elements.workflowSteps.appendChild(article);
  }
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

function setValidationState(ok, message) {
  elements.aiValidationBadge.textContent = ok ? "验证通过" : "验证异常";
  elements.aiValidationBadge.className = `validation-badge ${ok ? "ok" : "error"}`;
  elements.providerSaveResult.textContent = message;
  elements.providerSaveResult.classList.toggle("error", !ok);
  elements.aiSettingsPanel.open = !ok;
}

function updateApiKeyStatus(saved) {
  elements.apiKeyStatus.textContent = saved ? "API Key 已保存，页面不显示具体值。" : "未保存 API Key";
}

async function validateSavedProvider() {
  const data = await apiGet("/api/provider/validate");
  const validation = data.validation || {};
  state.apiConfigured = !!data.apiConfigured && !!validation.ok;
  elements.providerStatus.textContent = validation.ok
    ? `${data.providerName || "Provider"} 已验证`
    : `${data.providerName || "Provider"} 未通过验证`;
  elements.providerStatus.classList.toggle("error", !validation.ok);
  setValidationState(!!validation.ok, validation.message || "未验证");
}

async function loadConfig() {
  const data = await apiGet("/api/config");
  elements.appVersion.textContent = data.appVersion || "-";
  elements.heroAppVersion.textContent = data.appVersion || "-";
  elements.providerName.value = data.providerName || "";
  elements.apiBaseUrl.value = data.apiBaseUrl || "";
  elements.apiKey.value = "";
  elements.providerModelInput.value = data.model || "";
  elements.providerModel.textContent = data.model || "-";
  updateApiKeyStatus(!!data.apiKeySaved);
  if (!data.apiKeySaved) {
    elements.providerStatus.textContent = `${data.providerName || "Provider"} 未配置 API Key`;
    elements.providerStatus.classList.add("error");
    setValidationState(false, "还没有保存 API Key，无法做 AI 自动分析。");
    window.alert("当前还没有保存 API Key，请先填写并保存 AI 设置。");
    return;
  }
  await validateSavedProvider();
}

function renderSessions() {
  elements.sessionsList.innerHTML = "";
  if (!state.sessions.length) {
    elements.sessionsList.innerHTML = '<p class="helper">还没有会话。先创建一个客户调试会话。</p>';
    return;
  }
  for (const session of state.sessions) {
    const article = document.createElement("article");
    article.className = `session-chip ${session.id === state.activeSessionId ? "active" : ""}`;
    article.innerHTML = `
      <div class="session-chip-head">
        <div>
          <div class="session-chip-title">${session.title}</div>
          <div class="session-chip-meta">${session.customerName || "未填客户"} · ${session.deviceModel || "未填型号"} · ${session.serialNumber || "未填序号"}</div>
          <div class="session-chip-meta">${session.updatedAt}</div>
        </div>
        <div class="inline-actions compact">
          <button type="button" class="secondary-btn session-select-btn">切换/编辑</button>
          <button type="button" class="danger-btn session-delete-btn">删除</button>
        </div>
      </div>
    `;
    article.querySelector(".session-select-btn").addEventListener("click", () => {
      state.activeSessionId = session.id;
      if (elements.historySessionsPanel) elements.historySessionsPanel.open = false;
      loadSessionDetail(session.id).catch(showGenericError);
    });
    article.querySelector(".session-delete-btn").addEventListener("click", (event) => {
      event.stopPropagation();
      deleteSessionById(session.id).catch(showGenericError);
    });
    elements.sessionsList.appendChild(article);
  }
}

function evidenceBody(item) {
  const metaParts = [];
  if (item.fileName) metaParts.push(item.fileName);
  if (item.meta?.port) metaParts.push(`${item.meta.port} @ ${item.meta.baud}`);
  return {
    metaText: [item.createdAt, ...metaParts].filter(Boolean).join(" · "),
    bodyText: item.contentText || JSON.stringify(item.meta || {}, null, 2),
  };
}

function renderEvidence(evidence) {
  if (!elements.latestSerialOutput) {
    return;
  }
  const latestSerial = evidence.find((item) => item.kind === "serial_log");
  elements.latestSerialOutput.value = latestSerial
    ? (latestSerial.contentText || "").split(/\r?\n/).slice(-10).join("\n")
    : "";
}

function createListSection(title, items) {
  const section = document.createElement("section");
  section.className = "result-block";
  section.innerHTML = `<h3>${title}</h3>`;
  if (!items || !items.length) {
    section.innerHTML += '<p class="helper">无</p>';
    return section;
  }
  const list = document.createElement("div");
  list.className = "result-list";
  items.forEach((item) => {
    const card = document.createElement("article");
    card.className = "result-card";
    if (typeof item === "string") {
      card.textContent = item;
    } else {
      const lines = [];
      Object.entries(item).forEach(([key, value]) => {
        if (value === null || value === undefined || value === "") return;
        lines.push(`${key}: ${typeof value === "string" ? value : JSON.stringify(value, null, 2)}`);
      });
      card.textContent = lines.join("\n");
    }
    list.appendChild(card);
  });
  section.appendChild(list);
  return section;
}

function formatAnalysisForCompare(analysis) {
  const wrapper = document.createElement("article");
  wrapper.className = "compare-card";
  wrapper.appendChild(createListSection("分析摘要", [analysis.result?.phenomenon_summary || "无"]));
  wrapper.appendChild(createListSection("已用证据", analysis.result?.evidence_used || []));
  wrapper.appendChild(createListSection("可能原因", analysis.result?.possible_causes || []));
  wrapper.appendChild(createListSection("验证步骤", analysis.result?.validation_steps || []));
  return wrapper;
}

function renderCompareArea(analyses) {
  elements.analysisCompare.innerHTML = "";
  const selected = analyses.filter((item) => state.selectedCompareIds.includes(item.id)).slice(0, 2);
  if (selected.length !== 2) return;
  const grid = document.createElement("div");
  grid.className = "compare-grid";
  selected.forEach((analysis) => {
    const column = document.createElement("section");
    column.className = "compare-column";
    column.innerHTML = `<h3>${analysis.createdAt}</h3><p class="helper">${analysis.requestText}</p>`;
    column.appendChild(formatAnalysisForCompare(analysis));
    grid.appendChild(column);
  });
  elements.analysisCompare.appendChild(grid);
}

function createSummaryField(label, id, value, type = "text", options = []) {
  const wrapper = document.createElement("label");
  wrapper.className = "summary-edit-card";
  wrapper.innerHTML = `<span class="summary-label">${label}</span>`;
  let input;
  if (type === "textarea") {
    input = document.createElement("textarea");
    input.rows = 4;
  } else if (type === "select") {
    input = document.createElement("select");
    options.forEach((optionValue) => {
      const option = document.createElement("option");
      option.value = optionValue;
      option.textContent = optionValue;
      input.appendChild(option);
    });
  } else {
    input = document.createElement("input");
    input.type = "text";
  }
  input.id = id;
  input.value = value || "";
  wrapper.appendChild(input);
  return wrapper;
}

function renderReadableAnalysis(analysis) {
  elements.analysisResult.innerHTML = "";
  state.latestAnalysis = analysis;
  if (!analysis || !analysis.result || typeof analysis.result !== "object") {
    elements.analysisResult.textContent = "尚未分析";
    return;
  }
  const result = analysis.result;
  const summaryGrid = document.createElement("div");
  summaryGrid.className = "summary-edit-grid";
  summaryGrid.appendChild(createSummaryField("测试时间", "summary-test-time", result.test_time || analysis.createdAt || ""));
  summaryGrid.appendChild(createSummaryField("设备型号", "summary-device-model", result.device_model || ""));
  summaryGrid.appendChild(createSummaryField("序号", "summary-serial-number", result.serial_number || ""));
  summaryGrid.appendChild(createSummaryField("优先级", "summary-priority", result.priority || "P1", "select", ["P0", "P1", "P2"]));
  summaryGrid.appendChild(createSummaryField("风险等级", "summary-risk-level", result.risk_level || "low", "select", ["low", "medium", "high", "critical"]));
  elements.analysisResult.appendChild(summaryGrid);
  elements.analysisResult.appendChild(createSummaryField("现象总结", "summary-phenomenon", result.phenomenon_summary || "", "textarea"));
  elements.analysisResult.appendChild(createListSection("已用证据", result.evidence_used || []));
  elements.analysisResult.appendChild(createListSection("可能原因", result.possible_causes || []));
  elements.analysisResult.appendChild(createListSection("验证步骤", result.validation_steps || []));
  elements.analysisResult.appendChild(createListSection("缺失信息", result.missing_information || []));
  elements.analysisResult.appendChild(createListSection("建议命令/片段", result.suggested_commands_or_snippets || []));
}

function renderAnalyses(analyses) {
  elements.analysisCount.textContent = `${analyses.length} 条`;
  elements.analysisHistory.innerHTML = "";
  elements.analysisCompare.innerHTML = "";
  if (!analyses.length) {
    elements.analysisHistory.innerHTML = '<tr><td colspan="9" class="table-empty">还没有结构化分析结果。</td></tr>';
    renderReadableAnalysis(null);
    return;
  }
  renderReadableAnalysis(analyses[0]);
  for (const analysis of analyses) {
    const row = document.createElement("tr");
    row.className = "analysis-row";
    row.innerHTML = `
      <td class="table-check-cell">
        <input type="checkbox" data-analysis-id="${analysis.id}">
      </td>
      <td>${analysis.createdAt || ""}</td>
      <td>${analysis.result?.test_time || analysis.createdAt || ""}</td>
      <td>${analysis.result?.device_model || ""}</td>
      <td>${analysis.result?.serial_number || ""}</td>
      <td>${analysis.result?.priority || ""}</td>
      <td>${analysis.result?.risk_level || ""}</td>
      <td class="summary-cell">${analysis.result?.phenomenon_summary || "无现象总结"}</td>
      <td class="summary-cell">${analysis.requestText || ""}</td>
    `;
    row.addEventListener("click", () => renderReadableAnalysis(analysis));
    const checkbox = row.querySelector("input[type='checkbox']");
    checkbox.checked = state.selectedCompareIds.includes(analysis.id);
    checkbox.addEventListener("click", (event) => event.stopPropagation());
    checkbox.addEventListener("change", () => {
      if (checkbox.checked) {
        state.selectedCompareIds = [...state.selectedCompareIds.filter((id) => id !== analysis.id), analysis.id].slice(-2);
      } else {
        state.selectedCompareIds = state.selectedCompareIds.filter((id) => id !== analysis.id);
      }
      renderAnalyses(analyses);
    });
    elements.analysisHistory.appendChild(row);
  }
  renderCompareArea(analyses);
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
  if (index >= 0) state.sessions[index] = { ...state.sessions[index], ...data };
  elements.activeSessionLabel.textContent = `${data.title} · ${data.deviceModel || "未填型号"} · ${data.serialNumber || "未填序号"}`;
  elements.sessionTitle.value = data.title || "";
  elements.sessionCustomer.value = data.customerName || "";
  elements.deviceModel.value = data.deviceModel || "";
  elements.serialNumber.value = data.serialNumber || "";
  elements.deviceIp.value = data.deviceIp || "";
  renderSessions();
  renderEvidence(data.evidence || []);
  renderAnalyses(data.analyses || []);
}

async function createSession() {
  const data = await apiPost("/api/sessions", {
    title: elements.sessionTitle.value.trim(),
    customerName: elements.sessionCustomer.value.trim(),
    deviceModel: elements.deviceModel.value.trim(),
    serialNumber: elements.serialNumber.value.trim(),
    deviceIp: elements.deviceIp.value.trim(),
  });
  state.activeSessionId = data.session.id;
  await loadSessions();
}

async function saveSessionMeta() {
  requireSession();
  await apiPost(`/api/sessions/${state.activeSessionId}/meta`, {
    title: elements.sessionTitle.value.trim(),
    customerName: elements.sessionCustomer.value.trim(),
    deviceModel: elements.deviceModel.value.trim(),
    serialNumber: elements.serialNumber.value.trim(),
    deviceIp: elements.deviceIp.value.trim(),
  });
  await loadSessionDetail(state.activeSessionId);
}

async function deleteSession() {
  requireSession();
  if (!window.confirm("确定删除当前会话及其证据、分析历史吗？")) return;
  const response = await fetch(`/api/sessions/${state.activeSessionId}`, { method: "DELETE" });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "delete failed");
  state.activeSessionId = "";
  state.selectedCompareIds = [];
  await loadSessions();
}

async function deleteSessionById(sessionId) {
  if (!window.confirm("确定删除这个历史会话及其全部证据、分析吗？")) return;
  const response = await fetch(`/api/sessions/${sessionId}`, { method: "DELETE" });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "delete failed");
  if (state.activeSessionId === sessionId) {
    state.activeSessionId = "";
    state.selectedCompareIds = [];
  }
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
    elements.providerModel.textContent = data.model || "-";
    elements.apiKey.value = "";
    updateApiKeyStatus(!!data.apiKeySaved);
    await validateSavedProvider();
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

async function uploadLogFile() {
  requireSession();
  const file = elements.logFileInput.files[0];
  if (!file) {
    window.alert("请选择串口日志文件。");
    return;
  }
  const formData = new FormData();
  formData.append("sessionId", state.activeSessionId);
  formData.append("title", elements.logFileTitle.value.trim());
  formData.append("file", file);
  elements.uploadLogFileBtn.disabled = true;
  elements.logFileResult.textContent = "导入中...";
  try {
    const response = await fetch("/api/log-upload", { method: "POST", body: formData });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "upload failed");
    elements.logFileResult.textContent = `串口文件已导入：${data.evidence.title}`;
    elements.logFileTitle.value = "";
    elements.logFileInput.value = "";
    await loadSessionDetail(state.activeSessionId);
  } finally {
    elements.uploadLogFileBtn.disabled = false;
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

async function saveImportedInfo() {
  requireSession();
  const content = elements.infoContent.value.trim();
  const file = elements.infoFile.files[0];
  if (!content && !file) {
    window.alert("请先填写信息内容或选择附件。");
    return;
  }
  const formData = new FormData();
  formData.append("sessionId", state.activeSessionId);
  formData.append("title", elements.infoTitle.value.trim());
  formData.append("content", content);
  if (file) formData.append("file", file);
  elements.saveInfoBtn.disabled = true;
  elements.infoResult.textContent = "导入中...";
  try {
    const response = await fetch("/api/info-upload", { method: "POST", body: formData });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "upload failed");
    elements.infoResult.textContent = `导入完成：${data.evidence.title}`;
    elements.infoTitle.value = "";
    elements.infoContent.value = "";
    elements.infoFile.value = "";
    await loadSessionDetail(state.activeSessionId);
  } finally {
    elements.saveInfoBtn.disabled = false;
  }
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

function renderSerialPorts(ports) {
  elements.serialPortSelect.innerHTML = "";
  if (!ports.length) {
    elements.serialPortSelect.innerHTML = '<option value="">未发现串口</option>';
    return;
  }
  for (const port of ports) {
    const option = document.createElement("option");
    option.value = port.device;
    option.textContent = `${port.device} · ${port.description}`;
    elements.serialPortSelect.appendChild(option);
  }
}

async function loadSerialPorts() {
  const data = await apiGet("/api/serial/ports");
  renderSerialPorts(data.ports || []);
}

function renderSerialStatus(status) {
  state.serialStatus = status;
  if (!status) {
    elements.serialCaptureStatus.textContent = "未启动串口自动抓取。";
    return;
  }
  if (status.running) {
    elements.serialCaptureStatus.textContent = `正在抓取：${status.port} @ ${status.baud}，已采集 ${status.lines} 行，约 ${status.bytes} bytes。`;
  } else if (status.lastError) {
    elements.serialCaptureStatus.textContent = `串口抓取已停止，异常：${status.lastError}`;
  } else if (status.port) {
    elements.serialCaptureStatus.textContent = `串口抓取已停止：${status.port} @ ${status.baud}，共 ${status.lines} 行。`;
  } else {
    elements.serialCaptureStatus.textContent = "未启动串口自动抓取。";
  }
}

async function pollSerialStatus() {
  const data = await apiGet("/api/serial/status");
  renderSerialStatus(data.status);
  if (data.status?.running && state.activeSessionId === data.status.sessionId) {
    await loadSessionDetail(state.activeSessionId);
  }
}

function startSerialPolling() {
  if (serialPollTimer) clearInterval(serialPollTimer);
  serialPollTimer = setInterval(() => {
    pollSerialStatus().catch(console.error);
  }, 2000);
}

async function startSerialCapture() {
  requireSession();
  const port = elements.serialPortSelect.value;
  const baud = Number(elements.serialBaud.value || 115200);
  if (!port) {
    window.alert("请先选择串口端口。");
    return;
  }
  const data = await apiPost("/api/serial/start", { sessionId: state.activeSessionId, port, baud });
  renderSerialStatus(data.status);
  elements.latestSerialOutput.value = "";
  await loadSessionDetail(state.activeSessionId);
}

async function stopSerialCapture() {
  const data = await apiPost("/api/serial/stop", {});
  renderSerialStatus(data.status);
  if (state.activeSessionId) await loadSessionDetail(state.activeSessionId);
}

async function runAnalysis() {
  requireSession();
  if (!state.apiConfigured) {
    window.alert("请先通过 AI 验证。");
    return;
  }
  resetWorkflow();
  updateWorkflow("session", "running", "正在读取当前会话、资料、日志和备注...");
  updateWorkflow("provider", "running", "准备使用当前 AI 配置...");
  const captureSnapshotBefore = elements.captureBeforeAnalyze.checked;
  const deviceIp = elements.deviceIp.value.trim();
  updateWorkflow("session", "success", `已选中会话 ${state.activeSessionId}。`);
  updateWorkflow("snapshot", captureSnapshotBefore ? "running" : "success", captureSnapshotBefore ? "分析前将补充一张设备抓拍。" : "本轮不补充抓拍。");
  elements.analyzeBtn.disabled = true;
  try {
    const data = await apiPost(`/api/sessions/${state.activeSessionId}/analyze`, {
      requestText: elements.analysisRequest.value.trim(),
      deviceIp,
      captureSnapshot: captureSnapshotBefore,
    });
    updateWorkflow("snapshot", "success", captureSnapshotBefore ? "抓拍成功并已入库。" : "未启用抓拍。");
    updateWorkflow("provider", "success", "AI 配置可用。");
    updateWorkflow("request", "success", `请求已发送，请求ID：${data.requestId}`);
    updateWorkflow("response", "success", "结构化结果已解析并入库。");
    await loadSessionDetail(state.activeSessionId);
  } catch (error) {
    const message = error.message || "分析失败";
    if (message.includes("Snapshot")) {
      updateWorkflow("snapshot", "error", message);
      updateWorkflow("request", "pending", "因抓拍失败未继续。");
    } else if (message.includes("JSON")) {
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

async function saveAnalysisSummary() {
  requireSession();
  if (!state.latestAnalysis) {
    window.alert("当前没有可保存的分析结果。");
    return;
  }
  const result = { ...state.latestAnalysis.result };
  result.test_time = document.getElementById("summary-test-time")?.value || "";
  result.device_model = document.getElementById("summary-device-model")?.value || "";
  result.serial_number = document.getElementById("summary-serial-number")?.value || "";
  result.phenomenon_summary = document.getElementById("summary-phenomenon")?.value || "";
  result.priority = document.getElementById("summary-priority")?.value || "P1";
  result.risk_level = document.getElementById("summary-risk-level")?.value || "low";
  await apiPost(`/api/sessions/${state.activeSessionId}/analysis-summary`, {
    analysisId: state.latestAnalysis.id,
    result,
  });
  await loadSessionDetail(state.activeSessionId);
}

function compareSelectedAnalyses() {
  const count = state.selectedCompareIds.length;
  if (count !== 2) {
    window.alert("请先勾选两条分析记录。");
    return;
  }
  const current = Array.from(elements.analysisHistory.children);
  if (current.length) {
    elements.analysisCompare.scrollIntoView({ behavior: "smooth", block: "start" });
  }
}

elements.saveProviderBtn.addEventListener("click", () => saveProviderConfig().catch(showGenericError));
elements.createSessionBtn.addEventListener("click", () => createSession().catch(showGenericError));
elements.saveSessionMetaBtn.addEventListener("click", () => saveSessionMeta().catch(showGenericError));
elements.deleteSessionBtn.addEventListener("click", () => deleteSession().catch(showGenericError));
elements.uploadMaterialBtn.addEventListener("click", () => uploadMaterial().catch(showGenericError));
elements.saveLogBtn.addEventListener("click", () => saveLog().catch(showGenericError));
elements.uploadLogFileBtn.addEventListener("click", () => uploadLogFile().catch(showGenericError));
elements.refreshSerialPortsBtn.addEventListener("click", () => loadSerialPorts().catch(showGenericError));
elements.startSerialCaptureBtn.addEventListener("click", () => startSerialCapture().catch(showGenericError));
elements.stopSerialCaptureBtn.addEventListener("click", () => stopSerialCapture().catch(showGenericError));
elements.saveInfoBtn.addEventListener("click", () => saveImportedInfo().catch(showGenericError));
elements.captureSnapshotBtn.addEventListener("click", () => captureSnapshot().catch(showGenericError));
elements.analyzeBtn.addEventListener("click", () => runAnalysis().catch(showGenericError));
elements.saveAnalysisSummaryBtn.addEventListener("click", () => saveAnalysisSummary().catch(showGenericError));
elements.compareSelectedBtn.addEventListener("click", compareSelectedAnalyses);

resetWorkflow();
Promise.all([loadConfig(), loadSessions(), loadSerialPorts(), pollSerialStatus()]).catch(showGenericError);
startSerialPolling();
