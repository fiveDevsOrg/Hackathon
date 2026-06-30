const { createAgentRun, getAgent } = require("../shared/agent-registry");
const { jsonResponse, withCors } = require("../shared/http");

module.exports = async function(context, req) {
  if (req.method === "OPTIONS") {
    context.res = withCors(204, "");
    return;
  }

  try {
    const id = req.params?.id || req.query?.id || "";
    if (!id) {
      context.res = jsonResponse(400, { error: "Agent id is required." });
      return;
    }

    if (req.method === "GET") {
      const agent = await getAgent(id);
      context.res = agent ? jsonResponse(200, { runs: agent.runs || [] }) : jsonResponse(404, { error: "Agent not found" });
      return;
    }

    if (req.method === "POST") {
      const run = await createAgentRun(id, req.body || {}, req);
      context.res = jsonResponse(202, {
        accepted: true,
        run,
      });
      return;
    }

    context.res = jsonResponse(405, { error: "Method not allowed" });
  } catch (error) {
    context.res = jsonResponse(error.status || 500, {
      accepted: false,
      error: error.message || "Agent run request failed.",
    });
  }
};
