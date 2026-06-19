"""
prompts.py — Externalized, hardened prompts for Nudge OS.

This module is intentionally stdlib-only and side-effect free. It exposes a
small set of system-prompt strings plus one helper that assembles the user
message for the planner. Nothing here touches Qt, the network, or the GUI, so
it is safe to import at any time and never raises on import.

Public surface:
    SYSTEM_PLAN     -> planner system prompt (one-element-at-a-time pointer)
    SYSTEM_VERIFY   -> task-completion verifier system prompt
    SYSTEM_ROUTE    -> high-level route/step-breakdown system prompt
    build_user_text(...) -> assembles the planner user message

Design notes:
    - The planner NEVER clicks. It only POINTS at the single next element.
    - All model output is STRICT JSON (no markdown, no prose) so the caller
      can json.loads() the response directly.
    - The helper degrades gracefully: bad/missing inputs become safe defaults
      rather than exceptions.
"""

# --------------------------------------------------------------------------- #
# SYSTEM_PLAN — the core planner prompt.
#
# The model is shown a screenshot annotated with numbered marks (clickable UI
# elements on the foreground window plus the taskbar). It must choose exactly
# ONE next step and emit STRICT JSON. It never performs the action itself.
# --------------------------------------------------------------------------- #
SYSTEM_PLAN = """You are Nudge OS, a calm on-screen guide that POINTS at what the user should click next.

You are given:
- A screenshot of the user's Windows desktop.
- A numbered list of "marks" — clickable UI elements detected on the foreground window and the taskbar. Each mark has an index and a short label.

Your job is to point at the SINGLE next element the user should interact with to make progress on their TASK. You NEVER click, type, or act yourself — you only point and give one short instruction.

OUTPUT FORMAT — return STRICT JSON only, nothing else. No markdown, no code fences, no prose, no commentary. Exactly this shape:
{"index": <int into marks, or -1 for a keyboard-only step>, "instruction": "<one short imperative sentence>", "done": <bool>, "confidence": <float 0..1>, "key": "<optional keyboard shortcut like 'Win+R', or null>", "type_text": "<optional text to type, or null>"}

RULES:
- Choose EXACTLY ONE mark. Set "index" to that mark's number.
- Prefer the most direct next step toward the task. Do not skip ahead or batch multiple actions.
- Your "instruction" is one short imperative sentence (e.g. "Click the Settings gear").
- Set "done": true ONLY if the task already looks complete in the screenshot. When done is true, "index" may be -1.
- If the fastest next step is a keyboard shortcut (e.g. opening Run, the Start menu, or a save dialog), set "index": -1 and put the shortcut in "key" (e.g. "Win+R").
- If the next step is to type text into an already-focused field, you may fill "type_text" with the exact text; otherwise leave it null.
- "confidence" is your honest 0..1 estimate that this is the correct next step.
- Use null (not empty strings) for "key" and "type_text" when they do not apply.
- Never output anything except the single JSON object.

EXAMPLE
Marks:
[0] File menu
[1] Edit menu
[2] Save button (toolbar)
[3] Search box
Task: "Save the current document"
Ideal output:
{"index": 2, "instruction": "Click the Save button in the toolbar", "done": false, "confidence": 0.9, "key": null, "type_text": null}
"""


# --------------------------------------------------------------------------- #
# SYSTEM_VERIFY — lightweight completion checker.
#
# Given the task and the current screenshot, decide whether the task is done.
# --------------------------------------------------------------------------- #
SYSTEM_VERIFY = """You are Nudge OS's completion checker.

You are given a TASK and a screenshot of the user's screen. Decide whether the task already appears complete based only on what is visible.

OUTPUT FORMAT — return STRICT JSON only, nothing else. No markdown, no prose:
{"complete": <bool>, "reason": "<short>"}

RULES:
- "complete" is true only if the screenshot clearly shows the task is finished.
- "reason" is a short phrase (a few words) explaining your decision.
- Output nothing except the single JSON object.
"""


# --------------------------------------------------------------------------- #
# SYSTEM_ROUTE — coarse, up-front plan.
#
# Given a task in natural language, return a short ordered list of high-level
# steps. This is used to keep the per-frame planner oriented.
# --------------------------------------------------------------------------- #
SYSTEM_ROUTE = """You are Nudge OS's route planner.

You are given a TASK described in natural language. Break it into a short ordered list of high-level steps that, followed in order, would accomplish the task on a Windows desktop.

OUTPUT FORMAT — return STRICT JSON only, nothing else. No markdown, no prose:
{"steps": ["<high level step>", "<high level step>", ...]}

RULES:
- Provide between 2 and 6 steps.
- Keep each step short (a few words), imperative, and high level — not click-by-click.
- Output nothing except the single JSON object.
"""


def build_user_text(
    task,
    history,
    marks_text,
    win_title=None,
    app_name=None,
    route_step=None,
    stuck_note=None,
):
    """
    Assemble the planner user message from the current frame's context.

    Parameters
    ----------
    task : str
        The user's overall task (one line).
    history : list[str] | str | None
        Elements already clicked so far. A list is joined with " -> ".
        Empty / None becomes "(nothing yet)".
    marks_text : str | None
        Pre-formatted, numbered list of clickable marks.
    win_title : str | None
        Title of the foreground window, if known.
    app_name : str | None
        Process / app name of the foreground window, if known.
    route_step : str | None
        The current high-level route step the planner should focus on.
    stuck_note : str | None
        An optional note when the user appears stuck / no progress is being made.

    Returns
    -------
    str
        The fully assembled user message. Never raises — on any unexpected
        input it falls back to a minimal but valid message.
    """
    try:
        # --- Normalize the task line -------------------------------------- #
        task_str = ("" if task is None else str(task)).strip()
        if not task_str:
            task_str = "(no task provided)"
        lines = ['TASK: "{}"'.format(task_str)]

        # --- Optional foreground-window context --------------------------- #
        title_str = ("" if win_title is None else str(win_title)).strip()
        app_str = ("" if app_name is None else str(app_name)).strip()
        if title_str or app_str:
            if app_str:
                lines.append('FOREGROUND WINDOW: "{}" ({})'.format(title_str, app_str))
            else:
                lines.append('FOREGROUND WINDOW: "{}"'.format(title_str))

        # --- Optional current route step ---------------------------------- #
        route_str = ("" if route_step is None else str(route_step)).strip()
        if route_str:
            lines.append("CURRENT ROUTE STEP: {}".format(route_str))

        # --- Optional stuck note ------------------------------------------ #
        stuck_str = ("" if stuck_note is None else str(stuck_note)).strip()
        if stuck_str:
            lines.append(stuck_str)

        # --- Click history ------------------------------------------------ #
        history_str = _format_history(history)
        lines.append("Already clicked so far: {}".format(history_str))

        # --- Marks list --------------------------------------------------- #
        marks_str = ("" if marks_text is None else str(marks_text)).strip()
        if not marks_str:
            marks_str = "(no marks detected)"
        lines.append("")
        lines.append("Marks:")
        lines.append(marks_str)

        # --- Closing instruction ------------------------------------------ #
        lines.append("")
        lines.append("Return the STRICT JSON for the single next element to click.")

        return "\n".join(lines)
    except Exception:
        # Never raise from a public entrypoint — degrade to a minimal message.
        safe_task = ""
        try:
            safe_task = str(task)
        except Exception:
            safe_task = "(unavailable)"
        return (
            'TASK: "{}"\n'
            "Already clicked so far: (nothing yet)\n\n"
            "Marks:\n(no marks detected)\n\n"
            "Return the STRICT JSON for the single next element to click."
        ).format(safe_task)


def _format_history(history):
    """
    Render the click history into a single short string.

    Accepts a list/tuple of step labels, a plain string, or None. Always
    returns a non-empty string; falls back to "(nothing yet)".
    """
    try:
        if history is None:
            return "(nothing yet)"
        # A list/tuple of steps -> join with arrows.
        if isinstance(history, (list, tuple)):
            parts = [str(h).strip() for h in history if str(h).strip()]
            return " -> ".join(parts) if parts else "(nothing yet)"
        # Already a string (or anything else) -> stringify and trim.
        text = str(history).strip()
        return text if text else "(nothing yet)"
    except Exception:
        return "(nothing yet)"
