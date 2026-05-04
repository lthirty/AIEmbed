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
  activeStageLabel: document.getElementById("active-stage-label"),
  pageTitle: document.getElementById("page-title"),
  pageSubtitle: document.getElementById("page-subtitle"),
  overviewCounts: document.getElementById("overview-counts"),
  recentSessions: document.getElementById("recent-sessions"),
  recentTests: document.getElementById("recent-tests"),
  recentKnowledge: document.getElementById("recent-knowledge"),
  sessionTitle: document.getElementById("session-title"),
  sessionCustomer: document.getElementById("session-customer"),
  deviceModel: document.getElementById("device-model"),
  serialNumber: document.getElementById("serial-number"),
  issueType: document.getElementById("issue-type"),
  severity: document.getElementById("severity"),
  workflowStage: document.getElementById("workflow-stage"),
  sessionSymptom: document.getElementById("session-symptom"),
  owner: document.getElementById("owner"),
  deviceIp: document.getElementById("device-ip"),
  createSessionBtn: document.getElementById("create-session-btn"),
  saveSessionMetaBtn: document.getElementById("save-session-meta-btn"),
  deleteSessionBtn: document.getElementById("delete-session-btn"),
  qaNewSession: document.getElementById("qa-new-session"),
  qaImportMaterial: document.getElementById("qa-import-material"),
  qaStartTest: document.getElementById("qa-start-test"),
  qaStartAnalysis: document.getElementById("qa-start-analysis"),
  testCaseCode: document.getElementById("test-case-code"),
  testCaseName: document.getElementById("test-case-name"),
  testCaseCategory: document.getElementById("test-case-category"),
  testCaseTarget: document.getElementById("test-case-target"),
  testCaseSteps: document.getElementById("test-case-steps"),
  saveTestCaseBtn: document.getElementById("save-test-case-btn"),
  testCaseResult: document.getElementById("test-case-result"),
  testCaseCount: document.getElementById("test-case-count"),
  testCasesList: document.getElementById("test-cases-list"),
  runSelectedTestBtn: document.getElementById("run-selected-test-btn"),
  executionTarget: document.getElementById("execution-target"),
  testRunCount: document.getElementById("test-run-count"),
  testRunsHistory: document.getElementById("test-runs-history"),
  serialPortSelect: document.getElementById("serial-port-select"),
  refreshSerialPortsBtn: document.getElementById("refresh-serial-ports-btn"),
  serialBaud: document.getElementById("serial-baud"),
  startSerialCaptureBtn: document.getElementById("start-serial-capture-btn"),
  stopSerialCaptureBtn: document.getElementById("stop-serial-capture-btn"),
  serialCaptureStatus: document.getElementById("serial-capture-status"),
  latestSerialOutput: document.getElementById("latest-serial-output"),
  logTitle: document.getElementById("log-title"),
  logContent: document.getElementById("log-content"),
  saveLogBtn: document.getElementById("save-log-btn"),
  logFileTitle: document.getElementById("log-file-title"),
  logFileInput: document.getElementById("log-file-input"),
  uploadLogFileBtn: document.getElementById("upload-log-file-btn"),
  logFileResult: document.getElementById("log-file-result"),
  sessionStageNav: document.getElementById("session-stage-nav"),
  stageGuidance: document.getElementById("stage-guidance"),
  stepFormTitle: document.getElementById("step-form-title"),
  stepFormFields: document.getElementById("step-form-fields"),
  saveStepBtn: document.getElementById("save-step-btn"),
  markStepDoneBtn: document.getElementById("mark-step-done-btn"),
  stepSaveResult: document.getElementById("step-save-result"),
  analysisRequest: document.getElementById("analysis-request"),
  captureBeforeAnalyze: document.getElementById("capture-before-analyze"),
  suggestMissingBtn: document.getElementById("suggest-missing-btn"),
  suggestTestsBtn: document.getElementById("suggest-tests-btn"),
  analyzeBtn: document.getElementById("analyze-btn"),
  workflowSteps: document.getElementById("workflow-steps"),
  analysisGuidance: document.getElementById("analysis-guidance"),
  materialTitle: document.getElementById("material-title"),
  materialFile: document.getElementById("material-file"),
  uploadMaterialBtn: document.getElementById("upload-material-btn"),
  materialResult: document.getElementById("material-result"),
  infoTitle: document.getElementById("info-title"),
  infoContent: document.getElementById("info-content"),
  infoFile: document.getElementById("info-file"),
  saveInfoBtn: document.getElementById("save-info-btn"),
  infoResult: document.getElementById("info-result"),
  captureSnapshotBtn: document.getElementById("capture-snapshot-btn"),
  snapshotResult: document.getElementById("snapshot-result"),
  recentEvidenceList: document.getElementById("recent-evidence-list"),
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
  currentView: "overview",
  apiConfigured: false,
  overview: null,
  sessions: [],
  activeSessionId: "",
  activeSessionDetail: null,
  testCases: [],
  selectedTestCaseId: "",
  testRuns: [],
  latestAnalysis: null,
  selectedCompareIds: [],
  serialStatus: null,
  knowledge: [],
  selectedKnowledgeId: "",
  currentStepKey: "phenomenon",
  lastMissingInfo: [],
  lastSuggestedTests: [],
};

const workflowTemplate = [
  { key: "session", name: "读取会话与证据", state: "pending", detail: "等待开始" },
  { key: "snapshot", name: "补充抓拍证据", state: "pending", detail: "等待开始" },
  { key: "provider", name: "校验 AI 配置", state: "pending", detail: "等待开始" },
  { key: "request", name: "发送分析请求", state: "pending", detail: "等待开始" },
  { key: "response", name: "解析分析结果", state: "pending", detail: "等待开始" },
];

const stageDefinitions = {
  phenomenon: {
    title: "现象",
    help: "记录当前看到的问题表现、影响范围和触发条件。",
    fields: [
      { key: "description", label: "问题描述", type: "textarea", rows: 4 },
      { key: "impact", label: "影响范围", type: "textarea", rows: 3 },
      { key: "trigger", label: "触发条件", type: "textarea", rows: 3 },
    ],
  },
  layered_analysis: {
    title: "分层分析",
    help: "判断问题更像硬件、接口、驱动还是系统层。",
    fields: [
      { key: "suspectedLayer", label: "当前怀疑层", type: "text" },
      { key: "reasoning", label: "判断依据", type: "textarea", rows: 4 },
      { key: "excludedLayers", label: "已排除层", type: "textarea", rows: 3 },
    ],
  },
  validation: {
    title: "验证方法",
    help: "定义测试动作、预期结果和已执行结果。",
    fields: [
      { key: "plan", label: "验证计划", type: "textarea", rows: 4 },
      { key: "expected", label: "预期结果", type: "textarea", rows: 3 },
      { key: "result", label: "当前结果", type: "textarea", rows: 3 },
    ],
  },
  root_cause: {
    title: "根因",
    help: "只有在证据足够时才填写根因结论。",
    fields: [
      { key: "conclusion", label: "根因结论", type: "textarea", rows: 4 },
      { key: "confidence", label: "置信度", type: "text" },
      { key: "evidenceLinks", label: "关联证据", type: "textarea", rows: 3 },
    ],
  },
  solution: {
    title: "解决方案",
    help: "记录 workaround、修复动作与回归建议。",
    fields: [
      { key: "workaround", label: "临时方案", type: "textarea", rows: 3 },
      { key: "fixPlan", label: "正式修复", type: "textarea", rows: 4 },
      { key: "regression", label: "回归建议", type: "textarea", rows: 3 },
    ],
  },
  lessons: {
    title: "经验总结",
    help: "提炼可复用规则，准备生成 Knowledge。",
    fields: [
      { key: "reusablePattern", label: "复用规则", type: "textarea", rows: 4 },
      { key: "tags", label: "标签", type: "text" },
      { key: "nextAction", label: "后续动作", type: "textarea", rows: 3 },
    ],
  },
};

let workflowState = [];
let serialPollTimer = null;

function showGenericError(error) {
  console.error(error);
  window.alert(error.message || "操作失败");
}

function requireSession() {
  if (!state.activeSessionId) {
    throw new Error("请先创建或选择一个 Session。");
  }
}

function requireTestCase() {
  if (!state.selectedTestCaseId) {
    throw new Error("请先选择一个 TestCase。");
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

function renderWorkflow() {
  elements.workflowSteps.innerHTML = "";
  for (const step of workflowState) {
    const article = document.createElement("article");
    article.className = `workflow-step ${step.state}`;
    article.innerHTML = `
      <div class="step-name">${step.name}</div>
      <div class="step-state">${step.state.toUpperCase()}</div>
      <div class="step-detail">${step.detail}</div>
    `;
    elements.workflowSteps.appendChild(article);
  }
}

function setCurrentView(view) {
  state.currentView = view;
  const titles = {
    overview: ["Overview", "系统入口、状态概览和快速动作。"],
    test: ["Test Center", "测试数据生产、自动化执行和日志采集。"],
    analysis: ["Analysis Center", "按强制状态机推进问题闭环。"],
    library: ["Library", "经验沉淀、根因复用和知识检索。"],
  };
  elements.pageTitle.textContent = titles[view][0];
  elements.pageSubtitle.textContent = titles[view][1];
  elements.navItems.forEach((item) => item.classList.toggle("active", item.dataset.view === view));
  elements.views.forEach((item) => item.classList.toggle("active", item.id === `view-${view}`));
}

async function validateSavedProvider() {
  const data = await apiGet("/api/provider/validate");
  const validation = data.validation || {};
  state.apiConfigured = !!data.apiConfigured && !!validation.ok;
  const text = validation.ok ? `${data.providerName || "Provider"} 已验证` : `${data.providerName || "Provider"} 未通过验证`;
  elements.providerStatus.textContent = text;
  elements.heroProviderStatus.textContent = validation.ok ? "Ready" : "Error";
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
    elements.heroProviderStatus.textContent = "No Key";
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
    ["总 Session 数", counts.sessions || 0],
    ["未关闭问题", counts.openSessions || 0],
    ["测试用例数", counts.testCases || 0],
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
  renderSimpleList(elements.recentSessions, state.overview?.recentSessions || [], (item) => ({
    title: item.title,
    meta: `${item.issueType || "未分类"} · ${item.severity || "P1"} · ${item.updatedAt || ""}`,
  }));
  renderSimpleList(elements.recentTests, state.overview?.recentTestRuns || [], (item) => ({
    title: `${item.report?.caseCode || item.caseId || ""} · ${item.result || ""}`,
    meta: `${item.deviceModel || ""} · ${item.createdAt || ""}`,
  }));
  renderSimpleList(elements.recentKnowledge, state.overview?.recentKnowledge || [], (item) => ({
    title: item.title,
    meta: `${(item.tags || []).join(", ") || "无标签"} · ${item.updatedAt || ""}`,
  }));
}

function renderSimpleList(target, items, mapper) {
  target.innerHTML = "";
  if (!items.length) {
    target.innerHTML = '<p class="helper">暂无记录。</p>';
    return;
  }
  for (const item of items) {
    const mapped = mapper(item);
    const article = document.createElement("article");
    article.className = "list-item";
    article.innerHTML = `<strong>${mapped.title}</strong><p>${mapped.meta || ""}</p>`;
    target.appendChild(article);
  }
}

function hasEvidenceReady() {
  const evidence = state.activeSessionDetail?.evidence || [];
  return evidence.length > 0;
}

function validateAnalysisPrerequisites() {
  requireSession();
  const issues = [];
  if (!hasEvidenceReady()) {
    issues.push("还没有任何证据，请先完成资料导入、日志收集、导入信息或抓拍。");
  }
  const currentStep = getCurrentStepState();
  const sessionSymptom = (elements.sessionSymptom.value || "").trim();
  const stepDescription = currentStep?.data?.description || "";
  if (!sessionSymptom && !stepDescription) {
    issues.push("还没有清晰的问题现象，请先补充“问题现象”或完成现象步骤。");
  }
  if (issues.length) {
    state.lastMissingInfo = issues;
    renderAnalysisGuidance(state.latestAnalysis?.result || null);
    throw new Error(issues.join("\n"));
  }
}

function defaultTestStepsJson() {
  return JSON.stringify(
    [
      {
        type: "serial_expect",
        pattern: "sensor init ok",
        timeout_ms: 3000,
      },
    ],
    null,
    2,
  );
}

async function loadSessions() {
  const data = await apiGet("/api/sessions");
  state.sessions = data.sessions || [];
  if (!state.activeSessionId && state.sessions.length) {
    state.activeSessionId = state.sessions[0].id;
  }
  renderSessionMetaSummary();
  if (state.activeSessionId) {
    await loadSessionDetail(state.activeSessionId);
  }
}

function renderSessionMetaSummary() {
  const session = state.sessions.find((item) => item.id === state.activeSessionId);
  if (!session) {
    elements.activeSessionLabel.textContent = "未选择";
    elements.executionTarget.textContent = "未选择 Session";
    return;
  }
  elements.activeSessionLabel.textContent = session.title;
  elements.executionTarget.textContent = `${session.title} · ${session.deviceModel || "未填型号"} · ${session.serialNumber || "未填序号"}`;
}

async function loadSessionDetail(sessionId) {
  const data = await apiGet(`/api/sessions/${sessionId}`);
  state.activeSessionDetail = data;
  state.currentStepKey = data.workflowStage || data.steps?.find((step) => step.status !== "done")?.step || "phenomenon";
  const index = state.sessions.findIndex((item) => item.id === data.id);
  if (index >= 0) {
    state.sessions[index] = { ...state.sessions[index], ...data };
  }
  elements.activeSessionLabel.textContent = `${data.title} · ${data.deviceModel || "未填型号"} · ${data.serialNumber || "未填序号"}`;
  elements.activeStageLabel.textContent = stageDefinitions[state.currentStepKey]?.title || "现象";
  elements.sessionTitle.value = data.title || "";
  elements.sessionCustomer.value = data.customerName || "";
  elements.deviceModel.value = data.deviceModel || "";
  elements.serialNumber.value = data.serialNumber || "";
  elements.issueType.value = data.issueType || "";
  elements.severity.value = data.severity || "P1";
  elements.workflowStage.value = data.workflowStage || "phenomenon";
  elements.sessionSymptom.value = data.symptom || "";
  elements.owner.value = data.owner || "";
  elements.deviceIp.value = data.deviceIp || "";
  renderSessionMetaSummary();
  renderStageNavigation();
  renderStepForm();
  renderEvidencePreview();
  renderAnalyses(data.analyses || []);
}

function renderStageNavigation() {
  const steps = state.activeSessionDetail?.steps || [];
  const ordered = state.activeSessionDetail?.workflowStages || [];
  const statuses = Object.fromEntries(steps.map((item) => [item.step, item.status]));
  elements.sessionStageNav.innerHTML = "";
  ordered.forEach((stage, index) => {
    const previousDone = ordered.slice(0, index).every((item) => statuses[item.key] === "done");
    const button = document.createElement("button");
    button.type = "button";
    button.className = `stage-pill ${stage.key === state.currentStepKey ? "active" : ""}`;
    button.disabled = index > 0 && !previousDone;
    button.innerHTML = `<span class="stage-index">0${index + 1}</span><span>${stage.label}</span>`;
    button.addEventListener("click", () => {
      state.currentStepKey = stage.key;
      elements.workflowStage.value = stage.key;
      elements.activeStageLabel.textContent = stage.label;
      renderStepForm();
    });
    elements.sessionStageNav.appendChild(button);
  });
}

function getCurrentStepState() {
  const steps = state.activeSessionDetail?.steps || [];
  return steps.find((item) => item.step === state.currentStepKey) || { data: {}, status: "pending" };
}

function renderStepForm() {
  const definition = stageDefinitions[state.currentStepKey] || stageDefinitions.phenomenon;
  const current = getCurrentStepState();
  elements.stepFormTitle.textContent = `${definition.title} · ${current.status === "done" ? "已完成" : "待完成"}`;
  elements.stageGuidance.innerHTML = `<p>${definition.help}</p>`;
  elements.stepFormFields.innerHTML = "";
  definition.fields.forEach((field) => {
    const label = document.createElement("label");
    label.className = "step-field";
    const input = field.type === "textarea" ? document.createElement("textarea") : document.createElement("input");
    if (field.type !== "textarea") input.type = "text";
    if (field.rows) input.rows = field.rows;
    input.id = `step-field-${field.key}`;
    input.value = current.data?.[field.key] || "";
    label.innerHTML = `<span>${field.label}</span>`;
    label.appendChild(input);
    elements.stepFormFields.appendChild(label);
  });
}

function collectCurrentStepPayload() {
  const definition = stageDefinitions[state.currentStepKey] || stageDefinitions.phenomenon;
  const data = {};
  definition.fields.forEach((field) => {
    data[field.key] = document.getElementById(`step-field-${field.key}`)?.value?.trim() || "";
  });
  return data;
}

async function saveCurrentStep(status = "pending") {
  requireSession();
  const data = collectCurrentStepPayload();
  const response = await apiPost(`/session/${state.activeSessionId}/step`, {
    step: state.currentStepKey,
    data,
    status,
  });
  elements.stepSaveResult.textContent = status === "done" ? "当前步骤已标记完成。" : "当前步骤已保存。";
  await loadSessionDetail(state.activeSessionId);
  return response.step;
}

function renderEvidencePreview() {
  const evidence = state.activeSessionDetail?.evidence || [];
  const recent = evidence.slice(0, 6);
  renderSimpleList(elements.recentEvidenceList, recent, (item) => ({
    title: `${item.title} · ${item.kind}`,
    meta: `${item.createdAt || ""}${item.fileName ? ` · ${item.fileName}` : ""}`,
  }));
  const latestSerial = evidence.find((item) => item.kind === "serial_log");
  elements.latestSerialOutput.value = latestSerial ? (latestSerial.contentText || "").split(/\r?\n/).slice(-10).join("\n") : "";
}

async function createSession() {
  const data = await apiPost("/session/create", {
    title: elements.sessionTitle.value.trim(),
    customerName: elements.sessionCustomer.value.trim(),
    deviceModel: elements.deviceModel.value.trim(),
    serialNumber: elements.serialNumber.value.trim(),
    issueType: elements.issueType.value.trim(),
    severity: elements.severity.value,
    workflowStage: elements.workflowStage.value,
    symptom: elements.sessionSymptom.value.trim(),
    owner: elements.owner.value.trim(),
    deviceIp: elements.deviceIp.value.trim(),
  });
  state.activeSessionId = data.session.id;
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
    deviceIp: elements.deviceIp.value.trim(),
  });
  await Promise.all([loadOverview(), loadSessions(), loadKnowledge()]);
}

async function deleteSession() {
  requireSession();
  if (!window.confirm("确定删除当前 Session 及其证据、分析和步骤吗？")) return;
  const response = await fetch(`/api/sessions/${state.activeSessionId}`, { method: "DELETE" });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "delete failed");
  state.activeSessionId = "";
  state.activeSessionDetail = null;
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

async function loadTestCases() {
  const data = await apiGet("/testcase/list");
  state.testCases = data.testcases || [];
  renderTestCases();
}

function renderTestCases() {
  elements.testCaseCount.textContent = `${state.testCases.length} 条`;
  elements.testCasesList.innerHTML = "";
  if (!state.testCases.length) {
    elements.testCasesList.innerHTML = '<p class="helper">还没有测试用例。</p>';
    return;
  }
  state.testCases.forEach((testCase) => {
    const article = document.createElement("article");
    article.className = `list-item selectable ${state.selectedTestCaseId === testCase.id ? "active" : ""}`;
    article.innerHTML = `
      <strong>${testCase.caseCode} · ${testCase.name}</strong>
      <p>${testCase.category || "未分类"} · ${testCase.target || "未填 target"} · ${testCase.passRule}</p>
    `;
    article.addEventListener("click", () => {
      state.selectedTestCaseId = testCase.id;
      elements.testCaseCode.value = testCase.caseCode || "";
      elements.testCaseName.value = testCase.name || "";
      elements.testCaseCategory.value = testCase.category || "";
      elements.testCaseTarget.value = testCase.target || "";
      elements.testCaseSteps.value = JSON.stringify(testCase.steps || [], null, 2);
      elements.testCaseResult.textContent = `已载入测试用例：${testCase.caseCode}`;
      renderTestCases();
    });
    elements.testCasesList.appendChild(article);
  });
}

async function saveTestCase() {
  let steps;
  try {
    steps = JSON.parse(elements.testCaseSteps.value.trim() || "[]");
  } catch {
    throw new Error("Steps JSON 格式不合法。");
  }
  const data = await apiPost("/testcase", {
    caseCode: elements.testCaseCode.value.trim(),
    name: elements.testCaseName.value.trim(),
    category: elements.testCaseCategory.value.trim(),
    target: elements.testCaseTarget.value.trim(),
    steps,
    passRule: "all_steps_pass",
    enabled: true,
  });
  state.selectedTestCaseId = data.testcase.id;
  elements.testCaseResult.textContent = `测试用例已保存：${data.testcase.caseCode}`;
  await Promise.all([loadOverview(), loadTestCases()]);
}

async function loadTestRuns() {
  const data = await apiGet("/api/test-runs");
  state.testRuns = data.testRuns || [];
  renderTestRuns();
}

function renderTestRuns() {
  elements.testRunCount.textContent = `${state.testRuns.length} 条`;
  elements.testRunsHistory.innerHTML = "";
  if (!state.testRuns.length) {
    elements.testRunsHistory.innerHTML = '<tr><td colspan="7" class="table-empty">还没有测试执行记录。</td></tr>';
    return;
  }
  state.testRuns.forEach((run) => {
    const row = document.createElement("tr");
    row.innerHTML = `
      <td>${run.createdAt || ""}</td>
      <td>${run.report?.caseCode || run.caseId || ""}</td>
      <td>${run.result || ""}</td>
      <td>${run.failStep || "-"}</td>
      <td>${run.deviceModel || ""}</td>
      <td>${run.serialNumber || ""}</td>
      <td>${run.generatedSessionId || "-"}</td>
    `;
    elements.testRunsHistory.appendChild(row);
  });
}

async function runSelectedTestCase() {
  requireSession();
  requireTestCase();
  const data = await apiPost("/testrun/execute", {
    testcaseId: state.selectedTestCaseId,
    sessionId: state.activeSessionId,
  });
  elements.testCaseResult.textContent = data.testrun.result === "fail"
    ? `测试失败，已自动生成 Session：${data.generatedSessionId || "-"}`
    : `测试通过：${data.testrun.report?.caseCode || ""}`;
  await Promise.all([loadOverview(), loadSessions(), loadTestRuns(), loadKnowledge()]);
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

async function saveLog() {
  requireSession();
  const content = elements.logContent.value.trim();
  if (!content) throw new Error("请先粘贴串口日志。");
  await apiPost(`/api/sessions/${state.activeSessionId}/logs`, {
    title: elements.logTitle.value.trim(),
    content,
  });
  elements.logTitle.value = "";
  elements.logContent.value = "";
  await Promise.all([loadOverview(), loadSessionDetail(state.activeSessionId)]);
}

async function uploadLogFile() {
  requireSession();
  const file = elements.logFileInput.files[0];
  if (!file) throw new Error("请选择串口日志文件。");
  const formData = new FormData();
  formData.append("sessionId", state.activeSessionId);
  formData.append("title", elements.logFileTitle.value.trim());
  formData.append("file", file);
  const response = await fetch("/api/log-upload", { method: "POST", body: formData });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "upload failed");
  elements.logFileResult.textContent = `串口文件已导入：${data.evidence.title}`;
  elements.logFileTitle.value = "";
  elements.logFileInput.value = "";
  await Promise.all([loadOverview(), loadSessionDetail(state.activeSessionId)]);
}

async function saveImportedInfo() {
  requireSession();
  const content = elements.infoContent.value.trim();
  const file = elements.infoFile.files[0];
  if (!content && !file) throw new Error("请先填写信息内容或选择附件。");
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

async function captureSnapshot() {
  requireSession();
  const deviceIp = elements.deviceIp.value.trim();
  if (!deviceIp) throw new Error("请先填写设备 IP。");
  const data = await apiPost(`/api/sessions/${state.activeSessionId}/snapshot`, { deviceIp });
  elements.snapshotResult.textContent = `抓拍已保存：${data.evidence.title}`;
  await Promise.all([loadOverview(), loadSessionDetail(state.activeSessionId)]);
}

async function loadSerialPorts() {
  const data = await apiGet("/api/serial/ports");
  elements.serialPortSelect.innerHTML = "";
  const ports = data.ports || [];
  if (!ports.length) {
    elements.serialPortSelect.innerHTML = '<option value="">未发现串口</option>';
    return;
  }
  ports.forEach((port) => {
    const option = document.createElement("option");
    option.value = port.device;
    option.textContent = `${port.device} · ${port.description}`;
    elements.serialPortSelect.appendChild(option);
  });
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
  serialPollTimer = setInterval(() => pollSerialStatus().catch(console.error), 2000);
}

async function startSerialCapture() {
  requireSession();
  const port = elements.serialPortSelect.value;
  const baud = Number(elements.serialBaud.value || 115200);
  if (!port) throw new Error("请先选择串口端口。");
  const data = await apiPost("/api/serial/start", { sessionId: state.activeSessionId, port, baud });
  renderSerialStatus(data.status);
  await Promise.all([loadOverview(), loadSessionDetail(state.activeSessionId)]);
}

async function stopSerialCapture() {
  const data = await apiPost("/api/serial/stop", {});
  renderSerialStatus(data.status);
  if (state.activeSessionId) {
    await Promise.all([loadOverview(), loadSessionDetail(state.activeSessionId)]);
  }
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
    } else {
      card.textContent = Object.entries(item)
        .filter(([, value]) => value !== null && value !== undefined && value !== "")
        .map(([key, value]) => `${key}: ${typeof value === "string" ? value : JSON.stringify(value, null, 2)}`)
        .join("\n");
    }
    list.appendChild(card);
  });
  section.appendChild(list);
  return section;
}

function createOrderedChecklistSection(title, items) {
  const section = document.createElement("section");
  section.className = "result-block";
  section.innerHTML = `<h4>${title}</h4>`;
  if (!items || !items.length) {
    section.innerHTML += '<p class="helper">无</p>';
    return section;
  }
  const list = document.createElement("ol");
  list.className = "checklist-list";
  items.forEach((item, index) => {
    const li = document.createElement("li");
    li.className = "checklist-item";
    if (typeof item === "string") {
      li.textContent = item;
    } else {
      const order = item.order || index + 1;
      li.innerHTML = `
        <strong>${order}. ${item.action || item.goal || item.stage || "待处理动作"}</strong>
        <p>${item.why || item.guidance || item.instructions || ""}</p>
        <p class="helper">${item.done_when || item.completion_hint || item.expected_result || ""}</p>
      `;
    }
    list.appendChild(li);
  });
  section.appendChild(list);
  return section;
}

function createFishboneSection(fishbone) {
  const section = document.createElement("section");
  section.className = "result-block";
  section.innerHTML = "<h4>鱼骨图分析</h4>";
  if (!fishbone?.problem && !(fishbone?.branches || []).length) {
    section.innerHTML += '<p class="helper">当前还没有足够信息生成鱼骨图。</p>';
    return section;
  }
  const wrapper = document.createElement("div");
  wrapper.className = "fishbone-diagram";
  const problem = document.createElement("div");
  problem.className = "fishbone-problem";
  problem.textContent = fishbone.problem || "当前问题";
  wrapper.appendChild(problem);
  (fishbone.branches || []).forEach((branch) => {
    const item = document.createElement("article");
    item.className = "fishbone-branch";
    const title = document.createElement("h5");
    title.textContent = branch.branch || "未命名分支";
    item.appendChild(title);
    const list = document.createElement("ul");
    (branch.causes || []).forEach((cause) => {
      const li = document.createElement("li");
      li.textContent = cause;
      list.appendChild(li);
    });
    item.appendChild(list);
    wrapper.appendChild(item);
  });
  section.appendChild(wrapper);
  return section;
}

function appendMindmapNode(target, node) {
  if (!node) return;
  const li = document.createElement("li");
  li.className = "mindmap-node";
  const label = typeof node === "string" ? node : node.title || node.root || "未命名节点";
  li.innerHTML = `<span>${label}</span>`;
  const children = typeof node === "string" ? [] : node.children || [];
  if (children.length) {
    const list = document.createElement("ul");
    list.className = "mindmap-children";
    children.forEach((child) => appendMindmapNode(list, child));
    li.appendChild(list);
  }
  target.appendChild(li);
}

function createMindmapSection(mindmap) {
  const section = document.createElement("section");
  section.className = "result-block";
  section.innerHTML = "<h4>思维导图</h4>";
  if (!mindmap?.root) {
    section.innerHTML += '<p class="helper">当前还没有足够信息生成思维导图。</p>';
    return section;
  }
  const list = document.createElement("ul");
  list.className = "mindmap-tree";
  appendMindmapNode(list, mindmap);
  section.appendChild(list);
  return section;
}

function renderAnalysisGuidance(result) {
  elements.analysisGuidance.innerHTML = "";
  const missing = state.lastMissingInfo || [];
  const recommended = state.lastSuggestedTests || [];
  if (!missing.length && !recommended.length && !result) {
    elements.analysisGuidance.innerHTML = '<p class="helper">先完成证据输入，再点击“检测缺失信息”或“开始分析”。</p>';
    return;
  }
  elements.analysisGuidance.appendChild(createOrderedChecklistSection("第一步：先补齐缺失输入", missing.map((item, index) => ({ order: index + 1, action: item, why: "这是继续分析前必须补齐的前置条件。", done_when: "已补充到 Session 证据或步骤数据中。" }))));
  elements.analysisGuidance.appendChild(createOrderedChecklistSection("第二步：证据准备清单", result?.evidence_checklist || []));
  elements.analysisGuidance.appendChild(createOrderedChecklistSection("第三步：推荐测试用例", recommended.map((item, index) => ({ order: index + 1, action: `${item.caseCode} · ${item.name}`, why: `${item.category || "未分类"} · score=${item.score}`, done_when: item.reason || "执行后补充新证据。" }))));
  elements.analysisGuidance.appendChild(createOrderedChecklistSection("第四步：流程化引导", result?.guidance_checklist || result?.workflow_guidance || []));
  const relatedAssets = result?.related_assets || {};
  elements.analysisGuidance.appendChild(createListSection("第五步：可复用资产", [
    ...(relatedAssets.recommended_test_cases || []).map((item) => `TestCase: ${item}`),
    ...(relatedAssets.similar_session_hints || []).map((item) => `Session: ${item}`),
    ...(relatedAssets.reusable_patterns || []).map((item) => `Pattern: ${item}`),
  ]));
  elements.analysisGuidance.appendChild(createFishboneSection(result?.fishbone_diagram));
  elements.analysisGuidance.appendChild(createMindmapSection(result?.mindmap_tree));
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
    renderAnalysisGuidance(null);
    return;
  }
  const result = analysis.result;
  const summaryGrid = document.createElement("div");
  summaryGrid.className = "summary-edit-grid";
  summaryGrid.appendChild(createSummaryField("测试时间", "summary-test-time", result.test_time || analysis.createdAt || ""));
  summaryGrid.appendChild(createSummaryField("设备型号", "summary-device-model", result.device_model || ""));
  summaryGrid.appendChild(createSummaryField("序号", "summary-serial-number", result.serial_number || ""));
  summaryGrid.appendChild(createSummaryField("优先级", "summary-priority", result.priority || "P1", "select", ["P0", "P1", "P2", "P3"]));
  summaryGrid.appendChild(createSummaryField("风险等级", "summary-risk-level", result.risk_level || "low", "select", ["low", "medium", "high", "critical"]));
  elements.analysisResult.appendChild(summaryGrid);
  elements.analysisResult.appendChild(createSummaryField("现象总结", "summary-phenomenon", result.phenomenon_summary || "", "textarea"));
  elements.analysisResult.appendChild(createListSection("分层分析", result.layered_analysis || []));
  elements.analysisResult.appendChild(createListSection("已用证据", result.evidence_used || []));
  elements.analysisResult.appendChild(createListSection("可能原因", result.possible_causes || []));
  elements.analysisResult.appendChild(createListSection("验证步骤", result.validation_steps || []));
  elements.analysisResult.appendChild(createListSection("缺失信息", result.missing_information || []));
  elements.analysisResult.appendChild(createListSection("建议命令/片段", result.suggested_commands_or_snippets || []));
  renderAnalysisGuidance(result);
}

function formatAnalysisForCompare(analysis) {
  const wrapper = document.createElement("article");
  wrapper.className = "compare-card";
  wrapper.appendChild(createListSection("分析摘要", [analysis.result?.phenomenon_summary || "无"]));
  wrapper.appendChild(createListSection("分层分析", analysis.result?.layered_analysis || []));
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
    column.innerHTML = `<h4>${analysis.createdAt}</h4><p class="helper">${analysis.requestText}</p>`;
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
  });
  renderCompareArea(analyses);
}

async function suggestMissingInfo() {
  requireSession();
  const data = await apiPost("/ai/missing-info", { sessionId: state.activeSessionId });
  state.lastMissingInfo = data.missingInformation || [];
  renderAnalysisGuidance(state.latestAnalysis?.result || null);
}

async function suggestTestCases() {
  requireSession();
  const data = await apiPost("/ai/suggest-testcase", { sessionId: state.activeSessionId });
  state.lastSuggestedTests = data.recommendations || [];
  renderAnalysisGuidance(state.latestAnalysis?.result || null);
}

async function runAnalysis() {
  requireSession();
  if (!state.apiConfigured) throw new Error("请先通过 AI 验证。");
  validateAnalysisPrerequisites();
  resetWorkflow();
  updateWorkflow("session", "running", "正在读取当前 Session、步骤、证据和历史沉淀...");
  updateWorkflow("provider", "running", "准备使用当前 AI 配置...");
  const deviceIp = elements.deviceIp.value.trim();
  const captureSnapshot = elements.captureBeforeAnalyze.checked;
  updateWorkflow("session", "success", `已选中 Session ${state.activeSessionId}。`);
  updateWorkflow("snapshot", captureSnapshot ? "running" : "success", captureSnapshot ? "分析前将补一张抓拍。" : "本轮不补抓拍。");
  const data = await apiPost("/ai/analyze", {
    sessionId: state.activeSessionId,
    requestText: elements.analysisRequest.value.trim(),
    deviceIp,
    captureSnapshot,
  });
  updateWorkflow("snapshot", "success", captureSnapshot ? "抓拍成功并已入库。" : "未启用抓拍。");
  updateWorkflow("provider", "success", "AI 配置可用。");
  updateWorkflow("request", "success", `请求已发送，请求ID：${data.requestId}`);
  updateWorkflow("response", "success", "结构化结果已解析并入库。");
  await Promise.all([loadOverview(), loadSessionDetail(state.activeSessionId), loadKnowledge()]);
}

async function saveAnalysisSummary() {
  requireSession();
  if (!state.latestAnalysis) throw new Error("当前没有可保存的分析结果。");
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
  await Promise.all([loadOverview(), loadSessionDetail(state.activeSessionId), loadKnowledge()]);
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
    elements.knowledgeList.innerHTML = '<p class="helper">还没有沉淀到知识库的条目。</p>';
    elements.knowledgeDetail.innerHTML = '<p class="helper">从一个完成的 Session 生成知识条目后，这里会显示详情。</p>';
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
    article.className = `list-item selectable ${state.selectedKnowledgeId === item.id ? "active" : ""}`;
    article.innerHTML = `<strong>${item.title}</strong><p>${(item.tags || []).join(", ") || "无标签"} · ${item.updatedAt || ""}</p>`;
    article.addEventListener("click", () => {
      state.selectedKnowledgeId = item.id;
      renderKnowledge();
    });
    elements.knowledgeList.appendChild(article);
  });
  const detail = state.knowledge.find((item) => item.id === state.selectedKnowledgeId) || state.knowledge[0];
  if (detail) {
    elements.knowledgeDetail.innerHTML = "";
    elements.knowledgeDetail.appendChild(createListSection("问题描述 / 标题", [detail.title]));
    elements.knowledgeDetail.appendChild(createListSection("根因", [detail.rootCause || "无"]));
    elements.knowledgeDetail.appendChild(createListSection("解决方案", [detail.solution || "无"]));
    elements.knowledgeDetail.appendChild(createListSection("验证方法", [detail.validation || "无"]));
    elements.knowledgeDetail.appendChild(createListSection("关联 TestCase", (detail.relatedCases || []).map((item) => (typeof item === "string" ? item : JSON.stringify(item)))));
    elements.knowledgeDetail.appendChild(createListSection("标签", (detail.tags || []).map((item) => (typeof item === "string" ? item : JSON.stringify(item)))));
  }
}

function applySelectedKnowledgeToAnalysis() {
  const detail = state.knowledge.find((item) => item.id === state.selectedKnowledgeId);
  if (!detail) {
    throw new Error("请先在知识库里选择一条经验。");
  }
  const lines = [
    `参考知识条目：${detail.title}`,
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

elements.navItems.forEach((item) => item.addEventListener("click", () => setCurrentView(item.dataset.view)));
elements.saveProviderBtn.addEventListener("click", () => saveProviderConfig().catch(showGenericError));
elements.createSessionBtn.addEventListener("click", () => createSession().catch(showGenericError));
elements.saveSessionMetaBtn.addEventListener("click", () => saveSessionMeta().catch(showGenericError));
elements.deleteSessionBtn.addEventListener("click", () => deleteSession().catch(showGenericError));
elements.qaNewSession.addEventListener("click", () => window.scrollTo({ top: 0, behavior: "smooth" }));
elements.qaImportMaterial.addEventListener("click", () => setCurrentView("analysis"));
elements.qaStartTest.addEventListener("click", () => setCurrentView("test"));
elements.qaStartAnalysis.addEventListener("click", () => setCurrentView("analysis"));
elements.saveTestCaseBtn.addEventListener("click", () => saveTestCase().catch(showGenericError));
elements.runSelectedTestBtn.addEventListener("click", () => runSelectedTestCase().catch(showGenericError));
elements.refreshSerialPortsBtn.addEventListener("click", () => loadSerialPorts().catch(showGenericError));
elements.startSerialCaptureBtn.addEventListener("click", () => startSerialCapture().catch(showGenericError));
elements.stopSerialCaptureBtn.addEventListener("click", () => stopSerialCapture().catch(showGenericError));
elements.saveLogBtn.addEventListener("click", () => saveLog().catch(showGenericError));
elements.uploadLogFileBtn.addEventListener("click", () => uploadLogFile().catch(showGenericError));
elements.saveStepBtn.addEventListener("click", () => saveCurrentStep("pending").catch(showGenericError));
elements.markStepDoneBtn.addEventListener("click", () => saveCurrentStep("done").catch(showGenericError));
elements.suggestMissingBtn.addEventListener("click", () => suggestMissingInfo().catch(showGenericError));
elements.suggestTestsBtn.addEventListener("click", () => suggestTestCases().catch(showGenericError));
elements.analyzeBtn.addEventListener("click", () => runAnalysis().catch(showGenericError));
elements.uploadMaterialBtn.addEventListener("click", () => uploadMaterial().catch(showGenericError));
elements.saveInfoBtn.addEventListener("click", () => saveImportedInfo().catch(showGenericError));
elements.captureSnapshotBtn.addEventListener("click", () => captureSnapshot().catch(showGenericError));
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
elements.workflowStage.addEventListener("change", () => {
  state.currentStepKey = elements.workflowStage.value;
  renderStepForm();
});

resetWorkflow();
elements.testCaseSteps.value = defaultTestStepsJson();
Promise.all([loadConfig(), loadOverview(), loadSessions(), loadTestCases(), loadTestRuns(), loadSerialPorts(), loadKnowledge(), pollSerialStatus()]).catch(showGenericError);
startSerialPolling();
