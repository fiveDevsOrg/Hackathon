const DEFAULT_MODEL_TIMEOUT_MS = 20000;

async function extractWorkflowCommandIntent({ rawInput, updateText, workflow, workflows, canonicalStates, canonicalSequence }) {
  const fallback = deterministicIntent(updateText || rawInput, workflow);
  if (!process.env.ATLAS_MODEL_ENDPOINT) {
    return fallback;
  }

  try {
    const payload = await callModel({
      rawInput,
      updateText,
      workflow,
      workflows,
      canonicalStates,
      canonicalSequence,
    });
    return normalizeIntent(payload, fallback);
  } catch {
    return fallback;
  }
}

async function callModel({ rawInput, updateText, workflow, workflows, canonicalStates, canonicalSequence }) {
  const provider = process.env.ATLAS_MODEL_PROVIDER || "ollama";
  if (provider === "openai-compatible") {
    return callOpenAiCompatibleModel({ rawInput, updateText, workflow, workflows, canonicalStates, canonicalSequence });
  }
  if (provider === "pollinations") {
    return callPollinationsModel({ rawInput, updateText, workflow, workflows, canonicalStates, canonicalSequence });
  }
  return callOllamaModel({ rawInput, updateText, workflow, workflows, canonicalStates, canonicalSequence });
}

async function callOpenAiCompatibleModel(context) {
  const endpoint = trimTrailingSlash(process.env.ATLAS_MODEL_ENDPOINT);
  const response = await fetchWithTimeout(`${endpoint}/v1/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...authHeaders(),
    },
    body: JSON.stringify({
      model: process.env.ATLAS_MODEL_NAME || "gpt-4o-mini",
      temperature: 0,
      response_format: { type: "json_object" },
      messages: buildMessages(context),
    }),
  });
  const payload = await parseJsonResponse(response);
  return parseLooseJson(payload.choices?.[0]?.message?.content || "");
}

async function callPollinationsModel(context) {
  const endpoint = trimTrailingSlash(process.env.ATLAS_MODEL_ENDPOINT);
  const response = await fetchWithTimeout(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...authHeaders(),
    },
    body: JSON.stringify({
      model: process.env.ATLAS_MODEL_NAME || "openai",
      temperature: 0,
      messages: buildMessages(context),
    }),
  });
  const payload = await parseJsonResponse(response);
  return parseLooseJson(payload.choices?.[0]?.message?.content || "");
}

async function callOllamaModel(context) {
  const endpoint = trimTrailingSlash(process.env.ATLAS_MODEL_ENDPOINT);
  const response = await fetchWithTimeout(`${endpoint}/api/chat`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...authHeaders(),
    },
    body: JSON.stringify({
      model: process.env.ATLAS_MODEL_NAME || "qwen3:8b",
      stream: false,
      format: "json",
      options: { temperature: 0 },
      messages: buildMessages(context),
    }),
  });
  const payload = await parseJsonResponse(response);
  return parseLooseJson(payload.message?.content || payload.response || payload.content || "");
}

function buildMessages({ rawInput, updateText, workflow, workflows, canonicalStates, canonicalSequence }) {
  return [
    {
      role: "system",
      content: [
        "You are Atlas command intent parser.",
        "Return JSON only. Do not include markdown.",
        "You do not mutate data. You only classify a workflow command.",
        "Allowed intents: advance_workflow, set_workflow_status, update_workflow.",
        "If the user asks to move to the next stage, set transition to next.",
        "If the user says approved, blocked, complete, failed, canceled, needs review, revision requested, queued, assigned, or in progress, set status to the matching canonical state.",
        "Use only canonical workflow states supplied by the user payload.",
        "Shape: {\"intent\":\"advance_workflow|set_workflow_status|update_workflow\",\"workflow_name\":\"string\",\"transition\":\"next|\",\"status\":\"canonical state or empty\",\"summary\":\"short operator summary\",\"confidence\":0.0}",
      ].join("\n"),
    },
    {
      role: "user",
      content: JSON.stringify({
        raw_input: rawInput,
        update_text: updateText,
        selected_workflow: workflow,
        workflows,
        canonical_states: canonicalStates,
        canonical_sequence: canonicalSequence,
      }),
    },
  ];
}

function deterministicIntent(updateText, workflow) {
  const status = inferStatus(updateText, workflow);
  const transition = /\b(next stage|next step|move forward|advance|advance it|advance this)\b/i.test(updateText) ? "next" : "";
  return {
    intent: transition ? "advance_workflow" : "set_workflow_status",
    workflow_name: workflow?.name || "",
    transition,
    status,
    summary: String(updateText || "").trim(),
    confidence: transition || status ? 0.8 : 0.45,
    source: "deterministic",
  };
}

function normalizeIntent(payload, fallback) {
  const value = payload && typeof payload === "object" ? payload : {};
  return {
    ...fallback,
    intent: allowedIntent(value.intent) || fallback.intent,
    workflow_name: String(value.workflow_name || fallback.workflow_name || "").trim(),
    transition: String(value.transition || "").toLowerCase() === "next" ? "next" : fallback.transition,
    status: canonicalStatus(value.status || fallback.status),
    summary: String(value.summary || fallback.summary || "").trim(),
    confidence: Number.isFinite(Number(value.confidence)) ? Number(value.confidence) : fallback.confidence,
    source: "llm",
  };
}

function allowedIntent(value) {
  const intent = String(value || "").trim();
  return ["advance_workflow", "set_workflow_status", "update_workflow"].includes(intent) ? intent : "";
}

function inferStatus(updateText, workflow) {
  if (/\b(next stage|next step|move forward|advance|advance it|advance this)\b/i.test(updateText)) {
    return "";
  }
  if (/\b(blocked|stuck|waiting on dependency|cannot proceed)\b/i.test(updateText)) return "Blocked";
  if (/\b(revision requested|needs revision|rejected|send it back)\b/i.test(updateText)) return "Revision Requested";
  if (/\b(needs review|ready for review|pending review|human review)\b/i.test(updateText)) return "Needs Review";
  if (/\b(approved|accepted|signed off)\b/i.test(updateText)) return "Approved";
  if (/\b(failed|error|crashed)\b/i.test(updateText)) return "Failed";
  if (/\b(canceled|cancelled|stopped)\b/i.test(updateText)) return "Canceled";
  if (/\b(complete|completed|done)\b/i.test(updateText)) return "Completed";
  if (/\b(assigned|owner|owns)\b/i.test(updateText)) return "Assigned";
  if (/\b(queued|pending)\b/i.test(updateText)) return "Queued";
  if (/\b(move|start|started|working|running|continue|next)\b/i.test(updateText) || String(updateText || "").trim()) return "In Progress";
  return workflow?.status || workflow?.current_stage || "In Progress";
}

function canonicalStatus(value) {
  const normalized = String(value || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  const states = {
    queue: "Queued",
    queued: "Queued",
    pending: "Queued",
    assigned: "Assigned",
    claimed: "Assigned",
    "in progress": "In Progress",
    running: "In Progress",
    active: "In Progress",
    working: "In Progress",
    blocked: "Blocked",
    stuck: "Blocked",
    "needs review": "Needs Review",
    "need review": "Needs Review",
    waiting: "Needs Review",
    "waiting on human": "Needs Review",
    "human review": "Needs Review",
    review: "Needs Review",
    "needs revision": "Revision Requested",
    "revision requested": "Revision Requested",
    rejected: "Revision Requested",
    approved: "Approved",
    complete: "Completed",
    completed: "Completed",
    done: "Completed",
    failed: "Failed",
    error: "Failed",
    canceled: "Canceled",
    cancelled: "Canceled",
    stopped: "Canceled",
  };
  if (states[normalized]) {
    return states[normalized];
  }
  for (const [key, state] of Object.entries(states)) {
    if (normalized.includes(key)) {
      return state;
    }
  }
  return "";
}

async function fetchWithTimeout(url, options) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), Number(process.env.ATLAS_MODEL_TIMEOUT_MS || DEFAULT_MODEL_TIMEOUT_MS));
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

async function parseJsonResponse(response) {
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`Model endpoint returned ${response.status}: ${text.slice(0, 240)}`);
  }
  return parseLooseJson(text);
}

function parseLooseJson(value) {
  if (!value) return {};
  if (typeof value === "object") return value;
  try {
    return JSON.parse(value);
  } catch {
    const match = String(value).match(/\{[\s\S]*\}/);
    if (!match) {
      throw new Error("Model response did not include JSON.");
    }
    return JSON.parse(match[0]);
  }
}

function trimTrailingSlash(value) {
  return String(value || "").replace(/\/+$/, "");
}

function authHeaders() {
  if (!process.env.ATLAS_MODEL_API_KEY) {
    return {};
  }
  return {
    Authorization: `Bearer ${process.env.ATLAS_MODEL_API_KEY}`,
  };
}

module.exports = {
  extractWorkflowCommandIntent,
};
