"""
icons.py — QIcon / QPixmap factory for Nudge OS.

Builds crisp, antialiased glyphs with QPainter, tinted in the Nudge brand
palette (ember on ink/bone). Every glyph is drawn lazily *inside* the
function — never at import time — because Qt forbids creating QPixmap/QIcon
before a QApplication exists.

Public API (all wrapped in try/except so they degrade to an empty
QtGui.QIcon() / QtGui.QPixmap() rather than ever raising):

    app_icon()            -> QtGui.QIcon    # window/taskbar icon
    play_icon()           -> QtGui.QIcon    # ember "go" triangle / target
    stop_icon()           -> QtGui.QIcon    # rounded square
    bolt_icon()           -> QtGui.QIcon    # lightning bolt (auto-advance)
    tray_pixmap(size=64)  -> QtGui.QPixmap  # ember pointer arrow on ink tile

This module never raises on import and never raises from a public
entrypoint, honouring the app's never-crash guarantee.
"""

from PyQt5 import QtCore, QtGui, QtWidgets  # noqa: F401  (QtWidgets kept for parity)

# --- Brand palette (hardcoded; do NOT import from nudge_desktop) -------------
EMBER = "#FF6B35"      # primary accent
EMBER_HI = "#FF8A5B"   # lighter ember (highlights / gradients)
INK = "#12141A"        # deep background
INK2 = "#0E0D0C"       # darker ink (tile base)
BONE = "#F4F2EC"       # off-white foreground
EDGE = "#3A3530"       # subtle border
MUTED = "#B9B2A8"      # muted text

# Logical canvas we draw on before letting Qt scale down. Drawing large and
# scaling down keeps glyphs crisp at small UI sizes (14-16px).
_CANVAS = 256


# --------------------------------------------------------------------------- #
# Internal helpers
# --------------------------------------------------------------------------- #
def _new_pixmap(size):
    """Return a transparent ARGB QPixmap of the given square size."""
    pm = QtGui.QPixmap(int(size), int(size))
    pm.fill(QtCore.Qt.transparent)
    return pm


def _painter(pixmap):
    """Return an antialiased QPainter bound to *pixmap*."""
    p = QtGui.QPainter(pixmap)
    p.setRenderHint(QtGui.QPainter.Antialiasing, True)
    p.setRenderHint(QtGui.QPainter.SmoothPixmapTransform, True)
    p.setRenderHint(QtGui.QPainter.TextAntialiasing, True)
    return p


def _rounded_tile(painter, rect, fill_color, radius=None, border_color=None):
    """Paint a rounded-rectangle tile inside *rect* (a QRectF)."""
    if radius is None:
        radius = rect.width() * 0.22
    path = QtGui.QPainterPath()
    path.addRoundedRect(rect, radius, radius)
    painter.fillPath(path, QtGui.QColor(fill_color))
    if border_color is not None:
        pen = QtGui.QPen(QtGui.QColor(border_color))
        pen.setWidthF(rect.width() * 0.02)
        painter.setPen(pen)
        painter.drawPath(path)
        painter.setPen(QtCore.Qt.NoPen)


def _ember_gradient(rect):
    """Vertical ember -> ember-highlight gradient across *rect*."""
    grad = QtGui.QLinearGradient(rect.topLeft(), rect.bottomLeft())
    grad.setColorAt(0.0, QtGui.QColor(EMBER_HI))
    grad.setColorAt(1.0, QtGui.QColor(EMBER))
    return grad


def _icon_from_pixmap(pixmap):
    """Wrap a pixmap in a QIcon (empty icon if pixmap is null)."""
    if pixmap is None or pixmap.isNull():
        return QtGui.QIcon()
    return QtGui.QIcon(pixmap)


# --------------------------------------------------------------------------- #
# Painted glyph builders (each returns a QPixmap on the logical canvas)
# --------------------------------------------------------------------------- #
def _paint_chevron_tile():
    """Ember chevron-on-ink tile — the fallback app icon glyph."""
    pm = _new_pixmap(_CANVAS)
    p = _painter(pm)
    try:
        p.setPen(QtCore.Qt.NoPen)
        # Ink tile background.
        tile = QtCore.QRectF(8, 8, _CANVAS - 16, _CANVAS - 16)
        _rounded_tile(p, tile, INK, border_color=EDGE)

        # A bold ember chevron (">") pointing right — "nudge toward".
        c = _CANVAS / 2.0
        pen = QtGui.QPen(QtGui.QColor(EMBER))
        pen.setWidthF(_CANVAS * 0.11)
        pen.setCapStyle(QtCore.Qt.RoundCap)
        pen.setJoinStyle(QtCore.Qt.RoundJoin)
        p.setPen(pen)
        path = QtGui.QPainterPath()
        path.moveTo(c - 34, c - 56)
        path.lineTo(c + 38, c)
        path.lineTo(c - 34, c + 56)
        p.drawPath(path)
    finally:
        p.end()
    return pm


def _paint_play():
    """Ember right-pointing triangle (a "go"/target glyph)."""
    pm = _new_pixmap(_CANVAS)
    p = _painter(pm)
    try:
        p.setPen(QtCore.Qt.NoPen)
        c = _CANVAS / 2.0
        rect = QtCore.QRectF(0, 0, _CANVAS, _CANVAS)
        # Solid ember triangle, slightly inset, vertically centred.
        tri = QtGui.QPolygonF([
            QtCore.QPointF(c - 46, c - 64),
            QtCore.QPointF(c + 62, c),
            QtCore.QPointF(c - 46, c + 64),
        ])
        path = QtGui.QPainterPath()
        path.addPolygon(tri)
        path.closeSubpath()
        p.fillPath(path, QtGui.QBrush(_ember_gradient(rect)))
    finally:
        p.end()
    return pm


def _paint_stop():
    """Ember rounded square."""
    pm = _new_pixmap(_CANVAS)
    p = _painter(pm)
    try:
        p.setPen(QtCore.Qt.NoPen)
        rect = QtCore.QRectF(58, 58, _CANVAS - 116, _CANVAS - 116)
        path = QtGui.QPainterPath()
        path.addRoundedRect(rect, rect.width() * 0.22, rect.width() * 0.22)
        p.fillPath(path, QtGui.QBrush(_ember_gradient(rect)))
    finally:
        p.end()
    return pm


def _paint_bolt():
    """Ember lightning bolt — used for the auto-advance affordance."""
    pm = _new_pixmap(_CANVAS)
    p = _painter(pm)
    try:
        p.setPen(QtCore.Qt.NoPen)
        rect = QtCore.QRectF(0, 0, _CANVAS, _CANVAS)
        # Classic lightning bolt polygon, centred on the canvas.
        bolt = QtGui.QPolygonF([
            QtCore.QPointF(150, 28),
            QtCore.QPointF(78, 140),
            QtCore.QPointF(122, 140),
            QtCore.QPointF(104, 228),
            QtCore.QPointF(186, 108),
            QtCore.QPointF(138, 108),
        ])
        path = QtGui.QPainterPath()
        path.addPolygon(bolt)
        path.closeSubpath()
        p.fillPath(path, QtGui.QBrush(_ember_gradient(rect)))
    finally:
        p.end()
    return pm


def _paint_pointer_tile(size):
    """Ember pointer/cursor arrow on a rounded ink tile (tray glyph)."""
    pm = _new_pixmap(size)
    p = _painter(pm)
    try:
        scale = size / float(_CANVAS)
        p.scale(scale, scale)
        p.setPen(QtCore.Qt.NoPen)

        # Ink tile background.
        tile = QtCore.QRectF(6, 6, _CANVAS - 12, _CANVAS - 12)
        _rounded_tile(p, tile, INK2, border_color=EDGE)

        # An arrow/pointer (NW->SE) suggesting "this is where to click".
        rect = QtCore.QRectF(0, 0, _CANVAS, _CANVAS)
        arrow = QtGui.QPolygonF([
            QtCore.QPointF(86, 64),    # tip (top-left)
            QtCore.QPointF(86, 188),   # tail bottom
            QtCore.QPointF(118, 156),  # inner notch left
            QtCore.QPointF(140, 198),  # flag tip
            QtCore.QPointF(160, 188),  # flag tip back
            QtCore.QPointF(138, 146),  # inner notch right
            QtCore.QPointF(182, 138),  # right edge
        ])
        path = QtGui.QPainterPath()
        path.addPolygon(arrow)
        path.closeSubpath()
        p.fillPath(path, QtGui.QBrush(_ember_gradient(rect)))

        # Thin bone outline for contrast on dark taskbars.
        pen = QtGui.QPen(QtGui.QColor(BONE))
        pen.setWidthF(3.0)
        pen.setJoinStyle(QtCore.Qt.RoundJoin)
        p.setPen(pen)
        p.drawPath(path)
    finally:
        p.end()
    return pm


# --------------------------------------------------------------------------- #
# Public API
# --------------------------------------------------------------------------- #
def app_icon():
    """
    Application icon.

    Prefers the bundled assets/nudge.ico (via the sibling ``paths`` module's
    resource_path); if that file is missing or fails to load, falls back to a
    painted ember-chevron-on-ink glyph. Always returns a QtGui.QIcon
    (possibly empty) and never raises.
    """
    try:
        # Imported lazily so a missing/broken paths module can't break import.
        try:
            import paths  # provided by a sibling module at runtime
            ico_path = paths.resource_path("assets/nudge.ico")
            icon = QtGui.QIcon(ico_path)
            if not icon.isNull() and icon.availableSizes():
                return icon
        except Exception:
            # Fall through to the painted fallback below.
            pass

        return _icon_from_pixmap(_paint_chevron_tile())
    except Exception:
        return QtGui.QIcon()


def play_icon():
    """Ember right-triangle "go" icon. Returns QtGui.QIcon; never raises."""
    try:
        return _icon_from_pixmap(_paint_play())
    except Exception:
        return QtGui.QIcon()


def stop_icon():
    """Ember rounded-square "stop" icon. Returns QtGui.QIcon; never raises."""
    try:
        return _icon_from_pixmap(_paint_stop())
    except Exception:
        return QtGui.QIcon()


def bolt_icon():
    """Ember lightning-bolt icon (auto-advance). Returns QtGui.QIcon."""
    try:
        return _icon_from_pixmap(_paint_bolt())
    except Exception:
        return QtGui.QIcon()


def tray_pixmap(size=64):
    """
    System-tray pixmap: an ember pointer arrow on a rounded ink tile.

    *size* is the square edge in pixels. Returns a QtGui.QPixmap (empty on
    failure) and never raises.
    """
    try:
        s = int(size) if size else 64
        if s < 1:
            s = 64
        return _paint_pointer_tile(s)
    except Exception:
        return QtGui.QPixmap()
