"use client";

import { useState } from "react";

const ITEMS = [
  {
    q: "Does it work with my breed?",
    a: "Yes. GoodBoy detects the pose — sit, down, stand — not the breed. It works the same on a Frenchie, a Golden, or a 60-pound rescue mutt. Posture is posture.",
  },
  {
    q: "What commands can it check?",
    a: "Founding access ships with the core obedience set: sit, down (lie down), stand, and stay. Place, shake, and roll-over are next on the program as we expand the model.",
  },
  {
    q: "Is my video private?",
    a: "Completely. Verification runs on-device in your browser — the camera feed is processed locally and is never uploaded or stored on our servers. Your living room stays in your living room.",
  },
  {
    q: "Do I need any special gear?",
    a: "Nope. Just your phone or laptop camera, your dog, and some treats. Prop the camera so your pup is in frame, pick a command, and start. No collars, no sensors, no subscriptions to other apps.",
  },
];

export default function Faq() {
  const [open, setOpen] = useState<number | null>(0);

  return (
    <div className="mx-auto max-w-3xl divide-y divide-white/10 rounded-3xl border border-white/10 bg-ink-800/40">
      {ITEMS.map((item, i) => {
        const isOpen = open === i;
        return (
          <div key={item.q}>
            <button
              type="button"
              onClick={() => setOpen(isOpen ? null : i)}
              aria-expanded={isOpen}
              className="flex w-full items-center justify-between gap-4 px-5 py-5 text-left sm:px-7"
            >
              <span className="font-display text-lg font-medium text-bone sm:text-xl">
                {item.q}
              </span>
              <span
                className={`grid h-8 w-8 shrink-0 place-items-center rounded-full border border-white/15 text-ember transition-transform duration-300 ${
                  isOpen ? "rotate-45 bg-ember/15" : ""
                }`}
                aria-hidden
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                  <path
                    d="M12 5v14M5 12h14"
                    stroke="currentColor"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                  />
                </svg>
              </span>
            </button>
            <div
              className={`grid overflow-hidden transition-[grid-template-rows] duration-300 ${
                isOpen ? "grid-rows-[1fr]" : "grid-rows-[0fr]"
              }`}
            >
              <div className="overflow-hidden">
                <p className="px-5 pb-6 text-[15px] leading-relaxed text-muted sm:px-7">
                  {item.a}
                </p>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
