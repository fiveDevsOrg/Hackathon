import { NextResponse } from "next/server";

// Creates a Stripe Checkout Session for the $7 founding deposit.
// Goes live the moment STRIPE_SECRET_KEY is set in the Vercel env — no
// product/price setup needed (price is inline). Until then it returns 503 and
// the CheckoutButton falls back to the waitlist.
export async function POST(req: Request) {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) {
    return NextResponse.json(
      { error: "not_configured", message: "Set STRIPE_SECRET_KEY to enable checkout." },
      { status: 503 },
    );
  }

  try {
    const Stripe = (await import("stripe")).default;
    const stripe = new Stripe(key);

    // optional client-supplied idempotency key — prevents duplicate sessions
    // on double-clicks / retries
    let idemKey: string | undefined;
    try {
      const body = await req.json();
      const k = (body as { idempotencyKey?: unknown })?.idempotencyKey;
      if (typeof k === "string" && k.length > 0 && k.length <= 200) idemKey = k;
    } catch {
      /* no / invalid body -> proceed without an idempotency key */
    }

    const origin =
      req.headers.get("origin") ||
      `https://${req.headers.get("host") ?? "goodboy-alpha.vercel.app"}`;

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      payment_method_types: ["card"],
      line_items: [
        {
          price_data: {
            currency: "usd",
            unit_amount: 700,
            product_data: {
              name: "GoodBoy — Founding Deposit",
              description:
                "Refundable $7 deposit. Locks your founding rate: $6/mo for life (50% off $12).",
            },
          },
          quantity: 1,
        },
      ],
      // capture intent only — refundable deposit
      success_url: `${origin}/?welcome=founding`,
      cancel_url: `${origin}/?checkout=canceled`,
      submit_type: "pay",
      billing_address_collection: "auto",
    }, idemKey ? { idempotencyKey: idemKey } : undefined);

    return NextResponse.json({ url: session.url });
  } catch (err) {
    return NextResponse.json(
      { error: "stripe_error", message: (err as Error).message },
      { status: 500 },
    );
  }
}
