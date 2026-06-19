"""
updatecheck.py — Non-blocking update check for Nudge OS.

Fetches a small JSON manifest from a remote URL on a background QThread,
compares its version against the running version (semver-ish), and emits a
signal ONLY when a newer version is available.

Integration contract:
- Never raises on import or from any public entrypoint.
- All network work runs off the GUI thread (UpdateWorker is a QThread).
- Failures (no network, timeout, bad JSON, missing key) degrade to a no-op:
  the worker simply emits nothing.

Public surface:
- UpdateWorker(current_version, url=None, gen=0)  -> QtCore.QThread
    .result = pyqtSignal(str, str)  # (latest_version, url), emitted only if latest > current
- check_for_update(current, url) -> tuple | None    # synchronous helper for tests
- _ver_tuple(v) -> tuple[int, ...]                  # simple semver parser
"""

from __future__ import annotations

import json
import urllib.request

from PyQt5 import QtCore

# How long we are ever willing to wait on the network (seconds).
# The spec requires we never block more than ~2s.
_TIMEOUT = 2


def _ver_tuple(v):
    """
    Convert a version string like "1.4.2" into a comparable tuple of ints
    (1, 4, 2). Non-numeric / malformed components are coerced to 0 so the
    comparison never raises. Returns (0,) on total failure.

    Examples:
        _ver_tuple("1.2.3")   -> (1, 2, 3)
        _ver_tuple("v2.0")    -> (2, 0)
        _ver_tuple("1.0.0b2") -> (1, 0, 0)   # trailing junk on a part is dropped
        _ver_tuple(None)      -> (0,)
    """
    try:
        if v is None:
            return (0,)
        # Allow a leading "v"/"V" prefix and surrounding whitespace.
        s = str(v).strip().lstrip("vV")
        parts = []
        for chunk in s.split("."):
            # Pull the leading run of digits from each dotted component so
            # things like "0" or "12rc1" still yield a clean integer.
            digits = ""
            for ch in chunk:
                if ch.isdigit():
                    digits += ch
                else:
                    break
            parts.append(int(digits) if digits else 0)
        return tuple(parts) if parts else (0,)
    except Exception:
        # Never raise — a bad version simply sorts as the lowest possible.
        return (0,)


def check_for_update(current, url):
    """
    Synchronous update check, primarily for testing or off-thread use.

    Fetches the JSON manifest at `url`, expecting a shape like:
        {"version": "1.5.0", "url": "https://.../download"}

    Returns:
        (latest_version, download_url) tuple if the remote version is strictly
        newer than `current`; otherwise None. Returns None on any error
        (no url, timeout, network failure, malformed JSON, etc.) — never raises.
    """
    try:
        if not url:
            return None

        # Bounded network read; urlopen honours the timeout for connect+read.
        with urllib.request.urlopen(url, timeout=_TIMEOUT) as resp:
            raw = resp.read()

        # Be forgiving about encoding; default to utf-8.
        if isinstance(raw, (bytes, bytearray)):
            raw = raw.decode("utf-8", errors="replace")

        data = json.loads(raw)
        if not isinstance(data, dict):
            return None

        latest = data.get("version")
        if not latest:
            return None

        # Where to send the user to upgrade. Fall back to the manifest URL
        # itself if the payload omits a dedicated download link.
        dl = data.get("url") or url

        # Only report when the remote build is strictly newer.
        if _ver_tuple(latest) > _ver_tuple(current):
            return (str(latest), str(dl))
        return None
    except Exception:
        # Silent degrade — an update check should never disturb the app.
        return None


class UpdateWorker(QtCore.QThread):
    """
    Background worker that performs a single update check, then exits.

    Usage (from the main file, after the QApplication exists):
        self._upd = UpdateWorker(APP_VERSION, url=MANIFEST_URL)
        self._upd.result.connect(self._on_update_available)  # (latest, url)
        self._upd.start()

    The `result` signal is emitted at most once, and ONLY when a newer
    version is found. If `url` is None/empty, the worker does nothing.
    The `gen` field is a caller-supplied generation/token the main file may
    use to ignore results from stale workers.
    """

    # Emitted with (latest_version, download_url) only when latest > current.
    result = QtCore.pyqtSignal(str, str)

    def __init__(self, current_version, url=None, gen=0):
        super().__init__()
        self.current_version = current_version
        self.url = url
        self.gen = gen

    def run(self):
        """
        Thread body. Performs the check and emits `result` if (and only if)
        a newer version is available. Wrapped so nothing escapes the thread.
        """
        try:
            if not self.url:
                # Nothing to check against — silent no-op.
                return

            found = check_for_update(self.current_version, self.url)
            if found:
                latest, dl = found
                # Emit across the thread boundary; Qt queues this to the
                # connected slot on the receiver's (GUI) thread.
                self.result.emit(latest, dl)
        except Exception:
            # Never let an exception propagate out of the thread.
            return
