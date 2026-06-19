"""Nudge OS -- an AI copilot that POINTS, you click.

A frameless always-on-top control bar takes a plain-language task ("open my
email", "open the taskbar / Start", "change my wallpaper"), looks at the screen
the way you do (a screenshot) and at the live UI Automation "screen DOM" of the
foreground window + the taskbar, asks Claude for the SINGLE next thing to click,
and draws a click-through ember pointer on top of it. You do the clicking; on
every click it re-scans and re-points until the task is done.

Two proven foundations are reused verbatim in spirit:
  * poc_uia.py    -> scan_marks(): UIA interactive elements (name/type/rect) for
                     the foreground window AND the taskbar (Shell_TrayWnd).
  * poc_overlay.py-> Overlay: frameless, translucent, always-on-top, CLICK-
                     THROUGH ember ring + ghost cursor + flip-up tooltip.

------------------------------------------------------------------------------
THREADING MODEL (read this before touching anything)
------------------------------------------------------------------------------
Qt objects may ONLY be touched from the main (GUI) thread. Everything that can
block -- the UIA tree walk, the mss screen grab, the Anthropic HTTP call -- runs
OFF the main thread on a PlanWorker(QThread). The worker NEVER touches a Qt
widget; it only emits a `finished` pyqtSignal carrying a plain dict of results,
which Qt delivers back on the main thread where we update the overlay + status.

The global mouse listener (pynput.mouse.Listener) runs on its OWN thread too. It
must NOT call any Qt code directly. Instead it emits through a ClickBridge
QObject's `clicked` pyqtSignal; the connected slot runs on the main thread,
debounces ~750ms with a QTimer, and only then kicks off the next PlanWorker.

So there are exactly three long-lived threads of concern:
  1. main/GUI thread   -- control bar, overlay, all widget mutation
  2. PlanWorker thread -- capture + scan + plan (one-shot, recreated per cycle)
  3. mouse-listener thread -- detects clicks, signals the main thread only
All cross-thread communication is via pyqtSignal. No Qt call ever leaves thread 1.
------------------------------------------------------------------------------
"""
import base64
import io
import json
import math
import os
import re
import sys
import threading
import traceback

from PyQt5 import QtCore, QtGui, QtWidgets

# ---- optional companion modules (guarded: the app still runs standalone) ----
try:
    import paths as _paths
except Exception:
    _paths = None
try:
    import version as _version
except Exception:
    _version = None
try:
    from nudge_log import get_logger as _get_logger, set_level as _log_set_level
    _LOG = _get_logger()
except Exception:
    _LOG, _log_set_level = None, None
try:
    import settings as _settings_mod
    _CFG = _settings_mod.Settings()
except Exception:
    _settings_mod, _CFG = None, None
try:
    import prompts as _prompts
except Exception:
    _prompts = None
# UI / feature modules -- all guarded; any missing one just disables its feature
for _m in ("icons", "presets", "tray", "tts", "autostart", "onboarding",
           "updatecheck", "explain", "planner_preview"):
    try:
        globals()["_" + _m] = __import__(_m)
    except Exception:
        globals()["_" + _m] = None

# ---- branding --------------------------------------------------------------
APP_NAME = getattr(_version, "__appname__", "Nudge OS")
APP_VERSION = getattr(_version, "__version__", "0.4.0")
APP_TAGLINE = getattr(_version, "__tagline__", "I point. You click.")
APP_URL = "https://aiautomatesolution.com"

# ---- palette ---------------------------------------------------------------
# Brand ember on ink (AIAS). Kept as QColor for the painter; hex twins below
# feed the stylesheet. THEME centralizes every colour so re-skinning is 1 edit.
EMBER = QtGui.QColor("#FF6B35")
EMBER_HI = QtGui.QColor("#FF8A5B")
INK = QtGui.QColor(18, 20, 26, 242)
BONE = QtGui.QColor("#F4F2EC")

THEME = {
    "ember": "#FF6B35",
    "ember_hi": "#FF8A5B",
    "ember_dim": "#C9531F",
    "ink": "#12141A",
    "ink2": "#0E0D0C",
    "panel": "rgba(18,20,26,242)",
    "edge": "#3A3530",
    "bone": "#F4F2EC",
    "muted": "#B9B2A8",
    "ok": "#5BD08A",
    "warn": "#FFC857",
    "err": "#FF5C5C",
}

MODEL = "claude-haiku-4-5-20251001"
ANTHROPIC_TIMEOUT = 8.0  # seconds; never let a hung HTTP call wedge a worker
MAX_MARKS = 60          # cap on elements sent to the planner
TARGET_W = 1280         # screenshot downscale width sent to the model
HERE = os.path.dirname(os.path.abspath(__file__))

# ---- auto-advance watcher tuning ------------------------------------------
WATCH_MS = 450          # how often to sample the region around the target
WATCH_CHANGE = 0.18     # fraction of the region that must differ vs the
                        # baseline to count as "the user did something"
                        # (low enough to catch a menu/app opening, high
                        #  enough to ignore a hover highlight)
WATCH_SETTLE = 0.06     # once changed, advance only when consecutive frames
                        # are this close -- i.e. the screen stopped moving

# ---- post-action settle tuning (wait for a program to finish loading) -----
SETTLE_POLL_MS = 300    # how often to check whether the screen has settled
SETTLE_MIN_MS = 450     # always wait at least this long before re-planning
SETTLE_MAX_MS = 9000    # but never wait longer than this (cap for slow loads)
SETTLE_STABLE = 2       # this many consecutive quiet polls => settled
SETTLE_TOL = 0.05       # frame-to-frame diff below this == "not moving"
SETTLE_HINT_MS = 1200   # after this long still moving, tell the user we're
                        # waiting for it to load

# ---- safety caps -----------------------------------------------------------
HISTORY_CAP = 25        # trim the clicked-history we send to the planner
INFLIGHT_CAP = 6        # max concurrently-tracked PlanWorkers
STALL_LIMIT = 4         # re-pointing the same target this many times -> warn


# ===========================================================================
# UIA scan -- lifted from poc_uia.py, returns a flat list of marks
# ===========================================================================
try:
    import uiautomation as _auto
except Exception:  # pragma: no cover - import guard
    _auto = None

if _auto is not None:
    INTERACTIVE = {
        _auto.ControlType.ButtonControl,
        _auto.ControlType.EditControl,
        _auto.ControlType.HyperlinkControl,
        _auto.ControlType.CheckBoxControl,
        _auto.ControlType.RadioButtonControl,
        _auto.ControlType.ComboBoxControl,
        _auto.ControlType.ListItemControl,
        _auto.ControlType.MenuItemControl,
        _auto.ControlType.TabItemControl,
        _auto.ControlType.TreeItemControl,
        _auto.ControlType.SplitButtonControl,
    }
else:  # pragma: no cover
    INTERACTIVE = set()


def _walk(ctrl, depth, maxdepth, out, cap):
    """Depth-first collect named, sized, interactive controls (from poc_uia)."""
    if len(out) >= cap or depth > maxdepth:
        return
    try:
        children = ctrl.GetChildren()
    except Exception:
        children = []
    for c in children:
        try:
            r = c.BoundingRectangle
            w, h = r.width(), r.height()
            name = (c.Name or "").strip()
            if w > 0 and h > 0 and name and c.ControlType in INTERACTIVE:
                out.append({
                    "name": name[:50],
                    "type": c.ControlTypeName,
                    "rect": (r.left, r.top, w, h),
                })
        except Exception:
            pass
        _walk(c, depth + 1, maxdepth, out, cap)
        if len(out) >= cap:
            return


def _taskbar_for_screen(screen_rect):
    """The taskbar UIA control on `screen_rect` (left,top,w,h), else the primary.

    Windows puts the primary taskbar in Shell_TrayWnd and each secondary
    monitor's taskbar in its own Shell_SecondaryTrayWnd -- so on a multi-monitor
    setup we must pick the one that lives on the screen we're assisting.
    """
    try:
        cands = []
        for c in _auto.GetRootControl().GetChildren():
            cn = c.ClassName or ""
            if cn in ("Shell_TrayWnd", "Shell_SecondaryTrayWnd"):
                r = c.BoundingRectangle
                cands.append((c, cn, (r.left + r.right) // 2, (r.top + r.bottom) // 2))
        if screen_rect:
            sl, st, sw, sh = screen_rect
            for c, cn, cx, cy in cands:
                if sl <= cx < sl + sw and st <= cy < st + sh:
                    return c
        for c, cn, cx, cy in cands:
            if cn == "Shell_TrayWnd":
                return c
        return cands[0][0] if cands else None
    except Exception:
        return None


# foreground window context (title + process name) captured per scan, kept in
# thread-local storage so concurrent PlanWorkers never read each other's value
_scan_ctx = threading.local()


def _proc_name(hwnd):
    """Best-effort process image basename for a window handle (e.g. 'chrome.exe')."""
    try:
        import ctypes
        from ctypes import wintypes
        pid = wintypes.DWORD()
        ctypes.windll.user32.GetWindowThreadProcessId(hwnd, ctypes.byref(pid))
        h = ctypes.windll.kernel32.OpenProcess(0x1000, False, pid.value)  # QUERY_LIMITED
        if not h:
            return ""
        try:
            buf = ctypes.create_unicode_buffer(260)
            size = wintypes.DWORD(260)
            if ctypes.windll.kernel32.QueryFullProcessImageNameW(h, 0, buf, ctypes.byref(size)):
                return os.path.basename(buf.value)
        finally:
            ctypes.windll.kernel32.CloseHandle(h)
    except Exception:
        pass
    return ""


def scan_marks(screen_rect=None):
    """Return (marks, fg_count, taskbar_count).

    marks: [{i, name, type, rect:(x,y,w,h)}] for the foreground window first,
    then the taskbar (Shell_TrayWnd) ALWAYS appended so "open the taskbar /
    Start / open <app>" works even when the foreground app has no useful UI.
    Capped at MAX_MARKS. Never raises -- on any failure returns what it has.
    """
    fg = []
    tb = []
    if _auto is None:
        return [], 0, 0
    try:
        _auto.SetGlobalSearchTimeout(2)
    except Exception:
        pass
    # foreground window (+ capture its title/app for the planner prompt)
    title, appname = "", ""
    try:
        hwnd = _auto.GetForegroundWindow()
        win = _auto.ControlFromHandle(hwnd)
        if win is not None:
            try:
                title = (win.Name or "").strip()[:120]
            except Exception:
                title = ""
            _walk(win, 0, 25, fg, 80)
        appname = _proc_name(hwnd)
    except Exception:
        _logx("scan_marks.fg", "")
    _scan_ctx.win_title = title
    _scan_ctx.app_name = appname
    # taskbar on the TARGET screen (primary, or a secondary monitor's taskbar)
    try:
        tray = _taskbar_for_screen(screen_rect)
        if tray is not None:
            _walk(tray, 0, 14, tb, 40)
    except Exception:
        traceback.print_exc()

    marks = []
    seen = set()
    # foreground first, then taskbar, de-duped by (name, rect)
    for e in fg + tb:
        key = (e["name"], e["rect"])
        if key in seen:
            continue
        seen.add(key)
        marks.append(e)
        if len(marks) >= MAX_MARKS:
            break
    # If foreground crowded out the taskbar, force a few taskbar items back in.
    if tb and not any(m in tb for m in marks):
        for e in tb[:8]:
            key = (e["name"], e["rect"])
            if key in seen:
                continue
            seen.add(key)
            marks.append(e)
    for idx, m in enumerate(marks):
        m["i"] = idx
    return marks, len(fg), len(tb)


# ===========================================================================
# Screen grab -- mss + PIL, downscaled, base64 PNG
# ===========================================================================
import os as _os

try:
    _DBG = _paths.log_path() if _paths else _os.path.join(HERE, "debug.log")
except Exception:
    _DBG = _os.path.join(HERE, "debug.log")
_DEBUG_ON = False  # flipped on by --debug; _dbg() is a no-op otherwise


def set_debug(on):
    """Enable/disable the debug trace."""
    global _DEBUG_ON
    _DEBUG_ON = bool(on)
    if _log_set_level:
        try:
            _log_set_level(_DEBUG_ON)
        except Exception:
            pass
    if _DEBUG_ON and _LOG is None:
        try:
            with open(_DBG, "w", encoding="utf-8") as f:
                f.write("--- nudge debug log ---\n")
        except Exception:
            pass


def _dbg(msg):
    if not _DEBUG_ON:
        return
    if _LOG is not None:
        try:
            _LOG.debug(str(msg))
            return
        except Exception:
            pass
    try:
        with open(_DBG, "a", encoding="utf-8") as f:
            f.write(str(msg) + "\n")
    except Exception:
        pass


def _logx(where, exc):
    """Always-on error breadcrumb -> rotating log (best effort), plus stderr."""
    if _LOG is not None:
        try:
            _LOG.exception("ERROR in %s: %r", where, exc)
            return
        except Exception:
            pass
    try:
        with open(_DBG, "a", encoding="utf-8") as f:
            f.write("ERROR in %s: %r\n%s\n" % (where, exc, traceback.format_exc()))
    except Exception:
        pass


def guard(fn):
    """Wrap a Qt slot / timer callback so an exception is logged but never
    propagates -- a single bad tick must never tear down the event loop."""
    def wrapper(*a, **k):
        try:
            return fn(*a, **k)
        except Exception as ex:  # pragma: no cover - safety net
            _logx(fn.__name__, ex)
            return None
    wrapper.__name__ = getattr(fn, "__name__", "wrapped")
    wrapper.__doc__ = getattr(fn, "__doc__", None)
    return wrapper


def install_excepthook():
    """Last-resort hook: log unhandled exceptions instead of dying silently."""
    prev = sys.excepthook

    def hook(et, ev, tb):
        try:
            with open(_DBG, "a", encoding="utf-8") as f:
                f.write("UNHANDLED: %r\n%s\n" % (
                    ev, "".join(traceback.format_exception(et, ev, tb))))
        except Exception:
            pass
        try:
            prev(et, ev, tb)
        except Exception:
            pass

    sys.excepthook = hook


def mss_index_for(qgeom):
    """Map a Qt QScreen.geometry() to an mss monitor index (1-based). 1 on miss."""
    try:
        import mss
        with mss.mss() as sct:
            for i, m in enumerate(sct.monitors):
                if i == 0:
                    continue
                if m["left"] == qgeom.left() and m["top"] == qgeom.top():
                    return i
    except Exception:
        pass
    return 1


def grab_screen(mon_index=1):
    """Return (PIL.Image rgb, base64_png_str, scale).

    Captures the given monitor (1-based mss index) with mss, downscales to
    TARGET_W wide.
    scale = downscaled_width / original_width (kept for completeness; the model
    is given real-pixel mark rects so it does not need to undo the scale).
    Never raises -- returns (None, None, 1.0) on failure.
    """
    try:
        import mss
        from PIL import Image
    except Exception:
        traceback.print_exc()
        return None, None, 1.0
    try:
        with mss.mss() as sct:
            mons = sct.monitors
            mon = mons[mon_index] if 0 < mon_index < len(mons) else mons[1]
            shot = sct.grab(mon)
            img = Image.frombytes("RGB", shot.size, shot.bgra, "raw", "BGRX")
        ow = img.width
        scale = 1.0
        if ow > TARGET_W:
            scale = TARGET_W / float(ow)
            img = img.resize((TARGET_W, max(1, int(img.height * scale))))
        buf = io.BytesIO()
        img.save(buf, format="PNG")
        b64 = base64.b64encode(buf.getvalue()).decode("ascii")
        return img, b64, scale
    except Exception:
        traceback.print_exc()
        return None, None, 1.0


# ===========================================================================
# Auto-advance watcher -- detect that the user completed the current step by
# watching the foreground window + a tiny fingerprint of the screen region
# around the element we're pointing at. Pure Win32 + a small mss grab; cheap
# enough to run on a 450ms QTimer on the main thread.
# ===========================================================================
def _fg_hwnd():
    """The foreground window handle (pure Win32, no COM)."""
    try:
        import ctypes
        return int(ctypes.windll.user32.GetForegroundWindow())
    except Exception:
        return 0


# one cached mss instance PER THREAD -- mss isn't thread-safe and constructing
# one per poll is wasteful (the settle/watch timers sample at 2-3 Hz). The main
# (GUI) thread reuses its instance across polls so sampling stops hitching.
_mss_tls = threading.local()


def _get_sct():
    sct = getattr(_mss_tls, "sct", None)
    if sct is None:
        import mss
        sct = mss.mss()
        _mss_tls.sct = sct
    return sct


def _drop_sct():
    try:
        s = getattr(_mss_tls, "sct", None)
        if s is not None:
            s.close()
    except Exception:
        pass
    _mss_tls.sct = None


def _center_crop(geom, frac=0.66):
    """A centered sub-rect (l,t,w,h) of a QRect screen geometry, so the settle /
    keyboard-step watch never grabs the FULL screen on the GUI thread."""
    try:
        cw, ch = int(geom.width() * frac), int(geom.height() * frac)
        cl = geom.left() + (geom.width() - cw) // 2
        ct = geom.top() + (geom.height() - ch) // 2
        return (cl, ct, cw, ch)
    except Exception:
        return (geom.left(), geom.top(), geom.width(), geom.height())


def region_hash(rect, pad=44, cells=24):
    """A tiny grayscale fingerprint (bytes, cells*cells) of the screen area
    around `rect` (absolute screen px), or None. Region is padded so a hover
    highlight on the element alone doesn't dominate the diff. Reuses one mss
    instance per thread; recreates it once if a grab fails.
    """
    for _attempt in range(2):
        try:
            from PIL import Image
            x, y, w, h = rect
            left, top = int(x - pad), int(y - pad)
            width, height = int(w + pad * 2), int(h + pad * 2)
            sct = _get_sct()
            vb = sct.monitors[0]  # bounding box of all monitors
            # clamp to the virtual desktop so mss never grabs out of bounds
            l2 = max(vb["left"], left)
            t2 = max(vb["top"], top)
            r2 = min(vb["left"] + vb["width"], left + width)
            b2 = min(vb["top"] + vb["height"], top + height)
            if r2 - l2 < 8 or b2 - t2 < 8:
                return None
            shot = sct.grab({"left": l2, "top": t2, "width": r2 - l2, "height": b2 - t2})
            img = Image.frombytes("RGB", shot.size, shot.bgra, "raw", "BGRX")
            return img.convert("L").resize((cells, cells)).tobytes()
        except Exception:
            _drop_sct()  # stale/closed instance -> recreate on the next attempt
    return None


def hash_diff(a, b, tol=24):
    """Fraction (0..1) of fingerprint cells that differ by more than `tol`.
    Returns 1.0 (treat as fully changed) if either is missing or shapes differ.
    """
    if not a or not b or len(a) != len(b):
        return 1.0
    d = 0
    for ca, cb in zip(a, b):
        if abs(ca - cb) > tol:
            d += 1
    return d / float(len(a))


def rect_on_screen(rect):
    """True if the rect has positive size and its center lies on a real screen.
    Fail-open (True on error) so a check glitch never blocks pointing."""
    try:
        x, y, w, h = rect
        if w <= 0 or h <= 0:
            return False
        cx, cy = x + w // 2, y + h // 2
        vg = QtWidgets.QApplication.primaryScreen().virtualGeometry()
        return (vg.left() <= cx <= vg.right()) and (vg.top() <= cy <= vg.bottom())
    except Exception:
        return True


# ===========================================================================
# Planner -- Anthropic call + defensive parsing + local heuristic fallback
# ===========================================================================
_STOP_WORDS = {
    "the", "a", "an", "to", "my", "me", "i", "open", "go", "click", "on",
    "in", "of", "and", "for", "with", "please", "want", "do", "this", "that",
    "show", "find", "get", "let", "into", "your", "is", "it",
}


def _tokens(s):
    return [t for t in re.findall(r"[a-z0-9]+", (s or "").lower()) if t]


def _first_json(text):
    """Extract the first balanced {...} JSON object from a string, or None."""
    if not text:
        return None
    start = text.find("{")
    while start != -1:
        depth = 0
        for j in range(start, len(text)):
            ch = text[j]
            if ch == "{":
                depth += 1
            elif ch == "}":
                depth -= 1
                if depth == 0:
                    chunk = text[start:j + 1]
                    try:
                        return json.loads(chunk)
                    except Exception:
                        break  # malformed; try next "{"
        start = text.find("{", start + 1)
    return None


def _heuristic(task, marks):
    """Pick a mark by token overlap with the task. Returns a result dict.

    Fallback ladder: best token match -> a 'Start' button -> first taskbar-ish
    item -> mark 0. source is always 'local'. Also returns `score` (the best
    token-overlap count) and `unique` (only one mark hit that top score) so the
    fast path can decide whether to trust it without a vision call.
    """
    if not marks:
        return {"index": -1, "instruction": "No UI elements detected -- try the taskbar.",
                "done": False, "source": "local", "score": 0, "unique": False}
    task_toks = set(_tokens(task)) - _STOP_WORDS
    best_i, best_score, ties = -1, 0, 0
    for m in marks:
        name_toks = set(_tokens(m["name"]))
        score = len(task_toks & name_toks)
        # light bonus for partial/substring hits (e.g. "mail" in "Outlook Mail")
        if score == 0:
            for t in task_toks:
                if len(t) >= 3 and any(t in nt or nt in t for nt in name_toks):
                    score = 1
                    break
        if score > best_score:
            best_score, best_i, ties = score, m["i"], 1
        elif score == best_score and score > 0:
            ties += 1
    unique = best_score >= 1 and ties == 1
    if best_i < 0:
        # prefer a Start button, else first mark
        for m in marks:
            if "start" in m["name"].lower():
                best_i = m["i"]
                break
        if best_i < 0:
            best_i = marks[0]["i"]
    if best_score >= 2 and unique:
        conf = 0.9
    elif best_score >= 1 and unique:
        conf = 0.65
    elif best_score >= 1:
        conf = 0.45
    else:
        conf = 0.3
    return {
        "index": best_i,
        "instruction": "Best local guess: click \"%s\"." % marks[best_i]["name"],
        "done": False,
        "source": "local",
        "score": best_score,
        "unique": unique,
        "confidence": conf,
    }


def _confident_local(h):
    """True when the heuristic found a single, strongly-matching element -- safe
    to point at instantly and confirm with a fast text-only vision call."""
    return bool(h and h.get("source") == "local" and h.get("unique")
                and h.get("score", 0) >= 1 and h.get("index", -1) >= 0)


_SYSTEM = (
    "You are Nudge OS, a screen-guidance copilot for a Windows desktop. You can "
    "see a screenshot of the user's screen and a numbered list of clickable UI "
    "elements (marks) detected on the foreground window and the taskbar. You "
    "NEVER click anything yourself -- you only point the user at the SINGLE next "
    "element they should click to make progress on their task. Choose exactly "
    "one mark from the list (by its index). Prefer the most direct next step. If "
    "the task already appears complete, set done=true. Respond with STRICT JSON "
    "ONLY, no prose, no markdown, in this exact shape: "
    '{"index": <int index into the marks list>, '
    '"instruction": "<one short sentence telling the user what to click>", '
    '"done": <true|false>}'
)


def has_api_key():
    return bool((os.environ.get("ANTHROPIC_API_KEY") or "").strip())


def _verify_done(task, img_b64, win_title=None):
    """Second opinion before declaring a task complete. Returns (complete, reason).
    Defaults to (True, '') on any error so verification can never get us stuck."""
    if not has_api_key() or _prompts is None:
        return True, ""
    try:
        import anthropic
        client = anthropic.Anthropic(timeout=ANTHROPIC_TIMEOUT, max_retries=0)
        content = []
        if img_b64:
            content.append({"type": "image", "source": {"type": "base64",
                            "media_type": "image/png", "data": img_b64}})
        q = "TASK: %s\n" % task
        if win_title:
            q += 'FOREGROUND WINDOW: "%s"\n' % win_title
        q += "Is the task visibly COMPLETE on this screen? Return the STRICT JSON."
        content.append({"type": "text", "text": q})
        msg = client.messages.create(model=_model(), max_tokens=120,
                                     system=_prompts.SYSTEM_VERIFY,
                                     messages=[{"role": "user", "content": content}])
        raw = ""
        for b in getattr(msg, "content", []) or []:
            if getattr(b, "type", None) == "text":
                raw += b.text
        data = _first_json(raw) or {}
        return bool(data.get("complete", True)), str(data.get("reason", ""))[:160]
    except Exception as ex:
        _logx("verify_done", ex)
        return True, ""


def _model():
    try:
        return _CFG.get("model", MODEL) if _CFG else MODEL
    except Exception:
        return MODEL


def plan(task, marks, history, img_b64, win_title=None, app_name=None,
         route_step=None, stuck_note=None):
    """Ask Claude for the next mark to click. Returns a validated result dict
    {index, instruction, done, source, confidence, key, type_text}. Falls back
    to a local heuristic on any error/timeout/invalid output (source='offline'
    when the API is unreachable or unconfigured). Runs OFF the main thread.
    """
    if not marks:
        return {"index": -1,
                "instruction": "No detectable UI elements -- try the taskbar.",
                "done": False, "source": "local"}
    if not has_api_key():
        fb = _heuristic(task, marks)
        fb["source"] = "offline"
        return fb

    lines = []
    for m in marks:
        x, y, w, h = m["rect"]
        lines.append("%d: %s [%s] @ (%d,%d,%d,%d)" % (m["i"], m["name"], m["type"], x, y, w, h))
    marks_text = "\n".join(lines)
    if _prompts is not None:
        system_text = _prompts.SYSTEM_PLAN
        user_text = _prompts.build_user_text(
            task, history, marks_text, win_title=win_title, app_name=app_name,
            route_step=route_step, stuck_note=stuck_note)
    else:
        system_text = _SYSTEM
        hist_text = ", ".join(history) if history else "(nothing clicked yet)"
        user_text = (
            "TASK: %s\n\nAlready clicked so far: %s\n\n"
            "Clickable elements (the screenshot shows the live screen):\n%s\n\n"
            "Return the STRICT JSON for the single next element to click."
            % (task, hist_text, marks_text))

    try:
        import anthropic
        client = anthropic.Anthropic(timeout=ANTHROPIC_TIMEOUT, max_retries=0)
        content = []
        if img_b64:
            content.append({
                "type": "image",
                "source": {"type": "base64", "media_type": "image/png", "data": img_b64},
            })
        content.append({"type": "text", "text": user_text})
        cached_sys = [{"type": "text", "text": system_text,
                       "cache_control": {"type": "ephemeral"}}]

        msg, last = None, None
        # try cached system first; on any failure fall back to a plain string
        # (also covers a transient network blip as a single retry)
        for sysp in (cached_sys, system_text):
            try:
                msg = client.messages.create(
                    model=_model(), max_tokens=320, system=sysp,
                    messages=[{"role": "user", "content": content}])
                break
            except Exception as ex:
                last = ex
                continue
        if msg is None:
            raise last or RuntimeError("no response")

        raw = ""
        for block in getattr(msg, "content", []) or []:
            if getattr(block, "type", None) == "text":
                raw += block.text
        data = _first_json(raw)
        if not isinstance(data, dict) or "index" not in data:
            return _heuristic(task, marks)
        idx = int(data.get("index", -1))
        out = {
            "instruction": str(data.get("instruction") or "Click this.").strip()[:160],
            "done": bool(data.get("done", False)),
            "source": "AI",
            "confidence": data.get("confidence"),
            "key": (data.get("key") or None),
            "type_text": (data.get("type_text") or None),
        }
        if 0 <= idx < len(marks):
            out["index"] = idx
            return out
        # a keyboard-only step or a done verdict is valid even if the index is
        # out of range (incl. a positive hallucinated index) -- honor the payload
        if out["key"] or out["type_text"] or out["done"]:
            out["index"] = -1
            return out
        # otherwise the model picked an out-of-range index -> heuristic
        return _heuristic(task, marks)
    except Exception as ex:
        _logx("plan", ex)
        fb = _heuristic(task, marks)
        fb["source"] = "offline"
        return fb


# ===========================================================================
# Overlay -- click-through ember pointer (refactored from poc_overlay.py to
# persist and expose point_at()/clear()).
# ===========================================================================
class Overlay(QtWidgets.QWidget):
    """Frameless, translucent, always-on-top, CLICK-THROUGH pointer overlay.

    point_at(rect, label) updates the target and repaints; clear() hides it.
    Lives on the main thread for its whole life.
    """

    def __init__(self):
        super().__init__()
        self.t = None         # target rect (x,y,w,h) in screen pixels, or None
        self.label = ""
        self.step = None
        self.key_label = None  # keyboard-step hint (e.g. "Press  Win+R")
        self.key_geom = None   # QRect of the screen to center the keycap on
        self._phase = 0.0     # 0..1 animation phase for the breathing ring
        self._intensity = 1.0  # user-tunable ring/glow scale (0.5..1.5)
        self.conf = 1.0        # plan confidence -> solid ember vs dashed amber
        self.setWindowFlags(
            QtCore.Qt.FramelessWindowHint
            | QtCore.Qt.WindowStaysOnTopHint
            | QtCore.Qt.Tool
        )
        self.setAttribute(QtCore.Qt.WA_TranslucentBackground)
        self.setAttribute(QtCore.Qt.WA_TransparentForMouseEvents)  # click-through
        # span the ENTIRE virtual desktop so the pointer can land on ANY monitor
        self.sg = QtWidgets.QApplication.primaryScreen().virtualGeometry()
        self.setGeometry(self.sg)
        # ~30fps breathing animation, only running while we have a target
        self._anim = QtCore.QTimer(self)
        self._anim.setInterval(33)
        self._anim.timeout.connect(self._tick)
        # one-shot green "Done" flourish
        self._flash_geom = None
        self._flash_t = 0.0
        self._flash_timer = QtCore.QTimer(self)
        self._flash_timer.setInterval(40)
        self._flash_timer.timeout.connect(self._flash_tick)

    def _tick(self):
        self._phase = (self._phase + 0.045) % 1.0
        self.update()

    def point_at(self, rect, label, step=None, confidence=1.0):
        self.t = tuple(int(v) for v in rect)
        self.label = label or ""
        self.step = step
        try:
            self.conf = 1.0 if confidence is None else float(confidence)
        except Exception:
            self.conf = 1.0
        self.key_label = None
        self._flash_t = 0.0
        self._flash_timer.stop()
        if not self.isVisible():
            self.show()
        self.raise_()
        if not self._anim.isActive():
            self._anim.start()
        self.update()

    def flash_done(self, screen_geom):
        """A one-shot green check 'Done' flourish centered on the assist screen."""
        self.t = None
        self.key_label = None
        self._flash_geom = screen_geom
        self._flash_t = 1.0
        if not self.isVisible():
            self.show()
        self.raise_()
        self._flash_timer.start()
        self.update()

    @guard
    def _flash_tick(self):
        self._flash_t -= 0.045
        if self._flash_t <= 0:
            self._flash_t = 0.0
            self._flash_timer.stop()
            self.clear()
        else:
            self.update()

    def show_key(self, label, screen_geom):
        """Show a centered keycap hint for a keyboard step (no click target)."""
        self.t = None
        self.key_label = label or ""
        self.key_geom = screen_geom
        self._flash_t = 0.0
        self._flash_timer.stop()
        if not self.isVisible():
            self.show()
        self.raise_()
        if not self._anim.isActive():
            self._anim.start()
        self.update()

    def clear(self):
        self.t = None
        self.label = ""
        self.step = None
        self.key_label = None
        self.key_geom = None
        self._anim.stop()
        self._flash_t = 0.0
        self._flash_timer.stop()
        self.update()

    def set_intensity(self, level):
        try:
            self._intensity = max(0.4, min(1.8, float(level)))
            self.update()
        except Exception:
            pass

    @guard
    def paintEvent(self, _):
        p = QtGui.QPainter(self)
        p.setRenderHint(QtGui.QPainter.Antialiasing, True)
        if self.t:
            self._paint_ring(p)
        elif self.key_label:
            self._paint_keycap(p)
        elif self._flash_t > 0:
            self._paint_flash(p)

    def _paint_flash(self, p):
        """Fading green check 'Done' badge centered on the assist screen."""
        geom = self._flash_geom or QtWidgets.QApplication.primaryScreen().geometry()
        a = max(0.0, min(1.0, self._flash_t))
        f = QtGui.QFont("Segoe UI", 15)
        f.setBold(True)
        tw, th = 150, 56
        cx = geom.center().x() - self.sg.left()
        cy = geom.center().y() - self.sg.top()
        kx, ky = cx - tw // 2, cy - th // 2
        green = QtGui.QColor("#5BD08A")
        # glow
        p.setPen(QtCore.Qt.NoPen)
        p.setBrush(QtGui.QColor(91, 208, 138, int(45 * a)))
        p.drawRoundedRect(kx - 10, ky - 10, tw + 20, th + 20, 18, 18)
        # card
        ink = QtGui.QColor(INK)
        ink.setAlphaF(0.96 * a)
        p.setBrush(ink)
        gp = QtGui.QColor(green)
        gp.setAlphaF(a)
        pen = QtGui.QPen(gp, 2)
        p.setPen(pen)
        p.drawRoundedRect(kx, ky, tw, th, 14, 14)
        # check disc
        p.setPen(QtCore.Qt.NoPen)
        p.setBrush(gp)
        dcx, dcy = kx + 28, ky + th // 2
        p.drawEllipse(dcx - 11, dcy - 11, 22, 22)
        cpen = QtGui.QPen(QtGui.QColor("#0E0D0C"), 3)
        cpen.setCapStyle(QtCore.Qt.RoundCap)
        p.setPen(cpen)
        p.drawPolyline(QtGui.QPolygon([
            QtCore.QPoint(dcx - 5, dcy), QtCore.QPoint(dcx - 1, dcy + 4),
            QtCore.QPoint(dcx + 6, dcy - 5)]))
        # label
        tcol = QtGui.QColor(BONE)
        tcol.setAlphaF(a)
        p.setPen(tcol)
        p.setFont(f)
        p.drawText(QtCore.QRect(kx + 48, ky, tw - 52, th),
                   QtCore.Qt.AlignVCenter, "Done")

    def _paint_keycap(self, p):
        """Centered keycap hint for a keyboard step (e.g. 'Press  Win+R')."""
        geom = self.key_geom or QtWidgets.QApplication.primaryScreen().geometry()
        b = 0.5 - 0.5 * math.cos(self._phase * 2 * math.pi)
        f = QtGui.QFont("Segoe UI", 15)
        f.setBold(True)
        fm = QtGui.QFontMetrics(f)
        tw = fm.horizontalAdvance(self.key_label) + 56
        th = 60
        cx = geom.center().x() - self.sg.left()
        cy = geom.center().y() - self.sg.top()
        kx, ky = cx - tw // 2, cy - th // 2
        # breathing glow
        p.setPen(QtCore.Qt.NoPen)
        p.setBrush(QtGui.QColor(255, 107, 53, int(40 + 50 * b)))
        p.drawRoundedRect(kx - 8, ky - 8, tw + 16, th + 16, 18, 18)
        # keycap
        p.setBrush(INK)
        p.setPen(QtGui.QPen(EMBER, 2))
        p.drawRoundedRect(kx, ky, tw, th, 14, 14)
        p.setFont(f)
        p.setPen(BONE)
        p.drawText(QtCore.QRect(kx, ky, tw, th), QtCore.Qt.AlignCenter, self.key_label)

    def _paint_ring(self, p):
        x, y, w, h = self.t
        x -= self.sg.left()
        y -= self.sg.top()

        # breathing factor (smooth 0..1 via cosine), scaled by user intensity
        k = self._intensity
        b = 0.5 - 0.5 * math.cos(self._phase * 2 * math.pi)
        glow_pad = 6 + int(9 * b)
        glow_alpha = max(0, min(255, int((45 + 80 * b) * k)))
        ring_w = max(2, int(round(3 * k)))
        glow_w = max(5, int(round(9 * k)))

        # low-confidence picks ring in dashed amber (honest "best guess" signal)
        low = self.conf < 0.5
        ring_col = QtGui.QColor("#FFC857") if low else EMBER
        glow_rgb = (255, 200, 87) if low else (255, 107, 53)

        # outer breathing glow + crisp inner ring
        p.setBrush(QtCore.Qt.NoBrush)
        p.setPen(QtGui.QPen(QtGui.QColor(glow_rgb[0], glow_rgb[1], glow_rgb[2], glow_alpha), glow_w))
        p.drawRoundedRect(x - glow_pad, y - glow_pad,
                          w + glow_pad * 2, h + glow_pad * 2, 14, 14)
        ring_pen = QtGui.QPen(ring_col, ring_w)
        if low:
            ring_pen.setStyle(QtCore.Qt.DashLine)
        p.setPen(ring_pen)
        p.drawRoundedRect(x - 5, y - 5, w + 10, h + 10, 10, 10)

        # ghost cursor (arrow) just off the target's corner
        cx, cy = x + w + 2, y - 2
        p.setBrush(QtGui.QColor(255, 107, 53, 235))
        p.setPen(QtGui.QPen(QtGui.QColor("#0E0D0C"), 1.5))
        p.drawPolygon(QtGui.QPolygon([
            QtCore.QPoint(cx, cy), QtCore.QPoint(cx + 20, cy + 7),
            QtCore.QPoint(cx + 8, cy + 10), QtCore.QPoint(cx + 12, cy + 22),
        ]))

        self._paint_tooltip(p, x, y, w, h)

    def _paint_tooltip(self, p, x, y, w, h):
        """A rounded ink card with an ember NUDGE chip, optional step badge, the
        instruction, a drop shadow, and a tail pointing at the target."""
        f = QtGui.QFont("Segoe UI", 10)
        fp = QtGui.QFont("Segoe UI", 8)
        fp.setBold(True)
        pad, th, chip_h = 12, 32, 18
        chip = "NUDGE"
        chip_w = QtGui.QFontMetrics(fp).horizontalAdvance(chip) + 16
        step_txt = ("%d" % self.step) if self.step else ""
        step_w = (QtGui.QFontMetrics(fp).horizontalAdvance(step_txt) + 14) if step_txt else 0
        lab_w = QtGui.QFontMetrics(f).horizontalAdvance(self.label)
        tw = pad + chip_w + (step_w + 6 if step_w else 0) + 9 + lab_w + pad

        # clamp to the monitor the TARGET sits on (never spill to an adjacent one)
        gc = QtCore.QPoint(self.t[0] + self.t[2] // 2, self.t[1] + self.t[3] // 2)
        _scr = QtWidgets.QApplication.screenAt(gc) or QtWidgets.QApplication.primaryScreen()
        _sb = _scr.geometry()
        mb_l = _sb.left() - self.sg.left()
        mb_t = _sb.top() - self.sg.top()
        mb_r, mb_b = mb_l + _sb.width(), mb_t + _sb.height()
        tx, ty = x - 5, y + h + 16
        above = False
        if ty + th > mb_b - 4:
            ty = y - th - 16
            above = True
        tx = max(mb_l + 4, min(tx, mb_r - tw - 6))

        # tail toward the target (clamped to the card width)
        tail_cx = max(tx + 16, min(x + w // 2, tx + tw - 16))
        # drop shadow
        p.setPen(QtCore.Qt.NoPen)
        p.setBrush(QtGui.QColor(0, 0, 0, 120))
        p.drawRoundedRect(tx + 1, ty + 3, tw, th, 11, 11)
        # card + tail
        p.setBrush(INK)
        if above:
            p.drawPolygon(QtGui.QPolygon([
                QtCore.QPoint(tail_cx - 7, ty + th), QtCore.QPoint(tail_cx + 7, ty + th),
                QtCore.QPoint(tail_cx, ty + th + 8)]))
        else:
            p.drawPolygon(QtGui.QPolygon([
                QtCore.QPoint(tail_cx - 7, ty), QtCore.QPoint(tail_cx + 7, ty),
                QtCore.QPoint(tail_cx, ty - 8)]))
        p.setPen(QtGui.QPen(QtGui.QColor(255, 107, 53, 130), 1))
        p.drawRoundedRect(tx, ty, tw, th, 11, 11)

        # ember NUDGE chip
        cx0 = tx + pad
        cy0 = ty + (th - chip_h) // 2
        p.setPen(QtCore.Qt.NoPen)
        p.setBrush(EMBER)
        p.drawRoundedRect(cx0, cy0, chip_w, chip_h, 6, 6)
        p.setFont(fp)
        p.setPen(QtGui.QColor("#0E0D0C"))
        p.drawText(QtCore.QRect(cx0, cy0, chip_w, chip_h), QtCore.Qt.AlignCenter, chip)
        textx = cx0 + chip_w + 9
        # optional step badge
        if step_w:
            sx = cx0 + chip_w + 6
            p.setBrush(QtGui.QColor(58, 53, 48))
            p.drawRoundedRect(sx, cy0, step_w, chip_h, 6, 6)
            p.setFont(fp)
            p.setPen(BONE)
            p.drawText(QtCore.QRect(sx, cy0, step_w, chip_h), QtCore.Qt.AlignCenter, step_txt)
            textx = sx + step_w + 9
        # instruction
        p.setFont(f)
        p.setPen(BONE)
        p.drawText(textx, ty + 21, self.label)


# ===========================================================================
# PlanWorker -- one capture+scan+plan cycle on a background QThread.
# Emits `finished` with a plain dict; never touches a widget.
# ===========================================================================
class PlanWorker(QtCore.QThread):
    # `prelim` fires as soon as the UIA scan + heuristic are ready (before the
    # slow vision call) so the main thread can point INSTANTLY on confident
    # matches. `finished` carries the authoritative plan. Both tag a `gen` so
    # the main thread can ignore results from a superseded cycle.
    prelim = QtCore.pyqtSignal(dict)
    finished = QtCore.pyqtSignal(dict)

    def __init__(self, task, history, mon_index=1, screen_rect=None, gen=0,
                 stuck_note=None):
        super().__init__()
        self.task = task
        self.history = list(history)
        self.mon_index = mon_index
        self.screen_rect = screen_rect
        self.gen = gen
        self.stuck_note = stuck_note

    def run(self):
        result = {"ok": False, "marks": [], "plan": None, "fg": 0, "tb": 0,
                  "error": "", "gen": self.gen}
        com = False
        try:
            import comtypes
            comtypes.CoInitialize()  # UIA needs COM initialized on THIS thread
            com = True
        except Exception:
            pass
        try:
            marks, fg, tb = scan_marks(self.screen_rect)
            h = _heuristic(self.task, marks)
            # confident == a unique strong name match we HAVEN'T already clicked
            already = (h.get("index", -1) >= 0 and marks
                       and marks[h["index"]]["name"] in self.history)
            confident = _confident_local(h) and not already
            # instant optimistic pointer for confident matches (main thread
            # decides whether to actually show it)
            self.prelim.emit({"marks": marks, "plan": h, "fg": fg, "tb": tb,
                              "confident": confident, "gen": self.gen})
            # bail early if we were superseded / app is closing
            if self.isInterruptionRequested():
                self.finished.emit(result)
                return
            # unambiguous element -> skip the screenshot; text-only is faster.
            # ambiguous -> send the screenshot so the model can ground visually.
            b64 = None
            if not confident:
                _img, b64, _scale = grab_screen(self.mon_index)
            wt = getattr(_scan_ctx, "win_title", None)
            an = getattr(_scan_ctx, "app_name", None)
            pl = plan(self.task, marks, self.history, b64, win_title=wt, app_name=an,
                      stuck_note=self.stuck_note)
            # verify before declaring done -- one cheap second opinion against a
            # fresh screenshot catches premature "Done!"
            if pl.get("done"):
                vb64 = b64 if b64 is not None else grab_screen(self.mon_index)[1]
                ok_done, reason = _verify_done(self.task, vb64, wt)
                if not ok_done:
                    pl["done"] = False
                    if reason:
                        pl["instruction"] = reason
            result.update({"ok": True, "marks": marks, "plan": pl, "fg": fg, "tb": tb})
        except Exception as ex:  # pragma: no cover - safety net
            traceback.print_exc()
            result["error"] = str(ex)
        finally:
            if com:
                try:
                    import comtypes
                    comtypes.CoUninitialize()
                except Exception:
                    pass
        self.finished.emit(result)


# ===========================================================================
# ClickBridge -- pynput mouse listener (own thread) -> main thread via signal.
# The listener callback NEVER touches Qt; it only emits `clicked`.
# ===========================================================================
class ClickBridge(QtCore.QObject):
    clicked = QtCore.pyqtSignal()

    def __init__(self):
        super().__init__()
        self._listener = None

    def start(self):
        if self._listener is not None:
            return
        try:
            from pynput import mouse

            def on_click(x, y, button, pressed):
                # runs on the listener thread -- only emit, never touch Qt
                if pressed:
                    _dbg("CLICK caught (%d,%d)" % (x, y))
                    self.clicked.emit()

            self._listener = mouse.Listener(on_click=on_click)
            self._listener.start()
            _dbg("ClickBridge: listener started, running=%s" % self._listener.running)
        except Exception:
            traceback.print_exc()
            _dbg("ClickBridge: FAILED to start listener")
            self._listener = None

    def stop(self):
        if self._listener is not None:
            try:
                self._listener.stop()
            except Exception:
                pass
            self._listener = None


# ===========================================================================
# HotkeyBridge -- global keyboard hotkeys (own thread) -> main thread signals.
# Ctrl+Alt+N toggles the bar's visibility; Ctrl+Alt+X stops guiding. Like
# ClickBridge, the listener callbacks NEVER touch Qt -- they only emit.
# ===========================================================================
class HotkeyBridge(QtCore.QObject):
    toggle = QtCore.pyqtSignal()
    stop = QtCore.pyqtSignal()

    def __init__(self):
        super().__init__()
        self._listener = None

    def start(self):
        if self._listener is not None:
            return
        try:
            from pynput import keyboard

            self._listener = keyboard.GlobalHotKeys({
                "<ctrl>+<alt>+n": lambda: self.toggle.emit(),
                "<ctrl>+<alt>+x": lambda: self.stop.emit(),
            })
            self._listener.start()
            _dbg("HotkeyBridge: started (Ctrl+Alt+N show/hide, Ctrl+Alt+X stop)")
        except Exception:
            traceback.print_exc()
            _dbg("HotkeyBridge: FAILED to start")
            self._listener = None

    def stop_listener(self):
        if self._listener is not None:
            try:
                self._listener.stop()
            except Exception:
                pass
            self._listener = None


# ===========================================================================
# LogoMark -- tiny branded ember pointer glyph used as the bar's logo.
# ===========================================================================
class LogoMark(QtWidgets.QWidget):
    def __init__(self, size=22):
        super().__init__()
        self.setFixedSize(size, size)

    def paintEvent(self, _):
        p = QtGui.QPainter(self)
        p.setRenderHint(QtGui.QPainter.Antialiasing, True)
        s = self.width()
        p.setPen(QtCore.Qt.NoPen)
        p.setBrush(QtGui.QColor(255, 107, 53, 40))     # soft ember disc
        p.drawEllipse(0, 0, s, s)
        p.setBrush(EMBER)                              # ghost-cursor arrow
        p.setPen(QtGui.QPen(QtGui.QColor("#0E0D0C"), 1.2))
        cx, cy = s * 0.30, s * 0.20
        p.drawPolygon(QtGui.QPolygon([
            QtCore.QPoint(int(cx), int(cy)),
            QtCore.QPoint(int(cx + s * 0.46), int(cy + s * 0.30)),
            QtCore.QPoint(int(cx + s * 0.20), int(cy + s * 0.34)),
            QtCore.QPoint(int(cx + s * 0.30), int(cy + s * 0.60)),
        ]))


# ===========================================================================
# ControlBar -- the interactive, draggable top-center command window.
# Owns the engine loop state. All widget mutation happens here on the main
# thread; blocking work is delegated to PlanWorker.
# ===========================================================================
class ControlBar(QtWidgets.QWidget):
    def __init__(self, overlay):
        super().__init__()
        self.overlay = overlay
        self.worker = None
        self.settings = QtCore.QSettings("NudgeOS", "NudgeOS")
        self.cfg = _CFG  # JSON config (settings.py) for the newer options
        self._recent = []
        self._explainer = None  # keep ExplainWorker referenced
        self.bridge = ClickBridge()
        self.bridge.clicked.connect(self._on_global_click)
        self.hotkeys = HotkeyBridge()
        self.hotkeys.toggle.connect(self._toggle_visible)
        self.hotkeys.stop.connect(self.on_stop)
        self.guiding = False
        self.history = []          # names of marks already pointed at/clicked
        self.marks = []            # current cycle's marks
        self.cur_target = None     # {name, rect} we are currently pointing at
        self.step = 0
        self._dragging = False
        self._drag_off = QtCore.QPoint()
        # latency model: each cycle has a generation; only the current gen's
        # results count, so we can point optimistically + supersede in-flight
        # workers without races.
        self._gen = 0
        self._pointed_gen = -1     # gen we've already counted a step for
        self._inflight = []        # running PlanWorkers (kept alive until done)
        self._reaping = []         # evicted workers kept referenced until finished
        self._repeat_sig = None    # signature of the last target (stall detect)
        self._repeat_count = 0
        self._est_total = 4        # soft denominator for "Step N of ~M"

        # post-action settle: after a click/auto-advance, wait for the screen to
        # STOP changing (a program may take time to load) before re-planning, so
        # we never plan against a half-loaded screen or re-point the last step.
        self._settle = QtCore.QTimer(self)
        self._settle.setInterval(SETTLE_POLL_MS)
        self._settle.timeout.connect(self._settle_tick)
        self._settle_prev = None     # last settle fingerprint
        self._settle_stable = 0      # consecutive quiet polls
        self._settle_elapsed = 0     # ms waited so far this settle
        self._settle_rect = None     # assist-screen rect being watched
        self._settle_hinted = False  # showed the "still loading" hint yet

        # auto-advance: watch the screen near the target and move on when the
        # user completes the step (click OR keyboard OR anything), so we don't
        # depend on catching a mouse click.
        self.auto_advance = True
        self._pending = False      # a progress event is queued; ignore others
        self._watch_base = None    # (fg_hwnd, region_hash) when we pointed
        self._watch_prev = None    # previous tick's region hash
        self._watcher = QtCore.QTimer(self)
        self._watcher.setInterval(WATCH_MS)
        self._watcher.timeout.connect(self._watch_tick)

        # status state machine -> drives the status dot colour + a soft pulse
        self._state = "idle"
        self._pulse_on = False
        self._pulse = QtCore.QTimer(self)
        self._pulse.setInterval(380)
        self._pulse.timeout.connect(self._pulse_tick)

        self._build_ui()
        self._load_prefs()
        self.hotkeys.start()

    # ---- UI ---------------------------------------------------------------
    def _build_ui(self):
        self.setWindowFlags(
            QtCore.Qt.FramelessWindowHint
            | QtCore.Qt.WindowStaysOnTopHint
            | QtCore.Qt.Tool
        )
        self.setAttribute(QtCore.Qt.WA_TranslucentBackground)

        root = QtWidgets.QFrame(self)
        root.setObjectName("root")
        self._root = root
        # drop shadow for depth (needs margin room in the outer layout)
        shadow = QtWidgets.QGraphicsDropShadowEffect(self)
        shadow.setBlurRadius(38)
        shadow.setColor(QtGui.QColor(0, 0, 0, 175))
        shadow.setOffset(0, 10)
        root.setGraphicsEffect(shadow)

        outer = QtWidgets.QVBoxLayout(self)
        outer.setContentsMargins(20, 16, 20, 22)
        outer.addWidget(root)

        lay = QtWidgets.QVBoxLayout(root)
        lay.setContentsMargins(16, 12, 16, 13)
        lay.setSpacing(9)

        # --- header row: logo + wordmark + task + actions ---
        row = QtWidgets.QHBoxLayout()
        row.setSpacing(9)
        _tip = ("%s v%s   ·   Ctrl+Alt+N show/hide   ·   Ctrl+Alt+X stop   ·   Esc stop"
                % (APP_NAME, APP_VERSION))
        self.logo = LogoMark(22)
        self.logo.setToolTip(_tip)
        title = QtWidgets.QLabel("Nudge")
        title.setObjectName("title")
        title.setToolTip(_tip)
        titledim = QtWidgets.QLabel("OS")
        titledim.setObjectName("titledim")
        self.task_edit = QtWidgets.QLineEdit()
        self.task_edit.setObjectName("task")
        self.task_edit.setPlaceholderText("What do you want to do?")
        self.task_edit.setClearButtonEnabled(True)
        self.task_edit.returnPressed.connect(self.on_guide)
        self.guide_btn = QtWidgets.QPushButton("Guide")
        self.guide_btn.setObjectName("guide")
        self.guide_btn.setCursor(QtCore.Qt.PointingHandCursor)
        self.guide_btn.clicked.connect(self.on_guide)
        self.stop_btn = QtWidgets.QPushButton("Stop")
        self.stop_btn.setObjectName("stop")
        self.stop_btn.setCursor(QtCore.Qt.PointingHandCursor)
        self.stop_btn.clicked.connect(self.on_stop)
        if _icons is not None:
            try:
                self.guide_btn.setIcon(_icons.play_icon())
                self.guide_btn.setIconSize(QtCore.QSize(13, 13))
                self.stop_btn.setIcon(_icons.stop_icon())
                self.stop_btn.setIconSize(QtCore.QSize(12, 12))
            except Exception:
                pass
        row.addWidget(self.logo)
        row.addWidget(title)
        row.addWidget(titledim)
        row.addSpacing(4)
        row.addWidget(self.task_edit, 1)
        row.addWidget(self.guide_btn)
        row.addWidget(self.stop_btn)
        lay.addLayout(row)

        # --- presets: one-click common tasks ---
        if _presets is not None and getattr(_presets, "PRESETS", None):
            prow = QtWidgets.QHBoxLayout()
            prow.setSpacing(6)
            for label, task in _presets.PRESETS[:6]:
                chip = QtWidgets.QPushButton(label)
                chip.setObjectName("chip")
                chip.setCursor(QtCore.Qt.PointingHandCursor)
                chip.clicked.connect(self._make_preset(task))
                prow.addWidget(chip)
            prow.addStretch(1)
            lay.addLayout(prow)

        # --- options row: assist screen + auto-advance ---
        srow = QtWidgets.QHBoxLayout()
        srow.setSpacing(8)
        slab = QtWidgets.QLabel("Assist screen")
        slab.setObjectName("muted")
        self.screen_combo = QtWidgets.QComboBox()
        self.screen_combo.setObjectName("screens")
        self.screen_combo.setCursor(QtCore.Qt.PointingHandCursor)
        self._populate_screens()
        self.screen_combo.currentIndexChanged.connect(self._on_screen_changed)
        self.auto_chk = QtWidgets.QCheckBox("Auto-advance")
        self.auto_chk.setObjectName("autochk")
        self.auto_chk.setCursor(QtCore.Qt.PointingHandCursor)
        self.auto_chk.setChecked(True)
        self.auto_chk.setToolTip("Move to the next step automatically when the "
                                 "screen changes (no click needed).")
        self.auto_chk.toggled.connect(self._on_auto_toggled)
        self.tts_chk = QtWidgets.QCheckBox("Speak")
        self.tts_chk.setObjectName("autochk")
        self.tts_chk.setCursor(QtCore.Qt.PointingHandCursor)
        self.tts_chk.setToolTip("Read each step aloud (text-to-speech).")
        self.tts_chk.setEnabled(_tts is not None and _tts.available())
        self.tts_chk.toggled.connect(self._on_tts_toggled)
        self.autostart_chk = QtWidgets.QCheckBox("Start w/ Windows")
        self.autostart_chk.setObjectName("autochk")
        self.autostart_chk.setCursor(QtCore.Qt.PointingHandCursor)
        self.autostart_chk.setToolTip("Launch Nudge OS automatically at sign-in.")
        self.autostart_chk.setEnabled(_autostart is not None)
        self.autostart_chk.toggled.connect(self._on_autostart_toggled)
        srow.addWidget(slab)
        srow.addWidget(self.screen_combo, 1)
        srow.addWidget(self.auto_chk)
        srow.addWidget(self.tts_chk)
        srow.addWidget(self.autostart_chk)
        lay.addLayout(srow)

        # --- status row: state dot + message ---
        strow = QtWidgets.QHBoxLayout()
        strow.setSpacing(8)
        self.status_dot = QtWidgets.QLabel()
        self.status_dot.setObjectName("dot")
        self.status_dot.setFixedSize(9, 9)
        self.status = QtWidgets.QLabel("Type a task and press Guide. I point, you click.")
        self.status.setObjectName("status")
        self.status.setWordWrap(True)
        self.explain_btn = QtWidgets.QToolButton()
        self.explain_btn.setObjectName("explain")
        self.explain_btn.setText("?")
        self.explain_btn.setCursor(QtCore.Qt.PointingHandCursor)
        self.explain_btn.setToolTip("Explain the current step")
        self.explain_btn.setEnabled(False)
        self.explain_btn.clicked.connect(self._on_explain)
        self.intensity = QtWidgets.QSlider(QtCore.Qt.Horizontal)
        self.intensity.setObjectName("intensity")
        self.intensity.setRange(50, 150)
        self.intensity.setValue(100)
        self.intensity.setFixedWidth(82)
        self.intensity.setCursor(QtCore.Qt.PointingHandCursor)
        self.intensity.setToolTip("Pointer intensity")
        self.intensity.valueChanged.connect(self._on_intensity)
        strow.addWidget(self.status_dot, 0, QtCore.Qt.AlignVCenter)
        strow.addWidget(self.status, 1)
        strow.addWidget(self.explain_btn, 0)
        strow.addWidget(self.intensity, 0)
        lay.addLayout(strow)

        # thin indeterminate "thinking" shimmer (visible only while a plan runs)
        self.progress = QtWidgets.QProgressBar()
        self.progress.setObjectName("shimmer")
        self.progress.setRange(0, 0)
        self.progress.setTextVisible(False)
        self.progress.setFixedHeight(3)
        self.progress.hide()
        lay.addWidget(self.progress)

        self.setStyleSheet(self._qss())
        self._set_state("idle")

        self.adjustSize()
        self.setFixedWidth(max(620, self.width()))
        scr = QtWidgets.QApplication.primaryScreen().geometry()
        self.move(scr.center().x() - self.width() // 2, scr.top() + 18)

        # Esc stops guiding when the bar is focused (global stop is Ctrl+Alt+X)
        esc = QtWidgets.QShortcut(QtGui.QKeySequence("Escape"), self)
        esc.activated.connect(self.on_stop)

    # ---- styling / status state ------------------------------------------
    _STATE_COLORS = {
        "idle": THEME["muted"], "thinking": THEME["ember"],
        "waiting": THEME["warn"], "pointing": THEME["ember"],
        "done": THEME["ok"], "error": THEME["err"],
    }

    def _qss(self):
        css = """
        #root { background: @panel@; border: 1px solid @edge@; border-radius: 16px; }
        #title { color: @bone@; font: 800 15px 'Segoe UI'; }
        #titledim { color: @ember@; font: 800 15px 'Segoe UI'; }
        QLineEdit#task { background: @ink2@; color: @bone@; border: 1px solid @edge@;
            border-radius: 9px; padding: 7px 11px; font: 13px 'Segoe UI'; min-width: 260px;
            selection-background-color: @ember@; selection-color: @ink2@; }
        QLineEdit#task:focus { border: 1px solid @ember@; }
        QPushButton { color: @bone@; border: none; border-radius: 9px;
            padding: 7px 16px; font: 700 12px 'Segoe UI'; }
        #guide { background: @ember@; color: @ink2@; }
        #guide:hover { background: @ember_hi@; }
        #guide:pressed { background: @ember_dim@; }
        #guide:disabled { background: #5A4434; color: #B89A86; }
        #stop { background: #221F1B; color: @muted@; }
        #stop:hover { background: #312C27; color: @bone@; }
        #muted { color: @muted@; font: 11px 'Segoe UI'; }
        #status { color: @muted@; font: 11px 'Segoe UI'; }
        #screens { background: @ink2@; color: @bone@; border: 1px solid @edge@;
            border-radius: 8px; padding: 4px 9px; font: 11px 'Segoe UI'; }
        #screens::drop-down { border: none; width: 18px; }
        #screens QAbstractItemView { background: #15130F; color: @bone@; outline: none;
            border: 1px solid @edge@; selection-background-color: @ember@;
            selection-color: @ink2@; }
        #autochk { color: @muted@; font: 11px 'Segoe UI'; spacing: 6px; }
        #autochk::indicator { width: 15px; height: 15px; border-radius: 5px;
            border: 1px solid @edge@; background: @ink2@; }
        #autochk::indicator:hover { border: 1px solid @ember@; }
        #autochk::indicator:checked { background: @ember@; border: 1px solid @ember@; }
        #chip { background: #221F1B; color: @muted@; border: 1px solid @edge@;
            border-radius: 11px; padding: 3px 11px; font: 600 10px 'Segoe UI'; }
        #chip:hover { background: #312C27; color: @bone@; border: 1px solid @ember@; }
        #explain { color: @ember@; background: #221F1B; border: 1px solid @edge@;
            border-radius: 9px; font: 800 11px 'Segoe UI'; min-width: 16px;
            max-width: 18px; padding: 1px 0; }
        #explain:hover { background: #312C27; border: 1px solid @ember@; }
        #explain:disabled { color: #5a544c; border: 1px solid #2a2622; }
        #intensity::groove:horizontal { height: 4px; background: @ink2@;
            border-radius: 2px; }
        #intensity::sub-page:horizontal { background: @ember@; border-radius: 2px; }
        #intensity::handle:horizontal { background: @bone@; width: 11px;
            margin: -4px 0; border-radius: 5px; }
        #intensity::handle:horizontal:hover { background: @ember_hi@; }
        #shimmer { background: transparent; border: none; max-height: 3px; }
        #shimmer::chunk { background: @ember@; border-radius: 2px; }
        """
        for k, v in THEME.items():
            css = css.replace("@%s@" % k, v)
        return css

    def _step_status(self, src, instr):
        return "Step %d of ~%d · %s · %s" % (
            self.step, max(self.step, self._est_total), src, instr)

    def _set_state(self, state, text=None):
        """Update the status dot colour (+ pulse for working states) and text."""
        self._state = state
        col = self._STATE_COLORS.get(state, THEME["muted"])
        self.status_dot.setStyleSheet("background:%s; border-radius:4px;" % col)
        if text is not None:
            self.status.setText(text)
        if state in ("thinking", "waiting"):
            if not self._pulse.isActive():
                self._pulse_on = True
                self._pulse.start()
        else:
            self._pulse.stop()

    @guard
    def _pulse_tick(self):
        self._pulse_on = not self._pulse_on
        base = self._STATE_COLORS.get(self._state, THEME["ember"])
        col = base if self._pulse_on else THEME["ink2"]
        self.status_dot.setStyleSheet("background:%s; border-radius:4px;" % col)

    # ---- preferences / visibility -----------------------------------------
    def _load_prefs(self):
        """Restore saved choices (QSettings for the original two keys; the JSON
        config for the newer options)."""
        try:
            # JSON config is the source of truth; fall back to the legacy
            # QSettings values so existing users' prefs migrate on first run
            qs_auto = self.settings.value("auto_advance", True, type=bool)
            auto = bool(self._cfg_get("auto_advance", qs_auto))
            self.auto_chk.setChecked(auto)  # no-op if already True; else fires toggle
            qs_sidx = self.settings.value("screen_index", 0, type=int)
            sidx = int(self._cfg_get("screen_index", qs_sidx))
            if 0 <= sidx < self.screen_combo.count():
                self.screen_combo.setCurrentIndex(sidx)
        except Exception:
            _logx("load_prefs.qsettings", "")
        # newer options from the JSON config
        try:
            inten = int(self._cfg_get("overlay_intensity", 100))
            self.intensity.blockSignals(True)
            self.intensity.setValue(max(50, min(150, inten)))
            self.intensity.blockSignals(False)
            self.overlay.set_intensity(self.intensity.value() / 100.0)

            if self.tts_chk.isEnabled():
                self.tts_chk.blockSignals(True)
                self.tts_chk.setChecked(bool(self._cfg_get("tts_on", False)))
                self.tts_chk.blockSignals(False)

            if self.autostart_chk.isEnabled() and _autostart is not None:
                self.autostart_chk.blockSignals(True)
                self.autostart_chk.setChecked(bool(_autostart.is_autostart()))
                self.autostart_chk.blockSignals(False)

            self._recent = list(self._cfg_get("recent_tasks", []) or [])
            self._completer = QtWidgets.QCompleter(self._recent, self)
            self._completer.setCaseSensitivity(QtCore.Qt.CaseInsensitive)
            self.task_edit.setCompleter(self._completer)
        except Exception:
            _logx("load_prefs.cfg", "")

    def _toggle_visible(self):
        """Ctrl+Alt+N -- hide the bar if shown, else summon + focus it."""
        if self.isVisible():
            self.hide()
        else:
            self.show()
            self.raise_()
            self.activateWindow()

    def _drain_workers(self):
        """Ask in-flight PlanWorkers to stop and wait briefly so the process
        never hangs on exit with 'QThread destroyed while running'."""
        for w in list(self._inflight) + list(self._reaping):
            try:
                w.requestInterruption()
                w.quit()
                w.wait(1500)
            except Exception:
                pass
        self._inflight = []
        self._reaping = []

    def closeEvent(self, e):
        try:
            self.guiding = False
            self.bridge.stop()
            self.hotkeys.stop_listener()
            self._watcher.stop()
            self._settle.stop()
            self._pulse.stop()
            self._drain_workers()
            if _tts is not None:
                try:
                    _tts.shutdown()
                except Exception:
                    pass
            self.settings.sync()
        except Exception:
            pass
        super().closeEvent(e)

    # ---- screen selection --------------------------------------------------
    def _populate_screens(self):
        self.screen_combo.blockSignals(True)
        self.screen_combo.clear()
        self.screen_combo.addItem("Auto (this monitor)")
        prim = QtWidgets.QApplication.primaryScreen()
        for i, s in enumerate(QtWidgets.QApplication.screens()):
            g = s.geometry()
            tag = " - primary" if s == prim else ""
            self.screen_combo.addItem("Screen %d  (%dx%d)%s" % (i + 1, g.width(), g.height(), tag))
        self.screen_combo.blockSignals(False)

    def _resolve_target_screen(self):
        """Return (QScreen, mss_monitor_index) for the chosen / auto screen."""
        screens = QtWidgets.QApplication.screens()
        idx = self.screen_combo.currentIndex()
        if idx <= 0:  # Auto -> the monitor the control bar currently sits on
            scr = QtWidgets.QApplication.screenAt(self.frameGeometry().center()) \
                or QtWidgets.QApplication.primaryScreen()
        else:
            scr = screens[idx - 1] if (idx - 1) < len(screens) \
                else QtWidgets.QApplication.primaryScreen()
        return scr, mss_index_for(scr.geometry())

    def _on_screen_changed(self, idx):
        scr, _ = self._resolve_target_screen()
        if idx > 0:  # explicit choice -> move the bar onto that monitor
            g = scr.geometry()
            self.move(g.center().x() - self.width() // 2, g.top() + 16)
        self.status.setText("Assisting on this monitor."
                            if idx == 0 else "Assisting on Screen %d." % idx)
        self._cfg_set("screen_index", idx)

    # ---- dragging (the bar is interactive, so we move it ourselves) --------
    def mousePressEvent(self, e):
        if e.button() == QtCore.Qt.LeftButton:
            self._dragging = True
            self._drag_off = e.globalPos() - self.frameGeometry().topLeft()
            e.accept()

    def mouseMoveEvent(self, e):
        if self._dragging and (e.buttons() & QtCore.Qt.LeftButton):
            self.move(e.globalPos() - self._drag_off)
            e.accept()

    def mouseReleaseEvent(self, e):
        self._dragging = False

    # ---- engine loop ------------------------------------------------------
    def on_guide(self):
        task = self.task_edit.text().strip()
        if not task:
            self.status.setText("Enter a task first.")
            return
        self.task = task
        self._record_recent(task)
        self._gen += 1                 # supersede anything from a prior task
        self._reset_engine_state()     # stop a stale settle/watcher timer cleanly
        self.history = []
        self.step = 0
        self._pointed_gen = -1
        self._repeat_sig = None
        self._repeat_count = 0
        self._est_total = 4
        self.guiding = True
        self.bridge.start()
        _dbg("on_guide: started task=%r" % task)
        self._set_state("thinking", "Looking at your screen...")
        self._kick()

    def _reset_engine_state(self):
        """Single source of truth for tearing down the active-guide timers +
        flags. Stops every engine timer and clears the watcher/settle/pending
        state so no method can 'forget' one and leave the loop wedged."""
        self._settle.stop()
        self._watcher.stop()
        self._pulse.stop()
        self._pending = False
        self._watch_base = None
        self._watch_prev = None
        self._settle_prev = None
        self._settle_stable = 0
        self._settle_elapsed = 0
        self._settle_hinted = False
        try:
            self.progress.hide()
        except Exception:
            pass

    def on_stop(self):
        self.guiding = False
        self._gen += 1            # invalidate any in-flight plan/confirm
        self._reset_engine_state()
        self.bridge.stop()
        self.overlay.clear()
        self.cur_target = None
        self.explain_btn.setEnabled(False)
        self._set_state("idle", "Stopped. Type a new task and press Guide.")

    @guard
    def _on_global_click(self):
        # main thread (signal-marshalled). A click is one way to make progress;
        # the watcher is the other. Both funnel through _register_progress.
        _dbg("on_global_click: guiding=%s worker_running=%s pending=%s" % (
            self.guiding, (self.worker is not None and self.worker.isRunning()),
            self._pending))
        self._register_progress("click")

    def _register_progress(self, reason):
        """The user completed the current step (via click OR an auto-detected
        screen change). Record it and re-plan after the UI settles. Guards make
        it safe to call from both the click signal and the watcher tick.
        """
        if not self.guiding or self._pending:
            return
        self._pending = True
        self._gen += 1            # supersede any in-flight plan/confirm
        self._watcher.stop()
        # remember what we just told them to click
        if self.cur_target and self.cur_target.get("name"):
            nm = self.cur_target["name"]
            if not self.history or self.history[-1] != nm:
                self.history.append(nm)
            self.history = self.history[-HISTORY_CAP:]  # bound prompt + memory
        self.cur_target = None
        self.explain_btn.setEnabled(False)
        self.overlay.clear()  # drop the stale pointer immediately for feedback
        _dbg("register_progress: reason=%s" % reason)
        self._set_state(
            "thinking",
            "Got it - looking at the screen (a moment)..." if reason == "click"
            else "Looks like you did it - finding the next step...")
        self._begin_settle()

    def _begin_settle(self):
        """Start waiting for the screen to stop changing before re-planning."""
        self._settle_prev = None
        self._settle_stable = 0
        self._settle_elapsed = 0
        self._settle_hinted = False
        _scr, _ = self._resolve_target_screen()
        # watch a bounded center crop, not the whole screen, so the GUI thread
        # doesn't grab a full 1080p frame every poll
        self._settle_rect = _center_crop(_scr.geometry())
        self._settle.start()

    @guard
    def _settle_tick(self):
        """Poll the assist screen; re-plan once it has been quiet for a couple
        of polls (program finished loading) or we hit the max-wait cap."""
        if not self.guiding:
            self._settle.stop()
            return
        self._settle_elapsed += SETTLE_POLL_MS
        cur = region_hash(self._settle_rect, pad=0, cells=32)
        if self._settle_prev is not None:
            if hash_diff(cur, self._settle_prev) <= SETTLE_TOL:
                self._settle_stable += 1
            else:
                self._settle_stable = 0  # still moving -> reset
        self._settle_prev = cur
        # let the user know we're deliberately waiting on a slow load
        if (not self._settle_hinted and self._settle_stable == 0
                and self._settle_elapsed >= SETTLE_HINT_MS):
            self._settle_hinted = True
            self._set_state("waiting", "Waiting for it to finish loading...")
        settled = (self._settle_elapsed >= SETTLE_MIN_MS
                   and self._settle_stable >= SETTLE_STABLE)
        if settled or self._settle_elapsed >= SETTLE_MAX_MS:
            self._settle.stop()
            _dbg("settle: done elapsed=%dms stable=%d capped=%s" % (
                self._settle_elapsed, self._settle_stable,
                self._settle_elapsed >= SETTLE_MAX_MS))
            self._advance()

    @guard
    def _watch_tick(self):
        """Sample the region around the current target; auto-advance once it has
        changed from the baseline AND stopped moving (the action completed)."""
        if not self.guiding or self._pending or not self.cur_target:
            return
        rect = self.cur_target.get("rect")
        if not rect:
            return
        cur_fg = _fg_hwnd()
        cur_h = region_hash(rect)
        if self._watch_base is None:
            # first tick: capture the baseline AFTER the overlay has painted, so
            # the ember ring is part of both baseline and later frames (cancels).
            self._watch_base = (cur_fg, cur_h)
            self._watch_prev = cur_h
            return
        base_fg, base_h = self._watch_base
        fg_changed = bool(base_fg and cur_fg and cur_fg != base_fg)
        region_changed = hash_diff(cur_h, base_h) > WATCH_CHANGE
        if not (fg_changed or region_changed):
            self._watch_prev = cur_h
            return
        # something changed vs the baseline -- only advance once it settles
        settled = (self._watch_prev is not None
                   and hash_diff(cur_h, self._watch_prev) <= WATCH_SETTLE)
        if fg_changed or settled:
            _dbg("watch: advance fg_changed=%s region_changed=%s" % (
                fg_changed, region_changed))
            self._register_progress("auto")
            return
        self._watch_prev = cur_h

    def _on_auto_toggled(self, on):
        self.auto_advance = on
        self._cfg_set("auto_advance", bool(on))
        if not on:
            self._watcher.stop()
            self.status.setText("Auto-advance off - click to move to the next step.")
        else:
            if self.guiding and self.cur_target and not self._pending:
                self._watch_base = None
                self._watch_prev = None
                self._watcher.start()
            self.status.setText("Auto-advance on - I'll move ahead when the screen changes.")

    # ---- feature handlers -------------------------------------------------
    def _cfg_get(self, key, default=None):
        try:
            return self.cfg.get(key, default) if self.cfg else default
        except Exception:
            return default

    def _cfg_set(self, key, value):
        try:
            if self.cfg:
                self.cfg.set(key, value)
        except Exception:
            pass

    def _make_preset(self, task):
        def go():
            self.task_edit.setText(task)
            self.on_guide()
        return go

    def _on_tts_toggled(self, on):
        self._cfg_set("tts_on", bool(on))
        if on and _tts is not None:
            try:
                _tts.speak("Speech on.")
            except Exception:
                pass

    def _on_autostart_toggled(self, on):
        ok = False
        if _autostart is not None:
            try:
                ok = _autostart.set_autostart(bool(on))
            except Exception:
                ok = False
        self._cfg_set("autostart", bool(on))
        self._set_state("idle", "Start with Windows: %s" % ("on" if (on and ok) else "off"))

    def _on_intensity(self, v):
        try:
            self.overlay.set_intensity(v / 100.0)
        except Exception:
            pass
        self._cfg_set("overlay_intensity", int(v))

    def _on_explain(self):
        if not self.cur_target or _explain is None:
            return
        name = self.cur_target.get("name", "")
        self.explain_btn.setEnabled(False)
        try:
            self._explainer = _explain.ExplainWorker(self.task, name, self.history, self._gen)
            self._explainer.explained.connect(self._on_explained)
            self._explainer.start()
            self.status.setText("Explaining this step...")
        except Exception:
            self.explain_btn.setEnabled(True)

    @guard
    def _on_explained(self, text, gen):
        self.explain_btn.setEnabled(self.cur_target is not None)
        if text and self.guiding:
            self.status.setText("Why: " + text)

    def _record_recent(self, task):
        try:
            self._recent = ([task] + [t for t in self._recent if t != task])[:10]
            self._cfg_set("recent_tasks", self._recent)
            c = getattr(self, "_completer", None)
            if c is not None:
                c.model().setStringList(self._recent)
        except Exception:
            pass

    def _speak_step(self, instr):
        if _tts is None or not getattr(self, "tts_chk", None) or not self.tts_chk.isChecked():
            return
        try:
            _tts.speak("Step %d. %s" % (self.step, instr))
        except Exception:
            pass

    def _advance(self):
        _dbg("advance: guiding=%s" % self.guiding)
        if self.guiding:
            self._kick()

    def _kick(self):
        """Start a background capture+scan+plan cycle (non-blocking)."""
        self._gen += 1
        gen = self._gen
        _dbg("kick gen=%d" % gen)
        # prune finished workers (backstop reap) and cap concurrency
        self._inflight = [x for x in self._inflight if x.isRunning()]
        self._reaping = [x for x in self._reaping if x.isRunning()]
        while len(self._inflight) >= INFLIGHT_CAP:
            old = self._inflight.pop(0)
            try:
                old.requestInterruption()
                old.quit()
            except Exception:
                pass
            # keep a reference until it actually finishes -- dropping the only
            # ref to a running QThread aborts the process
            self._reaping.append(old)
        self.guide_btn.setEnabled(False)
        _scr, mon = self._resolve_target_screen()
        g = _scr.geometry()
        rect = (g.left(), g.top(), g.width(), g.height())
        # stuck recovery: if we keep landing on the same target, ask for a
        # DIFFERENT next step on the upcoming cycle
        stuck = None
        if self._repeat_count >= 2 and self._repeat_sig:
            nm = self._repeat_sig.split("|")[0]
            stuck = ("The previous suggestion (%s) did not make progress. "
                     "Propose a DIFFERENT element or a keyboard shortcut." % nm)
        w = PlanWorker(self.task, self.history, mon, rect, gen, stuck)
        w.prelim.connect(self._on_prelim)
        w.finished.connect(self._on_plan)
        self._inflight.append(w)   # keep a ref so the QThread isn't GC'd mid-run
        self.worker = w
        try:
            self.progress.show()   # thinking shimmer
        except Exception:
            pass
        w.start()

    def _show_target(self, mark, instr, src, gen, rearm=True, confidence=1.0):
        """Point at `mark`, count the step once per gen, and (re)arm the watcher.
        rearm=False leaves an already-running watcher + its baseline untouched
        (used when the vision plan merely confirms the optimistic target)."""
        # stale-pointer guard: never ring dead space (monitor unplugged / window moved)
        if not rect_on_screen(mark["rect"]):
            self.overlay.clear()
            self.cur_target = None
            self._set_state("waiting", "That element moved - re-checking...")
            QtCore.QTimer.singleShot(150, lambda: self._kick() if self.guiding else None)
            return
        # loop/stall detection: same target re-pointed many times in a row
        sig = "%s|%s" % (mark["name"], mark["rect"])
        if sig == self._repeat_sig:
            self._repeat_count += 1
        else:
            self._repeat_sig = sig
            self._repeat_count = 1
        self.cur_target = {"name": mark["name"], "rect": mark["rect"]}
        if self._pointed_gen != gen:
            self.step += 1
            self._pointed_gen = gen
            if self.step >= self._est_total:
                self._est_total = self.step + 1  # estimate only ever clamps up
        self.overlay.point_at(mark["rect"], instr, self.step, confidence)
        if self._repeat_count >= STALL_LIMIT:
            # break the re-plan loop, but KEEP auto-advance armed so a genuine
            # screen change can still move us on (don't go dead until Stop)
            self._set_state("waiting",
                            "Still on the same step - if you already did this, press "
                            "Stop and rephrase, or click the highlighted item.")
            if rearm:
                self._watch_base = None
                self._watch_prev = None
            if self.auto_advance and not self._watcher.isActive():
                self._watcher.start()
            return
        self._set_state("pointing", self._step_status(src, instr))
        self.explain_btn.setEnabled(_explain is not None)
        self._speak_step(instr)
        if rearm:
            self._watch_base = None
            self._watch_prev = None
        if self.auto_advance and not self._watcher.isActive():
            self._watcher.start()

    @guard
    def _show_key_hint(self, pl, gen):
        """Render a keyboard step (Press Win+R / type text). Watches the whole
        assist screen so the resulting foreground change auto-advances."""
        key, txt = pl.get("key"), pl.get("type_text")
        label = ("Press  %s" % key) if key else ('Type:  "%s"' % txt)
        if self._pointed_gen != gen:
            self.step += 1
            self._pointed_gen = gen
        scr, _ = self._resolve_target_screen()
        g = scr.geometry()
        # watch a bounded center crop (a keyboard action's foreground change is
        # caught by fg_changed anyway) -- don't grab the full screen each poll
        self.cur_target = {"name": label, "rect": _center_crop(g)}
        self.overlay.show_key(label, g)
        self.explain_btn.setEnabled(False)
        self._speak_step(label)
        self._set_state("pointing", "Step %d · key · %s" % (self.step, label))
        self._watch_base = None
        self._watch_prev = None
        if self.auto_advance and not self._watcher.isActive():
            self._watcher.start()

    def _on_prelim(self, result):
        """Instant optimistic pointer the moment the scan + heuristic land, for
        confident matches -- before the vision call returns."""
        if result.get("gen") != self._gen or not self.guiding or self._pending:
            return
        if not result.get("confident"):
            return  # ambiguous -> wait for the authoritative vision plan
        marks = result.get("marks") or []
        idx = (result.get("plan") or {}).get("index", -1)
        if idx is None or idx < 0 or idx >= len(marks):
            return
        self.marks = marks
        t = marks[idx]
        conf = (result.get("plan") or {}).get("confidence", 0.9)
        self._show_target(t, 'Click "%s".' % t["name"], "fast", result["gen"],
                          confidence=conf)

    @guard
    def _on_plan(self, result):
        # back on the main thread
        w = self.sender()
        for lst in (self._inflight, self._reaping):
            try:
                lst.remove(w)  # reap; QThread can be GC'd now it has finished
            except ValueError:
                pass
        if result.get("gen") != self._gen:
            return  # superseded by a newer cycle -- ignore this result
        try:
            self.progress.hide()  # plan landed -> stop the thinking shimmer
        except Exception:
            pass
        _pl = result.get("plan") or {}
        _dbg("on_plan: gen=%s ok=%s marks=%d idx=%s done=%s" % (
            result.get("gen"), result.get("ok"), len(result.get("marks", [])),
            _pl.get("index"), _pl.get("done")))
        self.guide_btn.setEnabled(True)
        self._pending = False  # this cycle's plan is in; accept progress again
        if not self.guiding:
            return
        if not result.get("ok"):
            self._set_state("error", "Hit a snag scanning the screen. Try Guide again.")
            return
        self.marks = result["marks"]
        pl = result["plan"] or {}
        fg, tb = result.get("fg", 0), result.get("tb", 0)

        # empty-marks / custom-drawn-app handling
        if not self.marks:
            self.overlay.clear()
            self.cur_target = None
            self._set_state(
                "waiting",
                "No detectable UI elements in this window (a vision add-on "
                "would cover it) -- try the taskbar."
            )
            return

        if pl.get("done"):
            try:
                scr, _ = self._resolve_target_screen()
                self.overlay.flash_done(scr.geometry())
            except Exception:
                self.overlay.clear()
            self.cur_target = None
            self.guiding = False
            self._watcher.stop()
            self.bridge.stop()
            # reset for the next task: surface the bar, clear + focus the box
            if not self.isVisible():
                self.show()
            self.raise_()
            self.task_edit.clear()
            self.task_edit.setFocus()
            self._set_state("done", "Done! Type your next task and press Guide.")
            return

        # keyboard-only step (no clickable mark) -> centered keycap hint
        _idx = pl.get("index", -1)
        if (pl.get("key") or pl.get("type_text")) and (_idx is None or _idx < 0):
            self._show_key_hint(pl, result.get("gen"))
            return

        idx = pl.get("index", -1)
        if idx is None or idx < 0 or idx >= len(self.marks):
            # foreground had nothing useful but the app is custom-drawn
            if fg == 0 and tb > 0:
                self._set_state(
                    "waiting",
                    "No detectable UI elements in this window (a vision add-on "
                    "would cover it) -- showing the taskbar instead."
                )
                idx = self.marks[0]["i"]
            else:
                self._set_state("error", "Couldn't pick a target this round. Try Guide again.")
                return

        target = self.marks[idx]
        src = pl.get("source", "AI")
        instr = pl.get("instruction", "Click this.")
        # did the optimistic prelim already point here? then this is a silent
        # confirm -- leave the overlay + watcher alone (repainting the tooltip
        # could trip the watcher); just refresh the status line.
        same = (self._pointed_gen == result.get("gen") and self.cur_target
                and self.cur_target.get("name") == target["name"]
                and self.cur_target.get("rect") == target["rect"])
        if same:
            self._set_state("pointing", self._step_status(src, instr))
        else:
            self._show_target(target, instr, src, result.get("gen"), rearm=True,
                              confidence=pl.get("confidence"))


# ===========================================================================
# Self-test modes (verification without launching the full interactive app)
# ===========================================================================
def run_selftest_local():
    """No Anthropic call. Capture + scan, point the overlay at the FIRST
    taskbar element (e.g. Start), save selftest_local.png, exit after ~1s.
    Exit code 0 on success, 2 if nothing to point at.
    """
    app = QtWidgets.QApplication(sys.argv)
    overlay = Overlay()
    marks, fg, tb = scan_marks()
    print("scan: %d marks (foreground=%d, taskbar=%d)" % (len(marks), fg, tb))

    # find the first taskbar-region mark; fall back to mark 0
    target = None
    try:
        tray = _auto.PaneControl(searchDepth=1, ClassName="Shell_TrayWnd")
        tr = tray.BoundingRectangle
        tray_top = tr.top
    except Exception:
        tray_top = None
    if tray_top is not None:
        for m in marks:
            if m["rect"][1] >= tray_top - 4:
                target = m
                break
    if target is None and marks:
        target = marks[0]

    out = os.path.join(HERE, "selftest_local.png")
    rc = {"code": 0}

    if target is None:
        print("selftest-local: no marks to point at")
        rc["code"] = 2
    else:
        print("pointing at: [%s] %s @ %s" % (target["type"], target["name"], target["rect"]))
        overlay.point_at(target["rect"], "Click \"%s\"" % target["name"])

    def finish():
        try:
            QtWidgets.QApplication.primaryScreen().grabWindow(0).save(out)
            print("saved ->", out)
        except Exception:
            traceback.print_exc()
            rc["code"] = 2
        app.quit()

    QtCore.QTimer.singleShot(1000, finish)
    app.exec_()
    return rc["code"]


def run_selftest(task):
    """ONE full cycle WITH Anthropic. Capture+scan+plan, point at the chosen
    element, save selftest.png, print the chosen {index,instruction,done},
    then exit. Reads ANTHROPIC_API_KEY from env (via the SDK).
    """
    app = QtWidgets.QApplication(sys.argv)
    overlay = Overlay()
    marks, fg, tb = scan_marks()
    print("scan: %d marks (foreground=%d, taskbar=%d)" % (len(marks), fg, tb))
    _img, b64, _scale = grab_screen()
    pl = plan(task, marks, [], b64)
    print("plan:", json.dumps({k: pl.get(k) for k in ("index", "instruction", "done")}))
    print("source:", pl.get("source"))

    out = os.path.join(HERE, "selftest.png")
    idx = pl.get("index", -1)
    if marks and 0 <= idx < len(marks):
        t = marks[idx]
        print("pointing at: [%s] %s @ %s" % (t["type"], t["name"], t["rect"]))
        overlay.point_at(t["rect"], pl.get("instruction", "Click this."))
    else:
        print("no valid target to point at (index=%r, marks=%d)" % (idx, len(marks)))

    def finish():
        try:
            QtWidgets.QApplication.primaryScreen().grabWindow(0).save(out)
            print("saved ->", out)
        except Exception:
            traceback.print_exc()
        app.quit()

    QtCore.QTimer.singleShot(1000, finish)
    app.exec_()
    return 0


def run_shot(out_name="bar_shot.png"):
    """Render the control bar over the live desktop and save a tight composited
    PNG for visual QA. No Anthropic call. Exits after grabbing."""
    app = QtWidgets.QApplication(sys.argv)
    overlay = Overlay()
    bar = ControlBar(overlay)
    try:
        bar.hotkeys.stop_listener()
    except Exception:
        pass
    bar.show()
    bar.raise_()
    out = os.path.join(HERE, out_name)

    def finish():
        try:
            g = bar.frameGeometry()
            pad = 26
            shot = QtWidgets.QApplication.primaryScreen().grabWindow(
                0, g.left() - pad, g.top() - pad, g.width() + pad * 2, g.height() + pad * 2)
            shot.save(out)
            print("saved bar -> %s (%dx%d)" % (out, shot.width(), shot.height()))
        except Exception:
            traceback.print_exc()
        app.quit()

    QtCore.QTimer.singleShot(800, finish)
    app.exec_()
    return 0


# ===========================================================================
# main
# ===========================================================================
def _single_instance(app):
    """Return a QLocalServer (we are the first instance), False (another is
    running -> we pinged it to show and should exit), or None (unavailable)."""
    try:
        from PyQt5 import QtNetwork
    except Exception:
        return None
    name = "NudgeOS-singleton"
    try:
        sock = QtNetwork.QLocalSocket()
        sock.connectToServer(name)
        if sock.waitForConnected(150):
            try:
                sock.write(b"show")
                sock.flush()
                sock.waitForBytesWritten(150)
            except Exception:
                pass
            sock.disconnectFromServer()
            return False
        QtNetwork.QLocalServer.removeServer(name)  # clear a stale server
        server = QtNetwork.QLocalServer()
        server.listen(name)
        return server
    except Exception:
        return None


def run_app():
    app = QtWidgets.QApplication(sys.argv)
    app.setQuitOnLastWindowClosed(True)
    if _icons is not None:
        try:
            app.setWindowIcon(_icons.app_icon())
        except Exception:
            pass

    server = _single_instance(app)
    if server is False:
        return 0  # another instance is already running; we asked it to surface

    overlay = Overlay()           # click-through pointer (hidden until pointed)
    bar = ControlBar(overlay)     # interactive command window
    if _icons is not None:
        try:
            bar.setWindowIcon(_icons.app_icon())
        except Exception:
            pass
    bar.show()
    bar.raise_()
    app.aboutToQuit.connect(bar.close)  # ensure worker/timer cleanup on Quit

    # surface the bar when a second launch pings the local server
    if server is not None:
        try:
            server.newConnection.connect(
                lambda: (bar.show(), bar.raise_(), bar.activateWindow()))
        except Exception:
            pass

    # system tray (background-resident)
    if _tray is not None:
        try:
            t = _tray.build_tray(bar)
            if t is not None:
                bar._tray = t
                t.show()
        except Exception:
            pass

    # first-run onboarding (after the window is up)
    if _onboarding is not None:
        try:
            QtCore.QTimer.singleShot(
                450, lambda: _onboarding.maybe_show_intro(bar, bar.cfg))
        except Exception:
            pass

    # non-blocking update check (only if a manifest URL is configured)
    if _updatecheck is not None and bar._cfg_get("check_updates", True):
        try:
            url = bar._cfg_get("update_url", None)
            if url:
                w = _updatecheck.UpdateWorker(APP_VERSION, url)
                bar._updworker = w
                w.result.connect(
                    lambda latest, u: bar.status.setText(
                        "A new version (%s) is available." % latest))
                w.start()
        except Exception:
            pass

    return app.exec_()


def main():
    # stdout may be piped; make it utf-8 tolerant like the PoCs.
    try:
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass
    install_excepthook()

    args = sys.argv[1:]
    if "--debug" in args:
        set_debug(True)
    if "--version" in args:
        print("%s %s" % (APP_NAME, APP_VERSION))
        sys.exit(0)
    if "--shot" in args:
        sys.exit(run_shot())
    if "--selftest-local" in args:
        sys.exit(run_selftest_local())
    if "--selftest" in args:
        task = "open my email"
        if "--task" in args:
            ti = args.index("--task")
            if ti + 1 < len(args):
                task = args[ti + 1]
        sys.exit(run_selftest(task))
    sys.exit(run_app())


if __name__ == "__main__":
    main()
