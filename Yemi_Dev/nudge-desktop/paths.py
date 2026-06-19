"""Frozen-aware filesystem locations for Nudge OS.

This module centralizes every path the app needs so behavior is identical
whether running from source or from a PyInstaller (``--onefile``) bundle.

Design rules (per the integration contract):
- Nothing here may ever raise. Every public function is wrapped in a
  try/except and falls back to a safe default (the current working
  directory) so the never-crash guarantee holds even on weird filesystems.
- No import-time side effects beyond standard-library imports.
"""

import os
import sys


def is_frozen():
    """Return True when running inside a PyInstaller/frozen bundle.

    Falls back to False on any unexpected error.
    """
    try:
        return bool(getattr(sys, "frozen", False))
    except Exception:
        return False


def app_dir():
    """Directory for bundled, read-only assets.

    When frozen, PyInstaller extracts assets to ``sys._MEIPASS``.
    When running from source, this is the directory containing this file.
    Falls back to the current working directory on any error.
    """
    try:
        if is_frozen():
            # _MEIPASS only exists in onefile bundles; getattr guards onedir.
            meipass = getattr(sys, "_MEIPASS", None)
            if meipass:
                return meipass
        # Directory of this source file (absolute, normalized).
        return os.path.dirname(os.path.abspath(__file__))
    except Exception:
        try:
            return os.getcwd()
        except Exception:
            return "."


def data_dir():
    """Writable per-user data directory: ``%APPDATA%/NudgeOS``.

    Falls back to ``~/.nudgeos`` when APPDATA is unavailable, and finally to
    the current working directory. The directory is created if missing.
    """
    try:
        appdata = os.environ.get("APPDATA")
        if appdata:
            target = os.path.join(appdata, "NudgeOS")
        else:
            # Non-Windows / missing APPDATA fallback.
            target = os.path.join(os.path.expanduser("~"), ".nudgeos")

        # Ensure the directory exists; ignore if it already does.
        os.makedirs(target, exist_ok=True)
        return target
    except Exception:
        # Last-resort fallback: never raise.
        try:
            return os.getcwd()
        except Exception:
            return "."


def log_path():
    """Absolute path to the rolling debug log file inside the data dir."""
    try:
        return os.path.join(data_dir(), "debug.log")
    except Exception:
        try:
            return os.path.join(os.getcwd(), "debug.log")
        except Exception:
            return "debug.log"


def artifact_path(name):
    """Absolute path for a named artifact stored in the data dir.

    ``name`` is a relative file/sub-path (e.g. "last_shot.png").
    """
    try:
        return os.path.join(data_dir(), name)
    except Exception:
        try:
            return os.path.join(os.getcwd(), name)
        except Exception:
            # Return the raw name as an absolute last resort.
            return name if isinstance(name, str) else "artifact"


def resource_path(rel):
    """Absolute path to a bundled read-only resource.

    ``rel`` is a relative path under the app directory (e.g. "icons/app.ico").
    """
    try:
        return os.path.join(app_dir(), rel)
    except Exception:
        try:
            return os.path.join(os.getcwd(), rel)
        except Exception:
            return rel if isinstance(rel, str) else "resource"
