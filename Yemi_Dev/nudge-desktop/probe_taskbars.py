"""Do secondary-monitor taskbars exist as their own UIA windows?"""
import sys

sys.stdout.reconfigure(encoding="utf-8", errors="replace")
import uiautomation as auto


def walk_buttons(ctrl, depth, out, cap):
    if len(out) >= cap or depth > 12:
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
            if w > 0 and h > 0 and name and c.ControlType == auto.ControlType.ButtonControl:
                out.append((name[:40], (r.left, r.top, w, h)))
        except Exception:
            pass
        walk_buttons(c, depth + 1, out, cap)


auto.SetGlobalSearchTimeout(2)
root = auto.GetRootControl()
for c in root.GetChildren():
    cn = c.ClassName or ""
    if "Tray" in cn:
        r = c.BoundingRectangle
        print("%-26s @ (%d,%d  %dx%d)" % (cn, r.left, r.top, r.width(), r.height()))
        out = []
        walk_buttons(c, 0, out, 12)
        for n, rc in out[:8]:
            print("     ", n, rc)
