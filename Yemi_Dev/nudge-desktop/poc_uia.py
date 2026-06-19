"""Derisk probe #1 — the 'screen DOM'.

Can Windows UI Automation give us named, on-screen, positioned interactive
elements for (a) the foreground app and (b) the taskbar? If yes, that's our
set-of-mark for the planner, no vision required.
"""
import sys

sys.stdout.reconfigure(encoding="utf-8", errors="replace")
import uiautomation as auto

INTERACTIVE = {
    auto.ControlType.ButtonControl,
    auto.ControlType.EditControl,
    auto.ControlType.HyperlinkControl,
    auto.ControlType.CheckBoxControl,
    auto.ControlType.RadioButtonControl,
    auto.ControlType.ComboBoxControl,
    auto.ControlType.ListItemControl,
    auto.ControlType.MenuItemControl,
    auto.ControlType.TabItemControl,
    auto.ControlType.TreeItemControl,
    auto.ControlType.SplitButtonControl,
}


def walk(ctrl, depth, maxdepth, out, cap):
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
                out.append({"name": name[:50], "type": c.ControlTypeName, "rect": (r.left, r.top, w, h)})
        except Exception:
            pass
        walk(c, depth + 1, maxdepth, out, cap)
        if len(out) >= cap:
            return


def dump(title, root, maxdepth, cap, show):
    out = []
    walk(root, 0, maxdepth, out, cap)
    print(f"\n=== {title}: {len(out)} interactive elements ===")
    for e in out[:show]:
        print(f"  [{e['type']:16}] {e['name'][:38]:38} @ {e['rect']}")
    return out


def main():
    auto.SetGlobalSearchTimeout(2)
    hwnd = auto.GetForegroundWindow()
    win = auto.ControlFromHandle(hwnd)
    print("Foreground window:", repr(win.Name), "|", win.ClassName)
    dump("FOREGROUND APP", win, 25, 80, 30)

    try:
        tray = auto.PaneControl(searchDepth=1, ClassName="Shell_TrayWnd")
        dump("TASKBAR (Shell_TrayWnd)", tray, 14, 60, 20)
    except Exception as ex:
        print("taskbar error:", ex)

    print("\n[probe] UIA screen-DOM check complete.")


if __name__ == "__main__":
    main()
