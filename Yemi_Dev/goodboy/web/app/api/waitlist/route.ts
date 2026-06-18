import { NextResponse } from "next/server";

// Simple, dependency-free email validation. Good enough for a waitlist capture.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export async function POST(request: Request) {
  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { ok: false, error: "Invalid request body." },
      { status: 400 }
    );
  }

  const email =
    typeof body === "object" && body !== null && "email" in body
      ? String((body as { email: unknown }).email ?? "").trim()
      : "";

  if (!email || !EMAIL_RE.test(email) || email.length > 254) {
    return NextResponse.json(
      { ok: false, error: "Please enter a valid email address." },
      { status: 422 }
    );
  }

  // No database in this build — just acknowledge + log server-side.
  // A real implementation would push this to Airtable / a mailing list here.
  console.log(
    `[goodboy:waitlist] new founding signup: ${email} @ ${new Date().toISOString()}`
  );

  return NextResponse.json({ ok: true });
}

// Reject non-POST methods cleanly.
export async function GET() {
  return NextResponse.json(
    { ok: false, error: "Method not allowed." },
    { status: 405 }
  );
}
