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
  mergedColumnWidths: {
    category: 160,
    owner: 140,
    reason: 360,
    method: 320,
    result: 240,
    actions: 110,
  },
};

const workflowTemplate = [
  { key: "session", name: "读取资料与会话", state: "pending", detail: "等待开始" },
  { key: "provider", name: "校验 AI 配置", state: "pending", detail: "等待开始" },
  { key: "request", name: "发送分析请求", state: "pending", detail: "等待开始" },
  { key: "response", name: "写入分析结果", state: "pending", detail: "等待开始" },
];

let workflowState = [];

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

async function createSession() {
  const data = await apiPost("/api/sessions", {
    title: elements.sessionTitle.value.trim() || "客户调试会话",
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
  elements.analysisStatus.textContent = "会话已创建。";
  elements.analysisStatus.classList.remove("error");
  await Promise.all([loadOverview(), loadSessions(), loadKnowledge()]);
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
    article.innerHTML = `
      <span class="evidence-token-label" title="${label}">${label}</span>
    `;
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
  const issues = [];
  if (!hasEvidenceReady()) issues.push("还没有任何资料或附件，请先完成资料导入。");
  const hasProblemEvidence = (state.activeSessionDetail?.evidence || []).some((item) => item.kind === "imported_info");
  if (!hasProblemEvidence) issues.push("还没有导入问题描述、测试报告、图片或日志。");
  if (issues.length) {
    state.lastMissingInfo = issues;
    elements.analysisStatus.textContent = issues.join(" ");
    elements.analysisStatus.classList.add("error");
    throw new Error(issues.join("\n"));
  }
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
    const data = await apiPost("/ai/analyze", {
      sessionId: state.activeSessionId,
      requestText: buildDefaultAnalysisPrompt(),
      deviceIp: state.activeSessionDetail?.deviceIp || "",
      captureSnapshot: false,
    });
    updateWorkflow("provider", "success", "AI 配置可用。");
    updateWorkflow("request", "success", `请求已发送，请求ID：${data.requestId}`);
    updateWorkflow("response", "success", "结构化结果已解析并写入历史分析。");
    elements.analysisStatus.textContent = `分析完成，请求ID：${data.requestId}`;
    elements.analysisStatus.classList.remove("error");
    await Promise.all([loadOverview(), loadSessionDetail(state.activeSessionId), loadKnowledge()]);
  } catch (error) {
    updateWorkflow("request", "error", error.message || "分析请求失败");
    updateWorkflow("response", "error", "本轮未生成有效结构化结果。");
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
  if (fromRows.length) return fromRows;
  const layered = Array.isArray(result.layered_analysis) ? result.layered_analysis : [];
  const validations = Array.isArray(result.validation_steps) ? result.validation_steps : [];
  const max = Math.max(layered.length, validations.length, 1);
  const rows = [];
  for (let index = 0; index < max; index += 1) {
    const layer = layered[index] || {};
    const validation = validations[index] || {};
    rows.push({
      category: layer.layer || "",
      owner: "",
      reason: [layer.layer || "", layer.judgement || "", layer.why || ""].filter(Boolean).join("："),
      method: validation.instructions || validation.goal || "",
      result: validation.expected_result || "",
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

function toggleRowEdit(section, index) {
  const key = rowEditKey(section, index);
  state.rowEditState[key] = !state.rowEditState[key];
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
      result[fieldName] = [...normalizeListItems(result[fieldName], ""), ""];
      renderReadableAnalysis(state.latestAnalysis);
    },
  }));
  const list = document.createElement("div");
  list.className = "simple-analysis-table";
  [
    ["index", "序号"],
    ["content", "内容"],
    ["actions", "操作"],
  ].forEach(([, label]) => {
    const head = document.createElement("div");
    head.className = "simple-analysis-head";
    head.textContent = label;
    list.appendChild(head);
  });
  const values = [...items];
  while (values.length < minRows) values.push("");
  values.forEach((value, index) => {
    const indexCell = document.createElement("div");
    indexCell.className = "simple-analysis-index";
    indexCell.textContent = String(index + 1);
    list.appendChild(indexCell);

    const textarea = document.createElement("textarea");
    textarea.rows = 3;
    textarea.value = value || "";
    textarea.dataset.listKey = key;
    textarea.dataset.listIndex = String(index);
    textarea.readOnly = !isRowEditing(key, index);
    textarea.className = "simple-analysis-textarea";
    list.appendChild(textarea);

    const actions = document.createElement("div");
    actions.className = "inline-actions mini-actions row-actions";
    const editBtn = document.createElement("button");
    editBtn.type = "button";
    editBtn.className = "secondary-button";
    editBtn.textContent = isRowEditing(key, index) ? "完成" : "编辑";
    editBtn.addEventListener("click", () => toggleRowEdit(key, index));
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
      const nextItems = [...normalizeListItems(result[fieldName], "")];
      nextItems.splice(index, 1);
      result[fieldName] = nextItems;
      delete state.rowEditState[rowEditKey(key, index)];
      renderReadableAnalysis(state.latestAnalysis);
    });
    actions.appendChild(editBtn);
    actions.appendChild(deleteBtn);
    list.appendChild(actions);
  });
  section.appendChild(list);
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
      const nextRows = [...buildMergedRows(result), { category: "", owner: "", reason: "", method: "", result: "" }];
      result.layered_validation_rows = nextRows;
      renderReadableAnalysis(state.latestAnalysis);
    },
  }));
  const tableWrap = document.createElement("div");
  tableWrap.className = "merged-analysis-table-wrap";
  applyMergedColumnWidths(tableWrap);
  const table = document.createElement("div");
  table.className = "merged-analysis-table";
  const headers = [
    ["category", "分类"],
    ["owner", "责任人"],
    ["reason", "原因分析"],
    ["method", "验证方法"],
    ["result", "验证结果"],
    ["actions", "操作"],
  ];
  headers.forEach(([key, label]) => {
    const head = document.createElement("div");
    head.className = "merged-analysis-head";
    head.textContent = label;
    if (key !== "actions") head.appendChild(createResizeHandle(key, tableWrap));
    table.appendChild(head);
  });
  const values = [...rows];
  while (values.length < 2) values.push({ category: "", owner: "", reason: "", method: "", result: "" });
  const builtinCategories = ["", "硬件", "软件", "固件", "OS", "__custom__"];
  values.forEach((row, index) => {
    const editable = isRowEditing("layeredValidation", index);
    const categoryCell = document.createElement("div");
    categoryCell.className = "merged-analysis-cell";
    const categorySelect = document.createElement("select");
    const customCategory = row.category && !["硬件", "软件", "固件", "OS"].includes(row.category) ? row.category : "";
    const selectedCategory = customCategory ? "__custom__" : (row.category || "");
    builtinCategories.forEach((value) => {
      const option = document.createElement("option");
      option.value = value;
      option.textContent = value === "" ? "未分类" : value === "__custom__" ? "自定义" : value;
      categorySelect.appendChild(option);
    });
    categorySelect.value = selectedCategory;
    categorySelect.disabled = !editable;
    categorySelect.dataset.layeredRow = String(index);
    categorySelect.dataset.layeredField = "category";
    categoryCell.appendChild(categorySelect);
    const customInput = document.createElement("input");
    customInput.type = "text";
    customInput.placeholder = "输入自定义分类";
    customInput.value = customCategory;
    customInput.dataset.layeredRow = String(index);
    customInput.dataset.layeredField = "categoryCustom";
    customInput.readOnly = !editable;
    customInput.className = selectedCategory === "__custom__" ? "custom-category-input" : "custom-category-input hidden";
    categorySelect.addEventListener("change", () => {
      customInput.classList.toggle("hidden", categorySelect.value !== "__custom__");
    });
    categoryCell.appendChild(customInput);
    table.appendChild(categoryCell);

    ["owner", "reason", "method", "result"].forEach((field) => {
      const textarea = document.createElement("textarea");
      textarea.rows = 3;
      textarea.value = row[field] || "";
      textarea.dataset.layeredRow = String(index);
      textarea.dataset.layeredField = field;
      textarea.readOnly = !editable;
      textarea.className = "merged-analysis-textarea";
      table.appendChild(textarea);
    });

    const actions = document.createElement("div");
    actions.className = "inline-actions mini-actions row-actions";
    const editBtn = document.createElement("button");
    editBtn.type = "button";
    editBtn.className = "secondary-button";
    editBtn.textContent = editable ? "完成" : "编辑";
    editBtn.addEventListener("click", () => toggleRowEdit("layeredValidation", index));
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
    actions.appendChild(editBtn);
    actions.appendChild(deleteBtn);
    table.appendChild(actions);
  });
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
    if (!map.has(rowIndex)) map.set(rowIndex, { category: "", owner: "", reason: "", method: "", result: "", categoryCustom: "" });
    map.get(rowIndex)[field] = node.value.trim();
  });
  return [...map.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([, value]) => ({
      category: value.category === "__custom__" ? value.categoryCustom : value.category,
      owner: value.owner,
      reason: value.reason,
      method: value.method,
      result: value.result,
    }))
    .filter((row) => Object.values(row).some(Boolean));
}

function renderReadableAnalysis(analysis) {
  elements.analysisResult.innerHTML = "";
  state.latestAnalysis = analysis;
  if (!analysis || !analysis.result || typeof analysis.result !== "object") {
    elements.analysisResult.innerHTML = '<p class="helper">当前还没有分析结果。完成资料导入后点击“开始分析”。</p>';
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

  const phenomenonItems = normalizeListItems(result.phenomenon_items, result.phenomenon_summary || "");
  const mergedRows = buildMergedRows(result);
  const rootCauseItems = normalizeListItems(result.root_cause_items, "");
  const solutionItems = normalizeListItems(result.solution_items, "");
  const lessonsItems = normalizeListItems(result.lessons_items, "");

  elements.analysisResult.appendChild(createEditableListSection("01", "现象", "phenomenon", phenomenonItems));
  elements.analysisResult.appendChild(createMergedSection(mergedRows));
  elements.analysisResult.appendChild(createEditableListSection("04", "根因", "rootCause", rootCauseItems, 1));
  elements.analysisResult.appendChild(createEditableListSection("05", "解决方案", "solution", solutionItems, 1));
  elements.analysisResult.appendChild(createEditableListSection("06", "经验总结", "lessons", lessonsItems, 1));
}

async function saveAnalysisSummary() {
  requireSession();
  if (!state.latestAnalysis) throw new Error("当前没有可保存的分析结果。");
  const result = { ...state.latestAnalysis.result };
  result.test_time = document.getElementById("summary-test-time")?.value || "";
  result.device_model = document.getElementById("summary-device-model")?.value || "";
  result.serial_number = document.getElementById("summary-serial-number")?.value || "";
  result.priority = document.getElementById("summary-priority")?.value || "P1";
  result.risk_level = document.getElementById("summary-risk-level")?.value || "low";
  result.phenomenon_items = collectListField("phenomenon");
  result.phenomenon_summary = result.phenomenon_items.join("\n");
  result.layered_validation_rows = collectMergedRows();
  result.layered_analysis_summary = result.layered_validation_rows.map((row) => row.reason).filter(Boolean).join("\n");
  result.validation_summary = result.layered_validation_rows.map((row) => `${row.method}${row.result ? ` -> ${row.result}` : ""}${row.owner ? ` @ ${row.owner}` : ""}`).filter(Boolean).join("\n");
  result.root_cause_items = collectListField("rootCause");
  result.root_cause_summary = result.root_cause_items.join("\n");
  result.solution_items = collectListField("solution");
  result.solution_summary = result.solution_items.join("\n");
  result.lessons_items = collectListField("lessons");
  result.lessons_summary = result.lessons_items.join("\n");
  await apiPost(`/api/sessions/${state.activeSessionId}/analysis-summary`, {
    analysisId: state.latestAnalysis.id,
    result,
  });
  elements.analysisStatus.textContent = "分析结果已保存。";
  elements.analysisStatus.classList.remove("error");
  await Promise.all([loadOverview(), loadSessionDetail(state.activeSessionId), loadKnowledge()]);
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
  wrapper.appendChild(createListSection("分层分析与验证", (analysis.result?.layered_validation_rows || []).map((row) => `${row.reason || "无原因"} | ${row.method || "无方法"} | ${row.result || "无结果"} | ${row.owner || "未分配"}`)));
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
      renderReadableAnalysis(analysis);
      elements.analysisResult.scrollIntoView({ behavior: "smooth", block: "start" });
    });
    deleteBtn.addEventListener("click", (event) => {
      event.stopPropagation();
      deleteAnalysis(analysis.id).catch(showGenericError);
    });
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
  const tagCounter = new Map();
  state.knowledge.forEach((item) => {
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
  state.knowledge.forEach((item) => {
    const article = document.createElement("article");
    article.className = `list-item compact-row selectable ${state.selectedKnowledgeId === item.id ? "active" : ""}`;
    article.innerHTML = `
      <strong>${item.title}</strong>
      <span class="item-meta">${(item.tags || []).join(", ") || "无标签"} · ${item.updatedAt || ""}</span>
    `;
    article.addEventListener("click", () => {
      state.selectedKnowledgeId = item.id;
      renderKnowledge();
    });
    elements.knowledgeList.appendChild(article);
  });
  const detail = state.knowledge.find((item) => item.id === state.selectedKnowledgeId) || state.knowledge[0];
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
}

bindEvents();
resetWorkflow();
setCurrentView("analysis");
Promise.all([loadConfig(), loadOverview(), loadSessions(), loadKnowledge()]).catch(showGenericError);
