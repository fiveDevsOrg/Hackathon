"""
tray.py — System tray integration for Nudge OS.

Adds a Windows system-tray (notification area) presence so the copilot can live
quietly out of the way: a single ember icon with a right-click menu to show or
hide the control bar, stop guiding, toggle auto-advance, and quit. Left-click /
double-click on the icon simply toggles the bar's visibility.

Design notes
------------
* The ONLY public entrypoint is ``build_tray(bar)``. It builds and returns a
  ``QSystemTrayIcon`` wired to the live ControlBar, or ``None`` when a tray is
  unavailable / anything goes wrong. The caller MUST keep a reference to the
  returned object (Qt does not own it) and call ``.show()`` on it.
* This module never raises — not on import, not from ``build_tray``. Every risky
  step is guarded so the app's never-crash guarantee holds. A failure degrades
  gracefully to ``None`` (no tray) rather than taking the app down.
* We do NOT import from nudge_desktop (avoids a circular import). Brand colours
  are hardcoded to the shared palette. The ``icons`` module is imported lazily
  and defensively, with a painted ember-dot fallback if it is missing/broken.
* No QPixmap / QIcon is created at import time — only inside functions that run
  after the QApplication exists.
"""

from PyQt5 import QtCore, QtGui, QtWidgets

# ---- shared brand palette (hardcoded; do not import from nudge_desktop) -----
EMBER = "#FF6B35"
EMBER_HI = "#FF8A5B"
INK = "#12141A"
INK2 = "#0E0D0C"
BONE = "#F4F2EC"
EDGE = "#3A3530"
MUTED = "#B9B2A8"


def _fallback_icon():
    """Paint a small ember-dot QIcon as a fallback tray glyph.

    Used when the ``icons`` module is unavailable or its ``tray_pixmap()`` fails.
    Only ever called after a QApplication exists, so building a QPixmap is safe.
    Never raises — returns an empty QIcon on the (very unlikely) paint failure.
    """
    try:
        size = 32
        pm = QtGui.QPixmap(size, size)
        pm.fill(QtCore.Qt.transparent)
        p = QtGui.QPainter(pm)
        try:
            p.setRenderHint(QtGui.QPainter.Antialiasing, True)
            # soft ember halo
            p.setPen(QtCore.Qt.NoPen)
            p.setBrush(QtGui.QColor(255, 107, 53, 60))
            p.drawEllipse(2, 2, size - 4, size - 4)
            # solid ember core
            p.setBrush(QtGui.QColor(EMBER))
            inset = int(size * 0.28)
            p.drawEllipse(inset, inset, size - inset * 2, size - inset * 2)
        finally:
            p.end()
        return QtGui.QIcon(pm)
    except Exception:
        # Absolute last resort: an empty icon still yields a usable tray entry.
        return QtGui.QIcon()


def _tray_icon():
    """Return the QIcon for the tray: ``icons.tray_pixmap()`` if available, else
    the painted ember-dot fallback. Fully guarded — never raises."""
    try:
        import icons  # lazy import; sibling module may or may not exist
        pm = icons.tray_pixmap()
        if pm is not None and not pm.isNull():
            return QtGui.QIcon(pm)
    except Exception:
        pass
    return _fallback_icon()


def build_tray(bar):
    """Build the Nudge OS system-tray icon wired to ``bar`` (the ControlBar).

    Returns a configured ``QtWidgets.QSystemTrayIcon`` whose context menu offers
    Show/Hide, Stop guiding, a checkable Auto-advance toggle, and Quit. The
    returned object is NOT shown yet — the caller must keep a reference to it and
    call ``.show()``.

    Returns ``None`` when no system tray is available or if anything goes wrong,
    so the app keeps running tray-less rather than crashing.
    """
    try:
        # No notification area? Nothing to build.
        if not QtWidgets.QSystemTrayIcon.isSystemTrayAvailable():
            return None

        tray = QtWidgets.QSystemTrayIcon()
        tray.setIcon(_tray_icon())
        tray.setToolTip("Nudge OS")

        # The menu is parented to the tray so its lifetime is tied to the icon.
        menu = QtWidgets.QMenu()

        # --- Show / Hide -> reuse the bar's existing toggle ---
        act_show = menu.addAction("Show / Hide")
        act_show.triggered.connect(bar._toggle_visible)

        # --- Pause / Resume -> keep task context, just stop/resume watching ---
        try:
            act_pause = menu.addAction("Pause / Resume")
            act_pause.triggered.connect(bar._toggle_pause)
        except Exception:
            pass

        # --- Stop guiding -> reuse the bar's stop handler ---
        act_stop = menu.addAction("Stop guiding")
        act_stop.triggered.connect(bar.on_stop)

        # --- Auto-advance: a checkable mirror of bar.auto_chk ---------------
        # Toggling here drives bar.auto_chk.setChecked, so the bar's existing
        # persistence (_on_auto_toggled -> QSettings) is the single source of
        # truth. We seed our checked state from the bar's current value.
        act_auto = menu.addAction("Auto-advance")
        act_auto.setCheckable(True)
        try:
            act_auto.setChecked(bar.auto_chk.isChecked())
        except Exception:
            # If the bar isn't fully built yet, default to checked (the app's
            # own default) rather than failing the whole tray build.
            act_auto.setChecked(True)
        # Route our toggle into the checkbox; the checkbox owns persistence.
        act_auto.toggled.connect(bar.auto_chk.setChecked)
        # Keep the menu item in sync if the bar's checkbox changes elsewhere
        # (e.g. clicked directly, or restored from settings), so the checkmark
        # never goes stale. Guarded: a missing signal must not break the build.
        try:
            bar.auto_chk.toggled.connect(act_auto.setChecked)
        except Exception:
            pass

        menu.addSeparator()

        # --- Quit -> close the whole app ---
        act_quit = menu.addAction("Quit Nudge OS")
        act_quit.triggered.connect(QtWidgets.QApplication.quit)

        tray.setContextMenu(menu)

        # Left-click / double-click the icon -> toggle the bar's visibility.
        def _on_activated(reason):
            try:
                if reason in (QtWidgets.QSystemTrayIcon.Trigger,
                              QtWidgets.QSystemTrayIcon.DoubleClick):
                    bar._toggle_visible()
            except Exception:
                # A misbehaving slot must never bubble out of the event loop.
                pass

        tray.activated.connect(_on_activated)

        return tray
    except Exception:
        # Any failure -> run tray-less. Never crash the app over a tray.
        return None
