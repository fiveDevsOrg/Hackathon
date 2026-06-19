"""onboarding.py — First-run intro dialog for Nudge OS.

Shows a calm, branded welcome card the very first time the app launches.
It explains in a few bullets how Nudge OS works (it points, you click),
then never shows again once the user dismisses it.

Public entrypoint:
    maybe_show_intro(parent, settings) -> None

Design constraints honoured here:
  * Never raises on import or from the public entrypoint (never-crash app).
  * Frameless, rounded, INK-on-BONE styling with EMBER accents.
  * NOT always-on-top: the guidance overlay must keep focus/priority.
  * Centered on the parent window.
  * Works with either a dict-style settings object (.get/.set) or a
    QSettings-style object (.value/.setValue) — we probe both safely.
"""

from PyQt5 import QtCore, QtGui, QtWidgets


# --- Brand palette (hardcoded per integration contract; no cross-imports) ---
EMBER = "#FF6B35"
EMBER_HI = "#FF8A5B"
INK = "#12141A"
INK2 = "#0E0D0C"
BONE = "#F4F2EC"
EDGE = "#3A3530"
MUTED = "#B9B2A8"


# The tips shown in the welcome card. Kept as data so they're easy to tweak.
_TIPS = (
    "I point at what to click — you do the clicking.",
    "Type a task and press Guide.",
    "Ctrl+Alt+N show/hide · Ctrl+Alt+X stop.",
    "Auto-advance moves on when the screen changes.",
)


def _settings_get(settings, key, default=None):
    """Read a value from an unknown settings object without ever raising.

    Tries a dict-like ``.get`` first (the API named in the spec), then falls
    back to QSettings-style ``.value``. Returns ``default`` on any failure.
    """
    if settings is None:
        return default
    try:
        getter = getattr(settings, "get", None)
        if callable(getter):
            return getter(key, default)
    except Exception:
        pass
    try:
        value = getattr(settings, "value", None)
        if callable(value):
            return value(key, default)
    except Exception:
        pass
    return default


def _settings_set(settings, key, val):
    """Persist a value to an unknown settings object without ever raising."""
    if settings is None:
        return
    try:
        setter = getattr(settings, "set", None)
        if callable(setter):
            setter(key, val)
            return
    except Exception:
        pass
    try:
        set_value = getattr(settings, "setValue", None)
        if callable(set_value):
            set_value(key, val)
    except Exception:
        pass


def _truthy(val):
    """Coerce a settings value to a bool. QSettings can hand back the strings
    'true'/'false', so handle those explicitly rather than trusting bool()."""
    if isinstance(val, str):
        return val.strip().lower() in ("1", "true", "yes", "on")
    return bool(val)


class _IntroDialog(QtWidgets.QDialog):
    """A frameless, rounded welcome card. Self-contained styling."""

    def __init__(self, parent, settings):
        super().__init__(parent)
        self._settings = settings

        # Frameless + translucent so the rounded corners read cleanly.
        # Deliberately NO WindowStaysOnTopHint: we must not steal focus or
        # paint over the guidance overlay.
        self.setWindowFlags(
            QtCore.Qt.Dialog
            | QtCore.Qt.FramelessWindowHint
        )
        self.setAttribute(QtCore.Qt.WA_TranslucentBackground, True)
        self.setModal(True)

        self._build_ui()

    # -- UI construction ---------------------------------------------------
    def _build_ui(self):
        # Outer transparent layout; the visible card is a styled #root frame.
        outer = QtWidgets.QVBoxLayout(self)
        outer.setContentsMargins(0, 0, 0, 0)

        root = QtWidgets.QFrame(self)
        root.setObjectName("root")
        outer.addWidget(root)

        col = QtWidgets.QVBoxLayout(root)
        col.setContentsMargins(28, 26, 28, 24)
        col.setSpacing(14)

        # Title
        title = QtWidgets.QLabel("Welcome to Nudge OS", root)
        title.setObjectName("title")
        col.addWidget(title)

        # Subtitle / one-liner under the title
        subtitle = QtWidgets.QLabel(
            "Your quiet copilot. Here's how it works:", root
        )
        subtitle.setObjectName("subtitle")
        col.addWidget(subtitle)

        # A thin ember rule for a touch of brand
        rule = QtWidgets.QFrame(root)
        rule.setObjectName("rule")
        rule.setFixedHeight(2)
        col.addWidget(rule)

        # Bullet tips
        tips_box = QtWidgets.QVBoxLayout()
        tips_box.setSpacing(11)
        for text in _TIPS:
            tips_box.addLayout(self._make_bullet(root, text))
        col.addLayout(tips_box)

        col.addSpacing(6)

        # "Got it" ember button, right-aligned
        btn_row = QtWidgets.QHBoxLayout()
        btn_row.addStretch(1)
        got_it = QtWidgets.QPushButton("Got it", root)
        got_it.setObjectName("gotit")
        got_it.setCursor(QtCore.Qt.PointingHandCursor)
        got_it.setDefault(True)
        got_it.clicked.connect(self._on_dismiss)
        btn_row.addWidget(got_it)
        col.addLayout(btn_row)

        root.setStyleSheet(self._qss())
        self.setFixedWidth(420)
        self.adjustSize()

    def _make_bullet(self, parent, text):
        """One tip row: an ember dot + wrapped bone text."""
        row = QtWidgets.QHBoxLayout()
        row.setSpacing(11)

        dot = QtWidgets.QLabel("●", parent)  # filled circle
        dot.setObjectName("bullet")
        dot.setAlignment(QtCore.Qt.AlignTop | QtCore.Qt.AlignHCenter)
        dot.setFixedWidth(14)
        row.addWidget(dot, 0, QtCore.Qt.AlignTop)

        label = QtWidgets.QLabel(text, parent)
        label.setObjectName("tip")
        label.setWordWrap(True)
        row.addWidget(label, 1)
        return row

    def _qss(self):
        """Stylesheet for the card. Uses %-substitution of the palette."""
        return """
        #root {
            background: %(ink)s;
            border: 1px solid %(edge)s;
            border-radius: 16px;
        }
        #title {
            color: %(bone)s;
            font: 600 21px 'Segoe UI';
        }
        #subtitle {
            color: %(muted)s;
            font: 13px 'Segoe UI';
        }
        #rule {
            background: %(ember)s;
            border: none;
            border-radius: 1px;
        }
        #tip {
            color: %(bone)s;
            font: 14px 'Segoe UI';
        }
        #bullet {
            color: %(ember)s;
            font: 11px 'Segoe UI';
        }
        QPushButton#gotit {
            color: %(ink2)s;
            background: %(ember)s;
            border: none;
            border-radius: 10px;
            padding: 9px 22px;
            font: 600 14px 'Segoe UI';
            min-width: 96px;
        }
        QPushButton#gotit:hover {
            background: %(ember_hi)s;
        }
        QPushButton#gotit:pressed {
            background: %(ember)s;
        }
        """ % {
            "ink": INK,
            "ink2": INK2,
            "bone": BONE,
            "edge": EDGE,
            "ember": EMBER,
            "ember_hi": EMBER_HI,
            "muted": MUTED,
        }

    # -- Behaviour ---------------------------------------------------------
    def _on_dismiss(self):
        """Persist the 'seen' flag and close. Guarded so a settings failure
        still lets the dialog close."""
        try:
            _settings_set(self._settings, "seen_intro", True)
        except Exception:
            pass
        try:
            self.accept()
        except Exception:
            try:
                self.close()
            except Exception:
                pass

    def center_on_parent(self):
        """Center this card over the parent window (or screen as fallback)."""
        try:
            self.adjustSize()
            geo = self.frameGeometry()
            parent = self.parentWidget()
            if parent is not None and parent.isVisible():
                anchor = parent.frameGeometry().center()
            else:
                screen = QtWidgets.QApplication.primaryScreen()
                if screen is not None:
                    anchor = screen.availableGeometry().center()
                else:
                    return
            geo.moveCenter(anchor)
            self.move(geo.topLeft())
        except Exception:
            # Position is cosmetic; never let it block the dialog.
            pass


def maybe_show_intro(parent, settings):
    """Show the first-run intro once, if it hasn't been seen.

    No-op (and never raises) if the intro was already dismissed, if no
    QApplication exists yet, or if anything goes wrong building the dialog.

    Args:
        parent: the main window (used for centering / modality). May be None.
        settings: a settings object exposing either .get/.set (dict-style)
                  or .value/.setValue (QSettings-style).
    """
    try:
        # Already seen? Then do nothing.
        if _truthy(_settings_get(settings, "seen_intro", False)):
            return

        # Must have a live QApplication before creating widgets.
        if QtWidgets.QApplication.instance() is None:
            return

        dlg = _IntroDialog(parent, settings)
        dlg.center_on_parent()
        # exec_() is modal but does NOT make the window top-most, so the
        # guidance overlay keeps its painting priority once dismissed.
        dlg.exec_()
    except Exception:
        # Onboarding is strictly best-effort; never block startup.
        return
