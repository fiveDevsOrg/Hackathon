const { isAuthorized } = require("../shared/agent-report");
const { controlAgentRun, reportAgentRun } = require("../shared/agent-registry");
const { jsonResponse, withCors } = require("../shared/http");

module.exports = async function(context, req) {
  if (req.method === "OPTIONS") {
    context.res = withCors(204, "");
    return;
  }

  try {
    const runId = req.params?.run_id || req.query?.run_id || "";
    const action = String(req.params?.action || req.query?.action || "").toLowerCase();
    if (!runId) {
      context.res = jsonResponse(400, { error: "Run id is required." });
      return;
    }

    if (action === "report") {
      if (process.env.ATLAS_AGENT_API_KEY && !isAuthorized(req)) {
        context.res = jsonResponse(401, {
          accepted: false,
          error: "Unauthorized",
          message: "Missing or invalid x-atlas-api-key.",
        });
        return;
      }
      const result = await reportAgentRun(runId, req.body || {});
      context.res = jsonResponse(202, {
        accepted: true,
        run: result.run,
        report_id: result.report.id,
        report: result.report,
      });
      return;
    }

    if (action === "control") {
      const result = await controlAgentRun(runId, req.body || {});
      context.res = jsonResponse(202, {
        accepted: true,
        run: result.run,
        control: result.control,
      });
      return;
    }

    context.res = jsonResponse(404, { error: "Unknown run action." });
  } catch (error) {
    context.res = jsonResponse(error.status || 500, {
      accepted: false,
      error: error.message || "Agent run event failed.",
    });
  }
};
