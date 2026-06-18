"use client";

import { useEffect, useState } from "react";

const LINKS = [
  { href: "#how", label: "How it works" },
  { href: "#pricing", label: "Pricing" },
];

export default function Nav({ ctaHref }: { ctaHref: string }) {
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 12);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header
      className={`fixed inset-x-0 top-0 z-50 transition-all duration-300 ${
        scrolled
          ? "border-b border-white/10 bg-ink-900/80 backdrop-blur-xl"
          : "border-b border-transparent bg-transparent"
      }`}
    >
      <nav className="mx-auto flex max-w-6xl items-center justify-between px-5 py-3.5 sm:px-8">
        {/* Wordmark */}
        <a
          href="#top"
          className="group flex items-center gap-2 font-display text-lg font-semibold tracking-tight"
        >
          <span className="text-xl transition-transform group-hover:-rotate-12">
            🐕
          </span>
          <span>
            Good<span className="text-gradient-ember">Boy</span>
          </span>
        </a>

        {/* Desktop links */}
        <div className="hidden items-center gap-8 md:flex">
          {LINKS.map((l) => (
            <a
              key={l.href}
              href={l.href}
              className="text-sm text-muted transition-colors hover:text-bone"
            >
              {l.label}
            </a>
          ))}
          <a
            href={ctaHref}
            className="rounded-full bg-ember px-4 py-2 text-sm font-semibold text-ink-900 shadow-[0_8px_24px_-8px_rgba(255,107,53,0.7)] transition-transform hover:-translate-y-0.5 hover:bg-ember-300"
          >
            Get founding access
          </a>
        </div>

        {/* Mobile toggle */}
        <button
          type="button"
          aria-label="Toggle menu"
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
          className="grid h-10 w-10 place-items-center rounded-full border border-white/10 bg-ink-800/60 md:hidden"
        >
          <div className="space-y-1.5">
            <span
              className={`block h-0.5 w-5 bg-bone transition-transform ${
                open ? "translate-y-2 rotate-45" : ""
              }`}
            />
            <span
              className={`block h-0.5 w-5 bg-bone transition-opacity ${
                open ? "opacity-0" : ""
              }`}
            />
            <span
              className={`block h-0.5 w-5 bg-bone transition-transform ${
                open ? "-translate-y-2 -rotate-45" : ""
              }`}
            />
          </div>
        </button>
      </nav>

      {/* Mobile drawer */}
      <div
        className={`overflow-hidden border-t border-white/10 bg-ink-900/95 backdrop-blur-xl transition-[max-height,opacity] duration-300 md:hidden ${
          open ? "max-h-72 opacity-100" : "max-h-0 opacity-0"
        }`}
      >
        <div className="flex flex-col gap-1 px-5 py-4">
          {LINKS.map((l) => (
            <a
              key={l.href}
              href={l.href}
              onClick={() => setOpen(false)}
              className="rounded-xl px-3 py-3 text-base text-bone/90 transition-colors hover:bg-white/5"
            >
              {l.label}
            </a>
          ))}
          <a
            href={ctaHref}
            onClick={() => setOpen(false)}
            className="mt-1 rounded-xl bg-ember px-3 py-3 text-center text-base font-semibold text-ink-900"
          >
            Get founding access — $7
          </a>
        </div>
      </div>
    </header>
  );
}
