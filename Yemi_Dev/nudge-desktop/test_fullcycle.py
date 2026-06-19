"""End-to-end worker-thread test for the user's exact case: 'open Brave'."""
import sys
import threading

sys.stdout.reconfigure(encoding="utf-8", errors="replace")
import comtypes

import nudge_desktop as nd

TASK = sys.argv[1] if len(sys.argv) > 1 else "open Brave"
out = {}


def name_of(m):
    if isinstance(m, dict):
        return m.get("name", "?")
    return getattr(m, "name", str(m))


def w():
    comtypes.CoInitialize()
    try:
        marks, fg, tb = nd.scan_marks()
        _img, b64, _sc = nd.grab_screen()
        pl = nd.plan(TASK, marks, [], b64)
        out["marks"] = len(marks)
        out["source"] = pl.get("source")
        out["instruction"] = pl.get("instruction")
        idx = pl.get("index")
        out["index"] = idx
        if isinstance(idx, int) and 0 <= idx < len(marks):
            out["TARGET"] = name_of(marks[idx])
    except Exception as e:
        out["err"] = repr(e)
    finally:
        comtypes.CoUninitialize()


t = threading.Thread(target=w)
t.start()
t.join()
print("TASK:", TASK)
for k, v in out.items():
    print(f"  {k}: {v}")
