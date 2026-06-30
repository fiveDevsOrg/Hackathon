export type AtlasReportEvent = {
  type: string;
  target: string;
  timestamp?: string;
  summary?: string;
  details?: Record<string, unknown>;
};

export type AtlasReportInput = {
  atlasUrl: string;
  apiKey: string;
  agentId: string;
  agentName: string;
  project: string;
  message: string;
  status: string;
  artifacts?: string[];
  events?: AtlasReportEvent[];
  confidence?: number;
  timestamp?: string;
};

export async function reportToAtlas(input: AtlasReportInput) {
  const {
    atlasUrl,
    apiKey,
    agentId,
    agentName,
    project,
    message,
    status,
    artifacts = [],
    events = [],
    confidence,
    timestamp,
  } = input;

  if (!atlasUrl) {
    throw new Error("atlasUrl is required.");
  }
  if (!apiKey) {
    throw new Error("apiKey is required.");
  }
  if (!agentId || !agentName) {
    throw new Error("agentId and agentName are required.");
  }
  if (!message) {
    throw new Error("message is required.");
  }

  const response = await fetch(`${atlasUrl.replace(/\/+$/, "")}/api/report`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-atlas-api-key": apiKey,
    },
    body: JSON.stringify({
      source: "agent",
      agent_id: agentId,
      agent_name: agentName,
      project,
      message,
      status,
      artifacts,
      events,
      confidence,
      timestamp,
    }),
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload.message || payload.error || `Atlas report failed with ${response.status}.`);
  }

  return payload;
}
