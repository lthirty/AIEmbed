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
  issueType: document.getElementById("issue-type"),
  severity: document.getElementById("severity"),
  workflowStage: document.getElementById("workflow-stage"),
  sessionSymptom: document.getElementById("session-symptom"),
  owner: document.getElementById("owner"),
  createSessionBtn: document.getElementById("create-session-btn"),
  saveSessionMetaBtn: document.getElementById("save-session-meta-btn"),
  deleteSessionBtn: document.getElementById("delete-session-btn"),
  materialTitle: document.getElementById("material-title"),
  materialFile: document.getElementById("material-file"),
  uploadMaterialBtn: document.getElementById("upload-material-btn"),
  materialResult: document.getElementById("material-result"),
  evidenceInlineList: document.getElementById("evidence-inline-list"),
  infoTitle: document.getElementById("info-title"),
  infoContent: document.getElementById("info-content"),
  infoFile: document.getElementById("info-file"),
  saveInfoBtn: document.getElementById("save-info-btn"),
  infoResult: document.getElementById("info-result"),
  analysisRequest: document.getElementById("analysis-request"),
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
};

const workflowTemplate = [
  { key: "session", name: "读取资料与会话", state: "pending", detail: "等待开始" },
  { key: "provider", name: "校验 AI 配置", state: "pending", detail: "等待开始" },
  { key: "request", name: "发送分析请求", state: "pending", detail: "等待开始" },
  { key: "response", name: "写入分析结果", state: "pending", detail: "等待开始" },
];

let workflowState = [];

function safeText(value, fallback = "") {
  return String(value ?? fallback);
}

function showGenericError(error) {
  console.error(error);
  const message = error?.message || "操作失败";
  if (elements.analysisStatus) {
    elements.analysisStatus.textContent = message;
    elements.analysisStatus.classList.add("error");
  }
  window.alert(message);
}

function requireSession() {
  if (!state.activeSessionId) {
    throw new Error("请先创建或选择一个会话。");
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

function setCurrentView(view) {
  state.currentView = view;
  const titles = {
    analysis: ["分析中心", "按“资料导入 -> 问题描述 -> AI 分析 -> 人工修订”推进定位。"],
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
  renderOverview();
}

function renderOverview() {
  const counts = state.overview?.counts || {};
  const items = [
    ["总会话数", counts.sessions || 0],
    ["未关闭问题", counts.openSessions || 0],
    ["分析记录数", counts.analyses || 0],
    ["证据条目数", counts.evidence || 0],
    ["知识条目数", counts.knowledge || 0],
  ];
  elements.overviewCounts.innerHTML = items
    .map(
      ([label, value]) => `
        <article class="overview-card">
          <div class="overview-value">${value}</div>
          <div class="overview-label">${label}</div>
        </article>
      `,
    )
    .join("");
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
      <span class="item-meta">${session.deviceModel || "未填型号"} · ${session.serialNumber || "未填序号"} · ${session.updatedAt || ""}</span>
    `;
    article.addEventListener("click", () => {
      state.activeSessionId = session.id;
      loadSessionDetail(session.id).catch(showGenericError);
    });
    elements.sessionList.appendChild(article);
  });
}

function renderSessionMetaSummary() {
  const session = state.sessions.find((item) => item.id === state.activeSessionId);
  elements.activeSessionLabel.textContent = session
    ? `${session.title} · ${session.deviceModel || "未填型号"} · ${session.serialNumber || "未填序号"}`
    : "未选择";
}

async function loadSessions() {
  const data = await apiGet("/api/sessions");
  state.sessions = data.sessions || [];
  if (!state.activeSessionId && state.sessions.length) {
    state.activeSessionId = state.sessions[0].id;
  }
  renderSessionList();
  renderSessionMetaSummary();
  if (state.activeSessionId) {
    await loadSessionDetail(state.activeSessionId);
  } else {
    renderReadableAnalysis(null);
  }
}

function evidenceChipText(item) {
  const title = item.title || item.fileName || item.kind || "未命名资料";
  const fileName = item.fileName && item.fileName !== title ? item.fileName : "";
  const kindMap = {
    material: "资料",
    imported_info: "问题信息",
    serial_log: "日志",
    snapshot: "图片",
  };
  const kind = kindMap[item.kind] || item.kind || "";
  return [title, fileName, kind].filter(Boolean).join(" · ");
}

function renderEvidenceInlineList() {
  const evidence = state.activeSessionDetail?.evidence || [];
  elements.evidenceInlineList.innerHTML = "";
  if (!evidence.length) {
    elements.evidenceInlineList.innerHTML = '<span class="helper">当前还没有导入任何资料或附件。</span>';
    return;
  }
  evidence.slice(0, 24).forEach((item) => {
    const chip = document.createElement("span");
    chip.className = "evidence-chip";
    chip.textContent = evidenceChipText(item);
    chip.title = evidenceChipText(item);
    elements.evidenceInlineList.appendChild(chip);
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
  elements.issueType.value = data.issueType || "";
  elements.severity.value = data.severity || "P1";
  elements.workflowStage.value = data.workflowStage || "phenomenon";
  elements.sessionSymptom.value = data.symptom || "";
  elements.owner.value = data.owner || "";
  renderSessionList();
  renderSessionMetaSummary();
  renderEvidenceInlineList();
  renderAnalyses(data.analyses || []);
}

async function createSession() {
  const data = await apiPost("/api/sessions", {
    title: elements.sessionTitle.value.trim() || "客户调试会话",
    customerName: elements.sessionCustomer.value.trim(),
    deviceModel: elements.deviceModel.value.trim(),
    serialNumber: elements.serialNumber.value.trim(),
    issueType: elements.issueType.value.trim(),
    severity: elements.severity.value,
    workflowStage: elements.workflowStage.value,
    symptom: elements.sessionSymptom.value.trim(),
    owner: elements.owner.value.trim(),
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
    issueType: elements.issueType.value.trim(),
    severity: elements.severity.value,
    workflowStage: elements.workflowStage.value,
    symptom: elements.sessionSymptom.value.trim(),
    owner: elements.owner.value.trim(),
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

function hasEvidenceReady() {
  return (state.activeSessionDetail?.evidence || []).length > 0;
}

function validateAnalysisPrerequisites() {
  requireSession();
  const issues = [];
  if (!hasEvidenceReady()) {
    issues.push("还没有任何资料或附件，请先完成资料导入。");
  }
  if (!(elements.analysisRequest.value || "").trim()) {
    issues.push("还没有填写“本轮问题描述 / 分析目标”。");
  }
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
      requestText: elements.analysisRequest.value.trim(),
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
  if (Array.isArray(items) && items.length) {
    return items.map((item) => String(item || "").trim()).filter(Boolean);
  }
  const text = safeText(fallbackText).trim();
  if (!text) return [""];
  return text
    .split(/\n+/)
    .map((line) => line.replace(/^\s*[-\d.、]+\s*/, "").trim())
    .filter(Boolean);
}

function textFromLayeredAnalysis(items = []) {
  return items
    .map((entry) => {
      const layer = entry.layer || "未命名层";
      const judgement = entry.judgement || "";
      const why = entry.why ? `，原因：${entry.why}` : "";
      return `${layer}：${judgement}${why}`;
    })
    .join("\n");
}

function textFromValidationSteps(items = []) {
  return items
    .map((entry, index) => `${index + 1}. ${entry.goal || entry.step_id || "验证步骤"}；动作：${entry.instructions || ""}；预期：${entry.expected_result || ""}`)
    .join("\n");
}

function textFromPossibleCauses(items = []) {
  return items
    .map((entry, index) => `${index + 1}. ${entry.label || "可能原因"}；依据：${entry.reasoning || ""}；下一步：${entry.required_next_check || ""}`)
    .join("\n");
}

function textFromSolution(result) {
  const validations = (result.validation_steps || []).slice(0, 3).map((entry) => entry.instructions || entry.goal || "");
  const commands = (result.suggested_commands_or_snippets || []).slice(0, 3).map((entry) => entry.content || "");
  return [...validations, ...commands].filter(Boolean).join("\n");
}

function textFromLessons(result) {
  const patterns = (result.related_assets?.reusable_patterns || []).map((item) => String(item));
  const tags = (result.case_update_hint?.candidate_root_cause_tags || []).filter(Boolean);
  return [...patterns, ...(tags.length ? [`候选标签：${tags.join(" / ")}`] : [])].join("\n");
}

function createEditableListSection(order, title, key, items, minRows = 2) {
  const section = document.createElement("section");
  section.className = "editable-analysis-section";
  section.innerHTML = `<h4>${order} ${title}</h4>`;
  const list = document.createElement("div");
  list.className = "editable-list";
  const values = [...items];
  while (values.length < minRows) values.push("");
  values.forEach((value, index) => {
    const row = document.createElement("label");
    row.className = "editable-list-row";
    row.innerHTML = `<span>${index + 1}</span>`;
    const textarea = document.createElement("textarea");
    textarea.rows = 3;
    textarea.value = value || "";
    textarea.dataset.listKey = key;
    row.appendChild(textarea);
    list.appendChild(row);
  });
  section.appendChild(list);
  return section;
}

function collectListField(key) {
  return Array.from(document.querySelectorAll(`textarea[data-list-key="${key}"]`))
    .map((node) => node.value.trim())
    .filter(Boolean);
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
  const layeredItems = normalizeListItems(result.layered_analysis_items, result.layered_analysis_summary || textFromLayeredAnalysis(result.layered_analysis || []));
  const validationItems = normalizeListItems(result.validation_items, result.validation_summary || textFromValidationSteps(result.validation_steps || []));
  const rootCauseItems = normalizeListItems(result.root_cause_items, result.root_cause_summary || textFromPossibleCauses(result.possible_causes || []));
  const solutionItems = normalizeListItems(result.solution_items, result.solution_summary || textFromSolution(result));
  const lessonsItems = normalizeListItems(result.lessons_items, result.lessons_summary || textFromLessons(result));

  elements.analysisResult.appendChild(createEditableListSection("01", "现象", "phenomenon", phenomenonItems));
  elements.analysisResult.appendChild(createEditableListSection("02", "分层分析", "layered", layeredItems));
  elements.analysisResult.appendChild(createEditableListSection("03", "验证方法", "validation", validationItems));
  elements.analysisResult.appendChild(createEditableListSection("04", "根因", "root-cause", rootCauseItems));
  elements.analysisResult.appendChild(createEditableListSection("05", "解决方案", "solution", solutionItems));
  elements.analysisResult.appendChild(createEditableListSection("06", "经验总结", "lessons", lessonsItems));
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
  result.layered_analysis_items = collectListField("layered");
  result.validation_items = collectListField("validation");
  result.root_cause_items = collectListField("root-cause");
  result.solution_items = collectListField("solution");
  result.lessons_items = collectListField("lessons");
  result.phenomenon_summary = result.phenomenon_items.join("\n");
  result.layered_analysis_summary = result.layered_analysis_items.join("\n");
  result.validation_summary = result.validation_items.join("\n");
  result.root_cause_summary = result.root_cause_items.join("\n");
  result.solution_summary = result.solution_items.join("\n");
  result.lessons_summary = result.lessons_items.join("\n");
  await apiPost(`/api/sessions/${state.activeSessionId}/analysis-summary`, {
    analysisId: state.latestAnalysis.id,
    result,
  });
  elements.analysisStatus.textContent = "分析结果已保存。";
  elements.analysisStatus.classList.remove("error");
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
  wrapper.appendChild(createListSection("分层分析", normalizeListItems(analysis.result?.layered_analysis_items, analysis.result?.layered_analysis_summary || textFromLayeredAnalysis(analysis.result?.layered_analysis || []))));
  wrapper.appendChild(createListSection("验证方法", normalizeListItems(analysis.result?.validation_items, analysis.result?.validation_summary || textFromValidationSteps(analysis.result?.validation_steps || []))));
  wrapper.appendChild(createListSection("根因", normalizeListItems(analysis.result?.root_cause_items, analysis.result?.root_cause_summary || textFromPossibleCauses(analysis.result?.possible_causes || []))));
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
    column.innerHTML = `<h4>${analysis.createdAt}</h4><p class="helper">${analysis.requestText || ""}</p>`;
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
  if (!state.selectedKnowledgeId && state.knowledge.length) {
    state.selectedKnowledgeId = state.knowledge[0].id;
  }
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
    article.className = `list-item selectable compact-row ${state.selectedKnowledgeId === item.id ? "active" : ""}`;
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
  const lines = [
    `参考案例：${detail.title}`,
    `根因：${detail.rootCause || "无"}`,
    `解决方案：${detail.solution || "无"}`,
    `验证方法：${detail.validation || "无"}`,
    `标签：${(detail.tags || []).join(", ") || "无"}`,
  ];
  const existing = elements.analysisRequest.value.trim();
  elements.analysisRequest.value = existing ? `${existing}\n\n${lines.join("\n")}` : lines.join("\n");
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
