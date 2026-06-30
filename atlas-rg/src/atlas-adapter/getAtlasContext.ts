import { atlasGet, type AtlasClientOptions } from "./client.ts";

export async function getAtlasContext(options: AtlasClientOptions & { project?: string }) {
  return atlasGet(options, "/api/context", { project: options.project });
}
