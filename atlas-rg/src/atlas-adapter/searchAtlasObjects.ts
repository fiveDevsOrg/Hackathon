import { atlasGet, type AtlasClientOptions } from "./client.ts";

export async function searchAtlasObjects(options: AtlasClientOptions & { q: string }) {
  return atlasGet(options, "/api/objects/search", { q: options.q });
}
