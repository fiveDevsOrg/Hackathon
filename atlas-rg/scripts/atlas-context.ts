#!/usr/bin/env node

import { pathToFileURL } from "node:url";
import { getAtlasContext } from "../src/atlas-adapter/getAtlasContext.ts";
import { getAtlasCliConfig, parseFlag, writeJson } from "./atlas-cli-config.ts";

export async function runContextCli(argv = process.argv.slice(2), env = process.env, write = (value: string) => process.stdout.write(value)) {
  const config = getAtlasCliConfig(env);
  const project = parseFlag(argv, "--project") || config.project;
  const result = await getAtlasContext({ atlasUrl: config.atlasUrl, apiKey: config.apiKey, project });
  writeJson(result, write);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runContextCli().catch((error) => {
    console.error(error.message);
    process.exit(1);
  });
}
