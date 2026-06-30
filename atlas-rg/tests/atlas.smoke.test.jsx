import React from "react";
import { createRequire } from "node:module";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@testing-library/jest-dom/vitest";
import App from "../src/App.jsx";
import { reportToAtlas } from "../src/atlas-adapter/reportToAtlas.ts";
import { runReportCli } from "../scripts/report-to-atlas.ts";

const STORAGE_KEY = "atlas_world_model_v0";
const require = createRequire(import.meta.url);
const reportHandler = require("../api/report/index.js");
const contextHandler = require("../api/context/index.js");
const projectsHandler = require("../api/projects/index.js");
const workItemsHandler = require("../api/work-items/index.js");
const workflowsHandler = require("../api/workflows/index.js");
const searchHandler = require("../api/objects-search/index.js");
const agentsHandler = require("../api/agents/index.js");
const agentRunsHandler = require("../api/agent-runs/index.js");
const agentRunEventsHandler = require("../api/agent-run-events/index.js");
const smokeInput =
  "Met with Arnaud, Nick Wong, and Matthieu about Azure Cost Dashboard. They requested rollup title changes and ServiceNow sys IDs need remapping.";

const extractionPayload = {
  entities: [
    { type: "Person", name: "Arnaud" },
    { type: "Person", name: "Nick Wong" },
    { type: "Person", name: "Matthieu" },
    { type: "Dashboard", name: "Azure Cost Dashboard" },
    { type: "Artifact", name: "Rollup Titles" },
    { type: "Artifact", name: "ServiceNow Sys IDs" },
    { type: "DataSource", name: "Azure Cost Source Connection" },
    { type: "System", name: "ServiceNow" },
    { type: "Person", name: "I" },
  ],
  relationships: [
    { source: "Arnaud", relation: "provided_feedback_on", target: "Azure Cost Dashboard" },
    { source: "Nick Wong", relation: "provided_feedback_on", target: "Azure Cost Dashboard" },
    { source: "Matthieu", relation: "provided_feedback_on", target: "Azure Cost Dashboard" },
    { source: "Azure Cost Dashboard", relation: "needs_change_to", target: "Rollup Titles" },
    { source: "ServiceNow Sys IDs", relation: "related_to", target: "Azure Cost Source Connection" },
  ],
  events: [
    {
      type: "FeedbackReceived",
      target: "Azure Cost Dashboard",
      timestamp: "2026-06-18T23:54:00Z",
      details: {
        summary: "Arnaud, Nick Wong, and Matthieu requested dashboard changes.",
      },
    },
    {
      type: "ChangeNeeded",
      target: "Rollup Titles",
      timestamp: "2026-06-18T23:55:00Z",
      details: {
        summary: "Rollup title logic needs updating for Azure Cost Dashboard.",
      },
    },
    {
      type: "InformationLearned",
      target: "ServiceNow Sys IDs",
      timestamp: "2026-06-18T23:56:00Z",
      details: {
        summary: "ServiceNow Sys IDs need to be remapped to the Azure Cost Source Connection because the old map is outdated.",
      },
    },
  ],
  extractor: {
    provider: "smoke",
    model: "deterministic-test",
  },
};

let exportedBlob;
let inboxPath;
let registryPath;

const agentReportPayload = {
  id: "report_smoke_001",
  received_at: "2026-06-20T12:00:00Z",
  source: "agent",
  agent_id: "codex-cli",
  agent_name: "Codex CLI",
  project: "Atlas",
  message: "Fixed duplicate objects in sidebar tree and improved object detail page layout.",
  status: "completed",
  artifacts: ["src/components/ObjectTree.tsx", "src/pages/ObjectDetail.tsx"],
  events: [
    { type: "TaskCompleted", target: "Fix duplicate sidebar objects" },
    { type: "ArtifactChanged", target: "ObjectTree.tsx" },
  ],
  confidence: 0.92,
  timestamp: "2026-06-20T12:00:00Z",
  processed: true,
  processing_result: {
    objects_updated: ["Codex CLI", "Atlas", "src/components/ObjectTree.tsx", "src/pages/ObjectDetail.tsx"],
    events_created: ["AgentReport", "TaskCompleted", "ArtifactChanged"],
    extraction: {
      source: "agent",
      submitted_by: "codex-cli",
      report_id: "report_smoke_001",
      entities: [
        { type: "Project", name: "Atlas", visibility: "primary" },
        { type: "WorkItem", name: "Fix duplicate sidebar objects", visibility: "primary" },
        { type: "AgentRun", name: "Codex CLI run 2026-06-20T12:00:00Z", visibility: "secondary" },
        { type: "Agent", name: "Codex CLI", visibility: "secondary" },
        { type: "Artifact", name: "src/components/ObjectTree.tsx", visibility: "debug" },
        { type: "Artifact", name: "src/pages/ObjectDetail.tsx", visibility: "debug" },
      ],
      relationships: [
        { source: "Codex CLI", relation: "reported_on", target: "Atlas" },
        { source: "Fix duplicate sidebar objects", relation: "belongs_to", target: "Atlas" },
        { source: "Codex CLI", relation: "performed", target: "Fix duplicate sidebar objects" },
        { source: "src/components/ObjectTree.tsx", relation: "belongs_to", target: "Atlas" },
        { source: "Codex CLI", relation: "changed_artifact", target: "src/components/ObjectTree.tsx" },
      ],
      events: [
        {
          type: "AgentReport",
          target: "Atlas",
          timestamp: "2026-06-20T12:00:00Z",
          details: {
            source: "agent",
            agent_name: "Codex CLI",
            project: "Atlas",
            status: "completed",
            confidence: 0.92,
            artifacts: ["src/components/ObjectTree.tsx", "src/pages/ObjectDetail.tsx"],
            summary: "Fixed duplicate objects in sidebar tree and improved object detail page layout.",
          },
        },
        {
          type: "TaskCompleted",
          target: "Fix duplicate sidebar objects",
          timestamp: "2026-06-20T12:00:00Z",
          details: {
            source: "agent",
            agent_name: "Codex CLI",
            project: "Atlas",
            status: "completed",
            confidence: 0.92,
            summary: "Fixed duplicate objects in sidebar tree and improved object detail page layout.",
          },
        },
      ],
      extractor: {
        mode: "agent_report",
        provider: "Codex CLI",
        model: "structured-report",
      },
    },
  },
};

function mockAtlasApi(reports = []) {
  const fetchMock = vi.fn(async (url) => {
    if (String(url).includes("/api/report")) {
      const body = JSON.stringify({
        api_key_configured: true,
        reports,
        recent_reports_count: reports.length,
        last_report_received_at: reports.at(-1)?.received_at || "",
      });
      return {
        ok: true,
        headers: new Headers({ "content-type": "application/json" }),
        json: async () => JSON.parse(body),
        text: async () => body,
      };
    }

    const body = JSON.stringify(extractionPayload);
    return {
      ok: true,
      headers: new Headers({ "content-type": "application/json" }),
      json: async () => JSON.parse(body),
      text: async () => body,
    };
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

function readWorld() {
  return JSON.parse(window.localStorage.getItem(STORAGE_KEY) || "{}");
}

async function submitSmokeInput(user) {
  const input = screen.getByPlaceholderText(/log what changed/i);
  await user.clear(input);
  await user.type(input, smokeInput);
  await user.click(screen.getByRole("button", { name: /log update/i }));
  await waitFor(() => expect(readWorld().entities || []).toEqual(expect.arrayContaining([expect.objectContaining({ name: "Azure Cost Dashboard" })])));
}

function canonicalEntityCount(world, name) {
  return (world.entities || []).filter((entity) => entity.name.toLowerCase() === name.toLowerCase()).length;
}

function clickNav(label) {
  fireEvent.click(screen.getByRole("button", { name: label }));
}

function enterAtlas() {
  const landing = screen.queryByRole("button", { name: "Enter Atlas" });
  if (landing) {
    fireEvent.click(landing);
  }
}

async function seedAgentReport() {
  const accepted = {};
  await reportHandler(accepted, {
    method: "POST",
    headers: { "x-atlas-api-key": "dev-atlas-key" },
    body: {
      source: "agent",
      agent_id: "codex-cli",
      agent_name: "Codex CLI",
      project: "Atlas",
      message: "Fixed object page UI.",
      status: "in_progress",
      artifacts: ["src/pages/ObjectDetail.tsx"],
      events: [{ type: "InformationLearned", target: "Fix object page UI" }],
      confidence: 0.9,
      timestamp: "2026-06-20T12:00:00Z",
    },
  });
  expect(accepted.res.status).toBe(202);
}

async function seedWorkflowReports() {
  const scout = {};
  await reportHandler(scout, {
    method: "POST",
    headers: { "x-atlas-api-key": "dev-atlas-key" },
    body: {
      source: "agent",
      agent_id: "contract-scout-agent",
      agent_name: "Contract Scout Agent",
      project: "Government Contract Pipeline",
      message: "Scouted government contract opportunities and sent the candidate list to review.",
      status: "completed",
      workflow: {
        name: "Government Contract Pipeline",
        objective: "Find and shortlist government contract opportunities for human review.",
        stage: "Scout",
        stage_status: "completed",
        next_stage: "Review",
        stages: [
          { name: "Scout", status: "completed", agent: "Contract Scout Agent", output: "Government contract candidate list" },
          { name: "Review", status: "in_progress", agent: "Opportunity Review Agent", input: "Government contract candidate list" },
          { name: "Human Review", status: "waiting", agent: "Human Operator", input: "Government contract shortlist" },
        ],
      },
      outputs: [{ name: "Government contract candidate list", type: "Candidate List", status: "produced" }],
      events: [{ type: "TaskCompleted", target: "Scout government contract opportunities" }],
      confidence: 0.86,
      timestamp: "2026-06-20T12:00:00Z",
    },
  });
  expect(scout.res.status).toBe(202);

  const review = {};
  await reportHandler(review, {
    method: "POST",
    headers: { "x-atlas-api-key": "dev-atlas-key" },
    body: {
      source: "agent",
      agent_id: "opportunity-review-agent",
      agent_name: "Opportunity Review Agent",
      project: "Government Contract Pipeline",
      message: "Reviewed the candidate list and prepared a shortlist for human review.",
      status: "needs_review",
      workflow: {
        name: "Government Contract Pipeline",
        objective: "Find and shortlist government contract opportunities for human review.",
        stage: "Review",
        stage_status: "completed",
        next_stage: "Human Review",
        stages: [
          { name: "Scout", status: "completed", agent: "Contract Scout Agent", output: "Government contract candidate list" },
          { name: "Review", status: "completed", agent: "Opportunity Review Agent", input: "Government contract candidate list", output: "Government contract shortlist" },
          { name: "Human Review", status: "waiting", agent: "Human Operator", input: "Government contract shortlist" },
        ],
      },
      outputs: [{ name: "Government contract shortlist", type: "Shortlist", status: "ready_for_review" }],
      events: [{ type: "TaskCompleted", target: "Review government contract candidate list" }],
      confidence: 0.82,
      timestamp: "2026-06-20T12:05:00Z",
    },
  });
  expect(review.res.status).toBe(202);
}

beforeEach(() => {
  window.localStorage.clear();
  exportedBlob = undefined;
  inboxPath = path.join(os.tmpdir(), `atlas-smoke-${Date.now()}-${Math.random().toString(36).slice(2)}.json`);
  registryPath = path.join(os.tmpdir(), `atlas-agent-registry-${Date.now()}-${Math.random().toString(36).slice(2)}.json`);
  process.env.ATLAS_AGENT_API_KEY = "dev-atlas-key";
  process.env.ATLAS_AGENT_INBOX_PATH = inboxPath;
  process.env.ATLAS_AGENT_REGISTRY_PATH = registryPath;
  vi.stubGlobal("URL", {
    ...URL,
    createObjectURL: vi.fn((blob) => {
      exportedBlob = blob;
      return "blob:atlas-smoke";
    }),
  });
  mockAtlasApi();
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  delete process.env.ATLAS_AGENT_API_KEY;
  delete process.env.ATLAS_AGENT_INBOX_PATH;
  delete process.env.ATLAS_AGENT_REGISTRY_PATH;
  if (inboxPath && fs.existsSync(inboxPath)) {
    fs.unlinkSync(inboxPath);
  }
  if (registryPath && fs.existsSync(registryPath)) {
    fs.unlinkSync(registryPath);
  }
});

describe("Atlas smoke suite", () => {
  it("boots and exposes core navigation pages", () => {
    render(<App />);

    expect(screen.getByRole("button", { name: "Workflows" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Agents" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Settings" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Command" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Activity" })).not.toBeInTheDocument();

    clickNav("Workflows");
    expect(screen.getByRole("heading", { name: "Workflows" })).toBeInTheDocument();

    clickNav("Agents");
    expect(screen.getByRole("heading", { name: "Agents" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Register new agent" }));
    expect(screen.getByRole("button", { name: "Register Agent" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Close" }));

    clickNav("Settings");
    expect(screen.getByRole("heading", { name: "Settings" })).toBeInTheDocument();
    expect(screen.getByText("Agent Connectivity")).toBeInTheDocument();
    expect(screen.getByText("Agent Integration")).toBeInTheDocument();
  });

  it.skip("updates the world model from command input and rejects generic context-captured UI", async () => {
    const user = userEvent.setup();
    const fetchMock = mockAtlasApi();
    render(<App />);

    await submitSmokeInput(user);

    expect(fetchMock).toHaveBeenCalledWith("/api/extract-context", expect.any(Object));
    expect(document.body).not.toHaveTextContent(/context captured/i);

    const world = readWorld();
    for (const name of ["Azure Cost Dashboard", "Arnaud", "Nick Wong", "Matthieu", "Rollup Titles", "ServiceNow Sys IDs"]) {
      expect(world.entities).toEqual(expect.arrayContaining([expect.objectContaining({ name })]));
    }
    expect(world.relationships.length).toBeGreaterThan(0);
    expect(world.events.length).toBeGreaterThan(0);
    expect(world.entities).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: "Azure Cost Dashboard", visibility: "primary" }),
      expect.objectContaining({ name: "Arnaud", visibility: "secondary" }),
      expect.objectContaining({ name: "ServiceNow", visibility: "primary" }),
      expect.objectContaining({ name: "Rollup Titles", visibility: "debug" }),
      expect.objectContaining({ name: "ServiceNow Sys IDs", visibility: "debug" }),
    ]));
  });

  it.skip("does not duplicate canonical entities when the same update is submitted twice", async () => {
    const user = userEvent.setup();
    render(<App />);

    await submitSmokeInput(user);
    await submitSmokeInput(user);

    const world = readWorld();
    for (const name of ["Azure Cost Dashboard", "Arnaud", "Nick Wong", "Matthieu", "Rollup Titles", "ServiceNow Sys IDs"]) {
      expect(canonicalEntityCount(world, name)).toBe(1);
    }
  });

  it.skip("keeps manual updates stored while Workflows stays workflow-only", async () => {
    const user = userEvent.setup();
    render(<App />);
    await submitSmokeInput(user);

    expect(readWorld().entities).toEqual(expect.arrayContaining([expect.objectContaining({ name: "Azure Cost Dashboard" })]));
    clickNav("Workflows");
    expect(screen.getByRole("heading", { name: "Workflows" })).toBeInTheDocument();
    expect(screen.queryByText("View raw objects")).not.toBeInTheDocument();
    expect(screen.queryByText("Azure Cost Dashboard")).not.toBeInTheDocument();
  });

  it.skip("renders timeline as user-readable activity instead of raw JSON/internal-only labels", async () => {
    const user = userEvent.setup();
    render(<App />);
    await submitSmokeInput(user);

    clickNav("Activity");
    expect(screen.getByText(/Feedback received/i)).toBeInTheDocument();
    expect(screen.getAllByText(/Requirement changed|Update captured|Mapping outdated/i).length).toBeGreaterThan(0);
    expect(document.body).not.toHaveTextContent(/^\s*\{/);
    expect(document.body).not.toHaveTextContent(/InformationLearned/);
  });

  it.skip("exports valid JSON, imports it, resets state, and persists across reloads", async () => {
    const user = userEvent.setup();
    const { unmount, container } = render(<App />);
    await submitSmokeInput(user);

    clickNav("Settings");
    expect(screen.queryByText("Atlas Health")).not.toBeInTheDocument();
    expect(screen.getByText("Agent Connectivity")).toBeInTheDocument();
    expect(screen.getByText("Quick Actions")).toBeInTheDocument();
    expect(screen.queryByText("World Model Stats")).not.toBeInTheDocument();
    const exportLink = screen.getByRole("link", { name: /export/i });
    expect(exportLink).toHaveAttribute("download", "world_model.json");
    expect(exportedBlob).toBeTruthy();
    const exported = JSON.parse(await exportedBlob.text());
    expect(exported.entities.length).toBeGreaterThan(0);
    expect(exported.relationships.length).toBeGreaterThan(0);
    expect(exported.events.length).toBeGreaterThan(0);

    await user.click(screen.getByRole("button", { name: /reset/i }));
    expect(readWorld().entities).toHaveLength(0);
    unmount();

    render(<App />);
    expect(readWorld().entities).toHaveLength(0);
    clickNav("Settings");
    const fileInput = document.querySelector('input[type="file"]');
    const file = new File([JSON.stringify(exported)], "world_model.json", { type: "application/json" });
    fireEvent.change(fileInput, { target: { files: [file] } });
    await waitFor(() => expect(readWorld().entities).toEqual(expect.arrayContaining([expect.objectContaining({ name: "Azure Cost Dashboard" })])));
    cleanup();

    render(<App />);
    expect(readWorld().entities).toEqual(expect.arrayContaining([expect.objectContaining({ name: "Azure Cost Dashboard" })]));
  });

  it("keeps UI free of obvious raw/null regressions and duplicate sidebar tree names", async () => {
    render(<App />);
    enterAtlas();

    expect(document.body).not.toHaveTextContent(/\bundefined\b/i);
    expect(document.body).not.toHaveTextContent(/\bnull\b/i);
    expect(document.body).not.toHaveTextContent(/User identified as User/i);
    expect(document.body).not.toHaveTextContent(/\bI\b\s*Person/i);

    const sidebar = document.querySelector("aside");
    const treeButtons = within(sidebar).getAllByRole("button").map((button) => button.getAttribute("aria-label") || button.textContent.trim()).filter(Boolean);
    expect(new Set(treeButtons).size).toBe(treeButtons.length);
    expect(within(sidebar).queryByText(/Is related to/i)).not.toBeInTheDocument();
    expect(within(sidebar).queryByText(/Reported on/i)).not.toBeInTheDocument();
  });

  it("rejects agent reports with missing or wrong API keys and accepts a valid report", async () => {
    const unauthorized = {};
    await reportHandler(unauthorized, {
      method: "POST",
      headers: {},
      body: {
        message: "Unauthorized report",
      },
    });
    expect(unauthorized.res.status).toBe(401);

    const wrongKey = {};
    await reportHandler(wrongKey, {
      method: "POST",
      headers: { "x-atlas-api-key": "wrong" },
      body: {
        message: "Unauthorized report",
      },
    });
    expect(wrongKey.res.status).toBe(401);

    const accepted = {};
    await reportHandler(accepted, {
      method: "POST",
      headers: { "x-atlas-api-key": "dev-atlas-key" },
      body: {
        source: "agent",
        agent_id: "codex-cli",
        agent_name: "Codex CLI",
        project: "Atlas",
        message: "Fixed duplicate objects in sidebar tree and improved object detail page layout.",
        status: "completed",
        artifacts: ["src/components/ObjectTree.tsx", "src/pages/ObjectDetail.tsx"],
        events: [
          { type: "TaskCompleted", target: "Fix duplicate sidebar objects" },
          { type: "ArtifactChanged", target: "ObjectTree.tsx" },
        ],
        confidence: 0.92,
        timestamp: "2026-06-20T12:00:00Z",
      },
    });

    expect(accepted.res.status).toBe(202);
    const payload = JSON.parse(accepted.res.body);
    expect(payload.accepted).toBe(true);
    expect(payload.report_id).toMatch(/^report_/);
    expect(payload.objects_updated).toEqual(["Atlas"]);

    const inbox = JSON.parse(fs.readFileSync(inboxPath, "utf8"));
    expect(inbox).toHaveLength(1);
    expect(inbox[0].processed).toBe(true);
    expect(inbox[0].processing_result.extraction.entities).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: "Agent", name: "Codex CLI", visibility: "secondary" }),
      expect.objectContaining({ type: "Project", name: "Atlas", visibility: "primary" }),
      expect.objectContaining({ type: "WorkItem", name: "Fix duplicate sidebar objects", visibility: "secondary" }),
      expect.objectContaining({ type: "Artifact", name: "src/pages/ObjectDetail.tsx", visibility: "debug" }),
    ]));
    expect(inbox[0].processing_result.extraction.relationships).toEqual(expect.arrayContaining([
      expect.objectContaining({ source: "Codex CLI", relation: "reported_on", target: "Atlas" }),
      expect.objectContaining({ source: "Fix duplicate sidebar objects", relation: "belongs_to", target: "Atlas" }),
      expect.objectContaining({ source: "Codex CLI", relation: "changed_artifact", target: "src/pages/ObjectDetail.tsx" }),
    ]));
    expect(inbox[0].processing_result.extraction.events.length).toBeGreaterThan(0);
  });

  it("read APIs require API key and return agent-facing Atlas context", async () => {
    const unauthorized = {};
    await contextHandler(unauthorized, {
      method: "GET",
      headers: {},
      query: { project: "Atlas" },
    });
    expect(unauthorized.res.status).toBe(401);

    await seedAgentReport();

    const contextResponse = {};
    await contextHandler(contextResponse, {
      method: "GET",
      headers: { "x-atlas-api-key": "dev-atlas-key" },
      query: { project: "Atlas" },
    });
    expect(contextResponse.res.status).toBe(200);
    const contextPayload = JSON.parse(contextResponse.res.body);
    expect(contextPayload.project).toEqual(expect.objectContaining({ name: "Atlas", status: "active" }));
    expect(contextPayload.project.id).toMatch(/^obj_/);
    expect(contextPayload.project.canonical_key).toBe("project:atlas");
    expect(contextPayload.open_work_items).toEqual(expect.arrayContaining([expect.objectContaining({ name: "Fix object page UI" })]));
    expect(contextPayload.known_agents).toEqual(expect.arrayContaining([expect.objectContaining({ name: "Codex CLI" })]));
    expect(contextPayload.known_artifacts).toEqual(expect.arrayContaining([expect.objectContaining({ name: "src/pages/ObjectDetail.tsx", visibility: "debug" })]));
  });

  it("read APIs return projects, work items, and canonical search matches", async () => {
    await seedAgentReport();

    const projectsResponse = {};
    await projectsHandler(projectsResponse, {
      method: "GET",
      headers: { "x-atlas-api-key": "dev-atlas-key" },
      query: {},
    });
    expect(projectsResponse.res.status).toBe(200);
    const projectsPayload = JSON.parse(projectsResponse.res.body);
    expect(projectsPayload.projects).toEqual(expect.arrayContaining([expect.objectContaining({ name: "Atlas", type: "Project", visibility: "primary" })]));
    expect(projectsPayload.projects).not.toEqual(expect.arrayContaining([expect.objectContaining({ name: "src/pages/ObjectDetail.tsx" })]));

    const workItemsResponse = {};
    await workItemsHandler(workItemsResponse, {
      method: "GET",
      headers: { "x-atlas-api-key": "dev-atlas-key" },
      query: { project: "Atlas", status: "open" },
    });
    expect(workItemsResponse.res.status).toBe(200);
    const workItemsPayload = JSON.parse(workItemsResponse.res.body);
    expect(workItemsPayload.work_items).toEqual(expect.arrayContaining([expect.objectContaining({ name: "Fix object page UI" })]));

    const searchResponse = {};
    await searchHandler(searchResponse, {
      method: "GET",
      headers: { "x-atlas-api-key": "dev-atlas-key" },
      query: { q: "object detail" },
    });
    expect(searchResponse.res.status).toBe(200);
    const searchPayload = JSON.parse(searchResponse.res.body);
    expect(searchPayload.results).toEqual(expect.arrayContaining([expect.objectContaining({ name: "src/pages/ObjectDetail.tsx", confidence: expect.any(Number) })]));
  });

  it("registers generic agents, creates runs, and accepts run callback reports", async () => {
    const templateResponse = {};
    await agentsHandler(templateResponse, {
      method: "GET",
      params: { id: "contract-template" },
      headers: {},
      query: {},
    });
    expect(templateResponse.res.status).toBe(200);
    const template = JSON.parse(templateResponse.res.body).template;
    expect(template.contract).toEqual(expect.objectContaining({
      agent_id: "",
      workflow_setup: expect.objectContaining({
        stages: expect.any(Array),
      }),
    }));

    const registerResponse = {};
    await agentsHandler(registerResponse, {
      method: "POST",
      headers: {},
      body: {
        agent_name: "Webhook Research Agent",
        provider: "http",
        default_project: "Research Pipeline",
        capabilities: ["research", "markdown_report"],
        output_types: ["markdown", "json"],
        primary_output: "research-brief.md",
        default_payload: { topic: "billing operations" },
        requires_review: true,
        workflow_setup: {
          workflow_name: "Research Pipeline",
          objective: "Research a topic and prepare a reviewable briefing.",
          trigger_payload: { topic: "billing operations" },
          stages: [
            { name: "Queued", agent: "Atlas", input: "Agent contract", output: "Run request prepared" },
            { name: "Researching", agent: "Webhook Research Agent", input: "Topic", output: "Research notes" },
            { name: "Needs Review", agent: "Human Operator", input: "research-brief.md", output: "Approved or denied" },
          ],
        },
      },
    });
    expect(registerResponse.res.status).toBe(202);
    const registered = JSON.parse(registerResponse.res.body).agent;
    expect(registered).toEqual(expect.objectContaining({
      id: "webhook-research-agent",
      agent_name: "Webhook Research Agent",
      type: "http_webhook",
      primary_output: "research-brief.md",
      default_payload: { topic: "billing operations" },
      workflow_setup: expect.objectContaining({
        workflow_name: "Research Pipeline",
        stages: expect.arrayContaining([expect.objectContaining({ name: "Researching" })]),
      }),
    }));

    const listResponse = {};
    await agentsHandler(listResponse, {
      method: "GET",
      headers: {},
      query: {},
    });
    expect(listResponse.res.status).toBe(200);
    expect(JSON.parse(listResponse.res.body).agents).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: "webhook-research-agent" }),
    ]));

    const runResponse = {};
    await agentRunsHandler(runResponse, {
      method: "POST",
      params: { id: "webhook-research-agent" },
      headers: { host: "localhost:5173" },
      body: {
        inputs: { topic: "billing operations" },
      },
    });
    expect(runResponse.res.status).toBe(202);
    const run = JSON.parse(runResponse.res.body).run;
    expect(run).toEqual(expect.objectContaining({
      agent_id: "webhook-research-agent",
      status: "queued",
      project: "Research Pipeline",
    }));

    const unauthorizedReport = {};
    await agentRunEventsHandler(unauthorizedReport, {
      method: "POST",
      params: { run_id: run.id, action: "report" },
      headers: {},
      body: {
        status: "needs_review",
        message: "Analysis ready.",
      },
    });
    expect(unauthorizedReport.res.status).toBe(401);

    const reportResponse = {};
    await agentRunEventsHandler(reportResponse, {
      method: "POST",
      params: { run_id: run.id, action: "report" },
      headers: { "x-atlas-api-key": "dev-atlas-key" },
      body: {
        status: "needs_review",
        stage: "Human Review",
        message: "Analysis ready.",
        outputs: [{
          name: "model-analysis.md",
          type: "markdown",
          status: "ready_for_review",
          documents: [{ name: "model-analysis.md", mime_type: "text/markdown", content: "# Analysis" }],
        }],
        events: [{ type: "TaskCompleted", target: "Research billing operations" }],
        confidence: 0.87,
      },
    });
    expect(reportResponse.res.status).toBe(202);
    const reportPayload = JSON.parse(reportResponse.res.body);
    expect(reportPayload.run).toEqual(expect.objectContaining({
      id: run.id,
      status: "needs_review",
      stage: "Human Review",
    }));
    expect(reportPayload.report_id).toMatch(/^report_/);

    const detailResponse = {};
    await agentsHandler(detailResponse, {
      method: "GET",
      params: { id: "webhook-research-agent" },
      headers: {},
      query: {},
    });
    expect(detailResponse.res.status).toBe(200);
    const detail = JSON.parse(detailResponse.res.body).agent;
    expect(detail.runs).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: run.id, status: "needs_review" }),
    ]));

    const inbox = JSON.parse(fs.readFileSync(inboxPath, "utf8"));
    expect(inbox).toEqual(expect.arrayContaining([
      expect.objectContaining({
        agent_id: "webhook-research-agent",
        agent_name: "Webhook Research Agent",
        status: "needs_review",
      }),
    ]));
  });

  it("renders workflow reports as one coherent operator workflow", async () => {
    await seedWorkflowReports();

    const workflowsResponse = {};
    await workflowsHandler(workflowsResponse, {
      method: "GET",
      headers: { "x-atlas-api-key": "dev-atlas-key" },
      query: {},
      params: {},
    });
    expect(workflowsResponse.res.status).toBe(200);
    const workflowsPayload = JSON.parse(workflowsResponse.res.body);
    expect(workflowsPayload.workflows).toHaveLength(1);
    expect(workflowsPayload.workflows[0]).toEqual(expect.objectContaining({
      name: "Government Contract Pipeline",
      status: "Completed",
      current_stage: "Completed",
      agent_count: 2,
      outputs_ready_count: 0,
    }));
    expect(workflowsPayload.workflows[0].stages).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: "Human Review", status: "needs_review", agent: "Human Operator" }),
    ]));
    expect(workflowsPayload.workflows[0].outputs).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: "Government contract shortlist", status: "needs_review" }),
    ]));

    const contextResponse = {};
    await contextHandler(contextResponse, {
      method: "GET",
      headers: { "x-atlas-api-key": "dev-atlas-key" },
      query: { project: "Government Contract Pipeline" },
    });
    const contextPayload = JSON.parse(contextResponse.res.body);
    expect(contextPayload.active_workflows).toEqual(expect.arrayContaining([expect.objectContaining({ name: "Government Contract Pipeline" })]));
    expect(contextPayload.outputs_ready_for_review).toEqual([]);

    const reports = JSON.parse(fs.readFileSync(inboxPath, "utf8"));
    mockAtlasApi(reports);
    const user = userEvent.setup();
    render(<App />);
    enterAtlas();

    await waitFor(() => expect(readWorld().entities || []).toEqual(expect.arrayContaining([expect.objectContaining({ type: "Workflow", name: "Government Contract Pipeline" })])));

    clickNav("Workflows");
    expect(screen.getAllByText("Government Contract Pipeline").length).toBeGreaterThan(0);
    expect(screen.queryByText("Workflow Workspace")).not.toBeInTheDocument();
    expect(screen.queryByText("View raw objects")).not.toBeInTheDocument();
    expect(screen.queryByText("Waiting on human")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Open" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "View Workflow" })).not.toBeInTheDocument();
    expect(screen.getAllByText("Needs Review").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Needs Review").length).toBeGreaterThan(0);
    expect(screen.getByText("Agents")).toBeInTheDocument();
    expect(screen.getByText("Outputs")).toBeInTheDocument();
    expect(screen.queryByText("Scout government contract opportunities")).not.toBeInTheDocument();

    const workflowCard = screen.getAllByText("Government Contract Pipeline").map((node) => node.closest("button")).find(Boolean);
    await user.click(workflowCard);
    expect(screen.getByRole("heading", { name: "Government Contract Pipeline" })).toBeInTheDocument();
    expect(screen.getByText("Workflow Progression")).toBeInTheDocument();
    expect(screen.getByText("Outputs")).toBeInTheDocument();
    expect(screen.getByText("Activity Feed")).toBeInTheDocument();
    expect(screen.getAllByText("Needs Review").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Workflows").length).toBeGreaterThan(0);
  });

  it.skip("applies workflow-scoped operator updates from command input", async () => {
    await seedWorkflowReports();
    const reports = JSON.parse(fs.readFileSync(inboxPath, "utf8"));
    mockAtlasApi(reports);
    const user = userEvent.setup();
    render(<App />);

    await waitFor(() => expect(readWorld().entities || []).toEqual(expect.arrayContaining([expect.objectContaining({ type: "Workflow", name: "Government Contract Pipeline" })])));
    const existingWorld = readWorld();
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({
      ...existingWorld,
      entities: [...existingWorld.entities, { type: "Workflow", name: "Atlas Release Pipeline", visibility: "primary" }],
      events: [
        ...existingWorld.events,
        {
          type: "WorkflowUpdated",
          target: "Atlas Release Pipeline",
          timestamp: "2026-06-20T13:00:00Z",
          details: {
            source: "agent",
            workflow_name: "Atlas Release Pipeline",
            workflow: {
              name: "Atlas Release Pipeline",
              stage: "Build",
              stage_status: "waiting",
              stages: [{ name: "Build", status: "waiting" }],
            },
          },
        },
      ],
    }));

    const input = screen.getByPlaceholderText(/log what changed/i);
    await user.clear(input);
    await user.type(input, "Human review is complete. Move this to Award Analysis. The shortlist is approved.");
    await user.click(screen.getByRole("button", { name: /log update/i }));

    await waitFor(() => {
      const world = readWorld();
      expect(world.events).toEqual(expect.arrayContaining([
        expect.objectContaining({
          type: "WorkflowUpdated",
          target: "Government Contract Pipeline",
          details: expect.objectContaining({
            workflow_name: "Government Contract Pipeline",
          }),
        }),
      ]));
    });

    clickNav("Workflows");
    expect(screen.getAllByText("Approved").length).toBeGreaterThan(0);
  });

  it.skip("advances a selected workflow to the next canonical stage", async () => {
    await seedWorkflowReports();
    const reports = JSON.parse(fs.readFileSync(inboxPath, "utf8"));
    mockAtlasApi(reports);
    const user = userEvent.setup();
    render(<App />);

    await waitFor(() => expect(readWorld().entities || []).toEqual(expect.arrayContaining([expect.objectContaining({ type: "Workflow", name: "Government Contract Pipeline" })])));

    const input = screen.getByPlaceholderText(/log what changed/i);
    await user.clear(input);
    await user.type(input, "/workflow");
    const workflowOption = await screen.findByRole("button", { name: /Government Contract Pipeline/i });
    await user.click(workflowOption);
    await user.type(input, "move to next stage");
    await user.click(screen.getByRole("button", { name: /log update/i }));

    await waitFor(() => {
      const workflowEvent = readWorld().events.findLast?.((event) => event.type === "WorkflowUpdated" && event.target === "Government Contract Pipeline");
      expect(workflowEvent?.details?.workflow?.stage_status).toBe("Approved");
    });
  });

  it("reportToAtlas sends the correct agent payload and API key header", async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        accepted: true,
        report_id: "report_adapter_smoke",
      }),
    }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await reportToAtlas({
      atlasUrl: "http://localhost:5173",
      apiKey: "dev-atlas-key",
      agentId: "codex-cli",
      agentName: "Codex CLI",
      project: "Atlas",
      message: "Fixed object page UI",
      status: "completed",
      artifacts: ["src/pages/ObjectDetail.tsx"],
      events: [{ type: "TaskCompleted", target: "Fixed object page UI" }],
      confidence: 0.91,
    });

    expect(result.accepted).toBe(true);
    expect(fetchMock).toHaveBeenCalledWith("http://localhost:5173/api/report", expect.objectContaining({
      method: "POST",
      headers: expect.objectContaining({
        "Content-Type": "application/json",
        "x-atlas-api-key": "dev-atlas-key",
      }),
    }));
    const requestBody = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(requestBody).toEqual(expect.objectContaining({
      source: "agent",
      agent_id: "codex-cli",
      agent_name: "Codex CLI",
      project: "Atlas",
      message: "Fixed object page UI",
      status: "completed",
      artifacts: ["src/pages/ObjectDetail.tsx"],
      confidence: 0.91,
    }));
    expect(requestBody.events).toEqual([expect.objectContaining({ type: "TaskCompleted", target: "Fixed object page UI" })]);
  });

  it("CLI report script works in dry-run mode with config and arguments", async () => {
    let stdout = "";
    await runReportCli([
      "--dry-run",
      "--message",
      "Fixed object page UI",
      "--status",
      "completed",
      "--project",
      "Atlas",
      "--artifact",
      "src/pages/ObjectDetail.tsx",
    ], {
      ATLAS_URL: "http://localhost:5173",
      ATLAS_AGENT_API_KEY: "dev-atlas-key",
      ATLAS_AGENT_ID: "codex-cli",
      ATLAS_AGENT_NAME: "Codex CLI",
      ATLAS_PROJECT: "Atlas",
    }, (value) => {
      stdout += value;
    });

    expect(stdout.trim()).not.toBe("");
    const output = JSON.parse(stdout);
    expect(output.dryRun).toBe(true);
    expect(output.payload).toEqual(expect.objectContaining({
      atlasUrl: "http://localhost:5173",
      apiKey: "[configured]",
      agentId: "codex-cli",
      agentName: "Codex CLI",
      project: "Atlas",
      message: "Fixed object page UI",
      status: "completed",
      artifacts: ["src/pages/ObjectDetail.tsx"],
    }));
  });

  it("reconciles agent reports into the UI alongside manual updates", async () => {
    mockAtlasApi([agentReportPayload]);
    render(<App />);
    enterAtlas();

    await waitFor(() => expect(readWorld().entities).toEqual(expect.arrayContaining([expect.objectContaining({ type: "Agent", name: "Codex CLI" })])));
    await waitFor(() => expect(readWorld().relationships).toEqual(expect.arrayContaining([
      expect.objectContaining({ source: "Codex CLI", relation: "reported_on", target: "Atlas" }),
      expect.objectContaining({ source: "Codex CLI", relation: "changed_artifact", target: "src/components/ObjectTree.tsx" }),
    ])));

    const world = readWorld();
    expect(world.entities).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: "Codex CLI" }),
      expect.objectContaining({ name: "Atlas" }),
      expect.objectContaining({ name: "src/components/ObjectTree.tsx" }),
    ]));
    expect(world.events.some((event) => event.details?.source === "agent")).toBe(true);

    clickNav("Workflows");
    expect(screen.getByRole("heading", { name: "Workflows" })).toBeInTheDocument();
    expect(screen.queryByText("Projects")).not.toBeInTheDocument();
    expect(screen.queryByText("Systems & Assets")).not.toBeInTheDocument();

    clickNav("Settings");
    expect(screen.getByText("Agent Connectivity")).toBeInTheDocument();
    expect(screen.getByText("Agent Integration")).toBeInTheDocument();
    expect(screen.getByText("Read API")).toBeInTheDocument();
    expect(screen.getByText("Report API")).toBeInTheDocument();
    expect(screen.getByText("Configured")).toBeInTheDocument();
  });
});
