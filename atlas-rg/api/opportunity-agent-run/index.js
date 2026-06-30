const { jsonResponse, withCors } = require("../shared/http");

const DEFAULT_SCAN = {
  feeds: ["topstories", "askstories", "showstories"],
  limit: 50,
  include_comments: true,
  max_comments_per_story: 20,
};

module.exports = async function(context, req) {
  if (req.method === "OPTIONS") {
    context.res = withCors(204, "");
    return;
  }

  const agentUrl = String(process.env.OPPORTUNITY_AGENT_URL || "").replace(/\/+$/, "");
  if (!agentUrl) {
    context.res = jsonResponse(424, {
      accepted: false,
      error: "Opportunity agent URL is not configured.",
      required_setting: "OPPORTUNITY_AGENT_URL",
    });
    return;
  }

  const body = {
    ...DEFAULT_SCAN,
    ...(req.body && typeof req.body === "object" ? req.body : {}),
  };

  try {
    const response = await fetch(`${agentUrl}/scan/hackernews/background`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    const text = await response.text();
    const payload = parseJson(text);
    context.res = jsonResponse(response.ok ? 202 : response.status, {
      accepted: response.ok,
      agent_url: agentUrl,
      request: body,
      response: payload || text,
    });
  } catch (error) {
    context.res = jsonResponse(502, {
      accepted: false,
      error: error.message || "Opportunity agent request failed.",
    });
  }
};

function parseJson(value) {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}
