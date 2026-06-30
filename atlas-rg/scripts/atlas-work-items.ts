#!/usr/bin/env node

import { pathToFileURL } from "node:url";
import { getWorkItems } from "../src/atlas-adapter/getWorkItems.ts";
import { getAtlasCliConfig, parseFlag, writeJson } from "./atlas-cli-config.ts";

export async function runWorkItemsCli(argv = process.argv.slice(2), env = process.env, write = (value: string) => process.stdout.write(value)) {
  const config = getAtlasCliConfig(env);
  const project = parseFlag(argv, "--project") || config.project;
  const status = parseFlag(argv, "--status");
  const result = await getWorkItems({ atlasUrl: config.atlasUrl, apiKey: config.apiKey, project, status });
  writeJson(result, write);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runWorkItemsCli().catch((error) => {
    console.error(error.message);
    process.exit(1);
  });
}
