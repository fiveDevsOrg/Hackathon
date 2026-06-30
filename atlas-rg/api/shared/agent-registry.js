const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { BlobServiceClient } = require("@azure/storage-blob");
const { buildAgentReport, storeReport } = require("./agent-report");

const DEFAULT_RUN_TIMEOUT_MS = 20000;

async function listAgents() {
  const registry = await readRegistry();
  return registry.agents.map((agent) => withRunSummary(agent, registry.runs));
}

async function getAgent(agentId) {
  const registry = await readRegistry();
  const agent = findAgent(registry, agentId);
  if (!agent) {
    return null;
  }
  return {
    ...withRunSummary(agent, registry.runs),
    runs: registry.runs
      .filter((run) => run.agent_id === agent.id)
      .sort((left, right) => String(right.created_at).localeCompare(String(left.created_at))),
  };
}

function getAgentContractTemplate() {
  return {
    version: "2026-06-22",
    description: "Fill this contract and POST it to /api/agents to register an Atlas-aware agent.",
    required_fields: ["agent_id", "agent_name", "run_endpoint"],
    optional_fields: [
      "description",
      "capabilities",
      "input_schema",
      "output_types",
      "primary_output",
      "default_payload",
      "requires_review",
      "workflow_setup",
      "control_endpoint",
    ],
    contract: {
      agent_id: "",
      agent_name: "",
      description: "",
      provider: "http",
      type: "http_webhook",
      capabilities: [],
      input_schema: {
        type: "object",
        properties: {},
      },
      output_types: ["markdown"],
      primary_output: "model-analysis.md",
      run_mode: "http",
      run_endpoint: "",
      control_endpoint: "",
      default_project: "Atlas",
      default_payload: {},
      requires_review: true,
      workflow_setup: {
        workflow_name: "",
        objective: "",
        trigger_payload: {},
        stages: [
          {
            name: "Queued",
            agent: "Atlas",
            input: "Agent contract and trigger payload",
            output: "Run request prepared",
          },
          {
            name: "In Progress",
            agent: "",
            input: "Run payload",
            output: "Agent work product",
          },
          {
            name: "Needs Review",
            agent: "Human Operator",
            input: "Primary output",
            output: "Approved, denied, or rerun requested",
          },
          {
            name: "Approved",
            agent: "Atlas",
            input: "Operator approval",
            output: "Approved output archived in Atlas",
          },
        ],
      },
    },
  };
}

async function registerAgent(body = {}) {
  const registry = await readRegistry();
  const now = new Date().toISOString();
  const id = slug(body.agent_id || body.agentId || body.id || body.agent_name || body.agentName || body.name);
  if (!id) {
    const error = new Error("agent_id or agent_name is required.");
    error.status = 400;
    throw error;
  }
  const existing = findAgent(registry, id);
  const agent = {
    id,
    agent_id: id,
    agent_name: clean(body.agent_name || body.agentName || body.name || id),
    provider: clean(body.provider || "http"),
    type: clean(body.type || "http_webhook"),
    description: clean(body.description),
    capabilities: normalizeStringArray(body.capabilities),
    input_schema: normalizeObject(body.input_schema || body.inputSchema),
    default_payload: normalizeObject(body.default_payload || body.defaultPayload),
    output_types: normalizeStringArray(body.output_types || body.outputTypes).length
      ? normalizeStringArray(body.output_types || body.outputTypes)
      : ["markdown", "json"],
    primary_output: clean(body.primary_output || body.primaryOutput),
    run_mode: clean(body.run_mode || body.runMode || "http"),
    run_endpoint: clean(body.run_endpoint || body.runEndpoint),
    control_endpoint: clean(body.control_endpoint || body.controlEndpoint),
    requires_review: Boolean(body.requires_review ?? body.requiresReview ?? true),
    default_project: clean(body.default_project || body.defaultProject || body.project || body.agent_name || body.name || id),
    workflow_setup: normalizeWorkflowSetup(body.workflow_setup || body.workflowSetup),
    enabled: body.enabled !== false,
    created_at: existing?.created_at || now,
    updated_at: now,
  };

  registry.agents = [...registry.agents.filter((item) => item.id !== id), agent].sort((left, right) => left.agent_name.localeCompare(right.agent_name));
  await writeRegistry(registry);
  return withRunSummary(agent, registry.runs);
}

async function deleteAgent(agentId) {
  const registry = await readRegistry();
  const agent = findAgent(registry, agentId);
  if (!agent) {
    const error = new Error("Agent not found.");
    error.status = 404;
    throw error;
  }

  registry.agents = registry.agents.filter((item) => item.id !== agent.id);
  registry.runs = registry.runs.filter((run) => run.agent_id !== agent.id);
  await writeRegistry(registry);
  return agent;
}

async function createAgentRun(agentId, body = {}, req = {}) {
  const registry = await readRegistry();
  const agent = findAgent(registry, agentId);
  if (!agent) {
    const error = new Error("Agent not found.");
    error.status = 404;
    throw error;
  }
  if (agent.enabled === false) {
    const error = new Error("Agent is disabled.");
    error.status = 409;
    throw error;
  }

  const now = new Date().toISOString();
  let run = {
    id: body.run_id || body.runId || `run_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    run_id: "",
    agent_id: agent.id,
    agent_name: agent.agent_name,
    project: clean(body.project || agent.default_project || agent.agent_name),
    workflow_name: clean(body.workflow_name || body.workflowName || agent.workflow_setup?.workflow_name || body.project || agent.default_project || agent.agent_name),
    status: "queued",
    stage: "Queued",
    message: clean(body.message || "Run queued."),
    inputs: normalizeObject(body.inputs || body.input || agent.default_payload),
    outputs: [],
    events: [],
    controls: [],
    report_ids: [],
    created_at: now,
    updated_at: now,
    started_at: "",
    completed_at: "",
    dispatched_at: "",
    error: "",
  };
  run.run_id = run.id;
  registry.runs.push(run);
  await writeRegistry(registry);

  if (!agent.run_endpoint) {
    return run;
  }

  try {
    const dispatchPayload = {
      run_id: run.id,
      agent_id: agent.id,
      agent_name: agent.agent_name,
      project: run.project,
      workflow_name: run.workflow_name,
      inputs: run.inputs,
      callback: callbackEnvelope(req, run.id),
    };
    const response = await fetchWithTimeout(agent.run_endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(dispatchPayload),
    });
    const responseText = await response.text();
    if (!response.ok) {
      throw new Error(`Run endpoint returned ${response.status}: ${responseText.slice(0, 240)}`);
    }
    run = {
      ...run,
      status: "in_progress",
      stage: "Dispatched",
      message: "Run dispatched to agent.",
      dispatched_at: new Date().toISOString(),
      started_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      dispatch_response: parseMaybeJson(responseText),
    };
  } catch (error) {
    run = {
      ...run,
      status: "failed",
      stage: "Dispatch Failed",
      message: "Run dispatch failed.",
      error: error.message,
      completed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
  }

  await upsertRun(run);
  return run;
}

async function reportAgentRun(runId, body = {}) {
  const registry = await readRegistry();
  const run = findRun(registry, runId);
  if (!run) {
    const error = new Error("Run not found.");
    error.status = 404;
    throw error;
  }
  const agent = findAgent(registry, run.agent_id) || {
    id: run.agent_id,
    agent_name: run.agent_name,
    default_project: run.project,
    description: "",
  };
  const now = new Date().toISOString();
  const status = normalizeRunStatus(body.status || run.status || "in_progress");
  const outputs = normalizeOutputs(body.outputs || body.artifacts_as_outputs);
  const artifacts = normalizeStringArray(body.artifacts);
  const events = normalizeRunEvents(body.events);
  const stage = clean(body.stage || body.current_stage || run.stage || titleize(status));
  const message = clean(body.message || run.message || `${agent.agent_name} reported ${status}.`);
  const report = await storeReport(buildAgentReport({
    source: "agent",
    agent_id: agent.id,
    agent_name: agent.agent_name,
    project: clean(body.project || run.project || agent.default_project || agent.agent_name),
    message,
    status,
    artifacts,
    events: events.length ? events : [{ type: "StatusChanged", target: stage, summary: message }],
    workflow: normalizeWorkflowFromRun(run, agent, body, stage, status, outputs),
    outputs,
    confidence: body.confidence,
    timestamp: body.timestamp || now,
  }));
  const updated = {
    ...run,
    project: clean(body.project || run.project),
    workflow_name: clean(body.workflow_name || body.workflowName || body.workflow?.name || run.workflow_name),
    status,
    stage,
    message,
    outputs: outputs.length ? outputs : run.outputs,
    events: [...(run.events || []), ...events],
    report_ids: [...(run.report_ids || []), report.id],
    updated_at: now,
    completed_at: isTerminalStatus(status) ? now : run.completed_at,
    error: status === "failed" ? clean(body.error || run.error) : run.error,
  };
  await upsertRun(updated);
  return { run: updated, report };
}

async function controlAgentRun(runId, body = {}) {
  const registry = await readRegistry();
  const run = findRun(registry, runId);
  if (!run) {
    const error = new Error("Run not found.");
    error.status = 404;
    throw error;
  }
  const agent = findAgent(registry, run.agent_id);
  const now = new Date().toISOString();
  const control = {
    id: `control_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    type: clean(body.type || body.action || "feedback"),
    feedback: clean(body.feedback || body.message),
    payload: normalizeObject(body.payload),
    created_at: now,
  };
  let updated = {
    ...run,
    controls: [...(run.controls || []), control],
    updated_at: now,
  };

  if (control.type === "cancel") {
    updated = { ...updated, status: "canceled", completed_at: now };
  } else if (control.type === "approve") {
    updated = { ...updated, status: "approved" };
  } else if (control.type === "deny" || control.type === "revision_requested") {
    updated = { ...updated, status: "revision_requested" };
  } else if (control.type === "rerun") {
    updated = { ...updated, status: "queued", stage: "Queued", completed_at: "" };
  }

  if (agent?.control_endpoint) {
    try {
      const response = await fetchWithTimeout(agent.control_endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ run_id: run.id, agent_id: agent.id, control }),
      });
      const responseText = await response.text();
      updated.control_dispatch = {
        status: response.status,
        ok: response.ok,
        response: parseMaybeJson(responseText),
      };
    } catch (error) {
      updated.control_dispatch = {
        ok: false,
        error: error.message,
      };
    }
  }

  await upsertRun(updated);
  return { run: updated, control };
}

async function readRegistry() {
  if (useBlobRegistry()) {
    return normalizeRegistry(await readBlobRegistry());
  }
  try {
    return normalizeRegistry(JSON.parse(fs.readFileSync(getRegistryPath(), "utf8")));
  } catch {
    return normalizeRegistry({});
  }
}

async function writeRegistry(registry) {
  const normalized = normalizeRegistry(registry);
  if (useBlobRegistry()) {
    await writeBlobRegistry(normalized);
    return;
  }
  const registryPath = getRegistryPath();
  fs.mkdirSync(path.dirname(registryPath), { recursive: true });
  fs.writeFileSync(registryPath, JSON.stringify(normalized, null, 2));
}

async function upsertRun(run) {
  const registry = await readRegistry();
  registry.runs = [...registry.runs.filter((item) => item.id !== run.id), run].sort((left, right) => String(left.created_at).localeCompare(String(right.created_at)));
  await writeRegistry(registry);
  return run;
}

function normalizeRegistry(value = {}) {
  return {
    agents: Array.isArray(value.agents) ? value.agents : [],
    runs: Array.isArray(value.runs) ? value.runs : [],
  };
}

function findAgent(registry, agentId) {
  const key = slug(agentId);
  return registry.agents.find((agent) => agent.id === key || slug(agent.agent_id) === key || slug(agent.agent_name) === key) || null;
}

function findRun(registry, runId) {
  return registry.runs.find((run) => run.id === runId || run.run_id === runId) || null;
}

function withRunSummary(agent, runs) {
  const agentRuns = runs
    .filter((run) => run.agent_id === agent.id)
    .sort((left, right) => String(right.created_at).localeCompare(String(left.created_at)));
  const lastRun = agentRuns[0] || null;
  return {
    ...agent,
    run_count: agentRuns.length,
    last_run_id: lastRun?.id || "",
    last_status: lastRun?.status || "",
    last_run_at: lastRun?.created_at || "",
  };
}

function normalizeWorkflowFromRun(run, agent, body, stage, status, outputs) {
  if (body.workflow && typeof body.workflow === "object") {
    return body.workflow;
  }
  const output = outputs[0]?.name || "";
  return {
    name: clean(body.workflow_name || body.workflowName || run.workflow_name || run.project || agent.agent_name),
    objective: clean(body.objective || agent.description || `Run ${agent.agent_name}.`),
    stage,
    stage_status: status,
    next_stage: clean(body.next_stage || body.nextStage),
    stages: [{ name: stage, status, agent: agent.agent_name, input: "", output }].filter((item) => item.name),
  };
}

function normalizeOutputs(value) {
  return Array.isArray(value)
    ? value
        .map((output) => ({
          name: clean(output?.name || output?.filename || output?.title),
          type: clean(output?.type || "Output"),
          status: normalizeRunStatus(output?.status || "reported"),
          summary: clean(output?.summary),
          url: clean(output?.url),
          artifacts: normalizeStringArray(output?.artifacts),
          documents: Array.isArray(output?.documents) ? output.documents : [],
        }))
        .filter((output) => output.name)
    : [];
}

function normalizeRunEvents(value) {
  return Array.isArray(value)
    ? value
        .map((event) => ({
          type: clean(event?.type || "StatusChanged"),
          target: clean(event?.target),
          timestamp: event?.timestamp,
          summary: clean(event?.summary),
          details: normalizeObject(event?.details),
        }))
        .filter((event) => event.type || event.target)
    : [];
}

function normalizeRunStatus(value) {
  const normalized = clean(value || "in_progress").toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
  const map = {
    pending: "queued",
    queued: "queued",
    assigned: "assigned",
    running: "in_progress",
    active: "in_progress",
    working: "in_progress",
    in_progress: "in_progress",
    blocked: "blocked",
    needs_review: "needs_review",
    ready_for_review: "needs_review",
    human_review: "needs_review",
    approved: "approved",
    revision_requested: "revision_requested",
    denied: "revision_requested",
    rejected: "revision_requested",
    completed: "completed",
    complete: "completed",
    done: "completed",
    failed: "failed",
    error: "failed",
    canceled: "canceled",
    cancelled: "canceled",
  };
  return map[normalized] || "in_progress";
}

function isTerminalStatus(status) {
  return ["completed", "failed", "canceled"].includes(status);
}

function callbackEnvelope(req, runId) {
  const baseUrl = requestBaseUrl(req);
  return {
    report_url: baseUrl ? `${baseUrl}/api/agent-runs/${runId}/report` : `/api/agent-runs/${runId}/report`,
    control_url: baseUrl ? `${baseUrl}/api/agent-runs/${runId}/control` : `/api/agent-runs/${runId}/control`,
    auth_header: "x-atlas-api-key",
  };
}

function requestBaseUrl(req = {}) {
  const explicit = clean(req.body?.callback_base_url || req.body?.callbackBaseUrl);
  if (explicit) {
    return explicit.replace(/\/+$/, "");
  }
  const origin = clean(req.headers?.origin);
  if (origin) {
    return origin.replace(/\/+$/, "");
  }
  const host = clean(req.headers?.["x-forwarded-host"] || req.headers?.host);
  if (!host) {
    return "";
  }
  const proto = clean(req.headers?.["x-forwarded-proto"] || "https");
  return `${proto}://${host}`;
}

async function fetchWithTimeout(url, options) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), Number(process.env.ATLAS_AGENT_RUN_TIMEOUT_MS || DEFAULT_RUN_TIMEOUT_MS));
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

function getRegistryPath() {
  return process.env.ATLAS_AGENT_REGISTRY_PATH || path.join(os.tmpdir(), "atlas-agent-registry.json");
}

function useBlobRegistry() {
  return Boolean(process.env.ATLAS_AGENT_REGISTRY_STORAGE_CONNECTION_STRING || process.env.ATLAS_REPORTS_STORAGE_CONNECTION_STRING || process.env.AzureWebJobsStorage);
}

function blobContainerName() {
  return process.env.ATLAS_AGENT_REGISTRY_CONTAINER || process.env.ATLAS_REPORTS_CONTAINER || "atlas-agent-reports";
}

function blobName() {
  return process.env.ATLAS_AGENT_REGISTRY_BLOB || "agents.json";
}

function blobClients() {
  const connectionString = process.env.ATLAS_AGENT_REGISTRY_STORAGE_CONNECTION_STRING || process.env.ATLAS_REPORTS_STORAGE_CONNECTION_STRING || process.env.AzureWebJobsStorage;
  const container = BlobServiceClient.fromConnectionString(connectionString).getContainerClient(blobContainerName());
  return {
    container,
    blob: container.getBlockBlobClient(blobName()),
  };
}

async function readBlobRegistry() {
  try {
    const { blob } = blobClients();
    if (!(await blob.exists())) {
      return {};
    }
    const content = await blob.downloadToBuffer();
    return JSON.parse(content.toString("utf8"));
  } catch {
    return {};
  }
}

async function writeBlobRegistry(registry) {
  const { blob, container } = blobClients();
  await container.createIfNotExists();
  const content = JSON.stringify(registry, null, 2);
  await blob.upload(content, Buffer.byteLength(content), {
    blobHTTPHeaders: { blobContentType: "application/json" },
  });
}

function normalizeStringArray(value) {
  if (Array.isArray(value)) {
    return value.map(clean).filter(Boolean);
  }
  return clean(value).split(",").map(clean).filter(Boolean);
}

function normalizeObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function normalizeWorkflowSetup(value) {
  const setup = normalizeObject(value);
  if (!Object.keys(setup).length) {
    return {};
  }
  return {
    workflow_name: clean(setup.workflow_name || setup.workflowName),
    objective: clean(setup.objective),
    trigger_payload: normalizeObject(setup.trigger_payload || setup.triggerPayload),
    stages: normalizeWorkflowSetupStages(setup.stages),
  };
}

function normalizeWorkflowSetupStages(value) {
  return Array.isArray(value)
    ? value
        .map((stage) => ({
          name: clean(stage?.name),
          status: clean(stage?.status || stage?.name),
          agent: clean(stage?.agent || stage?.owner),
          input: clean(stage?.input),
          output: clean(stage?.output),
        }))
        .filter((stage) => stage.name)
    : [];
}

function parseMaybeJson(text) {
  if (!text) {
    return null;
  }
  try {
    return JSON.parse(text);
  } catch {
    return text.slice(0, 1000);
  }
}

function clean(value) {
  return String(value || "").trim();
}

function slug(value) {
  return clean(value).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

function titleize(value) {
  return clean(value).replace(/[_-]+/g, " ").replace(/\b\w/g, (char) => char.toUpperCase());
}

module.exports = {
  controlAgentRun,
  createAgentRun,
  deleteAgent,
  getAgent,
  getAgentContractTemplate,
  listAgents,
  readRegistry,
  registerAgent,
  reportAgentRun,
};
