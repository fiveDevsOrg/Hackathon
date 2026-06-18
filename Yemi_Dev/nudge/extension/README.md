# Nudge — AI guided overlay (Chrome extension)

Nudge is an AI guided-overlay copilot. Click the toolbar icon on any website, type
what you want to do, and Nudge draws a glowing ring, a ghost cursor, and a tooltip
over the single element you should click next. It only *points* — you do the clicking
— and it advances step by step as you follow along.

Because the engine runs as a Manifest V3 **content script in Chrome's isolated
world**, it works even on CSP-strict sites (Hacker News, Google, etc.) where a
bookmarklet that injects a `<script>` tag would be blocked.

## Load unpacked

1. Open `chrome://extensions` in Chrome.
2. Toggle **Developer mode** on (top-right).
3. Click **Load unpacked**.
4. Select this `extension` folder.

Nudge now appears in the toolbar. (No popup — clicking the icon runs Nudge directly.)

## How to use

1. Go to any normal web page (`http://` or `https://`).
2. Click the **Nudge** toolbar icon. A task bar slides in at the top of the page.
3. Type a task, e.g. *"search for the latest AI news"* or *"sign in"*.
4. Click **Guide me** (or press Enter). Follow the ghost cursor and click the ringed
   element. Nudge re-plans and points at the next step automatically.
   - **Skip** — skip the current suggestion and try the next-best element.
   - **×** (or Esc) — close Nudge.
5. Clicking the toolbar icon again just re-opens the bar (it does not duplicate).

The status line under the bar shows an **AI** or **Heuristic** badge so you can see
which brain produced each step.

## AI brain

The AI brain is served by the project's Vercel deployment at
`https://nudge-sooty.vercel.app/api/guide` (proxied through the background service
worker, which is why it works cross-origin from any page).

- The route uses Claude (`claude-haiku-4-5`) and needs **`ANTHROPIC_API_KEY` set in
  the Vercel project** environment variables.
- If the key is **not** set (or the request fails / times out), Nudge silently falls
  back to the on-page **heuristic** planner — it still works, just without the LLM's
  multi-step reasoning. The badge shows which one ran.

## Files

- `manifest.json` — MV3 manifest (action, background worker, `activeTab` + `scripting`
  permissions, host permission for the Vercel API).
- `content-engine.js` — the guidance engine (shadow-DOM task bar + overlay, element
  scanner, heuristic + AI planner). Injected on demand.
- `background.js` — service worker: injects the engine on icon click and proxies AI
  planning requests to `/api/guide`.
