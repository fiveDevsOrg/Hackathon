const { buildInboxReport, inboxSummary, isAgentReport, isAuthorized, storeReport } = require("../shared/agent-report");
const { jsonResponse, withCors } = require("../shared/http");

module.exports = async function(context, req) {
  if (req.method === "OPTIONS") {
    context.res = withCors(204, "");
    return;
  }

  if (req.method === "GET") {
    context.res = jsonResponse(200, await inboxSummary());
    return;
  }

  if (isAgentReport(req.body || {}) && !isAuthorized(req)) {
    context.res = jsonResponse(401, {
      accepted: false,
      error: "Unauthorized",
      message: "Missing or invalid x-atlas-api-key.",
    });
    return;
  }

  const body = req.body || {};
  if (!body.message && !Array.isArray(body.events)) {
    context.res = jsonResponse(400, {
      accepted: false,
      error: "message or events are required",
    });
    return;
  }

  const report = await storeReport(buildInboxReport(body));
  context.res = jsonResponse(202, {
    accepted: true,
    report_id: report.id,
    objects_updated: report.processing_result.objects_updated,
    events_created: report.processing_result.events_created,
    extraction: report.processing_result.extraction,
    report,
    message: report.source === "manual" ? "Operator update accepted and processed." : "Agent report accepted and processed.",
  });
};
