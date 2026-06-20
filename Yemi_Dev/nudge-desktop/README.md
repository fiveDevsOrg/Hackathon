# Nudge OS

**An AI copilot that POINTS at what to click — you stay in control.**

Nudge OS is a small, always-on-top control bar for Windows. Type any plain-language
task — *"open my email"*, *"change my wallpaper"*, *"get to Bluetooth settings"* — and
Nudge looks at your screen, figures out the single next thing to click, and draws a
glowing **ember pointer** over it. You do every click. After each one it re-scans and
re-points until the task is done.

It never clicks for you. It just shows you the way.

---

## How it works

Nudge runs a tight perceive → plan → point → wait loop:

1. **UIA screen DOM** — Using Windows UI Automation, Nudge enumerates the named,
   on-screen, interactive controls (buttons, edits, links, list/menu items, …) of the
   foreground window *and* the taskbar (`Shell_TrayWnd` / `Shell_SecondaryTrayWnd`),
   each with an exact screen rectangle. These become the numbered "marks" the model
   chooses from — and the rectangle is what the overlay points at.
2. **Claude vision planner** — A screenshot plus the list of marks is sent to Claude
   (`claude-haiku-4-5-20251001`) off the GUI thread. It returns strict JSON
   `{"index", "instruction", "done"}` selecting one mark and explaining the step. The
   pixels give the model context; the *click target* always comes from UIA.
3. **Click-through ember overlay** — A frameless, transparent, click-through window
   draws an ember ring + ghost cursor + tooltip over the chosen rectangle. It spans the
   entire virtual desktop so it can land on any monitor, and never intercepts your clicks.
4. **Auto-advance watcher** — A mouse listener detects your click; the loop debounces,
   appends the clicked target to history, and re-runs — so guidance advances on its own
   as you go.
5. **Adaptive settle** — After a click, Nudge waits for the screen to stop changing
   (polling a fingerprint until it's stable for several quiet ticks) before re-scanning,
   so it doesn't point at a half-loaded window.
6. **Multi-monitor aware** — Capture, UIA scan, taskbar detection, and the overlay are
   all virtual-desktop aware, including secondary-monitor taskbars.

If Claude is unavailable (no key, no network, a timeout, or invalid output), the planner
falls back to a **local token-match heuristic** so Nudge keeps guiding.

> **Scope:** Nudge OS targets the operating system, native apps, and the taskbar — the
> surfaces UIA exposes. Guiding *inside* a web page's DOM is the job of a browser
> extension, not this desktop app.

---

## Quick start (from source)

Requires **Windows** and **Python 3.13**.

```bat
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
set ANTHROPIC_API_KEY=sk-ant-...
python nudge_desktop.py
```

Type a task into the bar and press **Guide** (or Enter). An ember ring appears over the
element to click; click it and Nudge advances automatically. Press **Stop** to clear and
reset. Drag the bar anywhere by its body.

> No `ANTHROPIC_API_KEY`? Nudge still runs — it drops to the local heuristic planner (see
> [Troubleshooting](#troubleshooting)).

### One-double-click launcher

For a no-terminal start, double-click **`run_nudge.cmd`**. It creates the `.venv` on first
run, installs dependencies once, then launches the app windowed (no console) with
`pythonw.exe`. Any CLI flags you pass are forwarded through.

---

## Building a standalone EXE

Produce a self-contained Windows build with PyInstaller:

```bat
pip install -r requirements-build.txt
pyinstaller nudge.spec --noconfirm
```

The result is a one-folder bundle:

```
dist\NudgeOS\NudgeOS.exe
```

Ship the whole `dist\NudgeOS\` folder; `NudgeOS.exe` is the launcher.

---

## CLI flags

| Flag | What it does |
| --- | --- |
| `--version` | Print `Nudge OS <version>` and exit. |
| `--shot` | Capture the current screen to a file and exit (capture smoke test). |
| `--selftest-local` | No API key, no network — capture, scan, point at the first taskbar mark, save `selftest_local.png`, exit. Verifies the scan + overlay plumbing. |
| `--selftest --task "..."` | One full cycle **with Claude** (needs `ANTHROPIC_API_KEY`): capture + scan + plan, point at the chosen element, save `selftest.png`, print `{index, instruction, done}`. |
| `--debug` | Enable verbose debug logging for this run. |

```bat
python nudge_desktop.py --version
python nudge_desktop.py --selftest-local
python nudge_desktop.py --selftest --task "open my email"
```

---

## Hotkeys

| Hotkey | Action |
| --- | --- |
| **Ctrl + Alt + N** | Show / hide the control bar (summons and focuses it when hidden). |
| **Ctrl + Alt + X** | Stop guiding (global). |
| **Esc** | Stop guiding (when the bar is focused). |
| **Ctrl + Alt + P** | Pause / resume guiding (keeps task context). |

---

## Agent control (HTTP API + MCP)

Nudge isn't only driven by the text box — **an AI agent can drive it.** The agent supplies
the task or the exact steps; Nudge guides *you* through them (it points, you click) and
reports progress back. Supervised autonomy: the agent directs, you stay in the loop.

While the app is running it serves a **localhost HTTP API** on `127.0.0.1:8765` (localhost
only; set `control_port` in `config.json` to change it). Set a `NUDGE_TOKEN` env var to
require an `X-Nudge-Token` header on every request.

| Method & path | Body | Does |
| --- | --- | --- |
| `GET /health` | — | Liveness `{ok, app}` (no auth). |
| `GET /status` | — | Snapshot: `{guiding, scripted, task, step, total, route, route_index, current, state, result, version}`. |
| `POST /guide` | `{"task": "..."}` | Start an autonomous guide (Nudge plans it). |
| `POST /guide_steps` | `{"steps": [...], "task": "..."}` | Guide through your explicit ordered steps; they become the route. |
| `POST /pause` | — | Pause / resume. |
| `POST /stop` | — | Stop guiding. |

Example (anything that can POST — n8n, Make, curl, your code):

```bash
curl -X POST http://127.0.0.1:8765/guide_steps \
  -H "Content-Type: application/json" \
  -d '{"task":"open settings","steps":["Open the Start menu","Click Settings","Open Display"]}'
curl http://127.0.0.1:8765/status      # poll for progress / completion
```

### Claude / Claude Code (MCP)

`nudge_mcp.py` is a stdio MCP server wrapping the API as native agent tools. Register it
(the Nudge desktop app must be running):

```bat
pip install -r requirements.txt
claude mcp add nudge -- .venv\Scripts\python.exe nudge_mcp.py
```

Tools: `nudge_guide(task)`, `nudge_guide_steps(steps, task, wait, timeout_s)`,
`nudge_status()`, `nudge_wait_until_done(timeout_s)`, `nudge_stop()`. With `wait=True`
(default), `nudge_guide_steps` **blocks until you finish the steps**, so the agent's tool
call returns only once the work is actually done.

> **Roadmap:** today Nudge points and *you* click (supervised). A future opt-in
> **autopilot** mode will let the agent execute the clicks itself — behind per-action
> confirmation, allow/deny lists, a kill-switch, and an audit log.

---

## Configuration & logs

Per-user data lives in:

```
%APPDATA%\NudgeOS\
```

- **`config.json`** — settings (model, auto-advance, screen index, overlay intensity,
  text-to-speech, theme, update checks, recent tasks, …). Written atomically.
- **`debug.log`** — rolling debug log.

The directory is created on first run. Bundled read-only assets (e.g. the app icon) ship
inside the app folder and are resolved automatically whether running from source or a
frozen build.

---

## Features

- Plain-language tasks → a single, unambiguous next click.
- UIA-grounded targeting with exact on-screen rectangles (not guessed pixel coordinates).
- Claude vision planner with a local heuristic fallback — works with or without a key.
- Click-through ember overlay: ring + ghost cursor + tooltip that never steals your clicks.
- Auto-advance watcher — points re-plan automatically after each click.
- Adaptive settle — waits for windows to finish loading before re-pointing.
- Multi-monitor and secondary-taskbar aware.
- Global hotkeys for show/hide and stop.
- Graceful empty-foreground handling — custom-drawn windows fall back to taskbar marks.
- Optional text-to-speech read-out of each step.
- Frozen-aware paths so source and EXE builds behave identically.
- Never-crash design: every risky operation degrades to a safe default.

---

## Troubleshooting

**No API key.** If `ANTHROPIC_API_KEY` isn't set (or the call fails / times out / returns
invalid output), Nudge drops to a **local heuristic mode** that token-matches your task
against the on-screen marks. It still points — just less smartly. Set the key in your
environment and restart for full vision planning.

**Custom-drawn apps and games.** Some windows (a Unity game, certain Electron canvases)
render their UI as raw pixels and expose **zero UIA elements**. Nudge can't point inside
them — there are no marks to target. Instead of crashing, it tells you no detectable UI
elements were found and keeps showing **taskbar marks** so you can navigate away.
Pixel-level targeting of custom-drawn UI is the job of a future vision add-on and is out
of scope here.

**Pointer on the wrong monitor.** Capture and overlay are virtual-desktop aware. If the
target screen looks off, check the configured screen index in `config.json` and make sure
the foreground window is on the screen you expect.
