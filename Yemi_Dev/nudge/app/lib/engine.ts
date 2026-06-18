/**
 * Nudge — Set-of-Mark engine
 * --------------------------------------------------------------------------
 * The "set-of-mark" is the list of interactive, on-screen targets the planner
 * reasons over. Every clickable element in the practice sandbox carries a
 * `data-nudge="<id>"` attribute plus visible text / aria-label. `scanMarks`
 * reads the LIVE DOM (positions from getBoundingClientRect) so the planner is
 * always pointing at where the element actually is right now.
 */

export type Mark = {
  /** Stable id from data-nudge="..." */
  id: string;
  /** Human-readable label (text content or aria-label) */
  label: string;
  /** ARIA / element role, for the AI brain's reasoning */
  role: string;
  /** Live bounding rect in viewport coordinates */
  rect: { top: number; left: number; width: number; height: number };
};

export type Plan = {
  /** data-nudge id to point the cursor at; null when nothing matches */
  targetId: string | null;
  /** One-sentence instruction shown in the tooltip */
  instruction: string;
  /** True once the task is complete */
  done: boolean;
};

/**
 * The ordered goal sequence for the task "Sign into a Google account".
 * Each goal names the data-nudge id it expects plus the instruction copy.
 * The planner walks this list and returns the FIRST goal whose target is
 * actually present in the current marks — so it genuinely adapts to the
 * live screen instead of blindly counting.
 */
export const GOALS: { id: string; instruction: string }[] = [
  { id: "open-browser", instruction: "First, open your web browser." },
  { id: "address-bar", instruction: "Click the address bar — we'll head to Google." },
  { id: "go", instruction: "Hit Go to visit accounts.google.com." },
  { id: "email", instruction: "Click the email field (we'll drop in a demo address)." },
  { id: "email-next", instruction: "Click Next." },
  { id: "password", instruction: "Click the password field (demo password added)." },
  { id: "signin", instruction: "Click Sign in to finish." },
];

/** Total number of guided steps — drives the "Step N of M" UI. */
export const STEPS = GOALS.length;

/** Map a target id to its 1-based step number (for "Step N of M"). */
export function stepNumber(targetId: string | null): number {
  if (!targetId) return STEPS;
  const idx = GOALS.findIndex((g) => g.id === targetId);
  return idx === -1 ? STEPS : idx + 1;
}

/**
 * Query every visible `[data-nudge]` element in the document and build the
 * set-of-mark. Elements with zero area (display:none / not laid out) are
 * skipped so the planner never points at something the user can't see.
 */
export function scanMarks(root: ParentNode = document): Mark[] {
  const nodes = Array.from(
    root.querySelectorAll<HTMLElement>("[data-nudge]"),
  );
  const marks: Mark[] = [];
  for (const el of nodes) {
    const id = el.getAttribute("data-nudge");
    if (!id) continue;
    const rect = el.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) continue; // not visible / not laid out
    const label =
      el.getAttribute("aria-label") ||
      (el.textContent || "").trim().replace(/\s+/g, " ") ||
      id;
    const role =
      el.getAttribute("role") ||
      el.tagName.toLowerCase();
    marks.push({
      id,
      label,
      role,
      rect: {
        top: rect.top,
        left: rect.left,
        width: rect.width,
        height: rect.height,
      },
    });
  }
  return marks;
}

/**
 * Heuristic planner. Reads the live marks and returns the next thing to point
 * at. It walks the ordered GOALS and returns the first goal whose targetId is
 * present in the current marks. If none of the remaining goals are present but
 * the success state is on screen, it reports done. `history` (clicked ids) is
 * accepted for parity with the AI brain and to break ties, but the present-on-
 * screen check is what makes this adaptive.
 */
export function planNext(
  task: string,
  marks: Mark[],
  history: string[] = [],
): Plan {
  const present = new Set(marks.map((m) => m.id));

  // Success state reached.
  if (present.has("done") || history.includes("signin")) {
    return {
      targetId: null,
      instruction: "🎉 Signed in! You followed every nudge.",
      done: true,
    };
  }

  for (const goal of GOALS) {
    if (history.includes(goal.id)) continue; // already done this one — advance
    if (present.has(goal.id)) {
      return {
        targetId: goal.id,
        instruction: goal.instruction,
        done: false,
      };
    }
  }

  // Nothing actionable on screen — gracefully fall through.
  return {
    targetId: null,
    instruction: "Looking for the next step…",
    done: false,
  };
}
