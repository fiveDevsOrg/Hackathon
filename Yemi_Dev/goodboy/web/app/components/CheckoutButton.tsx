"use client";

import { useRef, useState } from "react";
import { ev } from "../lib/analytics";

/**
 * Founding-deposit CTA. Resolves the cheapest available path:
 *  1. NEXT_PUBLIC_STRIPE_PAYMENT_LINK  -> redirect straight to a Stripe Payment Link
 *  2. POST /api/checkout (STRIPE_SECRET_KEY) -> redirect to a Checkout Session
 *  3. neither configured -> graceful fallback to the waitlist
 */
export default function CheckoutButton({
  className,
  children,
  fallback = "#waitlist",
  location = "page",
}: {
  className?: string;
  children: React.ReactNode;
  fallback?: string;
  location?: string;
}) {
  const [loading, setLoading] = useState(false);
  const link = process.env.NEXT_PUBLIC_STRIPE_PAYMENT_LINK;
  // stable per-button key so a double-click reuses the same Stripe idempotency key
  const keyRef = useRef<string>("");
  if (!keyRef.current) {
    keyRef.current =
      typeof crypto !== "undefined" && crypto.randomUUID
        ? crypto.randomUUID()
        : `gb_${Date.now()}_${Math.round(Math.random() * 1e9)}`;
  }

  async function go() {
    ev("checkout_click", { location });
    if (link) {
      window.location.href = link;
      return;
    }
    setLoading(true);
    try {
      const r = await fetch("/api/checkout", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ idempotencyKey: keyRef.current }),
      });
      if (r.ok) {
        const data = await r.json();
        if (data?.url) {
          window.location.href = data.url;
          return;
        }
      }
    } catch {
      /* fall through to fallback */
    }
    setLoading(false);
    window.location.href = fallback;
  }

  return (
    <button onClick={go} disabled={loading} type="button" className={className}>
      {loading ? "Redirecting…" : children}
    </button>
  );
}
