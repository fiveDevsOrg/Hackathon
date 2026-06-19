"""
planner_preview.py — Off-thread route outline generation for Nudge OS.

This module exposes a single QThread worker, `OutlineWorker`, which asks
Claude (Haiku) to break a task down into 2-6 short, high-level steps. The
work runs entirely off the GUI thread so the never-crash / never-block
guarantee of the main app is preserved.

Design rules honoured here:
  * Never raise on import — all heavy imports are deferred or guarded.
  * Never raise from a public entrypoint — `run()` swallows every error
    and emits an empty list so the UI degrades gracefully.
  * No imports from nudge_desktop (avoid circular imports).
  * The Anthropic call happens here, on the worker thread — never on the GUI.

Public surface:
    class OutlineWorker(QtCore.QThread)
        __init__(self, task, win_title=None, gen=0)
        signal: outline_ready = QtCore.pyqtSignal(list, int)
"""

from __future__ import annotations

import os

from PyQt5 import QtCore


# ---------------------------------------------------------------------------
# Configuration constants
# ---------------------------------------------------------------------------

# Pinned model id per the shared integration contract.
_MODEL_ID = "claude-haiku-4-5-20251001"

# Keep the response small and fast — an outline is only a handful of words.
_MAX_TOKENS = 200

# System prompt: instruct the model to return a tight JSON object only.
_SYSTEM_PROMPT = (
    "You are a planning assistant inside a desktop copilot. "
    "Given a task the user wants to accomplish on their computer, break it "
    "into 2 to 6 short, high-level steps that describe the route the user "
    "should take. Each step is a terse imperative phrase (a few words), not "
    "a full sentence, and never mentions specific pixel coordinates. "
    'Respond with ONLY a JSON object of the exact form {"steps": [...]} '
    "where the value is an ordered list of step strings. Output no prose, "
    "no markdown, and no text outside the JSON object."
)


# ---------------------------------------------------------------------------
# Local balanced-brace JSON extractor
# ---------------------------------------------------------------------------

def _extract_first_json_object(text):
    """Return the first balanced ``{...}`` substring in *text*, or None.

    This is a small, dependency-free scanner that walks the string tracking
    brace depth while respecting string literals and escape sequences, so a
    ``{`` or ``}`` appearing inside a quoted value does not throw off the
    balance count. It intentionally does NOT import any helper from the main
    application, keeping this module fully self-contained.
    """
    if not text:
        return None

    start = text.find("{")
    if start == -1:
        return None

    depth = 0
    in_string = False
    escaped = False

    for i in range(start, len(text)):
        ch = text[i]

        if in_string:
            # Inside a quoted string: only watch for the closing quote,
            # honouring backslash escapes.
            if escaped:
                escaped = False
            elif ch == "\\":
                escaped = True
            elif ch == '"':
                in_string = False
            continue

        # Outside any string literal.
        if ch == '"':
            in_string = True
        elif ch == "{":
            depth += 1
        elif ch == "}":
            depth -= 1
            if depth == 0:
                # Found the matching close for the first opening brace.
                return text[start : i + 1]

    # Unbalanced — no complete object found.
    return None


def _parse_steps(text):
    """Parse model output into a clean list of step strings.

    Returns a list of non-empty step strings (capped at 6). On any problem
    — no JSON found, malformed JSON, wrong shape — returns an empty list.
    """
    import json  # Local import: keeps module import cheap and crash-proof.

    blob = _extract_first_json_object(text)
    if not blob:
        return []

    try:
        data = json.loads(blob)
    except Exception:
        return []

    if not isinstance(data, dict):
        return []

    raw_steps = data.get("steps")
    if not isinstance(raw_steps, list):
        return []

    cleaned = []
    for item in raw_steps:
        # Accept plain strings; coerce other scalars defensively.
        if isinstance(item, str):
            step = item.strip()
        elif item is None:
            continue
        else:
            step = str(item).strip()

        if step:
            cleaned.append(step)

    # Enforce the 2-6 high-level steps contract on the upper bound; the lower
    # bound is left to the model, and we still return whatever we got so the
    # UI can show a partial outline rather than nothing.
    return cleaned[:6]


# ---------------------------------------------------------------------------
# Worker thread
# ---------------------------------------------------------------------------

class OutlineWorker(QtCore.QThread):
    """Generate a short route outline for a task, off the GUI thread.

    Emits ``outline_ready(list, int)`` exactly once when finished:
        * the list of step strings (empty on any failure), and
        * the generation counter ``gen`` passed at construction, so the
          receiver can ignore results from stale/superseded requests.
    """

    # (steps_list, generation)
    outline_ready = QtCore.pyqtSignal(list, int)

    def __init__(self, task, win_title=None, gen=0):
        super().__init__()
        # Coerce inputs to safe types so nothing downstream can blow up.
        self._task = task if isinstance(task, str) else ("" if task is None else str(task))
        self._win_title = win_title if isinstance(win_title, str) else None
        try:
            self._gen = int(gen)
        except Exception:
            self._gen = 0

    # -- internals ----------------------------------------------------------

    def _build_user_prompt(self):
        """Compose the user-facing prompt from the task and optional window."""
        parts = ["Task: {}".format(self._task.strip() or "(unspecified)")]
        if self._win_title:
            parts.append("Active window: {}".format(self._win_title.strip()))
        parts.append(
            "Give the high-level route as 2-6 short steps in the required "
            "JSON format."
        )
        return "\n".join(parts)

    # -- QThread entrypoint -------------------------------------------------

    def run(self):
        """Perform one Anthropic call and emit the parsed outline.

        Wrapped end-to-end in try/except: any failure (missing SDK, missing
        API key, network error, bad response) results in an empty list being
        emitted rather than a crash.
        """
        steps = []
        try:
            # Bail early if there's nothing actionable; still emit so the
            # caller's pending state resolves.
            if not self._task.strip():
                self.outline_ready.emit([], self._gen)
                return

            # No key → no call. Degrade silently.
            if not os.environ.get("ANTHROPIC_API_KEY"):
                self.outline_ready.emit([], self._gen)
                return

            # Import the SDK lazily inside the guarded block so a missing
            # dependency never breaks module import or the GUI thread.
            import anthropic

            client = anthropic.Anthropic(timeout=8.0, max_retries=0)

            response = client.messages.create(
                model=_MODEL_ID,
                max_tokens=_MAX_TOKENS,
                system=_SYSTEM_PROMPT,
                messages=[{"role": "user", "content": self._build_user_prompt()}],
            )

            # Concatenate any text blocks from the response content.
            text_chunks = []
            for block in getattr(response, "content", None) or []:
                if getattr(block, "type", None) == "text":
                    chunk = getattr(block, "text", "")
                    if chunk:
                        text_chunks.append(chunk)

            steps = _parse_steps("".join(text_chunks))
        except Exception:
            # Never propagate — emit a safe default below.
            steps = []

        # Always emit exactly once, even on failure.
        try:
            self.outline_ready.emit(steps if isinstance(steps, list) else [], self._gen)
        except Exception:
            # If the signal emission itself fails (e.g. during teardown),
            # there is nothing safe left to do — swallow it.
            pass
