"""
settings.py — JSON-backed configuration store for Nudge OS.

A tiny, crash-proof key/value config layer. It resolves a writable path
for ``config.json`` (via the project's ``paths`` helper, falling back to
the working directory), loads any existing JSON, and persists changes
atomically (write-to-temp then ``os.replace``).

Design rules for this app:
  * NEVER raise on import.
  * NEVER raise from a public method — every operation degrades to a
    safe default / no-op so the GUI can never be brought down by config.
"""

import json
import os
import tempfile


# Baked-in defaults. ``get`` falls back here when a key is not stored,
# and ``all`` merges these under the stored values.
DEFAULTS = {
    "model": "claude-haiku-4-5-20251001",
    "auto_advance": True,
    "screen_index": 0,
    "autostart": False,
    "debug": False,
    "check_updates": True,
    "theme": "dark",
    "overlay_intensity": 100,
    "tts_on": False,
    "show_preview": False,
    "recent_tasks": [],
    "seen_intro": False,
    "total_steps": 0,
    "total_tasks": 0,
}


def _resolve_default_path():
    """
    Resolve the on-disk location for ``config.json``.

    Prefers ``paths.artifact_path('config.json')`` so the file lives
    alongside the app's other artifacts. If that import or call fails for
    any reason, fall back to a plain ``./config.json`` in the current
    working directory. Never raises.
    """
    try:
        import paths  # imported lazily so a missing module can't break import
        resolved = paths.artifact_path("config.json")
        if resolved:
            return str(resolved)
    except Exception:
        # Any failure (missing module, bad return, etc.) -> local fallback.
        pass
    return os.path.join(os.getcwd(), "config.json")


class Settings:
    """
    Persistent JSON config store.

    Usage:
        s = Settings()
        model = s.get("model")
        s.set("seen_intro", True)
        snapshot = s.all()
    """

    def __init__(self, path=None):
        # Resolve and remember the target file path.
        try:
            self.path = path if path else _resolve_default_path()
        except Exception:
            # Absolute last-resort path so attribute always exists.
            self.path = os.path.join(os.getcwd(), "config.json")

        # In-memory store; populated from disk if present and valid.
        self._data = {}
        self._load()

    # ------------------------------------------------------------------ #
    # Loading
    # ------------------------------------------------------------------ #
    def _load(self):
        """
        Load JSON from ``self.path`` into ``self._data``.

        Missing file, unreadable file, or corrupt/non-dict JSON all
        degrade to an empty dict. Never raises.
        """
        try:
            with open(self.path, "r", encoding="utf-8") as fh:
                loaded = json.load(fh)
            # Only accept a dict; anything else is treated as empty.
            self._data = loaded if isinstance(loaded, dict) else {}
        except Exception:
            # FileNotFoundError, JSONDecodeError, permission errors, etc.
            self._data = {}

    # ------------------------------------------------------------------ #
    # Reads
    # ------------------------------------------------------------------ #
    def get(self, key, default=None):
        """
        Return the stored value for ``key``.

        Lookup order:
          1. stored value (if the key exists in ``self._data``)
          2. ``DEFAULTS`` value for ``key``
          3. the caller-supplied ``default``
        Never raises.
        """
        try:
            if key in self._data:
                return self._data[key]
            return DEFAULTS.get(key, default)
        except Exception:
            return default

    def all(self):
        """
        Return a merged snapshot: ``DEFAULTS`` overlaid with stored values.

        The result is a fresh dict, safe for the caller to mutate without
        affecting the live store. Never raises.
        """
        try:
            merged = dict(DEFAULTS)
            merged.update(self._data)
            return merged
        except Exception:
            # Fall back to a copy of defaults if anything goes sideways.
            try:
                return dict(DEFAULTS)
            except Exception:
                return {}

    # ------------------------------------------------------------------ #
    # Writes
    # ------------------------------------------------------------------ #
    def set(self, key, value):
        """
        Update a single key and persist atomically. Never raises.
        """
        try:
            self._data[key] = value
        except Exception:
            return
        self.save()

    def save(self):
        """
        Persist the current store to disk atomically.

        Writes to a temporary file in the same directory then uses
        ``os.replace`` for an atomic swap, so a crash mid-write can never
        leave a partially written ``config.json``. Never raises.
        """
        try:
            target = self.path
            directory = os.path.dirname(os.path.abspath(target))

            # Make sure the destination directory exists.
            try:
                if directory:
                    os.makedirs(directory, exist_ok=True)
            except Exception:
                pass

            # Write to a temp file in the same directory (so os.replace is
            # an atomic, same-filesystem move), then swap it into place.
            fd, tmp_path = tempfile.mkstemp(
                prefix=".config-", suffix=".tmp", dir=directory or None
            )
            try:
                with os.fdopen(fd, "w", encoding="utf-8") as fh:
                    json.dump(self._data, fh, indent=2, ensure_ascii=False)
                    fh.flush()
                    try:
                        os.fsync(fh.fileno())
                    except Exception:
                        # fsync may be unavailable on some platforms; ignore.
                        pass
                os.replace(tmp_path, target)
            except Exception:
                # Clean up the temp file on any failure during write/swap.
                try:
                    if os.path.exists(tmp_path):
                        os.remove(tmp_path)
                except Exception:
                    pass
        except Exception:
            # Saving must never crash the app.
            pass
