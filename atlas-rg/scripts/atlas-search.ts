#!/usr/bin/env node

import { pathToFileURL } from "node:url";
import { searchAtlasObjects } from "../src/atlas-adapter/searchAtlasObjects.ts";
import { getAtlasCliConfig, parseFlag, writeJson } from "./atlas-cli-config.ts";

export async function runSearchCli(argv = process.argv.slice(2), env = process.env, write = (value: string) => process.stdout.write(value)) {
  const config = getAtlasCliConfig(env);
  const q = parseFlag(argv, "--q") || "";
  if (!q) {
    throw new Error('Search query is required. Use --q "object detail".');
  }
  const result = await searchAtlasObjects({ atlasUrl: config.atlasUrl, apiKey: config.apiKey, q });
  writeJson(result, write);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runSearchCli().catch((error) => {
    console.error(error.message);
    process.exit(1);
  });
}
