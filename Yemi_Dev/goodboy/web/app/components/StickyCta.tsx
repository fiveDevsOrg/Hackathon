"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import CheckoutButton from "./CheckoutButton";

// Mobile-only sticky CTA that slides up after the hero scrolls away.
export default function StickyCta() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    const onScroll = () => setShow(window.scrollY > 640);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <div
      className={`fixed inset-x-0 bottom-0 z-40 md:hidden transition-transform duration-300 ${
        show ? "translate-y-0" : "translate-y-full"
      }`}
    >
      <div className="mx-3 mb-3 flex items-center gap-2 rounded-2xl border border-white/10 bg-ink-900/90 p-2 shadow-[0_-8px_30px_-12px_rgba(0,0,0,0.8)] backdrop-blur-xl">
        <Link
          href="/try"
          className="shrink-0 rounded-xl border border-white/15 px-4 py-3 text-sm font-medium text-bone"
        >
          Try free
        </Link>
        <CheckoutButton className="flex-1 rounded-xl bg-ember px-4 py-3 text-center text-sm font-semibold text-ink-900">
          Lock founding — $7
        </CheckoutButton>
      </div>
    </div>
  );
}
