"""
tts.py — Optional, non-blocking text-to-speech for Nudge OS.

Design goals (per the integration contract):
  * NEVER raise on import and NEVER raise from a public entrypoint.
  * If pyttsx3 is missing or the engine is broken, every call is a silent no-op.
  * speak() must NOT block the GUI thread — utterances are pushed onto a
    queue.Queue and consumed by a single daemon worker thread.
  * The pyttsx3 engine is created LAZILY inside the worker thread, because
    pyttsx3 engines are not safe to share across threads.

Public API:
    available() -> bool          # True only if pyttsx3 is importable
    speak(text) -> None          # enqueue text; deduped vs. the previous utterance
    shutdown() -> None           # stop the worker thread cleanly

Everything is wrapped in try/except so a missing or misbehaving speech
backend can never crash the host application.
"""

from __future__ import annotations

import queue
import threading

# ---------------------------------------------------------------------------
# Soft-detect pyttsx3 at import time. A failure here is benign: we simply
# treat TTS as unavailable and every public call becomes a no-op.
# ---------------------------------------------------------------------------
try:
    import pyttsx3  # type: ignore
    _PYTTSX3_AVAILABLE = True
except Exception:  # ImportError or any odd platform error
    pyttsx3 = None  # type: ignore
    _PYTTSX3_AVAILABLE = False


# A sentinel object pushed onto the queue to tell the worker to exit.
_STOP = object()


class _SpeechWorker:
    """
    Owns the speech queue and the single daemon worker thread.

    The engine is constructed lazily the first time the worker actually has
    something to say, and is kept alive for the life of the thread. All engine
    interaction happens on this one thread only.
    """

    def __init__(self) -> None:
        # Unbounded queue: speak() never blocks on a full queue.
        self._queue: "queue.Queue[object]" = queue.Queue()
        self._thread: threading.Thread | None = None
        self._lock = threading.Lock()
        self._started = False
        self._stopped = False
        # Tracks the immediately previous utterance for dedupe.
        self._last_text: str | None = None

    # -- lifecycle ---------------------------------------------------------

    def _ensure_started(self) -> None:
        """Lazily spin up the worker thread on first use (thread-safe)."""
        if not _PYTTSX3_AVAILABLE:
            return
        with self._lock:
            if self._started or self._stopped:
                return
            try:
                self._thread = threading.Thread(
                    target=self._run,
                    name="nudge-tts-worker",
                    daemon=True,  # never block process exit
                )
                self._thread.start()
                self._started = True
            except Exception:
                # If we somehow can't start a thread, stay a silent no-op.
                self._thread = None
                self._started = False

    def _run(self) -> None:
        """Worker loop: build the engine lazily, then drain the queue."""
        engine = None
        try:
            while True:
                item = self._queue.get()
                try:
                    if item is _STOP:
                        break
                    if not isinstance(item, str) or not item.strip():
                        continue

                    # Build the engine the first time we have real text to say.
                    if engine is None:
                        engine = self._make_engine()
                        if engine is None:
                            # Engine init failed — drop this and future text,
                            # but keep draining so the queue/STOP still work.
                            continue

                    # Speak this utterance. runAndWait() blocks the worker
                    # thread only, never the caller.
                    try:
                        engine.say(item)
                        engine.runAndWait()
                    except Exception:
                        # A failed utterance must not kill the worker; the
                        # engine may have wedged, so reset it for next time.
                        engine = self._reset_engine(engine)
                finally:
                    # Always mark the task done so the queue stays consistent.
                    try:
                        self._queue.task_done()
                    except Exception:
                        pass
        except Exception:
            # Absolute backstop: the worker must never propagate.
            pass
        finally:
            self._dispose_engine(engine)

    # -- engine helpers ----------------------------------------------------

    @staticmethod
    def _make_engine():
        """Construct a pyttsx3 engine; return None on any failure."""
        if not _PYTTSX3_AVAILABLE:
            return None
        try:
            return pyttsx3.init()
        except Exception:
            return None

    def _reset_engine(self, engine):
        """Dispose a wedged engine and try to build a fresh one."""
        self._dispose_engine(engine)
        return self._make_engine()

    @staticmethod
    def _dispose_engine(engine) -> None:
        """Best-effort engine teardown; never raises."""
        if engine is None:
            return
        try:
            engine.stop()
        except Exception:
            pass

    # -- public-facing operations -----------------------------------------

    def speak(self, text: str) -> None:
        """Enqueue text for speech, deduped against the previous utterance."""
        if not _PYTTSX3_AVAILABLE:
            return
        try:
            if text is None:
                return
            text = str(text).strip()
            if not text:
                return
            # Dedupe: skip if identical to the immediately previous utterance.
            with self._lock:
                if self._stopped:
                    return
                if text == self._last_text:
                    return
                self._last_text = text

            self._ensure_started()
            # If the worker never started (e.g. thread spawn failed), drop it.
            if self._started:
                self._queue.put(text)
        except Exception:
            # Enqueuing should never raise into the caller.
            pass

    def shutdown(self) -> None:
        """Signal the worker to stop and wait briefly for it to exit."""
        try:
            with self._lock:
                if self._stopped:
                    return
                self._stopped = True
                started = self._started
                thread = self._thread

            if started:
                try:
                    self._queue.put(_STOP)
                except Exception:
                    pass
                if thread is not None:
                    try:
                        # Don't hang the caller if the engine is mid-utterance.
                        thread.join(timeout=2.0)
                    except Exception:
                        pass
        except Exception:
            pass


# ---------------------------------------------------------------------------
# Module-level singleton + thin public functions. Callers only touch these.
# ---------------------------------------------------------------------------
_worker = _SpeechWorker()


def available() -> bool:
    """Return True only if pyttsx3 is importable (TTS can do real work)."""
    return bool(_PYTTSX3_AVAILABLE)


def speak(text: str) -> None:
    """
    Queue `text` to be spoken aloud without blocking the caller.

    Identical consecutive requests are deduped. No-op if TTS is unavailable.
    """
    _worker.speak(text)


def shutdown() -> None:
    """Stop the background speech worker. Safe to call multiple times."""
    _worker.shutdown()
