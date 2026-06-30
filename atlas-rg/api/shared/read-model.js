const { readInbox } = require("./agent-report");
const { withCanonicalIdentity } = require("./canonical");

async function buildReadModel() {
  const reports = await readInbox();
  const entities = [];
  const relationships = [];
  const events = [];

  for (const report of reports) {
    const extraction = report.processing_result?.extraction;
    if (!extraction) {
      continue;
    }
    for (const entity of extraction.entities || []) {
      mergeEntity(entities, withCanonicalIdentity(entity));
    }
    for (const relationship of extraction.relationships || []) {
      if (!relationships.some((item) => relationshipKey(item) === relationshipKey(relationship))) {
        relationships.push(relationship);
      }
    }
    events.push(...(extraction.events || []));
  }

  return {
    reports,
    entities,
    relationships,
    events,
  };
}

async function getProjects() {
  const model = await buildReadModel();
  return model.entities
    .filter((entity) => isPrimaryObject(entity) && entity.visibility !== "debug")
    .map((project) => ({
      id: project.id,
      canonical_key: project.canonical_key,
      name: project.name,
      type: project.type,
      status: statusForProject(project, model),
      visibility: project.visibility || "primary",
    }));
}

async function getWorkItems(projectName, status) {
  const model = await buildReadModel();
  const project = findProject(model, projectName);
  const projectNameValue = project?.name || projectName || "";
  const workItems = model.entities
    .filter((entity) => entity.type === "WorkItem")
    .filter((entity) => !projectNameValue || isRelatedToProject(entity.name, projectNameValue, model.relationships))
    .map((item) => {
      const itemEvents = relatedEvents(item.name, model.events);
      return {
        id: item.id,
        canonical_key: item.canonical_key,
        name: item.name,
        type: item.type,
        project: projectNameValue,
        status: statusForWorkItem(item, itemEvents),
        visibility: item.visibility || "primary",
        recent_updates: itemEvents.slice(-3).reverse().map(formatUpdate),
      };
    });

  return status ? workItems.filter((item) => matchesStatus(item.status, status)) : workItems;
}

async function getContext(projectName) {
  const model = await buildReadModel();
  const projects = await getProjects();
  const project = findProject(model, projectName) || projects[0] || null;
  const projectNameValue = project?.name || projectName || "";
  const projectEvents = model.events.filter((event) => !projectNameValue || event.target === projectNameValue || event.details?.project === projectNameValue);
  const openWorkItems = await getWorkItems(projectNameValue, "open");
  const workflows = (await getWorkflows()).filter((workflow) => !projectNameValue || workflow.project === projectNameValue || workflow.name === projectNameValue);

  return {
    project: project
      ? {
          id: project.id,
          canonical_key: project.canonical_key,
          name: project.name,
          status: statusForProject(project, model),
        }
      : null,
    open_work_items: openWorkItems,
    recent_updates: projectEvents.slice(-8).reverse().map(formatUpdate),
    known_agents: knownAgents(projectNameValue, model),
    known_artifacts: knownArtifacts(projectNameValue, model),
    needs_attention: needsAttention(projectNameValue, model),
    active_workflows: workflows,
    current_stages: workflows.map((workflow) => ({ workflow: workflow.name, stage: workflow.current_stage, status: workflow.stage_status })),
    open_human_actions: workflows.flatMap((workflow) => workflow.open_human_actions.map((action) => ({ workflow: workflow.name, action }))),
    outputs_ready_for_review: workflows.flatMap((workflow) => workflow.outputs_ready.map((output) => ({ workflow: workflow.name, ...output }))),
    canonical_objects: model.entities
      .filter((entity) => entity.visibility !== "debug")
      .filter((entity) => isPrimaryObject(entity) || entity.type === "Agent")
      .slice(-20)
      .reverse()
      .map(canonicalObject),
  };
}

async function getWorkflows() {
  const model = await buildReadModel();
  const byName = new Map();

  for (const report of model.reports) {
    const workflow = report.workflow;
    if (!workflow?.name) {
      continue;
    }
    const key = workflow.name.toLowerCase();
    const existing = byName.get(key) || emptyWorkflow(workflow.name, report.project);
    const reportTimestamp = Date.parse(report.timestamp || report.received_at || "");
    const existingStageTimestamp = Date.parse(existing.stage_updated_at || "");
    const reportIsNewerStage = !Number.isFinite(existingStageTimestamp) || (Number.isFinite(reportTimestamp) && reportTimestamp >= existingStageTimestamp);
    existing.project = report.project || existing.project;
    existing.objective = workflow.objective || existing.objective;
    existing.trigger = workflow.trigger || existing.trigger;
    if (reportIsNewerStage) {
      existing.current_stage = canonicalWorkflowState(workflow.stage_status || workflow.stage || workflow.next_stage || existing.current_stage);
      existing.stage_status = canonicalWorkflowState(workflow.stage_status || workflow.stage || existing.stage_status);
      existing.next_stage = workflow.next_stage || existing.next_stage;
      existing.stage_updated_at = report.timestamp || report.received_at || existing.stage_updated_at;
    }
    existing.last_update = report.timestamp || report.received_at || existing.last_update;
    existing.recent_activity.unshift(formatReportActivity(report));
    for (const stage of workflow.stages || []) {
      mergeStage(existing.stages, stage);
      if (stage.agent) existing.agents.add(stage.agent);
      if (stage.output) {
        existing.outputs.set(stage.output, mergeOutput(existing.outputs.get(stage.output), {
          name: stage.output,
          type: "Output",
          status: "produced",
          artifacts: report.artifacts,
        }, report));
      }
    }
    existing.agents.add(report.agent_name);
    for (const output of report.outputs || []) {
      existing.outputs.set(output.name, mergeOutput(existing.outputs.get(output.name), output, report));
    }
    byName.set(key, existing);
  }

  return [...byName.values()].map(finalizeWorkflow);
}

function mergeOutput(existing = {}, next = {}, report = {}) {
  const existingTimestamp = Date.parse(existing.updated_at || existing.updatedAt || "");
  const nextTimestamp = Date.parse(report.timestamp || report.received_at || "");
  const existingIsNewer = Number.isFinite(existingTimestamp) && Number.isFinite(nextTimestamp) && existingTimestamp > nextTimestamp;
  const selected = existingIsNewer ? existing : { ...existing, ...next };
  const documents = Object.prototype.hasOwnProperty.call(next, "documents")
    ? dedupeDocuments(next.documents || [])
    : dedupeDocuments(existing.documents || []);
  const artifacts = dedupeNames([...(existing.artifacts || []), ...(next.artifacts || [])]);
  return {
    ...selected,
    artifacts,
    documents: existingIsNewer ? dedupeDocuments(existing.documents || []) : documents,
    summary: existingIsNewer ? existing.summary || "" : next.summary || existing.summary || "",
    url: existingIsNewer ? existing.url || "" : next.url || existing.url || "",
    updated_at: existingIsNewer ? existing.updated_at || existing.updatedAt || "" : report.timestamp || report.received_at || existing.updated_at || "",
  };
}

function isDeprecatedOpportunityShortlistName(name = "") {
  return /^opportunity[-\s]shortlist(?:\.(?:md|json|csv))?$/i.test(String(name).trim());
}

function dedupeDocuments(documents) {
  const seen = new Set();
  return documents.filter((document) => {
    if (isDeprecatedOpportunityShortlistName(document?.name)) {
      return false;
    }
    const key = `${document?.name || ""}::${document?.url || ""}::${document?.mime_type || ""}`.toLowerCase();
    if (!document?.name || seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

function dedupeNames(values) {
  const seen = new Set();
  return values.filter((value) => {
    const key = String(value || "").trim().toLowerCase();
    if (!key || seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

async function getWorkflow(id) {
  const key = String(id || "").toLowerCase();
  return (await getWorkflows()).find((workflow) => workflow.id === key || workflow.name.toLowerCase() === key || workflow.canonical_key === key) || null;
}

async function searchObjects(query) {
  const model = await buildReadModel();
  const q = String(query || "").trim().toLowerCase();
  if (!q) {
    return [];
  }
  return model.entities
    .map((entity) => ({
      ...canonicalObject(entity),
      confidence: scoreEntity(entity, q),
    }))
    .filter((entity) => entity.confidence > 0)
    .sort((left, right) => right.confidence - left.confidence)
    .slice(0, 10);
}

function canonicalObject(entity) {
  return {
    id: entity.id,
    canonical_key: entity.canonical_key,
    name: entity.name,
    type: entity.type,
    visibility: entity.visibility || "primary",
  };
}

function knownAgents(projectName, model) {
  const agentNames = new Set(
    model.events
      .filter((event) => !projectName || event.details?.project === projectName || event.target === projectName)
      .map((event) => event.details?.agent_name)
      .filter(Boolean)
  );
  return model.entities.filter((entity) => entity.type === "Agent" && agentNames.has(entity.name)).map(canonicalObject);
}

function knownArtifacts(projectName, model) {
  const artifactNames = new Set(
    model.events
      .filter((event) => !projectName || event.details?.project === projectName || event.target === projectName)
      .flatMap((event) => event.details?.artifacts || [])
  );
  return model.entities.filter((entity) => entity.type === "Artifact" && artifactNames.has(entity.name)).map(canonicalObject);
}

function needsAttention(projectName, model) {
  const terminalWorkflowTimestamps = latestTerminalWorkflowTimestamps(model.events);
  return model.events
    .filter((event) => !projectName || event.target === projectName || event.details?.project === projectName)
    .filter((event) => {
      const workflowName = event.details?.workflow?.name || event.details?.workflow_name;
      const terminalTimestamp = terminalWorkflowTimestamps.get(String(workflowName || "").toLowerCase());
      if (terminalTimestamp && Date.parse(event.timestamp || "") <= terminalTimestamp) {
        return false;
      }
      const text = `${event.type || ""} ${event.details?.status || ""} ${event.details?.summary || ""}`.toLowerCase();
      return text.includes("block") || text.includes("review") || text.includes("failed") || Number(event.details?.confidence || 1) < 0.8;
    })
    .slice(-8)
    .reverse()
    .map(formatUpdate);
}

function latestTerminalWorkflowTimestamps(events) {
  const terminalByWorkflow = new Map();
  for (const event of events) {
    const workflow = event.details?.workflow;
    const workflowName = workflow?.name || event.details?.workflow_name;
    if (!workflowName) {
      continue;
    }
    const state = canonicalWorkflowState(workflow?.stage_status || workflow?.stage || event.details?.status || "");
    if (!["approved", "completed", "canceled"].includes(state)) {
      continue;
    }
    const timestamp = Date.parse(event.timestamp || "");
    if (!Number.isFinite(timestamp)) {
      continue;
    }
    const key = String(workflowName).toLowerCase();
    terminalByWorkflow.set(key, Math.max(terminalByWorkflow.get(key) || 0, timestamp));
  }
  return terminalByWorkflow;
}

function findProject(model, projectName) {
  const projects = model.entities.filter((entity) => isPrimaryObject(entity));
  return projects.find((project) => sameName(project.name, projectName)) || projects[0] || null;
}

function isPrimaryObject(entity) {
  return ["Workflow", "Project", "Goal", "System", "Asset", "Dashboard", "Application", "DataSource", "Dataset", "Process"].includes(entity.type) && (entity.visibility || "primary") === "primary";
}

function isRelatedToProject(name, projectName, relationships) {
  return relationships.some((relationship) =>
    ((sameName(relationship.source, name) && sameName(relationship.target, projectName)) ||
      (sameName(relationship.target, name) && sameName(relationship.source, projectName))) &&
    ["belongs_to", "reported_on", "run_for", "related_to"].includes(relationship.relation)
  );
}

function relatedEvents(name, events) {
  return events.filter((event) => event.details?.action_target === name || event.target === name || event.details?.work_items?.includes(name));
}

function formatUpdate(event) {
  return {
    type: event.type,
    label: titleize(event.type || "Update"),
    target: event.details?.action_target || event.target,
    timestamp: event.timestamp,
    summary: event.details?.summary || "",
    source: event.details?.source || "unknown",
    agent_name: event.details?.agent_name,
    report_id: event.details?.report_id,
  };
}

function statusForProject(project, model) {
  return needsAttention(project.name, model).length ? "needs_attention" : "active";
}

function statusForWorkItem(_item, events) {
  const text = events.map((event) => `${event.type || ""} ${event.details?.status || ""} ${event.details?.summary || ""}`).join(" ").toLowerCase();
  if (text.includes("block") || text.includes("failed")) {
    return "blocked";
  }
  if (text.includes("complete") || text.includes("completed")) {
    return "complete";
  }
  return "open";
}

function emptyWorkflow(name, project) {
  return {
    id: slug(name),
    canonical_key: `workflow:${slug(name)}`,
    name,
    project,
    objective: "",
    status: "active",
    current_stage: "",
    stage_status: "reported",
    next_stage: "",
    stages: [],
    agents: new Set(),
    outputs: new Map(),
    open_human_actions: [],
    recent_activity: [],
    last_update: "",
    stage_updated_at: "",
    trigger: null,
  };
}

function mergeStage(stages, stage) {
  const existing = stages.find((item) => sameName(item.name, stage.name));
  const next = {
    name: stage.name,
    status: stage.status || "reported",
    agent: stage.agent || "",
    input: stage.input || "",
    output: stage.output || "",
  };
  if (existing) {
    Object.assign(existing, { ...next, ...existing, ...next });
    stages.splice(stages.indexOf(existing), 1);
    stages.push(existing);
  } else {
    stages.push(next);
  }
}

function finalizeWorkflow(workflow) {
  const stages = workflow.stages;
  const current = stages.find((stage) => sameName(stage.status, workflow.stage_status) || sameName(stage.name, workflow.current_stage)) || stages.at(-1);
  const outputs = [...workflow.outputs.values()].filter((output) => !isDeprecatedOpportunityShortlistName(output.name));
  const state = canonicalWorkflowState(current?.status || workflow.stage_status || "in_progress");
  const needsHuman = ["blocked", "failed", "needs_review", "revision_requested"].includes(state);
  const outputsReady = needsHuman ? outputs.filter((output) => {
    const status = String(output.status || "");
    return status.includes("review") || status.includes("ready") || status.includes("revision") || status.includes("rejected");
  }) : [];
  const status = titleize(state);

  const agents = [...workflow.agents].filter(Boolean).filter((agent) => !/human/i.test(agent));

  return {
    ...workflow,
    current_stage: titleize(state),
    stage_status: state,
    status,
    agents,
    agent_count: agents.length,
    outputs,
    outputs_ready: outputsReady,
    outputs_ready_count: outputsReady.length,
    open_human_actions: humanActionsForWorkflow(workflow, current, outputsReady),
    stages,
    recent_activity: workflow.recent_activity.slice(0, 8),
  };
}

function humanActionsForWorkflow(workflow, waitingStage, outputsReady) {
  const actions = [];
  if (!["blocked", "failed", "needs_review", "revision_requested"].includes(waitingStage?.status)) {
    return actions;
  }
  if (waitingStage?.status === "revision_requested") {
    actions.push(`Resolve requested revision for ${waitingStage.output || outputsReady[0]?.name || "workflow output"}`);
  }
  if (waitingStage && /human/i.test(waitingStage.agent || waitingStage.name)) {
    actions.push(`Review ${waitingStage.input || outputsReady[0]?.name || "workflow output"}`);
  }
  for (const output of outputsReady) {
    actions.push(`Review ${output.name}`);
  }
  return [...new Set(actions)].slice(0, 4);
}

function isWaitingStatus(stageName, stages) {
  return stages.some((stage) => sameName(stage.name, stageName) && stage.status === "waiting");
}

function canonicalWorkflowState(value) {
  const normalized = String(value || "in_progress").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
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

function formatReportActivity(report) {
  const isManual = report.source === "manual";
  return {
    type: isManual ? "WorkflowUpdated" : "AgentReport",
    label: isManual ? "Operator Update" : "Agent Report",
    target: report.workflow?.name || report.project,
    timestamp: report.timestamp || report.received_at,
    summary: report.message,
    source: report.source || "agent",
    agent_name: isManual ? "" : report.agent_name,
    report_id: report.id,
    stage: report.workflow?.stage || "",
    status: report.workflow?.stage_status || report.status,
  };
}

function matchesStatus(actual, requested) {
  const value = String(requested || "").toLowerCase();
  if (value === "open") {
    return ["open", "blocked"].includes(actual);
  }
  return actual === value;
}

function scoreEntity(entity, query) {
  const name = entity.name.toLowerCase();
  const key = String(entity.canonical_key || "").toLowerCase();
  if (name === query || key === query) return 1;
  if (name.includes(query) || key.includes(query)) return 0.91;
  const tokens = query.split(/\s+/).filter(Boolean);
  const hits = tokens.filter((token) => name.includes(token) || key.includes(token)).length;
  return tokens.length && hits ? Math.max(0.45, hits / tokens.length) : 0;
}

function mergeEntity(entities, entity) {
  const existing = entities.find((item) => item.canonical_key === entity.canonical_key);
  if (existing) {
    Object.assign(existing, { ...entity, id: existing.id });
  } else {
    entities.push(entity);
  }
}

function relationshipKey(relationship) {
  return [relationship.source, relationship.relation, relationship.target].map((part) => String(part || "").toLowerCase()).join("::");
}

function sameName(left, right) {
  return String(left || "").toLowerCase() === String(right || "").toLowerCase();
}

function titleize(value) {
  return String(value || "")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function slug(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

module.exports = {
  buildReadModel,
  getContext,
  getProjects,
  getWorkflow,
  getWorkflows,
  getWorkItems,
  searchObjects,
};
