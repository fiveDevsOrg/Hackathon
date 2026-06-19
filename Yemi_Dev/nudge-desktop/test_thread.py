"""Prove the COM-on-worker-thread bug + fix: run scan_marks() on a thread."""
import sys
import threading

sys.stdout.reconfigure(encoding="utf-8", errors="replace")
mode = sys.argv[1] if len(sys.argv) > 1 else "com"
import nudge_desktop as nd

out = {}


def w():
    if mode == "com":
        import comtypes
        comtypes.CoInitialize()
    try:
        marks, fg, tb = nd.scan_marks()
        out.update(marks=len(marks), fg=fg, tb=tb)
    except Exception as e:
        out["err"] = repr(e)
    finally:
        if mode == "com":
            import comtypes
            comtypes.CoUninitialize()


t = threading.Thread(target=w)
t.start()
t.join()
print(mode, "->", out)
