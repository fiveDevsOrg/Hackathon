const { extractWorkflowCommandIntent } = require("../shared/command-intent");

module.exports = async function commandIntent(context, req) {
  if (req.method === "OPTIONS") {
    context.res = {
      status: 204,
      headers: corsHeaders(),
    };
    return;
  }

  try {
    const body = req.body || {};
    const rawInput = String(body.raw_input || body.rawInput || "");
    const updateText = String(body.update_text || body.updateText || rawInput);
    const workflow = body.workflow || {};
    const workflows = Array.isArray(body.workflows) ? body.workflows : [];

    const intent = await extractWorkflowCommandIntent({
      rawInput,
      updateText,
      workflow,
      workflows,
      canonicalStates: body.canonical_states || [],
      canonicalSequence: body.canonical_sequence || [],
    });

    context.res = {
      status: 200,
      headers: {
        ...corsHeaders(),
        "Content-Type": "application/json",
      },
      body: JSON.stringify(intent),
    };
  } catch (error) {
    context.res = {
      status: 200,
      headers: {
        ...corsHeaders(),
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        intent: "update_workflow",
        workflow_name: req.body?.workflow?.name || "",
        status: "",
        transition: "",
        summary: req.body?.update_text || req.body?.raw_input || "",
        confidence: 0.4,
        source: "deterministic",
        warning: error.message,
      }),
    };
  }
};

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };
}
