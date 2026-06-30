const { extractWorldUpdate } = require("../shared/extractor");

module.exports = async function(context, req) {
  if (req.method === "OPTIONS") {
    context.res = withCors(204, "");
    return;
  }

  const body = req.body || {};
  const rawInput = String(body.raw_input || body.rawInput || "").trim();

  if (!rawInput) {
    context.res = jsonResponse(400, {
      error: "raw_input is required",
    });
    return;
  }

  try {
    const extraction = await extractWorldUpdate({ rawInput });
    context.res = jsonResponse(200, extraction);
  } catch (error) {
    context.res = jsonResponse(502, {
      error: "LLM extraction failed",
      reason: error.message || "The configured model endpoint did not return a usable extraction.",
    });
  }
};

function jsonResponse(status, body) {
  return withCors(status, JSON.stringify(body), {
    "Content-Type": "application/json",
  });
}

function withCors(status, body, headers = {}) {
  return {
    status,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
      ...headers,
    },
    body,
  };
}
