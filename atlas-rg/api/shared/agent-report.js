const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { BlobServiceClient } = require("@azure/storage-blob");
const { withCanonicalIdentity } = require("./canonical");

function buildAgentReport(body = {}) {
  const receivedAt = new Date().toISOString();
  const report = {
    id: body.id || `report_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    received_at: receivedAt,
    source: "agent",
    agent_id: clean(body.agent_id || body.agentId || "unknown-agent"),
    agent_name: clean(body.agent_name || body.agentName || body.agent_id || body.agentId || "Unknown Agent"),
    project: clean(body.project || "Atlas"),
    message: clean(body.message),
    status: clean(body.status || "reported"),
    artifacts: normalizeStringArray(body.artifacts),
    events: normalizeReportEvents(body.events),
    workflow: normalizeWorkflow(body.workflow),
    outputs: normalizeOutputs(body.outputs),
    confidence: normalizeConfidence(body.confidence),
    timestamp: body.timestamp || receivedAt,
    processed: false,
    processing_result: {
      objects_updated: [],
      events_created: [],
      extraction: null,
    },
  };

  const extraction = normalizeAgentReportToExtraction(report);
  report.processed = true;
  report.processing_result = {
    objects_updated: [report.project],
    events_created: extraction.events.map((event) => event.type),
    extraction,
  };

  return report;
}

function buildManualReport(body = {}) {
  const receivedAt = new Date().toISOString();
  const workflow = normalizeWorkflow(body.workflow);
  const project = clean(body.project || workflow?.name || "Atlas");
  const report = {
    id: body.id || `manual_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    received_at: receivedAt,
    source: "manual",
    submitted_by: clean(body.submitted_by || body.submittedBy || "user"),
    agent_id: "",
    agent_name: "Human Operator",
    project,
    message: clean(body.message),
    status: normalizeStatus(body.status || workflow?.stage_status || workflow?.stage || "reported"),
    artifacts: [],
    events: normalizeReportEvents(body.events),
    workflow,
    outputs: normalizeOutputs(body.outputs),
    confidence: normalizeConfidence(body.confidence),
    timestamp: body.timestamp || receivedAt,
    processed: false,
    processing_result: {
      objects_updated: [],
      events_created: [],
      extraction: null,
    },
  };

  const extraction = normalizeAgentReportToExtraction(report);
  report.processed = true;
  report.processing_result = {
    objects_updated: [workflow?.name || project],
    events_created: extraction.events.map((event) => event.type),
    extraction,
  };

  return report;
}

function buildInboxReport(body = {}) {
  return isAgentReport(body) ? buildAgentReport(body) : buildManualReport(body);
}

function isAgentReport(body = {}) {
  return String(body.source || "agent").toLowerCase() !== "manual";
}

function normalizeAgentReportToExtraction(report) {
  const workItems = dedupeNames(report.events.map((event) => event.target).filter(Boolean));
  const runName = `${report.agent_name} run ${report.timestamp}`;
  const workflowName = report.workflow?.name || report.project;
  const stages = report.workflow?.stages || [];
  const stageNames = dedupeNames([
    report.workflow?.stage,
    report.workflow?.next_stage,
    ...stages.map((stage) => stage.name),
  ].filter(Boolean));
  const stageAgents = dedupeNames(stages.map((stage) => stage.agent).filter(Boolean));
  const stageOutputs = dedupeNames(stages.flatMap((stage) => [stage.output, stage.input]).filter(Boolean));
  const outputNames = dedupeNames([...report.outputs.map((output) => output.name), ...stageOutputs]);
  const entities = [
    ...(report.source === "agent" ? [{ type: "Agent", name: report.agent_name, visibility: "secondary" }] : []),
    ...stageAgents.map((agent) => ({ type: "Agent", name: agent, visibility: "secondary" })),
    { type: "Project", name: report.project, visibility: "primary" },
    { type: "Workflow", name: workflowName, visibility: "primary" },
    ...(report.source === "agent" ? [{ type: "AgentRun", name: runName, visibility: "secondary" }] : []),
    ...stageNames.map((stage) => ({ type: "Stage", name: stage, visibility: "secondary" })),
    ...outputNames.map((output) => ({ type: "Output", name: output, visibility: "secondary" })),
    ...workItems.map((target) => ({ type: "WorkItem", name: target, visibility: "secondary" })),
    ...report.artifacts.map((artifact) => ({ type: "Artifact", name: artifact, visibility: "debug" })),
  ];

  const relationships = [
    ...(report.source === "agent" ? [{ source: report.agent_name, relation: "reported_on", target: report.project }] : []),
    { source: workflowName, relation: "belongs_to", target: report.project },
    ...(report.source === "agent" ? [
      { source: runName, relation: "run_for", target: report.project },
      { source: runName, relation: "run_for", target: workflowName },
      { source: report.agent_name, relation: "performed", target: runName },
    ] : []),
    ...stageNames.map((stage) => ({ source: stage, relation: "stage_of", target: workflowName })),
    ...(report.source === "agent" && report.workflow?.stage ? [{ source: report.agent_name, relation: "worked_on_stage", target: report.workflow.stage }] : []),
    ...(report.workflow?.stage ? [{ source: report.workflow.stage, relation: "stage_of", target: workflowName }] : []),
    ...stages.flatMap((stage) => [
      stage.agent ? { source: stage.agent, relation: "worked_on_stage", target: stage.name } : null,
      stage.output ? { source: stage.output, relation: "produced_by_stage", target: stage.name } : null,
      stage.input ? { source: stage.input, relation: "input_to_stage", target: stage.name } : null,
    ].filter(Boolean)),
    ...report.outputs.map((output) => ({ source: output.name, relation: "output_of", target: workflowName })),
    ...workItems.flatMap((target) => [
      { source: target, relation: "belongs_to", target: report.project },
      { source: target, relation: "belongs_to", target: workflowName },
      ...(report.source === "agent" ? [{ source: report.agent_name, relation: "performed", target }] : []),
    ]),
    ...report.artifacts.flatMap((artifact) => [
      { source: artifact, relation: "belongs_to", target: report.project },
      ...(report.source === "agent" ? [
        { source: report.agent_name, relation: "changed_artifact", target: artifact },
        { source: runName, relation: "changed_artifact", target: artifact },
      ] : []),
    ]),
  ];

  const baseDetails = {
    source: report.source,
    report_id: report.id,
    agent_id: report.agent_id,
    agent_name: report.source === "agent" ? report.agent_name : "",
    submitted_by: report.submitted_by,
    project: report.project,
    status: report.status,
    confidence: report.confidence,
    artifacts: report.artifacts,
    workflow: report.workflow,
    workflow_name: workflowName,
    workflow_stage: report.workflow?.stage || "",
    workflow_stage_status: report.workflow?.stage_status || "",
    workflow_next_stage: report.workflow?.next_stage || "",
    outputs: report.outputs,
    run_name: runName,
    work_items: workItems,
    summary: report.message,
    raw_input: report.message,
  };

  const events = [
    ...(report.source === "agent" ? [{
      type: "AgentReport",
      target: report.project,
      timestamp: report.timestamp,
      details: baseDetails,
    }] : []),
    ...(report.workflow ? [{
      type: "WorkflowUpdated",
      target: workflowName,
      timestamp: report.timestamp,
      details: {
        ...baseDetails,
        summary: workflowSummary(report),
        raw_input: report.message,
      },
    }] : []),
    ...report.events.map((event) => ({
      type: canonicalAgentEventType(event.type),
      target: report.project,
      timestamp: event.timestamp || report.timestamp,
      details: {
        ...baseDetails,
        summary: event.summary || event.details?.summary || report.message,
        raw_input: report.message,
        original_type: event.type,
        action_target: event.target,
      },
    })),
  ];

  return {
    source: report.source,
    submitted_by: report.source === "agent" ? report.agent_id : report.submitted_by,
    report_id: report.id,
    entities: dedupeEntities(entities).map(withCanonicalIdentity),
    relationships: dedupeRelationships(relationships),
    events,
    extractor: {
      mode: "agent_report",
      provider: report.source === "agent" ? report.agent_name : "Human Operator",
      model: report.source === "agent" ? "structured-report" : "operator-workflow-command",
    },
  };
}

async function readInbox() {
  if (useBlobInbox()) {
    return readBlobInbox();
  }
  try {
    const content = fs.readFileSync(getInboxPath(), "utf8");
    const parsed = JSON.parse(content);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function writeInbox(reports) {
  if (useBlobInbox()) {
    await writeBlobInbox(reports);
    return;
  }
  const inboxPath = getInboxPath();
  fs.mkdirSync(path.dirname(inboxPath), { recursive: true });
  fs.writeFileSync(inboxPath, JSON.stringify(reports, null, 2));
}

async function storeReport(report) {
  const reports = await readInbox();
  reports.push(report);
  await writeInbox(reports);
  return report;
}

async function inboxSummary() {
  const reports = await readInbox();
  return {
    api_key_configured: Boolean(process.env.ATLAS_AGENT_API_KEY),
    reports,
    recent_reports_count: reports.length,
    last_report_received_at: reports.at(-1)?.received_at || "",
  };
}

function isAuthorized(req) {
  const configured = process.env.ATLAS_AGENT_API_KEY;
  if (!configured) {
    return false;
  }
  const header = req.headers?.["x-atlas-api-key"] || req.headers?.["X-Atlas-Api-Key"];
  return header === configured;
}

function getInboxPath() {
  return process.env.ATLAS_AGENT_INBOX_PATH || path.join(os.tmpdir(), "atlas-agent-report-inbox.json");
}

function useBlobInbox() {
  return Boolean(process.env.ATLAS_REPORTS_STORAGE_CONNECTION_STRING || process.env.AzureWebJobsStorage);
}

function blobContainerName() {
  return process.env.ATLAS_REPORTS_CONTAINER || "atlas-agent-reports";
}

function blobName() {
  return process.env.ATLAS_REPORTS_BLOB || "inbox.json";
}

function blobClients() {
  const connectionString = process.env.ATLAS_REPORTS_STORAGE_CONNECTION_STRING || process.env.AzureWebJobsStorage;
  const container = BlobServiceClient.fromConnectionString(connectionString).getContainerClient(blobContainerName());
  return {
    container,
    blob: container.getBlockBlobClient(blobName()),
  };
}

async function readBlobInbox() {
  try {
    const { blob } = blobClients();
    if (!(await blob.exists())) {
      return [];
    }
    const content = await blob.downloadToBuffer();
    const parsed = JSON.parse(content.toString("utf8"));
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function writeBlobInbox(reports) {
  const { blob, container } = blobClients();
  await container.createIfNotExists();
  const content = JSON.stringify(reports, null, 2);
  await blob.upload(content, Buffer.byteLength(content), {
    blobHTTPHeaders: { blobContentType: "application/json" },
  });
}

function clean(value) {
  return String(value || "").trim();
}

function normalizeStringArray(value) {
  return Array.isArray(value) ? value.map(clean).filter(Boolean) : [];
}

function normalizeReportEvents(value) {
  return Array.isArray(value)
    ? value
        .filter((event) => event?.type || event?.target)
        .map((event) => ({
          type: clean(event.type || "AgentReport"),
          target: clean(event.target),
          timestamp: event.timestamp,
          summary: event.summary,
          details: event.details,
        }))
    : [];
}

function normalizeWorkflow(value) {
  if (!value || typeof value !== "object") {
    return null;
  }
  const stages = Array.isArray(value.stages)
    ? value.stages
        .map((stage) => ({
          name: clean(stage?.name),
          status: normalizeStatus(stage?.status),
          agent: clean(stage?.agent),
          input: clean(stage?.input),
          output: clean(stage?.output),
        }))
        .filter((stage) => stage.name)
    : [];
  const name = clean(value.name);
  if (!name) {
    return null;
  }
  return {
    name,
    objective: clean(value.objective),
    stage: clean(value.stage),
    stage_status: normalizeStatus(value.stage_status),
    next_stage: clean(value.next_stage),
    trigger: normalizeWorkflowTrigger(value.trigger),
    stages,
  };
}

function normalizeWorkflowTrigger(value) {
  if (!value || typeof value !== "object") {
    return null;
  }
  return {
    type: clean(value.type || "agent_run"),
    endpoint: clean(value.endpoint || value.run_endpoint || value.runEndpoint),
    method: clean(value.method || "POST").toUpperCase(),
    payload: value.payload && typeof value.payload === "object" ? value.payload : {},
  };
}

function normalizeOutputs(value) {
  return Array.isArray(value)
    ? value
        .map((output) => ({
          name: clean(output?.name),
          type: clean(output?.type || "Output"),
          status: normalizeStatus(output?.status || "reported"),
          summary: clean(output?.summary),
          url: clean(output?.url),
          artifacts: normalizeStringArray(output?.artifacts),
          documents: normalizeDocuments(output?.documents),
        }))
        .filter((output) => output.name)
    : [];
}

function normalizeDocuments(value) {
  return Array.isArray(value)
    ? value
        .map((document) => ({
          name: clean(document?.name || document?.filename || document?.title),
          type: clean(document?.type || document?.kind || "document"),
          mime_type: clean(document?.mime_type || document?.mimeType || document?.mime || ""),
          url: clean(document?.url || document?.href || ""),
          content: typeof document?.content === "string" ? document.content : "",
          data: document?.data && typeof document.data === "object" ? document.data : null,
          summary: clean(document?.summary),
        }))
        .filter((document) => document.name)
    : [];
}

function normalizeStatus(value) {
  return canonicalWorkflowState(value);
}

function canonicalWorkflowState(value) {
  const normalized = clean(value || "in_progress").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  const entries = [
    ["queued", "queued"],
    ["pending", "queued"],
    ["assigned", "assigned"],
    ["claimed", "assigned"],
    ["in progress", "in_progress"],
    ["running", "in_progress"],
    ["active", "in_progress"],
    ["working", "in_progress"],
    ["completed", "completed"],
    ["complete", "completed"],
    ["done", "completed"],
    ["blocked", "blocked"],
    ["stuck", "blocked"],
    ["needs review", "needs_review"],
    ["ready for review", "needs_review"],
    ["human review", "needs_review"],
    ["review", "needs_review"],
    ["waiting", "needs_review"],
    ["revision requested", "revision_requested"],
    ["needs revision", "revision_requested"],
    ["rejected", "revision_requested"],
    ["approved", "approved"],
    ["failed", "failed"],
    ["error", "failed"],
    ["canceled", "canceled"],
    ["cancelled", "canceled"],
  ];
  const match = entries.find(([pattern]) => normalized === pattern || normalized.includes(pattern));
  return match ? match[1] : "in_progress";
}

function workflowSummary(report) {
  const stage = report.workflow?.stage || "Workflow";
  const status = report.workflow?.stage_status || report.status;
  const next = report.workflow?.next_stage ? ` Next stage: ${report.workflow.next_stage}.` : "";
  return `${stage} ${status}.${next} ${report.message}`.trim();
}

function normalizeConfidence(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) {
    return null;
  }
  return Math.max(0, Math.min(1, number));
}

function canonicalAgentEventType(value) {
  const normalized = clean(value).replace(/[^a-zA-Z0-9]+(.)/g, (_match, char) => char.toUpperCase()).replace(/^./, (char) => char.toUpperCase());
  const allowed = new Set(["AgentReport", "TaskCompleted", "ArtifactChanged", "StatusChanged", "InformationLearned", "WorkflowUpdated"]);
  return allowed.has(normalized) ? normalized : "InformationLearned";
}

function dedupeEntities(entities) {
  const seen = new Set();
  return entities.filter((entity) => {
    const key = `${entity.type.toLowerCase()}::${entity.name.toLowerCase()}`;
    if (!entity.name || seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

function dedupeRelationships(relationships) {
  const seen = new Set();
  return relationships.filter((relationship) => {
    const key = [relationship.source, relationship.relation, relationship.target].map((part) => String(part || "").toLowerCase()).join("::");
    if (!relationship.source || !relationship.target || seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

function dedupeNames(values) {
  const seen = new Set();
  return values.filter((value) => {
    const key = String(value || "").toLowerCase();
    if (!key || seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

module.exports = {
  buildAgentReport,
  buildInboxReport,
  inboxSummary,
  isAgentReport,
  isAuthorized,
  normalizeAgentReportToExtraction,
  readInbox,
  storeReport,
};
