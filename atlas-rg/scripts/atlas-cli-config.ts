import { existsSync, readFileSync } from "node:fs";

type AgentConfig = {
  atlasUrl?: string;
  apiKeyEnv?: string;
  defaultProject?: string;
};

export function getAtlasCliConfig(env = process.env) {
  const config = loadConfig();
  const apiKeyEnv = config.apiKeyEnv || "ATLAS_AGENT_API_KEY";
  return {
    atlasUrl: env.ATLAS_URL || config.atlasUrl || "http://localhost:5173",
    apiKey: env[apiKeyEnv] || "",
    project: env.ATLAS_PROJECT || config.defaultProject || "Atlas",
  };
}

export function parseFlag(args: string[], name: string) {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
}

export function writeJson(value: unknown, write = (text: string) => process.stdout.write(text)) {
  write(`${JSON.stringify(value, null, 2)}\n`);
}

function loadConfig(): AgentConfig {
  const configPath = "atlas.agent.config.json";
  if (!existsSync(configPath)) {
    return {};
  }
  return JSON.parse(readFileSync(configPath, "utf8"));
}
