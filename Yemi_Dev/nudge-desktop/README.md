# Nudge OS

An AI copilot that **points, you click.** Type any plain-language task ("open my
email", "open the taskbar", "change my wallpaper") into a small always-on-top
control bar. Nudge looks at your screen (a screenshot) and at the live Windows
UI Automation "screen DOM" of the foreground window plus the taskbar, asks Claude
for the *single next thing to click*, and draws a click-through ember pointer on
top of it. You do every click. On each click it re-scans and re-points until the
task is done. It never clicks for you.

## How to run

From `nudge-desktop\` using the project venv:

```
.\.venv\Scripts\python.exe nudge_desktop.py
```

Type a task, press **Guide** (or Enter). An ember ring + ghost cursor + tooltip
appears over the element to click. Click it; Nudge advances automatically.
Press **Stop** to clear and reset. Drag the bar anywhere by its body.

### Verification / self-test modes

```
# No API key, no network: capture + scan + point at the first taskbar element,
# save selftest_local.png, exit after ~1s. Verifies scan + overlay plumbing.
.\.venv\Scripts\python.exe nudge_desktop.py --selftest-local

# One full cycle WITH Claude (needs ANTHROPIC_API_KEY in env): capture+scan+plan,
# point at the chosen element, save selftest.png, print {index,instruction,done}.
.\.venv\Scripts\python.exe nudge_desktop.py --selftest --task "open my email"
```

## The UIA-vs-vision boundary

The planner is grounded by **Windows UI Automation**: it enumerates named,
on-screen, interactive controls (buttons, edits, links, list/menu items, etc.)
with exact screen rectangles for the foreground window and for the taskbar
(`Shell_TrayWnd`). Those become the numbered "marks" the model chooses from, and
the rectangle is what the overlay points at. A screenshot is also sent so the
model has visual context, but the **click targets come from UIA**, not from the
pixels.

Some windows are **custom-drawn** (e.g. a Unity game, some Electron canvases) and
return zero UIA elements. Nudge handles this gracefully: it tells you "No
detectable UI elements in this window (a vision add-on would cover it) -- try the
taskbar," and still shows taskbar marks so you can navigate away. It never
crashes on an empty foreground. Pixel-level targeting of custom-drawn UI is the
job of a future **vision add-on** and is out of scope here.

## Scope: OS / native / taskbar (not web pages)

Nudge OS targets the **operating system, native apps, and the taskbar** -- the
things UIA exposes. Guiding *inside web pages* (DOM elements within a browser
tab) is the job of the browser **extension**, not this desktop app. This app
focuses on getting you to and around native Windows surfaces.

## Architecture (threading)

Three long-lived pieces and exactly three threads of concern:

1. **Control bar** -- frameless, always-on-top, draggable, interactive command
   window (task field, Guide, Stop, status). Lives on the GUI thread.
2. **Overlay** -- the click-through ember pointer (`point_at(rect, label)` /
   `clear()`). GUI thread.
3. **Engine loop** -- `scan_marks()` (UIA), `grab_screen()` (mss/PIL), and
   `plan(task, marks, history, img_b64)` (Anthropic, model
   `claude-haiku-4-5-20251001`) run on a **PlanWorker QThread** so the UI never
   blocks. A **pynput mouse listener** runs on its own thread and only emits a Qt
   signal; the main thread debounces ~750ms after each click, appends the clicked
   target to history, and re-runs the cycle. All cross-thread updates go through
   `pyqtSignal`; no Qt object is ever touched off the GUI thread.

`plan()` returns strict JSON `{"index", "instruction", "done"}` validated against
the marks list; on any error/timeout/invalid output it falls back to a local
token-match heuristic (`source="local"`) so the app keeps guiding without a key
or network.
