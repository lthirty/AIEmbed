const elements = {
  appVersion: document.getElementById("app-version"),
  heroAppVersion: document.getElementById("hero-app-version"),
  providerStatus: document.getElementById("provider-status"),
  heroProviderStatus: document.getElementById("hero-provider-status"),
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
  activeSessionLabel: document.getElementById("active-session-label"),
  pageTitle: document.getElementById("page-title"),
  pageSubtitle: document.getElementById("page-subtitle"),
  overviewCounts: document.getElementById("overview-counts"),
  sessionCount: document.getElementById("session-count"),
  sessionList: document.getElementById("session-list"),
  sessionTitle: document.getElementById("session-title"),
  sessionCustomer: document.getElementById("session-customer"),
  deviceModel: document.getElementById("device-model"),
  serialNumber: document.getElementById("serial-number"),
  createSessionBtn: document.getElementById("create-session-btn"),
  saveSessionMetaBtn: document.getElementById("save-session-meta-btn"),
  deleteSessionBtn: document.getElementById("delete-session-btn"),
  materialTitle: document.getElementById("material-title"),
  materialFile: document.getElementById("material-file"),
  uploadMaterialBtn: document.getElementById("upload-material-btn"),
  materialResult: document.getElementById("material-result"),
  evidenceCount: document.getElementById("evidence-count"),
  evidenceInlineList: document.getElementById("evidence-inline-list"),
  infoTitle: document.getElementById("info-title"),
  infoContent: document.getElementById("info-content"),
  infoFile: document.getElementById("info-file"),
  saveInfoBtn: document.getElementById("save-info-btn"),
  infoResult: document.getElementById("info-result"),
  serialPortSelect: document.getElementById("serial-port-select"),
  serialBaudInput: document.getElementById("serial-baud-input"),
  refreshSerialPortsBtn: document.getElementById("refresh-serial-ports-btn"),
  startSerialCaptureBtn: document.getElementById("start-serial-capture-btn"),
  stopSerialCaptureBtn: document.getElementById("stop-serial-capture-btn"),
  serialStatusText: document.getElementById("serial-status-text"),
  serialLiveOutput: document.getElementById("serial-live-output"),
  suggestMissingBtn: document.getElementById("suggest-missing-btn"),
  analyzeBtn: document.getElementById("analyze-btn"),
  analysisStatus: document.getElementById("analysis-status"),
  workflowSteps: document.getElementById("workflow-steps"),
  analysisResult: document.getElementById("analysis-result"),
  saveAnalysisSummaryBtn: document.getElementById("save-analysis-summary-btn"),
  analysisCount: document.getElementById("analysis-count"),
  analysisHistory: document.getElementById("analysis-history"),
  compareSelectedBtn: document.getElementById("compare-selected-btn"),
  analysisCompare: document.getElementById("analysis-compare"),
  analysisHistoryModal: document.getElementById("analysis-history-modal"),
  analysisHistoryModalTitle: document.getElementById("analysis-history-modal-title"),
  analysisHistoryModalBody: document.getElementById("analysis-history-modal-body"),
  closeAnalysisHistoryModalBtn: document.getElementById("close-analysis-history-modal-btn"),
  knowledgeSearch: document.getElementById("knowledge-search"),
  searchKnowledgeBtn: document.getElementById("search-knowledge-btn"),
  createKnowledgeBtn: document.getElementById("create-knowledge-btn"),
  applyKnowledgeBtn: document.getElementById("apply-knowledge-btn"),
  knowledgeTagCloud: document.getElementById("knowledge-tag-cloud"),
  knowledgeList: document.getElementById("knowledge-list"),
  knowledgeDetail: document.getElementById("knowledge-detail"),
  navItems: Array.from(document.querySelectorAll(".nav-item")),
  views: Array.from(document.querySelectorAll(".view-page")),
};

const state = {
  currentView: "analysis",
  apiConfigured: false,
  overview: null,
  sessions: [],
  activeSessionId: "",
  activeSessionDetail: null,
  latestAnalysis: null,
  selectedCompareIds: [],
  knowledge: [],
  selectedKnowledgeId: "",
  lastMissingInfo: [],
  rowEditState: {},
  serialPorts: [],
  serialStatus: null,
  serialPollTimer: null,
  mergedColumnWidths: {
    category: 120,
    owner: 120,
    reason: 240,
    basis: 240,
    method: 240,
    result: 180,
    actions: 180,
  },
};

const workflowTemplate = [
  { key: "session", name: "读取资料与会话", state: "pending", detail: "等待开始" },
  { key: "provider", name: "校验 AI 配置", state: "pending", detail: "等待开始" },
  { key: "request", name: "发送分析请求", state: "pending", detail: "等待开始" },
  { key: "response", name: "写入分析结果", state: "pending", detail: "等待开始" },
];

let workflowState = [];
const AUTO_SESSION_BOOTSTRAP_KEY = "ai-workbench-auto-session-v1";
const defaultAnalysisDimensions = ["硬件", "软件", "固件", "OS", "器件", "生产", "工艺"];
const categoryAliasMap = {
  hardware: "硬件",
  hw: "硬件",
  software: "软件",
  sw: "软件",
  firmware: "固件",
  fw: "固件",
  os: "OS",
  rtos: "OS",
  device: "器件",
  component: "器件",
  production: "生产",
  manufacturing: "生产",
  process: "工艺",
};

function normalizeCategoryLabel(value) {
  const text = String(value || "").trim();
  if (["暂无分析结果", "无", "N/A", "n/a", "-"].includes(text)) return "";
  const lowered = text.toLowerCase();
  return categoryAliasMap[lowered] || text;
}

function showGenericError(error) {
  console.error(error);
  const message = error?.message || "操作失败";
  elements.analysisStatus.textContent = message;
  elements.analysisStatus.classList.add("error");
  window.alert(message);
}

function requireSession() {
  if (!state.activeSessionId) throw new Error("请先创建或选择一个会话。");
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

function setCurrentView(view) {
  state.currentView = view;
  const titles = {
    analysis: ["分析中心", "按“资料导入 -> 问题描述 -> AI 分析 -> 人工确认”推进定位。"],
    library: ["案例库", "查看、搜索、复用历史经验和外部资源。"],
  };
  const [title, subtitle] = titles[view] || titles.analysis;
  elements.pageTitle.textContent = title;
  elements.pageSubtitle.textContent = subtitle;
  elements.navItems.forEach((item) => item.classList.toggle("active", item.dataset.view === view));
  elements.views.forEach((item) => item.classList.toggle("active", item.id === `view-${view}`));
}

function resetWorkflow() {
  workflowState = workflowTemplate.map((item) => ({ ...item }));
  renderWorkflow();
}

function updateWorkflow(key, nextState, detail) {
  const target = workflowState.find((item) => item.key === key);
  if (!target) return;
  target.state = nextState;
  target.detail = detail;
  renderWorkflow();
}

function renderWorkflow() {
  elements.workflowSteps.innerHTML = "";
  workflowState.forEach((step) => {
    const article = document.createElement("article");
    article.className = `workflow-step ${step.state}`;
    article.innerHTML = `
      <div class="step-name">${step.name}</div>
      <div class="step-state">${step.state.toUpperCase()}</div>
      <div class="step-detail">${step.detail}</div>
    `;
    elements.workflowSteps.appendChild(article);
  });
}

async function validateSavedProvider() {
  const data = await apiGet("/api/provider/validate");
  const validation = data.validation || {};
  state.apiConfigured = !!data.apiConfigured && !!validation.ok;
  elements.providerStatus.textContent = validation.ok ? "已验证" : "验证异常";
  elements.heroProviderStatus.textContent = validation.ok ? "已验证" : "异常";
  elements.providerStatus.classList.toggle("error", !validation.ok);
  elements.providerModel.textContent = data.model || elements.providerModelInput.value || "-";
  setValidationState(!!validation.ok, validation.message || "未验证");
}

async function loadConfig() {
  const data = await apiGet("/api/config");
  elements.appVersion.textContent = data.appVersion || "-";
  elements.heroAppVersion.textContent = data.appVersion || "-";
  elements.providerName.value = data.providerName || "";
  elements.apiBaseUrl.value = data.apiBaseUrl || "";
  elements.providerModelInput.value = data.model || "";
  elements.providerModel.textContent = data.model || "-";
  elements.apiKey.value = "";
  updateApiKeyStatus(!!data.apiKeySaved);
  if (!data.apiKeySaved) {
    state.apiConfigured = false;
    elements.providerStatus.textContent = "未配置 API Key";
    elements.heroProviderStatus.textContent = "未配置";
    elements.providerStatus.classList.add("error");
    setValidationState(false, "还没有保存 API Key，无法做 AI 自动分析。");
    return;
  }
  await validateSavedProvider();
}

async function loadOverview() {
  state.overview = await apiGet("/api/workbench/overview");
  const counts = state.overview?.counts || {};
  const items = [
    ["总会话数", counts.sessions || 0],
    ["未关闭问题", counts.openSessions || 0],
    ["分析记录数", counts.analyses || 0],
    ["证据条目数", counts.evidence || 0],
    ["知识条目数", counts.knowledge || 0],
  ];
  elements.overviewCounts.innerHTML = items.map(([label, value]) => `
    <article class="overview-card">
      <div class="overview-value">${value}</div>
      <div class="overview-label">${label}</div>
    </article>
  `).join("");
}

function renderSessionMetaSummary() {
  const session = state.sessions.find((item) => item.id === state.activeSessionId);
  elements.activeSessionLabel.textContent = session
    ? `${session.title} · ${session.deviceModel || "未填型号"} · ${session.serialNumber || "未填序号"}`
    : "未选择";
}

function renderSessionList() {
  elements.sessionCount.textContent = `${state.sessions.length} 条`;
  elements.sessionList.innerHTML = "";
  if (!state.sessions.length) {
    elements.sessionList.innerHTML = '<p class="helper">还没有历史会话。</p>';
    return;
  }
  state.sessions.forEach((session) => {
    const article = document.createElement("article");
    article.className = `list-item compact-row selectable ${session.id === state.activeSessionId ? "active" : ""}`;
    article.innerHTML = `
      <strong>${session.title}</strong>
      <span class="item-meta">${session.customerName || "未填客户"} · ${session.deviceModel || "未填型号"} · ${session.serialNumber || "未填序号"} · ${session.updatedAt || ""}</span>
    `;
    article.addEventListener("click", () => {
      state.activeSessionId = session.id;
      loadSessionDetail(session.id).catch(showGenericError);
    });
    elements.sessionList.appendChild(article);
  });
}

async function loadSessions() {
  const data = await apiGet("/api/sessions");
  state.sessions = data.sessions || [];
  if (!state.activeSessionId && state.sessions.length) {
    state.activeSessionId = state.sessions[0].id;
  }
  renderSessionMetaSummary();
  renderSessionList();
  if (state.activeSessionId) {
    await loadSessionDetail(state.activeSessionId);
  } else {
    renderReadableAnalysis(null);
  }
}

async function createSession(options = {}) {
  const { title = "", silent = false } = options;
  const data = await apiPost("/api/sessions", {
    title: title || elements.sessionTitle.value.trim() || "客户调试会话",
    customerName: elements.sessionCustomer.value.trim(),
    deviceModel: elements.deviceModel.value.trim(),
    serialNumber: elements.serialNumber.value.trim(),
    issueType: "",
    severity: "P1",
    workflowStage: "phenomenon",
    symptom: "",
    owner: "",
    deviceIp: state.activeSessionDetail?.deviceIp || "",
  });
  state.activeSessionId = data.session.id;
  if (!silent) {
    elements.analysisStatus.textContent = "会话已创建。";
    elements.analysisStatus.classList.remove("error");
  }
  await Promise.all([loadOverview(), loadSessions(), loadKnowledge()]);
}

async function ensureAutoSessionOnEntry() {
  if (sessionStorage.getItem(AUTO_SESSION_BOOTSTRAP_KEY) === "1") return;
  sessionStorage.setItem(AUTO_SESSION_BOOTSTRAP_KEY, "1");
  const autoTitle = `新会话 ${new Date().toLocaleString("zh-CN", { hour12: false }).replace(/\//g, "-")}`;
  await createSession({ title: autoTitle, silent: true });
  elements.analysisStatus.textContent = `已自动新建会话：${autoTitle}`;
  elements.analysisStatus.classList.remove("error");
}

async function saveSessionMeta() {
  requireSession();
  await apiPost(`/api/sessions/${state.activeSessionId}/meta`, {
    title: elements.sessionTitle.value.trim(),
    customerName: elements.sessionCustomer.value.trim(),
    deviceModel: elements.deviceModel.value.trim(),
    serialNumber: elements.serialNumber.value.trim(),
    issueType: state.activeSessionDetail?.issueType || "",
    severity: state.activeSessionDetail?.severity || "P1",
    workflowStage: state.activeSessionDetail?.workflowStage || "phenomenon",
    symptom: state.activeSessionDetail?.symptom || "",
    owner: state.activeSessionDetail?.owner || "",
    deviceIp: state.activeSessionDetail?.deviceIp || "",
  });
  elements.analysisStatus.textContent = "当前会话已保存。";
  elements.analysisStatus.classList.remove("error");
  await Promise.all([loadOverview(), loadSessions(), loadKnowledge()]);
}

async function deleteSession() {
  requireSession();
  if (!window.confirm("确定删除当前会话及其证据、分析和步骤吗？")) return;
  const response = await fetch(`/api/sessions/${state.activeSessionId}`, { method: "DELETE" });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "delete failed");
  state.activeSessionId = "";
  state.activeSessionDetail = null;
  state.latestAnalysis = null;
  elements.analysisStatus.textContent = "当前会话已删除。";
  elements.analysisStatus.classList.remove("error");
  await Promise.all([loadOverview(), loadSessions(), loadKnowledge()]);
}

async function saveProviderConfig() {
  elements.saveProviderBtn.disabled = true;
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
  if (!file) throw new Error("请选择要上传的资料文件。");
  const formData = new FormData();
  formData.append("sessionId", state.activeSessionId);
  formData.append("title", elements.materialTitle.value.trim());
  formData.append("file", file);
  const response = await fetch("/api/upload", { method: "POST", body: formData });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "upload failed");
  elements.materialResult.textContent = `资料已导入：${data.evidence.title}`;
  elements.materialTitle.value = "";
  elements.materialFile.value = "";
  await Promise.all([loadOverview(), loadSessionDetail(state.activeSessionId)]);
}

async function saveImportedInfo() {
  requireSession();
  const content = elements.infoContent.value.trim();
  const file = elements.infoFile.files[0];
  if (!content && !file) throw new Error("请先填写问题描述或选择附件。");
  const formData = new FormData();
  formData.append("sessionId", state.activeSessionId);
  formData.append("title", elements.infoTitle.value.trim());
  formData.append("content", content);
  if (file) formData.append("file", file);
  const response = await fetch("/api/info-upload", { method: "POST", body: formData });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "upload failed");
  elements.infoResult.textContent = `导入完成：${data.evidence.title}`;
  elements.infoTitle.value = "";
  elements.infoContent.value = "";
  elements.infoFile.value = "";
  await Promise.all([loadOverview(), loadSessionDetail(state.activeSessionId)]);
}

async function deleteEvidence(evidenceId) {
  requireSession();
  if (!window.confirm("确定删除这条资料或附件吗？")) return;
  const response = await fetch(`/api/evidence/${evidenceId}`, { method: "DELETE" });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "delete failed");
  await Promise.all([loadOverview(), loadSessionDetail(state.activeSessionId)]);
}

function renderEvidenceList() {
  const evidence = state.activeSessionDetail?.evidence || [];
  elements.evidenceCount.textContent = `${evidence.length} 条`;
  elements.evidenceInlineList.innerHTML = "";
  if (!evidence.length) {
    elements.evidenceInlineList.innerHTML = '<p class="helper">当前还没有导入任何资料或附件。</p>';
    return;
  }
  evidence.forEach((item) => {
    const article = document.createElement("article");
    article.className = "evidence-token";
    const label = [item.title || item.fileName || "未命名资料", item.fileName || ""]
      .filter((value, index, array) => value && array.indexOf(value) === index)
      .join(" · ");
    if (item.isImage && item.fileUrl) {
      const previewLink = document.createElement("a");
      previewLink.href = item.fileUrl;
      previewLink.target = "_blank";
      previewLink.rel = "noopener noreferrer";
      previewLink.className = "evidence-preview-link";
      const preview = document.createElement("img");
      preview.src = item.fileUrl;
      preview.alt = label;
      preview.className = "evidence-thumb";
      previewLink.appendChild(preview);
      article.appendChild(previewLink);
    }
    const browseLink = document.createElement("a");
    browseLink.href = item.fileUrl || "#";
    browseLink.target = "_blank";
    browseLink.rel = "noopener noreferrer";
    browseLink.className = "evidence-token-label";
    browseLink.title = label;
    browseLink.textContent = label;
    if (!item.fileUrl) {
      browseLink.removeAttribute("href");
      browseLink.removeAttribute("target");
      browseLink.removeAttribute("rel");
      browseLink.classList.add("disabled");
    }
    article.appendChild(browseLink);
    const delBtn = document.createElement("button");
    delBtn.type = "button";
    delBtn.className = "danger-button";
    delBtn.textContent = "删除";
    delBtn.addEventListener("click", () => deleteEvidence(item.id).catch(showGenericError));
    article.appendChild(delBtn);
    elements.evidenceInlineList.appendChild(article);
  });
}

async function loadSessionDetail(sessionId) {
  const data = await apiGet(`/api/sessions/${sessionId}`);
  state.activeSessionDetail = data;
  const index = state.sessions.findIndex((item) => item.id === data.id);
  if (index >= 0) {
    state.sessions[index] = { ...state.sessions[index], ...data };
  }
  elements.sessionTitle.value = data.title || "";
  elements.sessionCustomer.value = data.customerName || "";
  elements.deviceModel.value = data.deviceModel || "";
  elements.serialNumber.value = data.serialNumber || "";
  renderSessionMetaSummary();
  renderSessionList();
  renderEvidenceList();
  renderAnalyses(data.analyses || []);
}

function hasEvidenceReady() {
  return (state.activeSessionDetail?.evidence || []).length > 0;
}

function buildDefaultAnalysisPrompt() {
  const lines = [
    "请基于当前会话里的资料、问题描述、测试报告、图片和日志进行结构化分析。",
    "先完成：01 现象。",
    "再完成：02-03 分层分析与验证方法。",
    "04 根因、05 解决方案、06 经验总结先留空，等待人工定位后再补。",
    "02-03 每条请尽量拆分为：分类、责任人、原因分析、验证方法、验证结果。",
  ];
  return lines.join("\n");
}

function validateAnalysisPrerequisites() {
  requireSession();
  state.lastMissingInfo = [];
}

async function suggestMissingInfo() {
  requireSession();
  const data = await apiPost("/ai/missing-info", { sessionId: state.activeSessionId });
  state.lastMissingInfo = data.missingInformation || [];
  if (!state.lastMissingInfo.length) {
    elements.analysisStatus.textContent = "当前资料基本齐全，可以开始分析。";
    elements.analysisStatus.classList.remove("error");
    return;
  }
  elements.analysisStatus.textContent = `缺失信息：${state.lastMissingInfo.join("；")}`;
  elements.analysisStatus.classList.add("error");
}

async function runAnalysis() {
  requireSession();
  if (!state.apiConfigured) throw new Error("请先完成 AI 验证。");
  validateAnalysisPrerequisites();
  resetWorkflow();
  updateWorkflow("session", "running", "正在读取当前会话、资料、附件和历史分析...");
  updateWorkflow("provider", "running", "正在校验当前 AI 设置...");
  try {
    updateWorkflow("session", "success", `已读取会话 ${state.activeSessionId}。`);
    await validateSavedProvider();
    if (!state.apiConfigured) throw new Error("当前 AI 设置校验未通过，请先修正。");
    updateWorkflow("provider", "success", "AI 配置可用。");
    updateWorkflow("request", "running", "正在向 AI 发送分析请求...");
    const data = await apiPost("/ai/analyze", {
      sessionId: state.activeSessionId,
      requestText: buildDefaultAnalysisPrompt(),
      deviceIp: state.activeSessionDetail?.deviceIp || "",
      captureSnapshot: false,
    });
    updateWorkflow("request", "success", `请求已发送，请求ID：${data.requestId}`);
    updateWorkflow("response", "success", "结构化结果已解析并写入历史分析。");
    elements.analysisStatus.textContent = `分析完成，请求ID：${data.requestId}`;
    elements.analysisStatus.classList.remove("error");
    await Promise.all([loadOverview(), loadSessionDetail(state.activeSessionId), loadKnowledge()]);
  } catch (error) {
    const message = error?.message || "分析请求失败";
    if (workflowState.find((item) => item.key === "provider")?.state === "running") {
      updateWorkflow("provider", "error", message);
      updateWorkflow("request", "pending", "等待开始");
    } else {
      updateWorkflow("request", "error", message);
    }
    updateWorkflow("response", "error", "本轮未生成有效结构化结果。");
    renderReadableAnalysis(null);
    throw error;
  }
}

function createSummaryField(label, id, value, type = "text", options = []) {
  const wrapper = document.createElement("label");
  wrapper.className = "summary-edit-card";
  wrapper.innerHTML = `<span class="summary-label">${label}</span>`;
  let input;
  if (type === "select") {
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

function normalizeListItems(items, fallbackText = "") {
  if (Array.isArray(items) && items.length) return items.map((item) => String(item || "").trim()).filter(Boolean);
  const text = String(fallbackText || "").trim();
  if (!text) return [""];
  return text.split(/\n+/).map((line) => line.replace(/^\s*[-\d.、]+\s*/, "").trim()).filter(Boolean);
}

function buildMergedRows(result) {
  const fromRows = Array.isArray(result.layered_validation_rows) ? result.layered_validation_rows : [];
  if (fromRows.length) {
    const normalized = fromRows.map((row) => ({
      category: normalizeCategoryLabel(row?.category),
      owner: String(row?.owner || "").trim() || "待定",
      reason: String(row?.reason || "").trim() || "暂无分析结果",
      basis: String(row?.basis || "").trim() || "暂无分析结果",
      method: String(row?.method || "").trim() || "暂无分析结果",
      result: String(row?.result || "").trim() || "暂无分析结果",
    }));
    const existing = new Set(normalized.map((row) => String(row?.category || "").trim()).filter(Boolean));
    defaultAnalysisDimensions.forEach((category) => {
      if (!existing.has(category)) {
        normalized.push({ category, owner: "待定", reason: "暂无分析结果", basis: "暂无分析结果", method: "暂无分析结果", result: "暂无分析结果" });
      }
    });
    return normalized;
  }
  const layered = Array.isArray(result.layered_analysis) ? result.layered_analysis : [];
  const validations = Array.isArray(result.validation_steps) ? result.validation_steps : [];
  const max = Math.max(layered.length, validations.length, defaultAnalysisDimensions.length);
  const rows = [];
  for (let index = 0; index < max; index += 1) {
    const layer = layered[index] || {};
    const validation = validations[index] || {};
    const fallbackCategory = defaultAnalysisDimensions[index] || "";
    rows.push({
      category: normalizeCategoryLabel(layer.layer) || fallbackCategory,
      owner: "待定",
      reason: [layer.judgement || "", layer.why || ""].filter(Boolean).join("：") || "暂无分析结果",
      basis: layer.why || "暂无分析结果",
      method: validation.instructions || validation.goal || "暂无分析结果",
      result: validation.expected_result || "暂无分析结果",
    });
  }
  return rows;
}

function rowEditKey(section, index) {
  return `${section}:${index}`;
}

function isRowEditing(section, index) {
  return !!state.rowEditState[rowEditKey(section, index)];
}

function syncAnalysisDraftToState() {
  if (!state.latestAnalysis?.result) return;
  const result = state.latestAnalysis.result;
  result.test_time = document.getElementById("summary-test-time")?.value || result.test_time || "";
  result.device_model = document.getElementById("summary-device-model")?.value || result.device_model || "";
  result.serial_number = document.getElementById("summary-serial-number")?.value || result.serial_number || "";
  result.priority = document.getElementById("summary-priority")?.value || result.priority || "P1";
  result.risk_level = document.getElementById("summary-risk-level")?.value || result.risk_level || "low";
  result.phenomenon_items = collectListField("phenomenon");
  result.phenomenon_summary = result.phenomenon_items.filter(Boolean).join("\n");
  result.layered_validation_rows = collectMergedRows();
  result.layered_analysis_summary = result.layered_validation_rows.map((row) => row.reason).filter(Boolean).join("\n");
  result.validation_summary = result.layered_validation_rows.map((row) => `${row.basis ? `[${row.basis}] ` : ""}${row.method}${row.result ? ` -> ${row.result}` : ""}${row.owner ? ` @ ${row.owner}` : ""}`).filter(Boolean).join("\n");
  result.root_cause_items = collectListField("rootCause");
  result.root_cause_summary = result.root_cause_items.filter(Boolean).join("\n");
  result.solution_items = collectListField("solution");
  result.solution_summary = result.solution_items.filter(Boolean).join("\n");
  result.lessons_items = collectListField("lessons");
  result.lessons_summary = result.lessons_items.filter(Boolean).join("\n");
}

async function persistLatestAnalysisDraft(silent = false) {
  if (!state.activeSessionId || !state.latestAnalysis) return;
  syncAnalysisDraftToState();
  await apiPost(`/api/sessions/${state.activeSessionId}/analysis-summary`, {
    analysisId: state.latestAnalysis.id,
    result: state.latestAnalysis.result,
  });
  if (!silent) {
    elements.analysisStatus.textContent = "分析结果已保存。";
    elements.analysisStatus.classList.remove("error");
  }
}

async function toggleRowEdit(section, index) {
  const key = rowEditKey(section, index);
  const wasEditing = !!state.rowEditState[key];
  if (wasEditing) {
    await persistLatestAnalysisDraft(true);
  }
  state.rowEditState[key] = !wasEditing;
  renderReadableAnalysis(state.latestAnalysis);
}

function createSectionHeader(title, options = {}) {
  const wrapper = document.createElement("div");
  wrapper.className = "section-header";
  const heading = document.createElement("h4");
  heading.textContent = title;
  wrapper.appendChild(heading);
  const actions = document.createElement("div");
  actions.className = "inline-actions mini-actions";
  if (typeof options.onAdd === "function") {
    const addBtn = document.createElement("button");
    addBtn.type = "button";
    addBtn.className = "secondary-button";
    addBtn.textContent = "新增一行";
    addBtn.addEventListener("click", options.onAdd);
    actions.appendChild(addBtn);
  }
  wrapper.appendChild(actions);
  return wrapper;
}

function createEditableListSection(order, title, key, items, minRows = 2) {
  const section = document.createElement("section");
  section.className = "editable-analysis-section";
  section.appendChild(createSectionHeader(`${order} ${title}`, {
    onAdd: () => {
      if (!state.latestAnalysis) return;
      const result = state.latestAnalysis.result;
      const map = {
        phenomenon: "phenomenon_items",
        rootCause: "root_cause_items",
        solution: "solution_items",
        lessons: "lessons_items",
      };
      const fieldName = map[key];
      const current = Array.isArray(result[fieldName]) ? result[fieldName].map((item) => String(item ?? "")) : normalizeListItems(result[fieldName], "");
      result[fieldName] = [...current, ""];
      state.rowEditState[rowEditKey(key, current.length)] = true;
      renderReadableAnalysis(state.latestAnalysis);
    },
  }));
  const tableWrap = document.createElement("div");
  tableWrap.className = "simple-analysis-table-wrap";
  const table = document.createElement("table");
  table.className = "simple-analysis-table";
  table.innerHTML = `
    <thead>
      <tr>
        <th>序号</th>
        <th>内容</th>
        <th>操作</th>
      </tr>
    </thead>
  `;
  const body = document.createElement("tbody");
  const values = [...items];
  while (values.length < minRows) values.push("");
  values.forEach((value, index) => {
    const tr = document.createElement("tr");
    const indexCell = document.createElement("td");
    indexCell.className = "simple-analysis-index";
    indexCell.textContent = String(index + 1);
    tr.appendChild(indexCell);
    const contentCell = document.createElement("td");
    const textarea = document.createElement("textarea");
    textarea.rows = 3;
    textarea.value = value || "";
    textarea.dataset.listKey = key;
    textarea.dataset.listIndex = String(index);
    textarea.readOnly = !isRowEditing(key, index);
    textarea.className = "simple-analysis-textarea";
    contentCell.appendChild(textarea);
    tr.appendChild(contentCell);
    const actionCell = document.createElement("td");
    const actions = document.createElement("div");
    actions.className = "inline-actions mini-actions row-actions";
    const editBtn = document.createElement("button");
    editBtn.type = "button";
    editBtn.className = "secondary-button";
    editBtn.textContent = isRowEditing(key, index) ? "完成" : "编辑";
    editBtn.addEventListener("click", () => toggleRowEdit(key, index).catch(showGenericError));
    const deleteBtn = document.createElement("button");
    deleteBtn.type = "button";
    deleteBtn.className = "danger-button";
    deleteBtn.textContent = "删除";
    deleteBtn.addEventListener("click", () => {
      if (!state.latestAnalysis) return;
      if (!window.confirm(`确定删除“${title}”的第 ${index + 1} 行吗？`)) return;
      const result = state.latestAnalysis.result;
      const map = {
        phenomenon: "phenomenon_items",
        rootCause: "root_cause_items",
        solution: "solution_items",
        lessons: "lessons_items",
      };
      const fieldName = map[key];
      const nextItems = Array.isArray(result[fieldName]) ? result[fieldName].map((item) => String(item ?? "")) : normalizeListItems(result[fieldName], "");
      nextItems.splice(index, 1);
      result[fieldName] = nextItems;
      delete state.rowEditState[rowEditKey(key, index)];
      renderReadableAnalysis(state.latestAnalysis);
    });
    actions.appendChild(editBtn);
    actions.appendChild(deleteBtn);
    actionCell.appendChild(actions);
    tr.appendChild(actionCell);
    body.appendChild(tr);
  });
  table.appendChild(body);
  tableWrap.appendChild(table);
  section.appendChild(tableWrap);
  return section;
}

function applyMergedColumnWidths(element) {
  Object.entries(state.mergedColumnWidths).forEach(([key, value]) => {
    element.style.setProperty(`--col-${key}`, `${value}px`);
  });
}

function createResizeHandle(columnKey, element) {
  const handle = document.createElement("span");
  handle.className = "column-resize-handle";
  handle.addEventListener("mousedown", (event) => {
    event.preventDefault();
    const startX = event.clientX;
    const startWidth = state.mergedColumnWidths[columnKey];
    const onMove = (moveEvent) => {
      const next = Math.max(110, startWidth + moveEvent.clientX - startX);
      state.mergedColumnWidths[columnKey] = next;
      applyMergedColumnWidths(element);
    };
    const onUp = () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  });
  return handle;
}

function createMergedSection(rows) {
  const section = document.createElement("section");
  section.className = "editable-analysis-section";
  section.appendChild(createSectionHeader("02-03 分层分析与验证方法", {
    onAdd: () => {
      if (!state.latestAnalysis) return;
      const result = state.latestAnalysis.result;
      syncAnalysisDraftToState();
      const nextRows = [...buildMergedRows(result), { category: "", owner: "待定", reason: "", basis: "", method: "", result: "" }];
      result.layered_validation_rows = nextRows;
      state.rowEditState[rowEditKey("layeredValidation", nextRows.length - 1)] = true;
      renderReadableAnalysis(state.latestAnalysis);
    },
  }));
  const tableWrap = document.createElement("div");
  tableWrap.className = "merged-analysis-table-wrap";
  applyMergedColumnWidths(tableWrap);
  const table = document.createElement("table");
  table.className = "merged-analysis-table";
  const headers = [
    ["category", "分类"],
    ["owner", "责任人"],
    ["reason", "原因分析"],
    ["basis", "判断依据"],
    ["method", "验证方法"],
    ["result", "验证结果"],
    ["actions", "操作"],
  ];
  const colgroup = document.createElement("colgroup");
  headers.forEach(([key]) => {
    const col = document.createElement("col");
    col.dataset.colKey = key;
    colgroup.appendChild(col);
  });
  table.appendChild(colgroup);
  const thead = document.createElement("thead");
  const headRow = document.createElement("tr");
  headers.forEach(([key, label]) => {
    const th = document.createElement("th");
    th.className = "merged-analysis-head";
    th.textContent = label;
    if (key !== "actions") th.appendChild(createResizeHandle(key, tableWrap));
    headRow.appendChild(th);
  });
  thead.appendChild(headRow);
  table.appendChild(thead);
  const tbody = document.createElement("tbody");
  const values = [...rows];
  if (!values.length) values.push({ category: "", owner: "待定", reason: "", basis: "", method: "", result: "" });
  const builtinCategories = ["", ...defaultAnalysisDimensions];
  values.forEach((row, index) => {
    const editable = isRowEditing("layeredValidation", index);
    const tr = document.createElement("tr");
    const categoryCell = document.createElement("td");
    categoryCell.className = "merged-analysis-cell";
    const categorySelect = document.createElement("select");
    const availableCategories = [...new Set([...builtinCategories, ...buildMergedRows(state.latestAnalysis?.result || {}).map((item) => normalizeCategoryLabel(item.category)).filter(Boolean)])];
    availableCategories.forEach((value) => {
      const option = document.createElement("option");
      option.value = value;
      option.textContent = value === "" ? "未分类" : value;
      categorySelect.appendChild(option);
    });
    const customOption = document.createElement("option");
    customOption.value = "__custom__";
    customOption.textContent = "自定义...";
    categorySelect.appendChild(customOption);
    categorySelect.value = row.category && availableCategories.includes(row.category) ? row.category : (row.category ? row.category : "");
    categorySelect.disabled = !editable;
    categorySelect.dataset.layeredRow = String(index);
    categorySelect.dataset.layeredField = "category";
    categorySelect.addEventListener("change", () => {
      if (categorySelect.value !== "__custom__") return;
        const customValue = window.prompt("输入自定义分类名称", row.category || "");
        if (customValue && customValue.trim()) {
          const nextValue = normalizeCategoryLabel(customValue.trim()) || customValue.trim();
          const option = document.createElement("option");
          option.value = nextValue;
          option.textContent = nextValue;
          categorySelect.insertBefore(option, customOption);
          categorySelect.value = nextValue;
      } else {
        categorySelect.value = row.category || "";
      }
    });
    categoryCell.appendChild(categorySelect);
    tr.appendChild(categoryCell);

    ["owner", "reason", "basis", "method", "result"].forEach((field) => {
      const td = document.createElement("td");
      const control = document.createElement(field === "owner" ? "input" : "textarea");
      if (field === "owner") {
        control.type = "text";
      } else {
        control.rows = field === "reason" || field === "basis" ? 3 : 2;
      }
      control.value = row[field] || "";
      control.dataset.layeredRow = String(index);
      control.dataset.layeredField = field;
      control.readOnly = !editable;
      control.className = field === "owner" ? "merged-analysis-input" : "merged-analysis-textarea";
      td.appendChild(control);
      tr.appendChild(td);
    });

    const actionCell = document.createElement("td");
    const actions = document.createElement("div");
    actions.className = "inline-actions mini-actions row-actions";
    const editBtn = document.createElement("button");
    editBtn.type = "button";
    editBtn.className = "secondary-button";
    editBtn.textContent = editable ? "完成" : "编辑";
    editBtn.addEventListener("click", () => toggleRowEdit("layeredValidation", index).catch(showGenericError));
    const upBtn = document.createElement("button");
    upBtn.type = "button";
    upBtn.className = "secondary-button";
    upBtn.textContent = "上移";
    upBtn.disabled = index === 0;
    upBtn.addEventListener("click", () => moveMergedRow(index, -1));
    const downBtn = document.createElement("button");
    downBtn.type = "button";
    downBtn.className = "secondary-button";
    downBtn.textContent = "下移";
    downBtn.disabled = index === values.length - 1;
    downBtn.addEventListener("click", () => moveMergedRow(index, 1));
    const deleteBtn = document.createElement("button");
    deleteBtn.type = "button";
    deleteBtn.className = "danger-button";
    deleteBtn.textContent = "删除";
    deleteBtn.addEventListener("click", () => {
      if (!state.latestAnalysis) return;
      if (!window.confirm(`确定删除第 ${index + 1} 行分层分析吗？`)) return;
      const nextRows = [...buildMergedRows(state.latestAnalysis.result)];
      nextRows.splice(index, 1);
      state.latestAnalysis.result.layered_validation_rows = nextRows;
      delete state.rowEditState[rowEditKey("layeredValidation", index)];
      renderReadableAnalysis(state.latestAnalysis);
    });
    actions.appendChild(upBtn);
    actions.appendChild(downBtn);
    actions.appendChild(editBtn);
    actions.appendChild(deleteBtn);
    actionCell.appendChild(actions);
    tr.appendChild(actionCell);
    tbody.appendChild(tr);
  });
  table.appendChild(tbody);
  tableWrap.appendChild(table);
  section.appendChild(tableWrap);
  return section;
}

function collectListField(key) {
  return Array.from(document.querySelectorAll(`textarea[data-list-key="${key}"]`))
    .map((node) => node.value.trim())
    .filter(Boolean);
}

function collectMergedRows() {
  const map = new Map();
  Array.from(document.querySelectorAll("[data-layered-row]")).forEach((node) => {
    const rowIndex = Number(node.dataset.layeredRow);
    const field = node.dataset.layeredField;
    if (!map.has(rowIndex)) map.set(rowIndex, { category: "", owner: "", reason: "", basis: "", method: "", result: "" });
    map.get(rowIndex)[field] = node.value.trim();
  });
  return [...map.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([, value]) => ({ category: value.category, owner: value.owner, reason: value.reason, basis: value.basis, method: value.method, result: value.result }))
    .filter((row) => Object.values(row).some(Boolean));
}

function moveMergedRow(index, delta) {
  if (!state.latestAnalysis) return;
  syncAnalysisDraftToState();
  const nextRows = [...buildMergedRows(state.latestAnalysis.result)];
  const targetIndex = index + delta;
  if (targetIndex < 0 || targetIndex >= nextRows.length) return;
  const [moved] = nextRows.splice(index, 1);
  nextRows.splice(targetIndex, 0, moved);
  state.latestAnalysis.result.layered_validation_rows = nextRows;
  renderReadableAnalysis(state.latestAnalysis);
}

function createBlankSimpleSection(order, title, minRows = 2) {
  const section = document.createElement("section");
  section.className = "editable-analysis-section";
  const header = document.createElement("div");
  header.className = "section-header";
  header.innerHTML = `<h4>${order} ${title}</h4>`;
  section.appendChild(header);
  const tableWrap = document.createElement("div");
  tableWrap.className = "simple-analysis-table-wrap";
  const table = document.createElement("table");
  table.className = "simple-analysis-table";
  table.innerHTML = `
    <thead>
      <tr>
        <th>序号</th>
        <th>内容</th>
      </tr>
    </thead>
  `;
  const body = document.createElement("tbody");
  for (let index = 0; index < minRows; index += 1) {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td class="simple-analysis-index">${index + 1}</td>
      <td class="readonly-cell"></td>
    `;
    body.appendChild(tr);
  }
  table.appendChild(body);
  tableWrap.appendChild(table);
  section.appendChild(tableWrap);
  return section;
}

function renderReadableAnalysis(analysis) {
  elements.analysisResult.innerHTML = "";
  state.latestAnalysis = analysis;
  if (!analysis || !analysis.result || typeof analysis.result !== "object") {
    const summaryGrid = document.createElement("div");
    summaryGrid.className = "summary-edit-grid";
    summaryGrid.appendChild(createSummaryField("测试时间", "summary-test-time", ""));
    summaryGrid.appendChild(createSummaryField("设备型号", "summary-device-model", ""));
    summaryGrid.appendChild(createSummaryField("序号", "summary-serial-number", ""));
    summaryGrid.appendChild(createSummaryField("优先级", "summary-priority", "", "select", ["", "P0", "P1", "P2", "P3"]));
    summaryGrid.appendChild(createSummaryField("风险等级", "summary-risk-level", "", "select", ["", "low", "medium", "high", "critical"]));
    elements.analysisResult.appendChild(summaryGrid);
    elements.analysisResult.appendChild(createBlankSimpleSection("01", "现象"));
    elements.analysisResult.appendChild(createReadonlyMergedSection(buildMergedRows({ layered_validation_rows: [] })));
    elements.analysisResult.appendChild(createBlankSimpleSection("04", "根因", 1));
    elements.analysisResult.appendChild(createBlankSimpleSection("05", "解决方案", 1));
    elements.analysisResult.appendChild(createBlankSimpleSection("06", "经验总结", 1));
    return;
  }
  const result = analysis.result;
  const summaryGrid = document.createElement("div");
  summaryGrid.className = "summary-edit-grid";
  summaryGrid.appendChild(createSummaryField("测试时间", "summary-test-time", result.test_time || analysis.createdAt || ""));
  summaryGrid.appendChild(createSummaryField("设备型号", "summary-device-model", result.device_model || state.activeSessionDetail?.deviceModel || ""));
  summaryGrid.appendChild(createSummaryField("序号", "summary-serial-number", result.serial_number || state.activeSessionDetail?.serialNumber || ""));
  summaryGrid.appendChild(createSummaryField("优先级", "summary-priority", result.priority || "P1", "select", ["P0", "P1", "P2", "P3"]));
  summaryGrid.appendChild(createSummaryField("风险等级", "summary-risk-level", result.risk_level || "low", "select", ["low", "medium", "high", "critical"]));
  elements.analysisResult.appendChild(summaryGrid);

  const phenomenonItems = Array.isArray(result.phenomenon_items) ? result.phenomenon_items.map((item) => String(item ?? "")) : normalizeListItems(result.phenomenon_items, result.phenomenon_summary || "");
  const mergedRows = buildMergedRows(result);
  const rootCauseItems = Array.isArray(result.root_cause_items) ? result.root_cause_items.map((item) => String(item ?? "")) : normalizeListItems(result.root_cause_items, "");
  const solutionItems = Array.isArray(result.solution_items) ? result.solution_items.map((item) => String(item ?? "")) : normalizeListItems(result.solution_items, "");
  const lessonsItems = Array.isArray(result.lessons_items) ? result.lessons_items.map((item) => String(item ?? "")) : normalizeListItems(result.lessons_items, "");

  elements.analysisResult.appendChild(createEditableListSection("01", "现象", "phenomenon", phenomenonItems));
  elements.analysisResult.appendChild(createMergedSection(mergedRows));
  elements.analysisResult.appendChild(createEditableListSection("04", "根因", "rootCause", rootCauseItems, 1));
  elements.analysisResult.appendChild(createEditableListSection("05", "解决方案", "solution", solutionItems, 1));
  elements.analysisResult.appendChild(createEditableListSection("06", "经验总结", "lessons", lessonsItems, 1));
}

async function saveAnalysisSummary() {
  requireSession();
  if (!state.latestAnalysis) throw new Error("当前没有可保存的分析结果。");
  await persistLatestAnalysisDraft();
  elements.analysisStatus.textContent = "分析结果已保存。";
  elements.analysisStatus.classList.remove("error");
  await Promise.all([loadOverview(), loadSessionDetail(state.activeSessionId), loadKnowledge()]);
}

function renderSerialLiveOutput() {
  const status = state.serialStatus || {};
  if (!state.activeSessionDetail) {
    elements.serialLiveOutput.value = "";
    return;
  }
  const serialEvidence = (state.activeSessionDetail.evidence || []).find((item) => item.id === status.evidenceId)
    || (state.activeSessionDetail.evidence || []).find((item) => item.kind === "serial_log");
  const lines = String(serialEvidence?.contentText || "").split(/\r?\n/).filter(Boolean);
  elements.serialLiveOutput.value = lines.slice(-10).join("\n");
}

async function loadSerialPorts() {
  const data = await apiGet("/api/serial/ports");
  state.serialPorts = data.ports || [];
  elements.serialPortSelect.innerHTML = "";
  state.serialPorts.forEach((port) => {
    const option = document.createElement("option");
    option.value = port.device;
    option.textContent = `${port.device} · ${port.description || port.hwid || ""}`;
    elements.serialPortSelect.appendChild(option);
  });
  if (!state.serialPorts.length) {
    const option = document.createElement("option");
    option.value = "";
    option.textContent = "未检测到串口";
    elements.serialPortSelect.appendChild(option);
  }
}

function renderSerialStatus() {
  const status = state.serialStatus || {};
  if (status.running) {
    elements.serialStatusText.textContent = `采集中：${status.port} @ ${status.baud} · ${status.lines || 0} 行 · ${status.bytes || 0} bytes`;
  } else if (status.lastError) {
    elements.serialStatusText.textContent = `异常：${status.lastError}`;
  } else {
    elements.serialStatusText.textContent = "未启动";
  }
  renderSerialLiveOutput();
}

async function pollSerialStatus() {
  try {
    const data = await apiGet("/api/serial/status");
    state.serialStatus = data.status || {};
    renderSerialStatus();
    if (state.serialStatus.running && state.activeSessionId && state.serialStatus.sessionId === state.activeSessionId) {
      await loadSessionDetail(state.activeSessionId);
    }
  } catch (error) {
    console.error(error);
  }
}

function ensureSerialPolling() {
  if (state.serialPollTimer) return;
  state.serialPollTimer = window.setInterval(() => {
    pollSerialStatus().catch(console.error);
  }, 1500);
}

async function startSerialCapture() {
  requireSession();
  const port = elements.serialPortSelect.value;
  if (!port) throw new Error("请先选择串口。");
  const baud = Number(elements.serialBaudInput.value || "115200");
  const data = await apiPost("/api/serial/start", { sessionId: state.activeSessionId, port, baud });
  state.serialStatus = data.status || {};
  renderSerialStatus();
  await loadSessionDetail(state.activeSessionId);
}

async function stopSerialCapture() {
  const data = await apiPost("/api/serial/stop", {});
  state.serialStatus = data.status || {};
  renderSerialStatus();
  if (state.activeSessionId) {
    await loadSessionDetail(state.activeSessionId);
  }
}

function enhanceCollapsibleSections() {
  document.querySelectorAll(".panel, .stack-card, .subpanel-inline").forEach((container) => {
    if (container.dataset.collapsibleReady === "1") return;
    let head = container.querySelector(":scope > .panel-head");
    if (!head) {
      const title = container.querySelector(":scope > h4, :scope > h5");
      if (!title) return;
      head = document.createElement("div");
      head.className = "panel-head collapsible-head";
      title.replaceWith(head);
      head.appendChild(title);
    }
    const toggle = document.createElement("button");
    toggle.type = "button";
    toggle.className = "collapse-toggle";
    toggle.textContent = "收起";
    const body = document.createElement("div");
    body.className = "collapsible-body";
    const children = Array.from(container.children).filter((child) => child !== head);
    children.forEach((child) => body.appendChild(child));
    container.appendChild(body);
    head.appendChild(toggle);
    toggle.addEventListener("click", (event) => {
      event.stopPropagation();
      const collapsed = container.classList.toggle("collapsed");
      toggle.textContent = collapsed ? "展开" : "收起";
    });
    container.dataset.collapsibleReady = "1";
  });
}

async function deleteAnalysis(analysisId) {
  requireSession();
  if (!window.confirm("确定删除这条历史分析吗？")) return;
  const response = await fetch(`/api/analyses/${analysisId}`, { method: "DELETE" });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "delete failed");
  await Promise.all([loadOverview(), loadSessionDetail(state.activeSessionId), loadKnowledge()]);
}

function createListSection(title, items) {
  const section = document.createElement("section");
  section.className = "result-block";
  section.innerHTML = `<h4>${title}</h4>`;
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
    } else if (item && typeof item === "object" && item.url) {
      const strong = document.createElement("strong");
      strong.textContent = item.label || "参考链接";
      const link = document.createElement("a");
      link.href = item.url;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      link.textContent = item.url;
      card.appendChild(strong);
      card.appendChild(document.createElement("br"));
      card.appendChild(link);
      if (item.value) {
        const extra = document.createElement("p");
        extra.textContent = item.value;
        card.appendChild(extra);
      }
    } else {
      card.textContent = JSON.stringify(item, null, 2);
    }
    list.appendChild(card);
  });
  section.appendChild(list);
  return section;
}

function formatAnalysisForCompare(analysis) {
  const wrapper = document.createElement("article");
  wrapper.className = "compare-card";
  wrapper.appendChild(createListSection("现象", normalizeListItems(analysis.result?.phenomenon_items, analysis.result?.phenomenon_summary || "")));
  wrapper.appendChild(createListSection("分层分析与验证", (analysis.result?.layered_validation_rows || []).map((row) => `${row.category || "未分类"} | ${row.reason || "无原因"} | 依据: ${row.basis || "无"} | ${row.method || "无方法"} | ${row.result || "无结果"} | ${row.owner || "未分配"}`)));
  wrapper.appendChild(createListSection("根因", normalizeListItems(analysis.result?.root_cause_items, analysis.result?.root_cause_summary || "")));
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
    column.innerHTML = `<h4>${analysis.createdAt}</h4>`;
    column.appendChild(formatAnalysisForCompare(analysis));
    grid.appendChild(column);
  });
  elements.analysisCompare.appendChild(grid);
}

function renderAnalyses(analyses) {
  elements.analysisCount.textContent = `${analyses.length} 条`;
  elements.analysisHistory.innerHTML = "";
  if (!analyses.length) {
    elements.analysisHistory.innerHTML = '<tr><td colspan="9" class="table-empty">还没有结构化分析结果。</td></tr>';
    renderReadableAnalysis(null);
    return;
  }
  renderReadableAnalysis(analyses[0]);
  analyses.forEach((analysis) => {
    const row = document.createElement("tr");
    row.className = "analysis-row";
    row.innerHTML = `
      <td class="table-check-cell"><input type="checkbox" data-analysis-id="${analysis.id}"></td>
      <td>${analysis.createdAt || ""}</td>
      <td>${analysis.result?.test_time || analysis.createdAt || ""}</td>
      <td>${analysis.result?.device_model || ""}</td>
      <td>${analysis.result?.serial_number || ""}</td>
      <td>${analysis.result?.priority || "P1"}</td>
      <td>${analysis.result?.risk_level || "low"}</td>
      <td class="summary-cell">${analysis.result?.phenomenon_summary || "无现象总结"}</td>
      <td>
        <div class="inline-actions mini-actions">
          <button type="button" class="secondary-button" data-action="edit">编辑</button>
          <button type="button" class="danger-button" data-action="delete">删除</button>
        </div>
      </td>
    `;
    const editBtn = row.querySelector('[data-action="edit"]');
    const deleteBtn = row.querySelector('[data-action="delete"]');
    editBtn.addEventListener("click", (event) => {
      event.stopPropagation();
      openAnalysisHistoryModal(analysis);
    });
    deleteBtn.addEventListener("click", (event) => {
      event.stopPropagation();
      deleteAnalysis(analysis.id).catch(showGenericError);
    });
    row.addEventListener("click", () => openAnalysisHistoryModal(analysis));
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
  });
  renderCompareArea(analyses);
}

function compareSelectedAnalyses() {
  if (state.selectedCompareIds.length !== 2) {
    window.alert("请先勾选两条分析记录。");
    return;
  }
  elements.analysisCompare.scrollIntoView({ behavior: "smooth", block: "start" });
}

function createReadonlyMergedSection(rows) {
  const section = document.createElement("section");
  section.className = "editable-analysis-section";
  const header = document.createElement("div");
  header.className = "section-header";
  header.innerHTML = "<h4>02-03 分层分析与验证方法</h4>";
  section.appendChild(header);

  const tableWrap = document.createElement("div");
  tableWrap.className = "merged-analysis-table-wrap";
  applyMergedColumnWidths(tableWrap);
  const table = document.createElement("table");
  table.className = "merged-analysis-table";
  table.innerHTML = `
    <thead>
      <tr>
        <th>分类</th>
        <th>责任人</th>
        <th>原因分析</th>
        <th>判断依据</th>
        <th>验证方法</th>
        <th>验证结果</th>
      </tr>
    </thead>
  `;
  const tbody = document.createElement("tbody");
  (rows || []).forEach((row) => {
    const tr = document.createElement("tr");
    ["category", "owner", "reason", "basis", "method", "result"].forEach((field) => {
      const td = document.createElement("td");
      td.className = "merged-analysis-cell readonly-cell";
      td.textContent = row?.[field] || "";
      tr.appendChild(td);
    });
    tbody.appendChild(tr);
  });
  table.appendChild(tbody);
  tableWrap.appendChild(table);
  section.appendChild(tableWrap);
  return section;
}

function buildHistoryAnalysisModalContent(analysis) {
  const wrapper = document.createElement("div");
  wrapper.className = "analysis-readable";
  if (!analysis?.result) {
    wrapper.innerHTML = '<p class="helper">没有可展示的分析内容。</p>';
    return wrapper;
  }
  const result = analysis.result;
  const summaryGrid = document.createElement("div");
  summaryGrid.className = "summary-edit-grid";
  [
    ["测试时间", result.test_time || analysis.createdAt || ""],
    ["设备型号", result.device_model || ""],
    ["序号", result.serial_number || ""],
    ["优先级", result.priority || "P1"],
    ["风险等级", result.risk_level || "low"],
  ].forEach(([label, value]) => {
    const card = document.createElement("div");
    card.className = "summary-edit-card";
    card.innerHTML = `<span class="summary-label">${label}</span><div>${value}</div>`;
    summaryGrid.appendChild(card);
  });
  wrapper.appendChild(summaryGrid);
  wrapper.appendChild(createListSection("01 现象", normalizeListItems(result.phenomenon_items, result.phenomenon_summary || "")));
  wrapper.appendChild(createReadonlyMergedSection(buildMergedRows(result)));
  wrapper.appendChild(createListSection("04 根因", normalizeListItems(result.root_cause_items, result.root_cause_summary || "")));
  wrapper.appendChild(createListSection("05 解决方案", normalizeListItems(result.solution_items, result.solution_summary || "")));
  wrapper.appendChild(createListSection("06 经验总结", normalizeListItems(result.lessons_items, result.lessons_summary || "")));
  return wrapper;
}

function openAnalysisHistoryModal(analysis) {
  elements.analysisHistoryModalTitle.textContent = `历史分析详情 · ${analysis.createdAt || ""}`;
  elements.analysisHistoryModalBody.innerHTML = "";
  elements.analysisHistoryModalBody.appendChild(buildHistoryAnalysisModalContent(analysis));
  elements.analysisHistoryModal.classList.remove("hidden");
}

function closeAnalysisHistoryModal() {
  elements.analysisHistoryModal.classList.add("hidden");
}

async function loadKnowledge(keyword = "") {
  const data = await apiGet(`/knowledge/search${keyword ? `?q=${encodeURIComponent(keyword)}` : ""}`);
  state.knowledge = data.knowledge || [];
  if (!state.selectedKnowledgeId && state.knowledge.length) state.selectedKnowledgeId = state.knowledge[0].id;
  renderKnowledge();
}

function renderKnowledge() {
  elements.knowledgeList.innerHTML = "";
  elements.knowledgeTagCloud.innerHTML = "";
  if (!state.knowledge.length) {
    elements.knowledgeList.innerHTML = '<p class="helper">还没有沉淀到案例库的条目。</p>';
    elements.knowledgeDetail.innerHTML = '<p class="helper">从当前会话生成一条案例后，这里会显示详情。</p>';
    return;
  }
  const orderedKnowledge = [...state.knowledge].sort((a, b) => {
    const aPinned = /Awesome-Embedded/i.test(a.title || "") ? 1 : 0;
    const bPinned = /Awesome-Embedded/i.test(b.title || "") ? 1 : 0;
    if (aPinned !== bPinned) return bPinned - aPinned;
    return String(b.updatedAt || "").localeCompare(String(a.updatedAt || ""), "zh-CN");
  });
  const tagCounter = new Map();
  orderedKnowledge.forEach((item) => {
    (item.tags || []).forEach((tag) => {
      const key = String(tag || "").trim();
      if (!key) return;
      tagCounter.set(key, (tagCounter.get(key) || 0) + 1);
    });
  });
  [...tagCounter.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "zh-CN"))
    .forEach(([tag, count]) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "tag-chip";
      button.textContent = `${tag} · ${count}`;
      button.addEventListener("click", () => {
        elements.knowledgeSearch.value = tag;
        loadKnowledge(tag).catch(showGenericError);
      });
      elements.knowledgeTagCloud.appendChild(button);
    });
  orderedKnowledge.forEach((item) => {
    const githubLink = Array.isArray(item.relatedCases)
      ? item.relatedCases.find((entry) => entry && typeof entry === "object" && /github/i.test(entry.url || ""))
      : null;
    const article = document.createElement("article");
    article.className = `list-item compact-row selectable ${state.selectedKnowledgeId === item.id ? "active" : ""}`;
    article.innerHTML = `
      <div class="knowledge-row-main">
        <strong>${item.title}</strong>
        <span class="item-meta">${(item.tags || []).join(", ") || "无标签"}</span>
      </div>
    `;
    article.addEventListener("click", () => {
      state.selectedKnowledgeId = item.id;
      renderKnowledge();
    });
    if (githubLink?.url) {
      const openLink = document.createElement("a");
      openLink.className = "evidence-preview-link";
      openLink.href = githubLink.url;
      openLink.target = "_blank";
      openLink.rel = "noopener noreferrer";
      openLink.textContent = "打开 GitHub";
      openLink.addEventListener("click", (event) => event.stopPropagation());
      article.appendChild(openLink);
    }
    elements.knowledgeList.appendChild(article);
  });
  const detail = orderedKnowledge.find((item) => item.id === state.selectedKnowledgeId) || orderedKnowledge[0];
  elements.knowledgeDetail.innerHTML = "";
  elements.knowledgeDetail.appendChild(createListSection("标题 / 问题描述", [detail.title]));
  elements.knowledgeDetail.appendChild(createListSection("根因", [detail.rootCause || "无"]));
  elements.knowledgeDetail.appendChild(createListSection("解决方案", [detail.solution || "无"]));
  elements.knowledgeDetail.appendChild(createListSection("验证方法", [detail.validation || "无"]));
  elements.knowledgeDetail.appendChild(createListSection("关联资源", detail.relatedCases || []));
  elements.knowledgeDetail.appendChild(createListSection("标签", detail.tags || []));
}

function applySelectedKnowledgeToAnalysis() {
  const detail = state.knowledge.find((item) => item.id === state.selectedKnowledgeId);
  if (!detail) throw new Error("请先在案例库里选择一条经验。");
  const text = [
    `参考案例：${detail.title}`,
    `根因：${detail.rootCause || "无"}`,
    `解决方案：${detail.solution || "无"}`,
    `验证方法：${detail.validation || "无"}`,
  ].join("\n");
  elements.analysisStatus.textContent = text;
  elements.analysisStatus.classList.remove("error");
  setCurrentView("analysis");
}

async function createKnowledgeFromCurrentSession() {
  requireSession();
  const data = await apiPost("/knowledge/create", { sessionId: state.activeSessionId });
  state.selectedKnowledgeId = data.knowledge.id;
  await Promise.all([loadOverview(), loadKnowledge()]);
  setCurrentView("library");
}

function bindEvents() {
  elements.navItems.forEach((item) => item.addEventListener("click", () => setCurrentView(item.dataset.view)));
  elements.saveProviderBtn.addEventListener("click", () => saveProviderConfig().catch(showGenericError));
  elements.createSessionBtn.addEventListener("click", () => createSession().catch(showGenericError));
  elements.saveSessionMetaBtn.addEventListener("click", () => saveSessionMeta().catch(showGenericError));
  elements.deleteSessionBtn.addEventListener("click", () => deleteSession().catch(showGenericError));
  elements.uploadMaterialBtn.addEventListener("click", () => uploadMaterial().catch(showGenericError));
  elements.saveInfoBtn.addEventListener("click", () => saveImportedInfo().catch(showGenericError));
  elements.suggestMissingBtn.addEventListener("click", () => suggestMissingInfo().catch(showGenericError));
  elements.analyzeBtn.addEventListener("click", () => runAnalysis().catch(showGenericError));
  elements.saveAnalysisSummaryBtn.addEventListener("click", () => saveAnalysisSummary().catch(showGenericError));
  elements.compareSelectedBtn.addEventListener("click", compareSelectedAnalyses);
  elements.searchKnowledgeBtn.addEventListener("click", () => loadKnowledge(elements.knowledgeSearch.value.trim()).catch(showGenericError));
  elements.createKnowledgeBtn.addEventListener("click", () => createKnowledgeFromCurrentSession().catch(showGenericError));
  elements.applyKnowledgeBtn.addEventListener("click", () => {
    try {
      applySelectedKnowledgeToAnalysis();
    } catch (error) {
      showGenericError(error);
    }
  });
  elements.refreshSerialPortsBtn.addEventListener("click", () => loadSerialPorts().catch(showGenericError));
  elements.startSerialCaptureBtn.addEventListener("click", () => startSerialCapture().catch(showGenericError));
  elements.stopSerialCaptureBtn.addEventListener("click", () => stopSerialCapture().catch(showGenericError));
  elements.closeAnalysisHistoryModalBtn.addEventListener("click", closeAnalysisHistoryModal);
  elements.analysisHistoryModal.addEventListener("click", (event) => {
    if (event.target === elements.analysisHistoryModal) closeAnalysisHistoryModal();
  });
  window.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !elements.analysisHistoryModal.classList.contains("hidden")) {
      closeAnalysisHistoryModal();
    }
  });
}

bindEvents();
enhanceCollapsibleSections();
resetWorkflow();
setCurrentView("analysis");
ensureSerialPolling();
Promise.all([loadConfig(), loadOverview(), loadSessions(), loadKnowledge(), loadSerialPorts(), pollSerialStatus()])
  .then(() => ensureAutoSessionOnEntry())
  .catch(showGenericError);
