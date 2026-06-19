"""Derisk probe #2 — the pointer overlay.

A frameless, translucent, always-on-top, click-through window that draws a
highlight ring + ghost cursor + tooltip at a SCREEN rect. Defaults to the real
Start-button rect UIA reported. Self-captures the screen (incl. itself) so we
can confirm it renders on top of the live desktop.
"""
import sys

from PyQt5 import QtCore, QtGui, QtWidgets

EMBER = QtGui.QColor("#FF6B35")
INK = QtGui.QColor(18, 20, 26, 242)
BONE = QtGui.QColor("#F4F2EC")
OUT = r"C:\Users\adibi\fivedevs-hackathon\Yemi_Dev\nudge-desktop\overlay_out.png"


class Overlay(QtWidgets.QWidget):
    def __init__(self, rect, label):
        super().__init__()
        self.t = rect
        self.label = label
        self.setWindowFlags(
            QtCore.Qt.FramelessWindowHint
            | QtCore.Qt.WindowStaysOnTopHint
            | QtCore.Qt.Tool
        )
        self.setAttribute(QtCore.Qt.WA_TranslucentBackground)
        self.setAttribute(QtCore.Qt.WA_TransparentForMouseEvents)  # click-through
        self.sg = QtWidgets.QApplication.primaryScreen().geometry()
        self.setGeometry(self.sg)

    def paintEvent(self, _):
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

        # tooltip — flips above the target if it would fall off the bottom
        f = QtGui.QFont("Segoe UI", 11)
        fb = QtGui.QFont("Segoe UI", 11)
        fb.setBold(True)
        pad, th = 14, 34
        tw = QtGui.QFontMetrics(fb).horizontalAdvance("Nudge") + 8 + \
            QtGui.QFontMetrics(f).horizontalAdvance(self.label) + pad * 2
        tx, ty = x - 5, y + h + 14
        if ty + th > self.height() - 4:
            ty = y - th - 14
        tx = max(4, min(tx, self.width() - tw - 6))
        p.setBrush(INK)
        p.setPen(QtCore.Qt.NoPen)
        p.drawRoundedRect(tx, ty, tw, th, 9, 9)
        p.setFont(fb)
        p.setPen(EMBER)
        p.drawText(tx + pad, ty + 22, "Nudge")
        p.setFont(f)
        p.setPen(BONE)
        p.drawText(tx + pad + QtGui.QFontMetrics(fb).horizontalAdvance("Nudge") + 8, ty + 22, self.label)


def main():
    app = QtWidgets.QApplication(sys.argv)
    rect = (342, 1032, 45, 48)
    label = "Click Start to open the menu"
    if len(sys.argv) >= 5:
        rect = tuple(int(a) for a in sys.argv[1:5])
    if len(sys.argv) > 5:
        label = sys.argv[5]
    w = Overlay(rect, label)
    w.show()
    w.raise_()

    def cap():
        app.primaryScreen().grabWindow(0).save(OUT)
        print("captured ->", OUT)
        app.quit()

    QtCore.QTimer.singleShot(800, cap)
    app.exec_()


if __name__ == "__main__":
    main()
