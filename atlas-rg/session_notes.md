# Session Notes - 2026-06-21

## Summary

Today converted the former world-model workspace into the Atlas workflow/orchestration UI and connected it to the Opportunity Discovery Agent running in Azure. The work covered the agent backend, Atlas workflow reporting, human review loops, output browsing, workflow controls, and multiple UI refinements.

## Opportunity Discovery Agent

- Created the Opportunity Discovery Agent from the existing Azure Container Apps web-scrape-agent direction.
- Added persistent storage for agent results.
- Implemented Hacker News as the first primary source using the public Firebase API.
- Added source/analyzer/storage structure so Reddit can be added later through the same source interface.
- Added pain-point detection, opportunity scoring, and model-backed opportunity analysis.
- Added LLM-backed scan planning so the model helps form the scan focus at the start of the run.
- Limited final operator-facing output to a single Markdown model-analysis file.
- Removed opportunity-shortlist output generation and stopped surfacing shortlist payloads in Atlas.
- Hardened the agent deployment and background scan behavior.

## Atlas Integration

- Registered the Opportunity Discovery workflow with Atlas.
- Added Atlas reporting payloads from the agent so workflows can appear in the Atlas UI.
- Added workflow trigger support from Atlas to initiate an agent run.
- Mapped agent run stages to Atlas workflow status/stage vocabulary.
- Added review states for operator approval, denial, feedback, revision, and completion.
- Added approval and denial feedback input.
- Added denial-triggered rerun behavior while preserving approved workflow review state.
- Fixed repeated human-review loops so approved outputs are not treated as new pending requests.
- Fixed Atlas API fallback handling around non-JSON responses.
- Added a generic HTTP/Webhook Agent Registry and run contract for plug-and-play agents.
- Added standard run callback endpoints for agent reports and operator controls.
- Added an Agents page in Atlas for registering agents, viewing run history, and triggering runs.

## Workflow UI

- Added the trigger action in the workflow metadata row.
- Reworked the trigger button using the glass trigger component and then refined sizing/styling.
- Added workflow archive, unarchive, cancel, and delete actions.
- Fixed archive and delete actions.
- Removed the activity tab while preserving a workflow-detail activity feed scoped to the current run.
- Added a red delete option and later moved workflow actions into the header ellipsis menu.
- Removed the workflow handoff section, restored it for experiments, then removed it again in favor of simpler workflow details.
- Added an archived workflows toggle on the workflows page.
- Restored workflow tile hover motion.
- Made workflow tile stage pills reflect real workflow progression and collapse extra stages behind a +N indicator.
- Removed duplicate/static stage labels inside workflow tiles where the status pill already conveyed state.

## Outputs And Review

- Added a generalized workflow output document model for payloads containing artifacts/documents.
- Added an output workspace and then replaced it with a richer output file browser.
- Added list/grid output browsing with search, sort, copy, open, and download actions.
- Added file preview support for Markdown, JSON, CSV, spreadsheet-like data, text, and common document/code formats.
- Filtered workflow outputs so the default view shows only operator-actionable review payloads.
- Hid outputs from human review until the workflow reaches the review stage.
- Added a filter control in the outputs header.
- Tuned output layout width, scrolling behavior, grid/list density, and file icons.

## Atlas Sidebar And Navigation

- Replaced the old side menu with a collapsing Atlas navigation sidebar.
- Removed the Command tab from the sidebar.
- Renamed the menu concept from World Model to Agentic Orchestration.
- Removed Quick Actions from settings.
- Fixed breadcrumbs so workflow details can navigate back to Workflows.
- Fixed the sidebar so it is fixed to the viewport and remains full height while workflow detail pages scroll.
- Removed the contextual side-menu tree so the sidebar stays on Workflows when viewing a workflow detail.

## Verification And Deployment

- Repeatedly ran `npm run typecheck` and `npm run build` for the Atlas SWA app after UI changes.
- Deployed the Static Web App to production after major UI changes.
- Confirmed the production SWA endpoint returned HTTP 200 after deployment.
- Committed and pushed changes to Azure DevOps throughout the session.

## Current Notes

- The active SWA production URL is `https://proud-mud-0fff2710f.7.azurestaticapps.net`.
- The agent runtime resource group is `agents-rg`; it contains `web-scrape-agent`, the Container Apps environment, ACR, storage, and workspace resources.
- The Opportunity Discovery Agent should now surface only `model-analysis.md` for operator review.
- Operator-facing outputs should default to actionable review items, not status/debug payloads.
- The app rename to Atlas is included with these notes.
