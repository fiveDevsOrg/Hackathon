import { track } from "@vercel/analytics";

// Thin wrapper around Vercel Analytics custom events. Safe to call anywhere
// (no-ops on the server / if analytics is unavailable).
export function ev(
  name: string,
  props?: Record<string, string | number | boolean>,
) {
  try {
    track(name, props);
  } catch {
    /* analytics is best-effort */
  }
}
