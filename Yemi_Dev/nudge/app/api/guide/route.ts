import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";

/**
 * POST /api/guide
 * --------------------------------------------------------------------------
 * The optional "AI brain". Given a task + the on-screen set-of-mark (each
 * { id, label, role }) + the history of clicked ids, Claude chooses the SINGLE
 * next element id to point at and a one-sentence instruction.
 *
 * Body:  { task: string, marks: {id,label,role}[], history: string[] }
 * Reply: { targetId: string | null, instruction: string, done: boolean }
 *
 * If ANTHROPIC_API_KEY is absent → 503 { error: "no_key" } and the client
 * falls back to the local heuristic. Any other failure → 500 with a message.
 * The build never exercises this route, so it must (and does) build with no
 * key set.
 */

// Haiku 4.5 — fast and cheap, well-suited to a single-step routing decision.
const MODEL = "claude-haiku-4-5-20251001";

type Mark = { id: string; label: string; role: string };

const SYSTEM = `You are Nudge, a screen-guidance copilot. Your job is to look at what is currently on a user's screen and point at the SINGLE next element they should click to make progress on their task. You only POINT — the human always does the clicking.

You receive:
- task: what the user is trying to accomplish.
- marks: the interactive elements currently visible on screen, each with an "id" (a stable handle), a "label" (its visible text or aria-label), and a "role".
- history: the ids the user has already clicked, in order.

Choose the ONE element id from "marks" that should be clicked next to advance the task. Prefer the most logical next step given the task and what has already been clicked. Write a short, friendly, one-sentence instruction telling the user what to click and why (no more than ~15 words).

If the task already appears complete (e.g. a success/done state is showing, or every step in the flow has been clicked), set done to true and targetId to null.

Respond with STRICT JSON ONLY, no prose, no markdown fences, in exactly this shape:
{"targetId": "<one id from marks, or null>", "instruction": "<one short sentence>", "done": <true|false>}`;

export async function POST(req: NextRequest) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "no_key" }, { status: 503 });
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

    const userContent = JSON.stringify({ task, marks, history });

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
    return NextResponse.json(parsed, { status: 200 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown_error";
    return NextResponse.json({ error: "guide_failed", message }, { status: 500 });
  }
}

type Decision = { targetId: string | null; instruction: string; done: boolean };

/** Defensive parse: strip fences, find the JSON object, validate fields. */
function parseDecision(text: string, marks: Mark[]): Decision {
  const ids = new Set(marks.map((m) => m.id));

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
    const obj = JSON.parse(raw) as Partial<Decision>;
    const done = obj.done === true;
    let targetId: string | null = null;
    if (typeof obj.targetId === "string" && ids.has(obj.targetId)) {
      targetId = obj.targetId;
    }
    const instruction =
      typeof obj.instruction === "string" && obj.instruction.trim()
        ? obj.instruction.trim()
        : done
          ? "All done — nice work!"
          : "Click the highlighted element to continue.";
    return { targetId, instruction, done: done || targetId === null };
  } catch {
    // Couldn't parse — signal "no usable target" so the client falls back.
    return {
      targetId: null,
      instruction: "Click the highlighted element to continue.",
      done: false,
    };
  }
}
