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
import os
import re
import sys
import traceback

from PyQt5 import QtCore, QtGui, QtWidgets

# ---- palette (matches the proven overlay PoC) ------------------------------
EMBER = QtGui.QColor("#FF6B35")
INK = QtGui.QColor(18, 20, 26, 242)
BONE = QtGui.QColor("#F4F2EC")

MODEL = "claude-haiku-4-5-20251001"
MAX_MARKS = 60          # cap on elements sent to the planner
TARGET_W = 1280         # screenshot downscale width sent to the model
DEBOUNCE_MS = 750       # let the UI settle after a click before re-planning
HERE = os.path.dirname(os.path.abspath(__file__))


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
    # foreground window
    try:
        hwnd = _auto.GetForegroundWindow()
        win = _auto.ControlFromHandle(hwnd)
        if win is not None:
            _walk(win, 0, 25, fg, 80)
    except Exception:
        traceback.print_exc()
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

_DBG = _os.path.join(_os.path.dirname(_os.path.abspath(__file__)), "debug.log")


def _dbg(msg):
    try:
        with open(_DBG, "a", encoding="utf-8") as f:
            f.write(str(msg) + "\n")
    except Exception:
        pass


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
    item -> mark 0. source is always 'local'.
    """
    if not marks:
        return {"index": -1, "instruction": "No UI elements detected -- try the taskbar.",
                "done": False, "source": "local"}
    task_toks = set(_tokens(task)) - _STOP_WORDS
    best_i, best_score = -1, 0
    for m in marks:
        name_toks = set(_tokens(m["name"]))
        score = len(task_toks & name_toks)
        # light bonus for partial/substring hits (e.g. "mail" in "Outlook Mail")
        if score == 0:
            for t in task_toks:
                if any(t in nt or nt in t for nt in name_toks if len(t) >= 3):
                    score = 1
                    break
        if score > best_score:
            best_score, best_i = score, m["i"]
    if best_i < 0:
        # prefer a Start button, else first mark
        for m in marks:
            if "start" in m["name"].lower():
                best_i = m["i"]
                break
        if best_i < 0:
            best_i = marks[0]["i"]
    return {
        "index": best_i,
        "instruction": "Best local guess: click \"%s\"." % marks[best_i]["name"],
        "done": False,
        "source": "local",
    }


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


def plan(task, marks, history, img_b64):
    """Ask Claude for the next mark to click. Returns a validated result dict
    {index, instruction, done, source}. Falls back to a local heuristic on any
    error/timeout/invalid output. Runs OFF the main thread.
    """
    if not marks:
        return {"index": -1,
                "instruction": "No detectable UI elements -- try the taskbar.",
                "done": False, "source": "local"}

    lines = []
    for m in marks:
        x, y, w, h = m["rect"]
        lines.append("%d: %s [%s] @ (%d,%d,%d,%d)" % (m["i"], m["name"], m["type"], x, y, w, h))
    marks_text = "\n".join(lines)
    hist_text = ", ".join(history) if history else "(nothing clicked yet)"
    user_text = (
        "TASK: %s\n\n"
        "Already clicked so far: %s\n\n"
        "Clickable elements (the screenshot shows the live screen):\n%s\n\n"
        "Return the STRICT JSON for the single next element to click."
        % (task, hist_text, marks_text)
    )

    try:
        import anthropic
        client = anthropic.Anthropic()  # reads ANTHROPIC_API_KEY from env
        content = []
        if img_b64:
            content.append({
                "type": "image",
                "source": {"type": "base64", "media_type": "image/png", "data": img_b64},
            })
        content.append({"type": "text", "text": user_text})
        msg = client.messages.create(
            model=MODEL,
            max_tokens=300,
            system=_SYSTEM,
            messages=[{"role": "user", "content": content}],
        )
        raw = ""
        for block in getattr(msg, "content", []) or []:
            if getattr(block, "type", None) == "text":
                raw += block.text
        data = _first_json(raw)
        if not isinstance(data, dict) or "index" not in data:
            return _heuristic(task, marks)
        idx = int(data.get("index", -1))
        if idx < 0 or idx >= len(marks):
            # model picked an out-of-range index -> heuristic, but keep its words
            fb = _heuristic(task, marks)
            return fb
        return {
            "index": idx,
            "instruction": str(data.get("instruction") or "Click this.").strip()[:160],
            "done": bool(data.get("done", False)),
            "source": "AI",
        }
    except Exception:
        traceback.print_exc()
        return _heuristic(task, marks)


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

    def point_at(self, rect, label):
        self.t = tuple(int(v) for v in rect)
        self.label = label or ""
        if not self.isVisible():
            self.show()
        self.raise_()
        self.update()

    def clear(self):
        self.t = None
        self.label = ""
        self.update()

    def paintEvent(self, _):
        if not self.t:
            return
        p = QtGui.QPainter(self)
        p.setRenderHint(QtGui.QPainter.Antialiasing, True)
        x, y, w, h = self.t
        x -= self.sg.left()
        y -= self.sg.top()

        # highlight ring (soft glow + crisp ring)
        p.setBrush(QtCore.Qt.NoBrush)
        p.setPen(QtGui.QPen(QtGui.QColor(255, 107, 53, 90), 10))
        p.drawRoundedRect(x - 9, y - 9, w + 18, h + 18, 14, 14)
        p.setPen(QtGui.QPen(EMBER, 3))
        p.drawRoundedRect(x - 5, y - 5, w + 10, h + 10, 10, 10)

        # ghost cursor (arrow) just off the target's corner
        cx, cy = x + w + 2, y - 2
        p.setBrush(QtGui.QColor(255, 107, 53, 235))
        p.setPen(QtGui.QPen(QtGui.QColor("#0E0D0C"), 1.5))
        p.drawPolygon(QtGui.QPolygon([
            QtCore.QPoint(cx, cy), QtCore.QPoint(cx + 20, cy + 7),
            QtCore.QPoint(cx + 8, cy + 10), QtCore.QPoint(cx + 12, cy + 22),
        ]))

        # tooltip -- flips above the target if it would fall off the bottom
        f = QtGui.QFont("Segoe UI", 11)
        fb = QtGui.QFont("Segoe UI", 11)
        fb.setBold(True)
        pad, th = 14, 34
        tw = QtGui.QFontMetrics(fb).horizontalAdvance("Nudge") + 8 + \
            QtGui.QFontMetrics(f).horizontalAdvance(self.label) + pad * 2
        # clamp the tooltip to the monitor the TARGET sits on (not the whole
        # virtual desktop), so it never spills onto an adjacent screen.
        gc = QtCore.QPoint(self.t[0] + self.t[2] // 2, self.t[1] + self.t[3] // 2)
        _scr = QtWidgets.QApplication.screenAt(gc) or QtWidgets.QApplication.primaryScreen()
        _sb = _scr.geometry()
        mb_l, mb_t = _sb.left() - self.sg.left(), _sb.top() - self.sg.top()
        mb_r, mb_b = mb_l + _sb.width(), mb_t + _sb.height()
        tx, ty = x - 5, y + h + 14
        if ty + th > mb_b - 4:
            ty = y - th - 14
        tx = max(mb_l + 4, min(tx, mb_r - tw - 6))
        p.setBrush(INK)
        p.setPen(QtCore.Qt.NoPen)
        p.drawRoundedRect(tx, ty, tw, th, 9, 9)
        p.setFont(fb)
        p.setPen(EMBER)
        p.drawText(tx + pad, ty + 22, "Nudge")
        p.setFont(f)
        p.setPen(BONE)
        p.drawText(tx + pad + QtGui.QFontMetrics(fb).horizontalAdvance("Nudge") + 8,
                   ty + 22, self.label)


# ===========================================================================
# PlanWorker -- one capture+scan+plan cycle on a background QThread.
# Emits `finished` with a plain dict; never touches a widget.
# ===========================================================================
class PlanWorker(QtCore.QThread):
    finished = QtCore.pyqtSignal(dict)

    def __init__(self, task, history, mon_index=1, screen_rect=None):
        super().__init__()
        self.task = task
        self.history = list(history)
        self.mon_index = mon_index
        self.screen_rect = screen_rect

    def run(self):
        result = {"ok": False, "marks": [], "plan": None, "fg": 0, "tb": 0, "error": ""}
        com = False
        try:
            import comtypes
            comtypes.CoInitialize()  # UIA needs COM initialized on THIS thread
            com = True
        except Exception:
            pass
        try:
            marks, fg, tb = scan_marks(self.screen_rect)
            _img, b64, _scale = grab_screen(self.mon_index)
            pl = plan(self.task, marks, self.history, b64)
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
# ControlBar -- the interactive, draggable top-center command window.
# Owns the engine loop state. All widget mutation happens here on the main
# thread; blocking work is delegated to PlanWorker.
# ===========================================================================
class ControlBar(QtWidgets.QWidget):
    def __init__(self, overlay):
        super().__init__()
        self.overlay = overlay
        self.worker = None
        self.bridge = ClickBridge()
        self.bridge.clicked.connect(self._on_global_click)
        self.guiding = False
        self.history = []          # names of marks already pointed at/clicked
        self.marks = []            # current cycle's marks
        self.cur_target = None     # {name, rect} we are currently pointing at
        self.step = 0
        self._dragging = False
        self._drag_off = QtCore.QPoint()

        # debounce timer: re-plan only after the UI settles post-click
        self._debounce = QtCore.QTimer(self)
        self._debounce.setSingleShot(True)
        self._debounce.setInterval(DEBOUNCE_MS)
        self._debounce.timeout.connect(self._advance)

        self._build_ui()

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
        outer = QtWidgets.QVBoxLayout(self)
        outer.setContentsMargins(0, 0, 0, 0)
        outer.addWidget(root)

        lay = QtWidgets.QVBoxLayout(root)
        lay.setContentsMargins(14, 10, 14, 12)
        lay.setSpacing(8)

        row = QtWidgets.QHBoxLayout()
        row.setSpacing(8)
        title = QtWidgets.QLabel("Nudge OS")
        title.setObjectName("title")
        self.task_edit = QtWidgets.QLineEdit()
        self.task_edit.setPlaceholderText("What do you want to do?")
        self.task_edit.returnPressed.connect(self.on_guide)
        self.guide_btn = QtWidgets.QPushButton("Guide")
        self.guide_btn.setObjectName("guide")
        self.guide_btn.clicked.connect(self.on_guide)
        self.stop_btn = QtWidgets.QPushButton("Stop")
        self.stop_btn.setObjectName("stop")
        self.stop_btn.clicked.connect(self.on_stop)
        row.addWidget(title)
        row.addWidget(self.task_edit, 1)
        row.addWidget(self.guide_btn)
        row.addWidget(self.stop_btn)
        lay.addLayout(row)

        # screen selector -- Auto follows the monitor the bar sits on
        srow = QtWidgets.QHBoxLayout()
        srow.setSpacing(8)
        slab = QtWidgets.QLabel("Assist screen:")
        slab.setObjectName("status")
        self.screen_combo = QtWidgets.QComboBox()
        self.screen_combo.setObjectName("screens")
        self._populate_screens()
        self.screen_combo.currentIndexChanged.connect(self._on_screen_changed)
        srow.addWidget(slab)
        srow.addWidget(self.screen_combo, 1)
        lay.addLayout(srow)

        self.status = QtWidgets.QLabel("Type a task and press Guide. I point, you click.")
        self.status.setObjectName("status")
        self.status.setWordWrap(True)
        lay.addWidget(self.status)

        self.setStyleSheet(
            """
            #root { background: rgba(18,20,26,242); border: 1px solid #FF6B35;
                    border-radius: 14px; }
            #title { color: #FF6B35; font: bold 14px 'Segoe UI'; }
            QLineEdit { background: #0E0D0C; color: #F4F2EC; border: 1px solid #3a3530;
                        border-radius: 8px; padding: 6px 9px; font: 12px 'Segoe UI';
                        min-width: 300px; }
            QLineEdit:focus { border: 1px solid #FF6B35; }
            QPushButton { color: #F4F2EC; border: none; border-radius: 8px;
                          padding: 6px 14px; font: bold 12px 'Segoe UI'; }
            #guide { background: #FF6B35; color: #0E0D0C; }
            #guide:hover { background: #ff7d4d; }
            #stop { background: #2a2622; }
            #stop:hover { background: #3a3530; }
            #status { color: #b9b2a8; font: 11px 'Segoe UI'; }
            #screens { background: #0E0D0C; color: #F4F2EC; border: 1px solid #3a3530;
                       border-radius: 7px; padding: 3px 8px; font: 11px 'Segoe UI'; }
            #screens QAbstractItemView { background: #15130f; color: #F4F2EC;
                       selection-background-color: #FF6B35; selection-color: #0E0D0C; }
            """
        )

        self.resize(560, 120)
        scr = QtWidgets.QApplication.primaryScreen().geometry()
        self.move(scr.center().x() - self.width() // 2, scr.top() + 16)

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
        self.history = []
        self.step = 0
        self.guiding = True
        self.bridge.start()
        _dbg("on_guide: started task=%r" % task)
        self.status.setText("Looking at your screen...")
        self._kick()

    def on_stop(self):
        self.guiding = False
        self._debounce.stop()
        self.bridge.stop()
        self.overlay.clear()
        self.cur_target = None
        self.status.setText("Stopped. Type a new task and press Guide.")

    def _on_global_click(self):
        # main thread (signal-marshalled). Only react while guiding and idle.
        _dbg("on_global_click: guiding=%s worker_running=%s" % (
            self.guiding, (self.worker is not None and self.worker.isRunning())))
        if not self.guiding:
            return
        if self.worker is not None and self.worker.isRunning():
            return
        # remember what we just told them to click, then re-plan after settle
        if self.cur_target and self.cur_target.get("name"):
            nm = self.cur_target["name"]
            if not self.history or self.history[-1] != nm:
                self.history.append(nm)
        self.cur_target = None
        self.overlay.clear()  # drop the stale pointer immediately for feedback
        self.status.setText("Got it - looking at the screen (a moment)...")
        self._debounce.start()

    def _advance(self):
        _dbg("advance: guiding=%s" % self.guiding)
        if self.guiding:
            self._kick()

    def _kick(self):
        """Start a background capture+scan+plan cycle (non-blocking)."""
        _dbg("kick")
        if self.worker is not None and self.worker.isRunning():
            return
        self.guide_btn.setEnabled(False)
        _scr, mon = self._resolve_target_screen()
        g = _scr.geometry()
        rect = (g.left(), g.top(), g.width(), g.height())
        self.worker = PlanWorker(self.task, self.history, mon, rect)
        self.worker.finished.connect(self._on_plan)
        self.worker.start()

    def _on_plan(self, result):
        # back on the main thread
        _pl = result.get("plan") or {}
        _dbg("on_plan: ok=%s marks=%d idx=%s done=%s" % (
            result.get("ok"), len(result.get("marks", [])),
            _pl.get("index"), _pl.get("done")))
        self.guide_btn.setEnabled(True)
        if not self.guiding:
            return
        if not result.get("ok"):
            self.status.setText("Hit a snag scanning the screen. Try Guide again.")
            return
        self.marks = result["marks"]
        pl = result["plan"] or {}
        fg, tb = result.get("fg", 0), result.get("tb", 0)

        # empty-marks / custom-drawn-app handling
        if not self.marks:
            self.overlay.clear()
            self.cur_target = None
            self.status.setText(
                "No detectable UI elements in this window (a vision add-on "
                "would cover it) -- try the taskbar."
            )
            return

        if pl.get("done"):
            self.overlay.clear()
            self.cur_target = None
            self.guiding = False
            self.bridge.stop()
            self.status.setText("Done!")
            return

        idx = pl.get("index", -1)
        if idx is None or idx < 0 or idx >= len(self.marks):
            # foreground had nothing useful but the app is custom-drawn
            if fg == 0 and tb > 0:
                self.status.setText(
                    "No detectable UI elements in this window (a vision add-on "
                    "would cover it) -- showing the taskbar instead."
                )
                idx = self.marks[0]["i"]
            else:
                self.status.setText("Couldn't pick a target this round. Try Guide again.")
                return

        target = self.marks[idx]
        self.cur_target = {"name": target["name"], "rect": target["rect"]}
        self.step += 1
        src = pl.get("source", "AI")
        instr = pl.get("instruction", "Click this.")
        self.overlay.point_at(target["rect"], instr)
        self.status.setText("Step %d · %s · %s" % (self.step, src, instr))


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


# ===========================================================================
# main
# ===========================================================================
def run_app():
    app = QtWidgets.QApplication(sys.argv)
    app.setQuitOnLastWindowClosed(True)
    overlay = Overlay()           # click-through pointer (hidden until pointed)
    bar = ControlBar(overlay)     # interactive command window
    bar.show()
    bar.raise_()
    return app.exec_()


def main():
    # stdout may be piped; make it utf-8 tolerant like the PoCs.
    try:
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass

    args = sys.argv[1:]
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
