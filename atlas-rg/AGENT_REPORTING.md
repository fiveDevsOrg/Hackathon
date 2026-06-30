# Atlas Agent Reporting

Atlas accepts structured observations from coding agents through `/api/report`.
Agents do not write the world model directly. They report what happened, Atlas stores the report in an inbox, then normalizes it into objects, relationships, and timeline activity.

## Required Environment

```bash
ATLAS_URL=http://localhost:5173
ATLAS_AGENT_API_KEY=dev-atlas-key
ATLAS_AGENT_ID=codex-cli
ATLAS_AGENT_NAME="Codex CLI"
ATLAS_PROJECT=Atlas
```

Copy `atlas.agent.config.example.json` to `atlas.agent.config.json` when an agent needs local defaults.

## Payload Shape

```json
{
  "source": "agent",
  "agent_id": "codex-cli",
  "agent_name": "Codex CLI",
  "project": "Atlas",
  "message": "Fixed object page UI.",
  "status": "completed",
  "artifacts": ["src/pages/ObjectDetail.tsx"],
  "events": [
    {
      "type": "TaskCompleted",
      "target": "Fix object page UI"
    }
  ],
  "confidence": 0.9
}
```

## Plug-And-Play Agent Registry

Atlas also supports explicit registration for generic HTTP/Webhook agents. This is the preferred path for new agents because Atlas can show the agent, trigger runs, track run history, and receive callbacks through one standard contract.

Register an agent:

```bash
curl -sS -X POST "$ATLAS_URL/api/agents" \
  -H "Content-Type: application/json" \
  -d '{
    "agent_id": "research-agent",
    "agent_name": "Research Agent",
    "provider": "http",
    "type": "http_webhook",
    "description": "Runs research workflows and returns reviewable artifacts.",
    "capabilities": ["research", "markdown_report", "human_review"],
    "output_types": ["markdown", "json", "csv"],
    "run_endpoint": "https://example.com/run",
    "control_endpoint": "https://example.com/control",
    "default_project": "Research Pipeline",
    "requires_review": true
  }'
```

List registered agents:

```bash
curl -sS "$ATLAS_URL/api/agents"
```

Trigger a run:

```bash
curl -sS -X POST "$ATLAS_URL/api/agents/research-agent/runs" \
  -H "Content-Type: application/json" \
  -d '{"inputs":{"topic":"billing operations"}}'
```

When Atlas triggers an HTTP/Webhook agent, it sends:

```json
{
  "run_id": "run_...",
  "agent_id": "research-agent",
  "agent_name": "Research Agent",
  "project": "Research Pipeline",
  "workflow_name": "Research Pipeline",
  "inputs": {},
  "callback": {
    "report_url": "https://atlas.example/api/agent-runs/run_.../report",
    "control_url": "https://atlas.example/api/agent-runs/run_.../control",
    "auth_header": "x-atlas-api-key"
  }
}
```

Report run progress or outputs back to Atlas:

```bash
curl -sS -X POST "$ATLAS_URL/api/agent-runs/$RUN_ID/report" \
  -H "Content-Type: application/json" \
  -H "x-atlas-api-key: $ATLAS_AGENT_API_KEY" \
  -d '{
    "status": "needs_review",
    "stage": "Human Review",
    "message": "Model analysis is ready.",
    "outputs": [{
      "name": "model-analysis.md",
      "type": "markdown",
      "status": "ready_for_review",
      "documents": [{
        "name": "model-analysis.md",
        "mime_type": "text/markdown",
        "content": "# Analysis"
      }]
    }],
    "events": [{"type":"TaskCompleted","target":"Research billing operations"}],
    "confidence": 0.87
  }'
```

Send operator control back to a run:

```bash
curl -sS -X POST "$ATLAS_URL/api/agent-runs/$RUN_ID/control" \
  -H "Content-Type: application/json" \
  -d '{"type":"rerun","feedback":"Focus on B2B workflow pain."}'
```

## Curl Example

```bash
curl -sS -X POST "$ATLAS_URL/api/report" \
  -H "Content-Type: application/json" \
  -H "x-atlas-api-key: $ATLAS_AGENT_API_KEY" \
  -d '{"source":"agent","agent_id":"codex-cli","agent_name":"Codex CLI","project":"Atlas","message":"Fixed object page UI.","status":"completed","artifacts":["src/pages/ObjectDetail.tsx"],"events":[{"type":"TaskCompleted","target":"Fix object page UI"}],"confidence":0.9}'
```

## Npm Example

```bash
npm run atlas:context
npm run atlas:search -- --q "object detail"
npm run atlas:work-items -- --project Atlas --status open
npm run atlas:report -- --message "Fixed object page UI" --status completed --project Atlas --artifact src/pages/ObjectDetail.tsx
```

Dry-run without posting:

```bash
npm run atlas:report -- --dry-run --message "Fixed object page UI" --status completed --project Atlas --artifact src/pages/ObjectDetail.tsx
```

## Triggerable Agents

Atlas can still proxy a workflow trigger to the Opportunity Discovery Agent when `OPPORTUNITY_AGENT_URL` is configured:

```bash
curl -sS -X POST "$ATLAS_URL/api/agents/opportunity-discovery/run" \
  -H "Content-Type: application/json" \
  -d '{"feeds":["topstories","askstories","showstories"],"limit":50,"include_comments":true,"max_comments_per_story":20}'
```

## When To Report

- Report after completing a scoped task.
- Report when changing files or behavior that Atlas should remember.
- Report blocked work as `blocked`.
- Report operator-review work as `needs_review`.
- Use canonical workflow statuses: `queued`, `assigned`, `in_progress`, `blocked`, `needs_review`, `revision_requested`, `approved`, `completed`, `failed`, `canceled`.
- Include changed artifacts when they help future navigation.

## What Not To Report

- Do not report secrets, API keys, tokens, or private credentials.
- Do not report noisy intermediate steps that produced no durable change.
- Do not write directly to `world_model.json`.
- Do not invent project state that was not observed.
