const { deleteAgent, getAgent, getAgentContractTemplate, listAgents, registerAgent } = require("../shared/agent-registry");
const { jsonResponse, withCors } = require("../shared/http");

module.exports = async function(context, req) {
  if (req.method === "OPTIONS") {
    context.res = withCors(204, "");
    return;
  }

  try {
    const id = req.params?.id || req.query?.id || "";

    if (req.method === "GET") {
      if (id === "contract-template") {
        context.res = jsonResponse(200, {
          template: getAgentContractTemplate(),
        });
        return;
      }
      if (id) {
        const agent = await getAgent(id);
        context.res = agent ? jsonResponse(200, { agent }) : jsonResponse(404, { error: "Agent not found" });
        return;
      }
      context.res = jsonResponse(200, { agents: await listAgents() });
      return;
    }

    if (req.method === "POST") {
      const agent = await registerAgent(req.body || {});
      context.res = jsonResponse(202, {
        accepted: true,
        agent,
      });
      return;
    }

    if (req.method === "DELETE") {
      if (!id) {
        context.res = jsonResponse(400, { error: "Agent id is required." });
        return;
      }
      const agent = await deleteAgent(id);
      context.res = jsonResponse(200, {
        deleted: true,
        agent,
      });
      return;
    }

    context.res = jsonResponse(405, { error: "Method not allowed" });
  } catch (error) {
    context.res = jsonResponse(error.status || 500, {
      accepted: false,
      error: error.message || "Agent registry request failed.",
    });
  }
};
