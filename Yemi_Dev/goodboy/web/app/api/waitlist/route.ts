import { NextResponse } from "next/server";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

// Best-effort in-memory rate limit + dedup (per serverless instance). Real
// dedup is enforced by the DB unique constraint when persistence is wired.
const RATE = new Map<string, number[]>();
const SEEN = new Map<string, number>();
const WINDOW_MS = 60_000;
const MAX_PER_WINDOW = 6;

function limited(ip: string): boolean {
  const now = Date.now();
  const hits = (RATE.get(ip) ?? []).filter((t) => now - t < WINDOW_MS);
  hits.push(now);
  RATE.set(ip, hits);
  return hits.length > MAX_PER_WINDOW;
}

// Persist via whatever is configured. All optional — code is complete; wiring
// is a one-step env addition (no redeploy of logic needed).
async function persist(email: string, source: string) {
  const ts = new Date().toISOString();

  const webhook = process.env.WAITLIST_WEBHOOK_URL; // Make / Airtable / Sheets
  if (webhook) {
    await fetch(webhook, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email, source, ts }),
    }).catch(() => {});
    return "webhook";
  }

  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_KEY;
  if (url && key) {
    // table: waitlist(email text unique, source text, created_at timestamptz)
    await fetch(`${url}/rest/v1/waitlist?on_conflict=email`, {
      method: "POST",
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
        "content-type": "application/json",
        Prefer: "resolution=merge-duplicates,return=minimal",
      },
      body: JSON.stringify({ email, source, created_at: ts }),
    }).catch(() => {});
    return "supabase";
  }

  console.log(`[goodboy:waitlist] ${email} (${source}) @ ${ts}`);
  return "log";
}

export async function POST(request: Request) {
  const ip =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  if (limited(ip)) {
    return NextResponse.json(
      { ok: false, error: "Too many requests — try again in a minute." },
      { status: 429 },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid request body." }, { status: 400 });
  }

  const rec = (body ?? {}) as Record<string, unknown>;
  const email = String(rec.email ?? "").trim().toLowerCase();
  const source = String(rec.source ?? "waitlist").slice(0, 40);

  if (!email || !EMAIL_RE.test(email) || email.length > 254) {
    return NextResponse.json(
      { ok: false, error: "Please enter a valid email address." },
      { status: 422 },
    );
  }

  // soft dedup so the visible metric isn't inflated by double-submits
  const now = Date.now();
  const last = SEEN.get(email);
  const duplicate = last !== undefined && now - last < 24 * 60 * 60 * 1000;
  SEEN.set(email, now);

  if (!duplicate) {
    await persist(email, source);
  }

  return NextResponse.json({ ok: true, duplicate });
}

export async function GET() {
  return NextResponse.json({ ok: false, error: "Method not allowed." }, { status: 405 });
}
