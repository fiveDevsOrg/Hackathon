const DEFAULT_MODEL_TIMEOUT_MS = 45000;
const ENTITY_TYPES = [
  "Person",
  "Team",
  "Organization",
  "Project",
  "WorkItem",
  "AgentRun",
  "System",
  "Application",
  "DataSource",
  "Dataset",
  "Report",
  "Dashboard",
  "Process",
  "Concept",
  "Artifact",
  "Unknown",
];
const EVENT_TYPES = [
  "MeetingHeld",
  "FeedbackReceived",
  "RequestMade",
  "ChangeNeeded",
  "MeetingNeeded",
  "DependencyIdentified",
  "BlockerIdentified",
  "StatusChanged",
  "DecisionMentioned",
  "InformationLearned",
];

async function extractWorldUpdate({ rawInput }) {
  if (!isModelConfigured()) {
    throw new Error("ATLAS_MODEL_ENDPOINT is not configured.");
  }

  const modelPayload = await callModel({ rawInput });
  return {
    ...normalizeExtraction(modelPayload, rawInput),
    extractor: {
      mode: "private_model",
      provider: getProvider(),
      model: getModelName(),
    },
  };
}

function isModelConfigured() {
  return Boolean(process.env.ATLAS_MODEL_ENDPOINT);
}

async function callModel({ rawInput }) {
  if (getProvider() === "pollinations") {
    return callPollinationsModel({ rawInput });
  }

  if (getProvider() === "openai-compatible") {
    return callOpenAiCompatibleModel({ rawInput });
  }

  return callOllamaModel({ rawInput });
}

async function callPollinationsModel({ rawInput }) {
  const endpoint = trimTrailingSlash(process.env.ATLAS_MODEL_ENDPOINT);
  const response = await fetchWithTimeout(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...authHeaders(),
    },
    body: JSON.stringify({
      model: getModelName(),
      temperature: 0.1,
      messages: buildMessages(rawInput),
    }),
  });

  const payload = await parseJsonResponse(response);
  return parseLooseJson(payload.choices?.[0]?.message?.content || "");
}

async function callOllamaModel({ rawInput }) {
  const endpoint = trimTrailingSlash(process.env.ATLAS_MODEL_ENDPOINT);
  const response = await fetchWithTimeout(`${endpoint}/api/chat`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...authHeaders(),
    },
    body: JSON.stringify({
      model: getModelName(),
      stream: false,
      format: "json",
      options: { temperature: 0.1 },
      messages: buildMessages(rawInput),
    }),
  });

  const payload = await parseJsonResponse(response);
  return parseLooseJson(payload.message?.content || payload.response || payload.content || "");
}

async function callOpenAiCompatibleModel({ rawInput }) {
  const endpoint = trimTrailingSlash(process.env.ATLAS_MODEL_ENDPOINT);
  const response = await fetchWithTimeout(`${endpoint}/v1/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...authHeaders(),
    },
    body: JSON.stringify({
      model: getModelName(),
      temperature: 0.1,
      response_format: { type: "json_object" },
      messages: buildMessages(rawInput),
    }),
  });

  const payload = await parseJsonResponse(response);
  return parseLooseJson(payload.choices?.[0]?.message?.content || "");
}

function buildMessages(rawInput) {
  return [
    {
      role: "system",
      content: [
        "You extract changes into a minimal persistent world model.",
        "Return JSON only. Do not include markdown.",
        "Use only these top-level keys: entities, relationships, events.",
        "Do not create tasks, goals, risks, decisions, projects, meetings, documents, or workflows as top-level concepts.",
        `Entity shape: {"type":"${ENTITY_TYPES.join("|")}","name":"string"}. Use Unknown when no listed type fits.`,
        "Relationship shape: {\"source\":\"entity name\",\"relation\":\"verb_or_relation\",\"target\":\"entity name\"}.",
        "Use only these relationship names: owns, uses, depends_on, blocks, requested, provided_feedback_on, needs_change_to, replaces, belongs_to, responsible_for, related_to.",
        `Event shape: {"type":"${EVENT_TYPES.join("|")}","target":"entity name","timestamp":"ISO-8601 UTC timestamp","details":{"summary":"short reason","raw_input":"original user text"}}. Use InformationLearned when no listed event type fits.`,
        "Use the current timestamp for events when the user gives a relative date.",
        `Current timestamp: ${new Date().toISOString()}`,
      ].join("\n"),
    },
    {
      role: "user",
      content: rawInput,
    },
  ];
}

function normalizeExtraction(value, rawInput = "") {
  const entities = Array.isArray(value?.entities) ? value.entities : [];
  const relationships = Array.isArray(value?.relationships) ? value.relationships : [];
  const events = Array.isArray(value?.events) ? value.events : [];

  return {
    entities: entities
      .filter((entity) => entity?.name)
      .map((entity) => ({
        type: canonicalEntityType(entity.type),
        name: String(entity.name).trim(),
      })),
    relationships: relationships
      .filter((relationship) => relationship?.source && relationship?.target)
      .map((relationship) => ({
        source: String(relationship.source).trim(),
        relation: canonicalRelation(relationship.relation),
        target: String(relationship.target).trim(),
      })),
    events: events.map((event) => ({
      type: canonicalEventType(event.type),
      target: String(event.target || "").trim(),
      timestamp: event.timestamp || new Date().toISOString(),
      details: normalizeEventDetails(event.details, rawInput),
    })),
  };
}

function canonicalEntityType(value) {
  const normalized = normalizeTypeName(value);
  return ENTITY_TYPES.includes(normalized) ? normalized : "Unknown";
}

function canonicalEventType(value) {
  const normalized = normalizeTypeName(value);
  return EVENT_TYPES.includes(normalized) ? normalized : "InformationLearned";
}

function normalizeTypeName(value) {
  return String(value || "")
    .trim()
    .replace(/[^a-zA-Z0-9]+(.)/g, (_match, char) => char.toUpperCase())
    .replace(/^./, (char) => char.toUpperCase());
}

function normalizeEventDetails(details, rawInput) {
  const normalized = typeof details === "object" && details ? { ...details } : {};
  if (!normalized.summary) {
    normalized.summary = rawInput;
  }
  if (!normalized.raw_input) {
    normalized.raw_input = rawInput;
  }
  return normalized;
}

function canonicalRelation(value) {
  const relation = String(value || "related_to")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");

  if (!relation) {
    return "related_to";
  }

  const aliases = [
    [/^(requested|requests|asked_for|asks_for|wants|wanted|needs|requested_from)$/, "requested"],
    [/^(gave_feedback_on|provided_feedback_on|provided_feedback_for|gave_feedback_for|feedback_on|feedback_about|reviewed|commented_on)$/, "provided_feedback_on"],
    [/^(needs_change_to|needs_changes_to|requires_change_to|requires_changes_to|change_needed_for|change_required_for|update_needed_for|needs_update_to)$/, "needs_change_to"],
    [/^(uses|used|uses_system|uses_application|uses_source|connects_to|links_to|linked_to)$/, "uses"],
    [/^(replaces|replaced|supersedes|replaces_old|new_version_of)$/, "replaces"],
    [/^(belongs_to|part_of|member_of|under|within)$/, "belongs_to"],
    [/^(responsible_for|owner_of|accountable_for|assigned_to)$/, "responsible_for"],
    [/^(waiting_on|blocked_by|depends_on_response_from|pending_from|awaiting)$/, "waiting_on"],
    [/^(blocks|blocking|blocked)$/, "blocks"],
    [/^(owns|owned_by)$/, "owns"],
    [/^(depends_on|requires|blocked_by_dependency|needs_dependency)$/, "depends_on"],
  ];

  for (const [pattern, canonical] of aliases) {
    if (pattern.test(relation)) {
      return canonical;
    }
  }

  const allowed = new Set(["owns", "uses", "depends_on", "blocks", "requested", "provided_feedback_on", "needs_change_to", "replaces", "belongs_to", "responsible_for", "related_to"]);
  return allowed.has(relation) ? relation : "related_to";
}

async function fetchWithTimeout(url, options) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), Number(process.env.ATLAS_MODEL_TIMEOUT_MS || DEFAULT_MODEL_TIMEOUT_MS));

  try {
    return await fetch(url, {
      ...options,
      signal: controller.signal,
    });
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
  if (!value) {
    return {};
  }

  if (typeof value === "object") {
    return value;
  }

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

function getProvider() {
  return process.env.ATLAS_MODEL_PROVIDER || "ollama";
}

function getModelName() {
  return process.env.ATLAS_MODEL_NAME || "qwen3:8b";
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
  extractWorldUpdate,
};
