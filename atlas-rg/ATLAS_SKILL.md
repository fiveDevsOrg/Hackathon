# Atlas Agent Skill

Atlas is the operator visibility layer for agent work. Agents should read Atlas before naming work, then report factual updates as movement through a workflow.

## Required Environment

```bash
ATLAS_URL=https://proud-mud-0fff2710f.7.azurestaticapps.net
ATLAS_AGENT_API_KEY=...
ATLAS_AGENT_ID=codex-cli
ATLAS_AGENT_NAME="Codex CLI"
ATLAS_PROJECT=Atlas
```

## Read Before Write

1. Read current project context:

```bash
curl -sS "$ATLAS_URL/api/context?project=$ATLAS_PROJECT" \
  -H "x-atlas-api-key: $ATLAS_AGENT_API_KEY"
```

2. Search before naming an object:

```bash
curl -sS "$ATLAS_URL/api/objects/search?q=object%20detail" \
  -H "x-atlas-api-key: $ATLAS_AGENT_API_KEY"
```

3. Check open work:

```bash
curl -sS "$ATLAS_URL/api/work-items?project=$ATLAS_PROJECT&status=open" \
  -H "x-atlas-api-key: $ATLAS_AGENT_API_KEY"
```

4. Check workflows:

```bash
curl -sS "$ATLAS_URL/api/workflows" \
  -H "x-atlas-api-key: $ATLAS_AGENT_API_KEY"
```

5. Report after meaningful work:

```bash
curl -sS -X POST "$ATLAS_URL/api/report" \
  -H "Content-Type: application/json" \
  -H "x-atlas-api-key: $ATLAS_AGENT_API_KEY" \
  -d '{"source":"agent","agent_id":"opportunity-review-agent","agent_name":"Opportunity Review Agent","project":"Government Contract Pipeline","message":"Reviewed the candidate list and prepared a shortlist for operator review.","status":"needs_review","workflow":{"name":"Government Contract Pipeline","objective":"Find and shortlist government contract opportunities for operator review.","stage":"Needs Review","stage_status":"needs_review","stages":[{"name":"Needs Review","status":"needs_review","agent":"Opportunity Review Agent","output":"Government contract shortlist"}]},"outputs":[{"name":"Government contract shortlist","type":"Shortlist","status":"ready_for_review"}],"events":[{"type":"TaskCompleted","target":"Review government contract candidate list"}],"confidence":0.9}'
```

## Npm Helpers

```bash
npm run atlas:context
npm run atlas:search -- --q "object detail"
npm run atlas:work-items -- --project Atlas --status open
npm run atlas:report -- --message "Fixed UI" --status completed --project Atlas
```

## Workflow Reporting Rule

Agents report work as movement through a workflow, not isolated facts. A useful report includes:

- workflow name
- workflow objective
- current canonical status
- agent, input, output, and status
- outputs produced
- human action needed when applicable

Canonical workflow statuses:

- queued
- assigned
- in_progress
- blocked
- needs_review
- revision_requested
- approved
- completed
- failed
- canceled

Do not invent domain-specific workflow stages as first-class status values. Put domain detail in `message`, `events`, or `outputs`.

## Canonical Object Rule

Before introducing a project, work item, artifact, or agent name, search Atlas first. Reuse the closest canonical object when confidence is high. Do not create alternate names for the same thing.

Atlas returns canonical objects with:

```json
{
  "id": "obj_project_atlas_...",
  "canonical_key": "project:atlas",
  "name": "Atlas",
  "type": "Project",
  "visibility": "primary",
  "confidence": 0.91
}
```

## When To Report

- Report completed workflow work.
- Report blocked or failed work.
- Report changed artifacts that matter to future work.
- Report review-needed items.

## What Not To Report

- Do not report secrets or credentials.
- Do not report every intermediate shell command.
- Do not invent project names without searching.
- Do not write directly to Atlas storage.
