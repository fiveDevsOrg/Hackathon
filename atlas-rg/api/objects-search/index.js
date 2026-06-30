const { isAuthorized } = require("../shared/agent-report");
const { jsonResponse, withCors } = require("../shared/http");
const { searchObjects } = require("../shared/read-model");

module.exports = async function(context, req) {
  if (req.method === "OPTIONS") {
    context.res = withCors(204, "");
    return;
  }
  if (!isAuthorized(req)) {
    context.res = jsonResponse(401, { error: "Unauthorized", message: "Missing or invalid x-atlas-api-key." });
    return;
  }
  context.res = jsonResponse(200, { results: await searchObjects(req.query?.q || "") });
};
