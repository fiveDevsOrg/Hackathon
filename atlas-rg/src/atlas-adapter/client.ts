export type AtlasClientOptions = {
  atlasUrl: string;
  apiKey: string;
};

export async function atlasGet({ atlasUrl, apiKey }: AtlasClientOptions, path: string, query: Record<string, string | undefined> = {}) {
  if (!atlasUrl) {
    throw new Error("atlasUrl is required.");
  }
  if (!apiKey) {
    throw new Error("apiKey is required.");
  }

  const url = new URL(`${atlasUrl.replace(/\/+$/, "")}${path}`);
  for (const [key, value] of Object.entries(query)) {
    if (value) {
      url.searchParams.set(key, value);
    }
  }

  const response = await fetch(url, {
    headers: {
      "x-atlas-api-key": apiKey,
    },
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload.message || payload.error || `Atlas request failed with ${response.status}.`);
  }
  return payload;
}
