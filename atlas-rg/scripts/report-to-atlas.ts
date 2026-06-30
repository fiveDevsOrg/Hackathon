#!/usr/bin/env node

import { existsSync, readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { reportToAtlas, type AtlasReportEvent } from "../src/atlas-adapter/reportToAtlas.ts";

type AgentConfig = {
  atlasUrl?: string;
  apiKeyEnv?: string;
  agentId?: string;
  agentName?: string;
  defaultProject?: string;
};

type CliOptions = {
  message?: string;
  status?: string;
  project?: string;
  artifacts: string[];
  events: AtlasReportEvent[];
  confidence?: number;
  dryRun: boolean;
};

export async function runReportCli(argv = process.argv.slice(2), env = process.env, write = (value: string) => process.stdout.write(value)) {
  const config = loadConfig();
  const args = parseArgs(argv);
  const apiKeyEnv = config.apiKeyEnv || "ATLAS_AGENT_API_KEY";
  const payload = {
    atlasUrl: env.ATLAS_URL || config.atlasUrl || "http://localhost:5173",
    apiKey: env[apiKeyEnv] || "",
    agentId: env.ATLAS_AGENT_ID || config.agentId || "codex-cli",
    agentName: env.ATLAS_AGENT_NAME || config.agentName || "Codex CLI",
    project: args.project || env.ATLAS_PROJECT || config.defaultProject || "Atlas",
    message: args.message || env.ATLAS_REPORT_MESSAGE || "",
    status: args.status || env.ATLAS_REPORT_STATUS || "completed",
    artifacts: args.artifacts.length ? args.artifacts : splitList(env.ATLAS_REPORT_ARTIFACTS),
    events: args.events.length ? args.events : defaultEvents(args),
    confidence: args.confidence ?? parseOptionalNumber(env.ATLAS_REPORT_CONFIDENCE) ?? 0.9,
  };

  if (!payload.message) {
    throw new Error('A report message is required. Use --message "Fixed object page UI".');
  }

  if (args.dryRun) {
    writeJson({ dryRun: true, payload: redactPayload(payload) }, write);
    return;
  }

  const result = await reportToAtlas(payload);
  writeJson(result, write);
}

function parseArgs(args: string[]): CliOptions {
  const options: CliOptions = {
    artifacts: [],
    events: [],
    dryRun: false,
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    const next = args[index + 1];
    if (arg === "--dry-run") {
      options.dryRun = true;
    } else if (arg === "--message") {
      options.message = consumeValue(arg, next);
      index += 1;
    } else if (arg === "--status") {
      options.status = consumeValue(arg, next);
      index += 1;
    } else if (arg === "--project") {
      options.project = consumeValue(arg, next);
      index += 1;
    } else if (arg === "--artifact") {
      options.artifacts.push(consumeValue(arg, next));
      index += 1;
    } else if (arg === "--event") {
      options.events.push(parseEvent(consumeValue(arg, next)));
      index += 1;
    } else if (arg === "--confidence") {
      options.confidence = Number(consumeValue(arg, next));
      index += 1;
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  return options;
}

function loadConfig(): AgentConfig {
  const configPath = "atlas.agent.config.json";
  if (!existsSync(configPath)) {
    return {};
  }

  return JSON.parse(readFileSync(configPath, "utf8"));
}

function defaultEvents(args: CliOptions): AtlasReportEvent[] {
  return [
    {
      type: "TaskCompleted",
      target: args.message || "Agent work",
    },
  ];
}

function parseEvent(value: string): AtlasReportEvent {
  const [type, target] = value.split(":");
  return {
    type: type || "InformationLearned",
    target: target || value,
  };
}

function splitList(value?: string) {
  return String(value || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function consumeValue(flag: string, value?: string) {
  if (!value || value.startsWith("--")) {
    throw new Error(`${flag} requires a value.`);
  }
  return value;
}

function parseOptionalNumber(value?: string) {
  if (!value) {
    return undefined;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function redactPayload(payload: Record<string, unknown>) {
  return {
    ...payload,
    apiKey: payload.apiKey ? "[configured]" : "[missing]",
  };
}

function writeJson(value: unknown, write: (value: string) => void) {
  write(`${JSON.stringify(value, null, 2)}\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runReportCli().catch((error) => {
    console.error(error.message);
    process.exit(1);
  });
}
