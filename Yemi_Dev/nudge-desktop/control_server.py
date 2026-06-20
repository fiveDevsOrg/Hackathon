"""control_server.py -- localhost HTTP control API for Nudge OS.

Lets an external agent (n8n, Make, your own code, or the MCP wrapper) drive the
running Nudge engine: start an autonomous guide, feed an explicit ordered list
of steps, read live status, pause, or stop. Bound to 127.0.0.1 ONLY.

Threading model (mirrors ClickBridge / HotkeyBridge in the main app):
  * The HTTP server runs on a daemon thread.
  * Request handlers NEVER touch Qt directly -- they emit signals on a
    ControlBridge(QObject), which Qt delivers to the GUI thread.
  * GET /status reads a plain dict via the supplied status_fn (no Qt calls),
    which is safe to call cross-thread.

Endpoints:
  GET  /health                      -> {ok:true, app:"Nudge OS"}     (no auth)
  GET  /status                      -> engine snapshot dict
  POST /guide       {task}          -> start an autonomous guide
  POST /guide_steps {steps,[task]}  -> guide through agent-supplied steps
  POST /pause                       -> pause/resume guiding
  POST /stop                        -> stop guiding

Auth: if a token is configured, every request except /health must carry it via
the `X-Nudge-Token` header or a `?token=` query param.
"""
import json
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlparse, parse_qs

from PyQt5 import QtCore


class ControlBridge(QtCore.QObject):
    """Marshals HTTP requests (server thread) onto the GUI thread via signals."""
    guide_task = QtCore.pyqtSignal(str)
    guide_steps = QtCore.pyqtSignal(list, str)  # (steps, task)
    stop = QtCore.pyqtSignal()
    pause = QtCore.pyqtSignal()


def _make_handler(bridge, status_fn, token):
    class Handler(BaseHTTPRequestHandler):
        protocol_version = "HTTP/1.1"

        def log_message(self, *a):  # silence default stderr access logging
            pass

        # -- helpers --------------------------------------------------------
        def _authed(self):
            if not token:
                return True
            got = self.headers.get("X-Nudge-Token", "")
            if not got:
                q = parse_qs(urlparse(self.path).query)
                got = (q.get("token") or [""])[0]
            return got == token

        def _send(self, code, obj):
            try:
                body = json.dumps(obj).encode("utf-8")
                self.send_response(code)
                self.send_header("Content-Type", "application/json")
                self.send_header("Content-Length", str(len(body)))
                self.send_header("Access-Control-Allow-Origin", "*")
                self.send_header("Access-Control-Allow-Headers",
                                 "Content-Type, X-Nudge-Token")
                self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
                self.end_headers()
                self.wfile.write(body)
            except Exception:
                pass

        def _body(self):
            try:
                n = int(self.headers.get("Content-Length", 0) or 0)
                raw = self.rfile.read(n) if n else b""
                return json.loads(raw.decode("utf-8")) if raw else {}
            except Exception:
                return {}

        # -- verbs ----------------------------------------------------------
        def do_OPTIONS(self):
            self._send(200, {"ok": True})

        def do_GET(self):
            try:
                path = self.path.split("?", 1)[0]
                if path == "/health":
                    self._send(200, {"ok": True, "app": "Nudge OS"})
                    return
                if not self._authed():
                    self._send(401, {"ok": False, "error": "unauthorized"})
                    return
                if path == "/status":
                    self._send(200, status_fn())
                    return
                self._send(404, {"ok": False, "error": "not found"})
            except Exception as ex:
                self._send(500, {"ok": False, "error": str(ex)})

        def do_POST(self):
            try:
                path = self.path.split("?", 1)[0]
                if not self._authed():
                    self._send(401, {"ok": False, "error": "unauthorized"})
                    return
                data = self._body()
                if path == "/guide":
                    bridge.guide_task.emit(str(data.get("task", "")))
                    self._send(200, {"ok": True})
                elif path == "/guide_steps":
                    steps = data.get("steps")
                    if not isinstance(steps, list):
                        steps = []
                    bridge.guide_steps.emit([str(s) for s in steps],
                                            str(data.get("task", "")))
                    self._send(200, {"ok": True, "steps": len(steps)})
                elif path == "/pause":
                    bridge.pause.emit()
                    self._send(200, {"ok": True})
                elif path == "/stop":
                    bridge.stop.emit()
                    self._send(200, {"ok": True})
                else:
                    self._send(404, {"ok": False, "error": "not found"})
            except Exception as ex:
                self._send(500, {"ok": False, "error": str(ex)})

    return Handler


def start_server(bridge, status_fn, host="127.0.0.1", port=8765, token=None):
    """Start the control server on a daemon thread.

    Returns the ThreadingHTTPServer (call .shutdown() to stop it) or None on
    failure (e.g. the port is taken). Never raises.
    """
    try:
        handler = _make_handler(bridge, status_fn, token)
        srv = ThreadingHTTPServer((host, int(port)), handler)
        threading.Thread(target=srv.serve_forever, daemon=True).start()
        return srv
    except Exception:
        return None
