import { atlasGet, type AtlasClientOptions } from "./client.ts";

export async function getWorkItems(options: AtlasClientOptions & { project?: string; status?: string }) {
  return atlasGet(options, "/api/work-items", { project: options.project, status: options.status });
}
