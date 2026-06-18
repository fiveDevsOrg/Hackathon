import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";

/**
 * POST /api/guide
 * --------------------------------------------------------------------------
 * The optional "AI brain". Given a task + the on-screen set-of-mark (each
 * { i?, label, role, id? }) + the history of clicked labels, Claude chooses the
 * SINGLE next element to point at and a one-sentence instruction. Claude returns
 * a 0-based INDEX into the marks array. We surface that index back to the caller
 * and, for backward compatibility with the original sandbox caller, also return a
 * "targetId" (the chosen mark's id, when it has one). You only POINT — the human
 * always does the clicking.
 *
 * Body:  { task: string, marks: {i?,label,role,id?}[], history: string[] }
 * Reply: { index: number | null, targetId: string | null, instruction: string, done: boolean }
 *
 * If ANTHROPIC_API_KEY is absent -> 503 { error: "no_key" } and the client falls
 * back to the local heuristic. Any other failure -> 500 with a message. The build
 * never exercises this route, so it must (and does) build with no key set.
 *
 * CORS: the Chrome extension proxies through its background service worker, but we
 * still expose permissive CORS (and an OPTIONS preflight handler) so the route can
 * be called directly from a browser context too.
 */

// Haiku 4.5 - fast and cheap, well-suited to a single-step routing decision.
const MODEL = "claude-haiku-4-5-20251001";

type Mark = { i?: number; label: string; role: string; id?: string };

const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SYSTEM = `You are Nudge, a screen-guidance copilot. Your job is to look at what is currently on a user's screen and point at the SINGLE next element they should click to make progress on their task. You only POINT - the human always does the clicking.

You receive:
- task: what the user is trying to accomplish.
- marks: the interactive elements currently visible on screen, as a NUMBERED list. Each line is "<index>: [<role>] <label>". The index is the 0-based position of that element.
- history: the labels of elements the user has already clicked, in order.

Choose the ONE element from "marks" that should be clicked next to advance the task, and return its index (the number at the start of its line). Prefer the most logical next step given the task and what has already been clicked. Write a short, friendly, one-sentence instruction telling the user what to click and why (no more than ~15 words).

If the task already appears complete (e.g. a success/done state is showing, or every step in the flow has been clicked), set done to true and index to null.

Respond with STRICT JSON ONLY, no prose, no markdown fences, in exactly this shape:
{"index": <0-based number from the list, or null>, "instruction": "<one short sentence>", "done": <true|false>}`;

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}

export async function POST(req: NextRequest) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "no_key" },
      { status: 503, headers: CORS_HEADERS }
    );
  }

  try {
    const body = (await req.json()) as {
      task?: string;
      marks?: Mark[];
      history?: string[];
    };
    const task = body.task ?? "";
    const marks = Array.isArray(body.marks) ? body.marks : [];
    const history = Array.isArray(body.history) ? body.history : [];

    const client = new Anthropic({ apiKey });

    // Build a NUMBERED element list so Claude reasons about positional indices.
    const numbered = marks
      .map((m, i) => `${i}: [${m.role || "element"}] ${m.label || "(no label)"}`)
      .join("\n");

    const userContent = JSON.stringify({
      task,
      marks: numbered,
      history,
    });

    const response = await client.messages.create({
      model: MODEL,
      max_tokens: 256,
      system: SYSTEM,
      messages: [{ role: "user", content: userContent }],
    });

    // Pull the first text block and parse defensively.
    const text = response.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("")
      .trim();

    const parsed = parseDecision(text, marks);
    return NextResponse.json(parsed, { status: 200, headers: CORS_HEADERS });
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown_error";
    return NextResponse.json(
      { error: "guide_failed", message },
      { status: 500, headers: CORS_HEADERS }
    );
  }
}

type Decision = {
  index: number | null;
  targetId: string | null;
  instruction: string;
  done: boolean;
};

/** Defensive parse: strip fences, find the JSON object, validate the index. */
function parseDecision(text: string, marks: Mark[]): Decision {
  let raw = text;
  // Strip ```json fences if the model added them despite instructions.
  const fence = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) raw = fence[1].trim();

  // Grab the first {...} block.
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start !== -1 && end !== -1 && end > start) {
    raw = raw.slice(start, end + 1);
  }

  try {
    const obj = JSON.parse(raw) as Partial<{
      index: number | null;
      instruction: string;
      done: boolean;
    }>;
    const done = obj.done === true;

    let index: number | null = null;
    if (
      typeof obj.index === "number" &&
      Number.isInteger(obj.index) &&
      obj.index >= 0 &&
      obj.index < marks.length
    ) {
      index = obj.index;
    }

    // Backward-compat: surface the chosen mark's id when present.
    const targetId =
      index !== null && marks[index] && typeof marks[index].id === "string"
        ? (marks[index].id as string)
        : null;

    const instruction =
      typeof obj.instruction === "string" && obj.instruction.trim()
        ? obj.instruction.trim()
        : done
          ? "All done - nice work!"
          : "Click the highlighted element to continue.";

    return {
      index,
      targetId,
      instruction,
      done: done || index === null,
    };
  } catch {
    // Couldn't parse - signal "no usable target" so the client falls back.
    return {
      index: null,
      targetId: null,
      instruction: "Click the highlighted element to continue.",
      done: false,
    };
  }
}
