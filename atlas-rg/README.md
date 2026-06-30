# Atlas World Model V0

Small proof of concept for a persistent local world model.

The app tracks only:

- Entities
- Relationships
- Events

It does not hardcode tasks, goals, projects, meetings, decisions, risks, workflows, or approvals.

## Behavior

1. Enter a natural-language update.
2. Atlas extracts entities, relationships, and events.
3. The browser merges the extraction into local world state.
4. The state can be queried and exported as `world_model.json`.

## Persistence

The running app persists state in browser localStorage under:

```text
atlas_world_model_v0
```

Use the Export and Import controls to move state in and out of `world_model.json`.

## Vocabularies

Entity types:

- `Person`
- `Team`
- `Organization`
- `System`
- `Application`
- `DataSource`
- `Dataset`
- `Report`
- `Dashboard`
- `Process`
- `Concept`
- `Artifact`
- `Unknown`

Relationship names:

- `owns`
- `uses`
- `depends_on`
- `blocks`
- `requested`
- `provided_feedback_on`
- `needs_change_to`
- `replaces`
- `belongs_to`
- `responsible_for`
- `related_to`

Event types:

- `MeetingHeld`
- `FeedbackReceived`
- `RequestMade`
- `ChangeNeeded`
- `MeetingNeeded`
- `DependencyIdentified`
- `BlockerIdentified`
- `StatusChanged`
- `DecisionMentioned`
- `InformationLearned`

## Model Extraction

`/api/extract-context` requires a configured model endpoint. If the model is unavailable, extraction fails visibly and does not mutate the world model.

App settings:

- `ATLAS_MODEL_PROVIDER`: `ollama`, `openai-compatible`, or `pollinations`
- `ATLAS_MODEL_ENDPOINT`: private model base URL
- `ATLAS_MODEL_NAME`: defaults to `qwen3:8b`
- `ATLAS_MODEL_API_KEY`: optional bearer token
- `ATLAS_MODEL_TIMEOUT_MS`: optional timeout, defaults to `45000`

For quick public testing, `pollinations` can use:

- `ATLAS_MODEL_ENDPOINT=https://text.pollinations.ai/openai`
- `ATLAS_MODEL_NAME=openai`

Do not send sensitive private context to a public no-key provider.

## Development

```bash
npm install
npm run dev
npm run build
```

## Agent Registry

Atlas supports generic HTTP/Webhook agents through:

- `GET /api/agents`
- `POST /api/agents`
- `GET /api/agents/{id}`
- `POST /api/agents/{id}/runs`
- `POST /api/agent-runs/{run_id}/report`
- `POST /api/agent-runs/{run_id}/control`

The registry uses the same storage model as agent reports: Azure Blob storage in production, local JSON files during local smoke tests. External agent callbacks to `/report` use the `x-atlas-api-key` header.

## Azure

The SWA resource/config remains in this repo. The agent runtime is separate from this UI app.

- Agent runtime resource group: `agents-rg`
- Agent runtime Container App: `web-scrape-agent`
- Static Web App hostname: `proud-mud-0fff2710f.7.azurestaticapps.net`
