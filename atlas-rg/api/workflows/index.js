const { isAuthorized } = require("../shared/agent-report");
const { jsonResponse, withCors } = require("../shared/http");
const { getWorkflow, getWorkflows } = require("../shared/read-model");

module.exports = async function(context, req) {
  if (req.method === "OPTIONS") {
    context.res = withCors(204, "");
    return;
  }

  if (!isAuthorized(req)) {
    context.res = jsonResponse(401, {
      error: "Unauthorized",
      message: "Missing or invalid x-atlas-api-key.",
    });
    return;
  }

  const id = req.params?.id || req.query?.id || "";
  if (id) {
    const workflow = await getWorkflow(id);
    context.res = workflow ? jsonResponse(200, { workflow }) : jsonResponse(404, { error: "Workflow not found" });
    return;
  }

  context.res = jsonResponse(200, {
    workflows: await getWorkflows(),
  });
};
