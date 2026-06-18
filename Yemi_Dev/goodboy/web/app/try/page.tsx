import Link from "next/link";
import type { Metadata } from "next";
import TryTrainer from "./TryTrainer";

export const metadata: Metadata = {
  title: "Try GoodBoy free — AI dog-trick trainer in your browser",
  description:
    "Test the GoodBoy AI dog trainer right now, free, no signup. It runs entirely in your browser — point your camera at your dog or upload a photo and watch it verify sit, down, and stand.",
};

export default function TryPage() {
  return (
    <div className="relative min-h-screen overflow-x-clip bg-atmosphere">
      <div className="pointer-events-none absolute inset-0 bg-dotgrid opacity-60" />

      <header className="relative mx-auto flex max-w-6xl items-center justify-between px-5 py-5 sm:px-8">
        <Link href="/" className="flex items-center gap-2 font-display text-lg font-semibold">
          <span>🐕</span>
          <span>
            Good<span className="text-gradient-ember">Boy</span>
          </span>
        </Link>
        <span className="rounded-full border border-leaf/30 bg-leaf/10 px-3 py-1 text-xs font-medium text-leaf">
          Free · no signup · on-device
        </span>
      </header>

      <main className="relative mx-auto max-w-6xl px-5 pb-24 sm:px-8">
        <div className="mx-auto max-w-2xl py-8 text-center">
          <h1 className="font-display text-4xl font-semibold leading-tight text-bone sm:text-5xl">
            Try it{" "}
            <span className="text-gradient-ember italic">right now</span>.
          </h1>
          <p className="mx-auto mt-4 max-w-xl text-lg text-muted">
            This is the real GoodBoy model running <span className="text-bone">in your browser</span> — no
            install, no signup, no paywall. Point your camera at your dog (or upload a photo) and watch it
            call <span className="font-semibold text-leaf">sit</span>,{" "}
            <span className="font-semibold text-sky">down</span>, and{" "}
            <span className="font-semibold text-ember-300">stand</span>.
          </p>
        </div>

        <div className="rounded-[2rem] border border-white/10 bg-ink-900/40 p-5 sm:p-8">
          <TryTrainer />
        </div>

        <div className="mx-auto mt-10 max-w-xl rounded-2xl border border-ember/25 bg-ink-800/50 p-6 text-center">
          <p className="text-bone">
            Like it? Lock <span className="font-semibold text-ember-300">founding access</span> — $6/mo for
            life with a refundable $7 deposit.
          </p>
          <Link
            href="/#pricing"
            className="mt-4 inline-flex rounded-full bg-ember px-6 py-3 font-semibold text-ink-900 hover:bg-ember-300"
          >
            See founding offer
          </Link>
        </div>
      </main>
    </div>
  );
}
