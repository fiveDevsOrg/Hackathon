"""
explain.py — On-demand "why this step" copilot reasoning for Nudge OS.

This module provides a small, fire-and-forget background worker that asks
Anthropic (Haiku) for a single short sentence explaining *why* clicking a
particular UI target helps accomplish the user's current task. The call is
TEXT ONLY (no tools, no images) and intentionally tiny so it returns fast and
cheaply.

Design / never-crash guarantees
--------------------------------
- Importing this module never raises. The `anthropic` SDK is imported lazily
  inside `run()`, so a missing dependency or missing API key degrades to a
  silent no-op (an empty-string result) rather than crashing the GUI.
- `ExplainWorker.run()` swallows *all* exceptions and always emits the
  `explained` signal exactly once — either with the explanation text or with
  an empty string on any failure. The caller can therefore treat an empty
  string as "no explanation available" and move on.
- The Anthropic call runs on this QThread, off the GUI thread, so the UI
  never blocks while waiting on the network.

Reference discipline (IMPORTANT)
--------------------------------
QThread objects are deleted by Python's garbage collector if no reference is
kept alive. The CALLER MUST keep a reference to each ExplainWorker instance
(e.g. `self._explain_worker = ExplainWorker(...)`) until its `explained`
signal has fired, otherwise the worker may be destroyed mid-flight and the
signal will never arrive. A common pattern is to stash the worker on the
window and clear the reference inside the connected slot.

Public API
----------
    class ExplainWorker(QtCore.QThread)
        __init__(self, task, target_name, history, gen=0)
        signal: explained = QtCore.pyqtSignal(str, int)   # (text, gen)
        start()  # inherited from QThread; runs run() on a background thread

The `gen` (generation) integer is echoed back in the `explained` signal so
the caller can discard stale results when the user has moved on to a newer
target/task (compare the emitted gen against the current generation).
"""

from __future__ import annotations

import os

from PyQt5 import QtCore

# Anthropic model id is fixed by the integration contract. Haiku is fast/cheap,
# which suits a tiny one-sentence explanation request.
_MODEL_ID = "claude-haiku-4-5-20251001"

# Keep the response short: a single sentence is plenty for a tooltip-style hint.
_MAX_TOKENS = 80


class ExplainWorker(QtCore.QThread):
    """Background worker that fetches a one-sentence "why this step" hint.

    Emits ``explained(text, gen)`` exactly once when finished. On any error
    (no SDK, no API key, network failure, malformed response, etc.) it emits
    ``("", gen)`` so the caller can silently ignore the result.
    """

    # (explanation_text, generation) — generation lets the caller drop stale hits.
    explained = QtCore.pyqtSignal(str, int)

    def __init__(self, task, target_name, history, gen: int = 0, parent=None):
        """Create the worker.

        Args:
            task: What the user is trying to accomplish (free text).
            target_name: The name/label of the UI element Nudge will point at.
            history: Optional context (recent steps / breadcrumbs). Accepted for
                API symmetry with the rest of the app; coerced to a short string
                and lightly woven into the prompt. May be None.
            gen: Generation counter echoed back via the `explained` signal so
                the caller can ignore out-of-date results.
            parent: Optional QObject parent.
        """
        super().__init__(parent)
        # Defensive coercion: never assume callers pass clean strings.
        self._task = self._safe_str(task)
        self._target_name = self._safe_str(target_name)
        self._history = self._safe_str(history)
        self._gen = int(gen) if isinstance(gen, (int, float)) else 0

    # ------------------------------------------------------------------ #
    # Helpers
    # ------------------------------------------------------------------ #
    @staticmethod
    def _safe_str(value) -> str:
        """Coerce any value to a stripped string, never raising."""
        try:
            if value is None:
                return ""
            return str(value).strip()
        except Exception:
            return ""

    def _build_prompt(self) -> str:
        """Compose the user-facing prompt for the model."""
        target = self._target_name or "this element"
        task = self._task or "the current task"
        prompt = (
            f'Task: "{task}"\n'
            f'Target to click: "{target}"\n'
        )
        # History is optional flavor; only include it when present and short.
        if self._history:
            snippet = self._history[:300]
            prompt += f"Recent context: {snippet}\n"
        prompt += (
            f'In one short sentence, explain why clicking "{target}" helps '
            f'accomplish the task. No preamble.'
        )
        return prompt

    # ------------------------------------------------------------------ #
    # QThread entry point
    # ------------------------------------------------------------------ #
    def run(self) -> None:  # noqa: D401  (QThread override)
        """Perform the Anthropic call on the background thread.

        Always emits `explained` exactly once. Never raises.
        """
        text = ""
        try:
            text = self._fetch_explanation()
        except Exception:
            # Absolutely never let an exception escape the thread.
            text = ""
        finally:
            try:
                self.explained.emit(text or "", self._gen)
            except Exception:
                # If even emitting fails (e.g. during teardown), give up quietly.
                pass

    def _fetch_explanation(self) -> str:
        """Do the actual SDK call. Returns "" on any soft failure."""
        # No key -> no call. Degrade silently.
        api_key = os.environ.get("ANTHROPIC_API_KEY")
        if not api_key:
            return ""

        # Lazy import so a missing dependency can't break module import.
        try:
            import anthropic
        except Exception:
            return ""

        try:
            client = anthropic.Anthropic(api_key=api_key)
        except Exception:
            return ""

        system_prompt = (
            "You are a concise UI copilot. In one short sentence, explain why "
            "clicking the given target helps accomplish the user's task. "
            "No preamble, no markdown, no quotes — just the single sentence."
        )

        try:
            message = client.messages.create(
                model=_MODEL_ID,
                max_tokens=_MAX_TOKENS,
                system=system_prompt,
                messages=[{"role": "user", "content": self._build_prompt()}],
            )
        except Exception:
            return ""

        return self._extract_text(message)

    @staticmethod
    def _extract_text(message) -> str:
        """Pull plain text out of an Anthropic message response, safely."""
        try:
            parts = []
            for block in getattr(message, "content", None) or []:
                # Text blocks expose `.type == "text"` and a `.text` attribute.
                if getattr(block, "type", None) == "text":
                    chunk = getattr(block, "text", "")
                    if chunk:
                        parts.append(chunk)
                else:
                    # Fall back to any `.text` attribute on unknown block types.
                    chunk = getattr(block, "text", "")
                    if chunk:
                        parts.append(chunk)
            return " ".join(parts).strip()
        except Exception:
            return ""
