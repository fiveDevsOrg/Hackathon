"""nudge_mcp.py -- MCP server exposing Nudge OS as agent tools.

Lets a Claude / Claude Code agent drive the running Nudge OS desktop app: hand
it a task or an explicit ordered list of steps and (optionally) BLOCK until the
human has completed them. It's a thin proxy over the Nudge HTTP control API
(default http://127.0.0.1:8765) -- the Nudge desktop app must be running.

Register with Claude Code (from this folder):
    claude mcp add nudge -- .venv/Scripts/python.exe nudge_mcp.py
or add a stdio MCP server in your client's config that runs this file.

Env:
    NUDGE_URL    base URL of the control API (default http://127.0.0.1:8765)
    NUDGE_TOKEN  token, only if the Nudge control API was configured to need one
"""
import json
import os
import time
import urllib.error
import urllib.request

from mcp.server.fastmcp import FastMCP

BASE = os.environ.get("NUDGE_URL", "http://127.0.0.1:8765").rstrip("/")
TOKEN = os.environ.get("NUDGE_TOKEN", "")

mcp = FastMCP("nudge")


def _req(method, path, body=None, timeout=8):
    url = BASE + path
    data = json.dumps(body).encode("utf-8") if body is not None else None
    req = urllib.request.Request(url, data=data, method=method)
    req.add_header("Content-Type", "application/json")
    if TOKEN:
        req.add_header("X-Nudge-Token", TOKEN)
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            raw = r.read().decode("utf-8")
            return json.loads(raw) if raw else {}
    except urllib.error.URLError as e:
        return {"ok": False,
                "error": "Nudge app not reachable at %s (%s). Is Nudge OS running?"
                % (BASE, e)}
    except Exception as e:
        return {"ok": False, "error": str(e)}


def _wait_done(timeout_s):
    """Block until guiding stops (done/stopped) or timeout. Robust to the async
    start: first waits for guiding to actually begin, then for it to finish."""
    deadline = time.time() + max(1, int(timeout_s))
    for _ in range(15):  # ~3s: let the guide actually start (signal is async)
        st = _req("GET", "/status")
        if st.get("guiding"):
            break
        time.sleep(0.2)
    last = {}
    while time.time() < deadline:
        st = _req("GET", "/status")
        if st.get("error"):
            return st
        last = st
        if not st.get("guiding"):
            return {"ok": True, "done": True, "result": st.get("result"),
                    "steps_completed": st.get("route_index"), "status": st}
        time.sleep(1.0)
    return {"ok": True, "done": False, "timeout": True, "status": last}


@mcp.tool()
def nudge_status() -> dict:
    """Get the current state of Nudge OS: whether it's guiding, the current step,
    the route/checklist, and the last task's result."""
    return _req("GET", "/status")


@mcp.tool()
def nudge_guide(task: str) -> dict:
    """Ask Nudge to autonomously guide the human through a task it plans itself
    (e.g. 'open display settings', 'connect to Wi-Fi'). Nudge points at what to
    click; the human does the clicking. Returns immediately (poll nudge_status
    or call nudge_wait_until_done to know when it's finished)."""
    return _req("POST", "/guide", {"task": task})


@mcp.tool()
def nudge_guide_steps(steps: list, task: str = "", wait: bool = True,
                      timeout_s: int = 300) -> dict:
    """Guide the human through an explicit ordered list of click-level steps you
    provide (e.g. ["Open the Start menu", "Click Settings", "Open Display"]).
    Nudge locates each step on the live screen and points at it; the human
    clicks. If wait=True (default) this BLOCKS until the human completes every
    step (or timeout), returning the outcome -- so you know the work is done
    before you continue."""
    ack = _req("POST", "/guide_steps", {"steps": list(steps), "task": task})
    if not ack.get("ok"):
        return ack
    if not wait:
        return {"ok": True, "started": True, "steps": len(steps)}
    return _wait_done(timeout_s)


@mcp.tool()
def nudge_wait_until_done(timeout_s: int = 300) -> dict:
    """Block until the human finishes the current guided task (or timeout).
    Use after nudge_guide to wait for completion."""
    return _wait_done(timeout_s)


@mcp.tool()
def nudge_stop() -> dict:
    """Stop the current guidance immediately."""
    return _req("POST", "/stop")


if __name__ == "__main__":
    mcp.run()
