"""
nudge_log.py — Structured rotating logger for Nudge OS.

Provides a single, idempotent logger configured with a size-limited
RotatingFileHandler so the log never grows without bound. The log file
location is resolved from the shared ``paths`` module when available, with
a safe fallback to ``debug.log`` in the current working directory.

This module follows the app's never-crash guarantee: nothing here raises
on import or from any public entrypoint. If logging setup fails for any
reason, the caller still receives a usable Logger (degraded to a plain,
unconfigured logger) instead of an exception.
"""

import logging
import logging.handlers
import os

# Rotation policy: keep each log file small and retain a couple of backups.
_MAX_BYTES = 512 * 1024  # 512 KB per file
_BACKUP_COUNT = 2

# Timestamped, level-tagged format for easy log grepping.
_FORMAT = "%(asctime)s %(levelname)s %(message)s"

# A marker attribute we stamp onto handlers we add, so we can detect
# (and avoid re-adding) our own handler on repeat calls — keeping the
# setup idempotent even across multiple imports / get_logger() calls.
_HANDLER_TAG = "_nudge_rotating_handler"


def _resolve_log_path():
    """
    Determine the log file path.

    Prefer ``paths.log_path()`` from the shared module. If that import or
    call fails for any reason (module absent, error inside it, etc.), fall
    back to ``<cwd>/debug.log``. Never raises.
    """
    try:
        import paths  # imported lazily so this module loads even if paths.py is absent
        candidate = paths.log_path()
        if candidate:
            return candidate
    except Exception:
        # Fall through to the safe default below.
        pass

    # Safe fallback inside the current working directory.
    try:
        return os.path.join(os.getcwd(), "debug.log")
    except Exception:
        # As an absolute last resort, use a bare relative filename.
        return "debug.log"


def get_logger(name="nudge"):
    """
    Return a configured, rotating logger.

    The logger is set up with a RotatingFileHandler (512 KB, 2 backups) and
    a timestamped formatter. Setup is idempotent: calling this repeatedly
    with the same name will not attach duplicate handlers.

    Never raises — on any failure it returns a plain logger so callers can
    still log (or at least not crash).
    """
    try:
        logger = logging.getLogger(name)
        logger.setLevel(logging.INFO)

        # Don't bubble records up to the root logger / its handlers.
        logger.propagate = False

        # Idempotency guard: skip if we've already attached our handler.
        for handler in logger.handlers:
            if getattr(handler, _HANDLER_TAG, False):
                return logger

        log_path = _resolve_log_path()

        # Best-effort: ensure the parent directory exists.
        try:
            parent = os.path.dirname(log_path)
            if parent:
                os.makedirs(parent, exist_ok=True)
        except Exception:
            # If we can't make the directory, the handler creation below
            # may still fail; that's handled gracefully.
            pass

        try:
            handler = logging.handlers.RotatingFileHandler(
                log_path,
                maxBytes=_MAX_BYTES,
                backupCount=_BACKUP_COUNT,
                encoding="utf-8",
            )
            handler.setFormatter(logging.Formatter(_FORMAT))
            # Tag the handler so future calls recognise it as ours.
            setattr(handler, _HANDLER_TAG, True)
            logger.addHandler(handler)
        except Exception:
            # File handler failed (e.g. locked path / permissions). Degrade
            # to a stream handler so logging still works without crashing.
            try:
                stream = logging.StreamHandler()
                stream.setFormatter(logging.Formatter(_FORMAT))
                setattr(stream, _HANDLER_TAG, True)
                logger.addHandler(stream)
            except Exception:
                # Even the stream handler failed; return the bare logger.
                pass

        return logger
    except Exception:
        # Absolute fallback: hand back something log-shaped that won't crash.
        try:
            return logging.getLogger(name)
        except Exception:
            return logging.getLogger()


def set_level(debug):
    """
    Toggle the default logger's level between DEBUG and INFO.

    ``debug=True`` -> DEBUG (verbose), ``debug=False`` -> INFO.
    Adjusts both the logger and any attached handlers. Never raises.
    """
    try:
        level = logging.DEBUG if debug else logging.INFO
        LOG.setLevel(level)
        for handler in LOG.handlers:
            try:
                handler.setLevel(level)
            except Exception:
                # Skip any handler that won't accept the level change.
                pass
    except Exception:
        # Never let a level toggle take down the app.
        pass


# Module-level default logger, ready to import and use everywhere.
LOG = get_logger()
