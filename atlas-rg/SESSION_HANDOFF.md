# Atlas World Model V0 Handoff

## Current Direction

Atlas is now a minimal persistent world model proof of concept.

The only durable concepts are:

- Entities
- Relationships
- Events

Current controlled vocabularies:

- Entity types: `Person`, `Team`, `Organization`, `System`, `Application`, `DataSource`, `Dataset`, `Report`, `Dashboard`, `Process`, `Concept`, `Artifact`, `Unknown`
- Relationships: `owns`, `uses`, `depends_on`, `blocks`, `requested`, `provided_feedback_on`, `needs_change_to`, `replaces`, `belongs_to`, `responsible_for`, `related_to`
- Event types: `MeetingHeld`, `FeedbackReceived`, `RequestMade`, `ChangeNeeded`, `MeetingNeeded`, `DependencyIdentified`, `BlockerIdentified`, `StatusChanged`, `DecisionMentioned`, `InformationLearned`

Do not reintroduce hardcoded task management, CRM, ontology, workflow, approval, SQL, project management, or auth concepts unless the user explicitly changes the product direction.

## App Shape

- Frontend: React/Vite in `src/`
- SWA config: `staticwebapp.config.json`
- Function API: `api/extract-context`
- Seed/export shape: `world_model.json`

The browser persists the active world model in localStorage under `atlas_world_model_v0`. The UI supports export/import of `world_model.json`.

## Extraction

`/api/extract-context` returns:

```json
{
  "entities": [],
  "relationships": [],
  "events": []
}
```

`ATLAS_MODEL_ENDPOINT` is required. The Function does not use deterministic extraction fallbacks; model failures should surface as errors and must not mutate the world model.

## Verification

Last known clean check:

```bash
npm run build
node -e "require('./api/extract-context/index.js'); require('./api/shared/extractor.js'); console.log('api modules loaded')"
```
