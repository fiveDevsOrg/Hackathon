import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "The tech behind GoodBoy — powered by RF-DETR",
  description:
    "GoodBoy verifies your dog's tricks with RF-DETR, a 2025 real-time detection transformer. It's NMS-free, runs entirely in your browser (no server, fully private), and was fine-tuned to 95% accuracy on sit / down / stand.",
  alternates: { canonical: "/tech" },
};

function Chip({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded-full border border-white/12 bg-ink-800/60 px-3 py-1.5 font-mono text-xs text-bone">
      {children}
    </span>
  );
}

function Card({ icon, title, body }: { icon: string; title: string; body: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-ink-800/40 p-6 transition-colors hover:border-white/20">
      <div className="text-2xl">{icon}</div>
      <h3 className="mt-3 font-display text-lg font-semibold text-bone">{title}</h3>
      <p className="mt-2 text-[15px] leading-relaxed text-muted">{body}</p>
    </div>
  );
}

export default function TechPage() {
  return (
    <div className="relative min-h-screen overflow-x-clip bg-atmosphere">
      <div className="pointer-events-none absolute inset-0 bg-dotgrid opacity-60" />

      <header className="relative mx-auto flex max-w-5xl items-center justify-between px-5 py-5 sm:px-8">
        <Link href="/" className="flex items-center gap-2 font-display text-lg font-semibold">
          <span>🐕</span>
          <span>
            Good<span className="text-gradient-ember">Boy</span>
          </span>
        </Link>
        <Link
          href="/try"
          className="rounded-full bg-ember px-4 py-2 text-sm font-semibold text-ink-900 hover:bg-ember-300"
        >
          Try it free
        </Link>
      </header>

      <main className="relative mx-auto max-w-5xl px-5 pb-24 sm:px-8">
        <section className="py-10 text-center">
          <div className="font-mono text-xs uppercase tracking-[0.22em] text-ember-300">The tech behind GoodBoy</div>
          <h1 className="mx-auto mt-4 max-w-3xl font-display text-4xl font-semibold leading-tight text-bone sm:text-5xl">
            Powered by{" "}
            <span className="text-gradient-ember italic">RF-DETR</span>
          </h1>
          <p className="mx-auto mt-5 max-w-2xl text-lg text-muted">
            Most dog apps just see <span className="line-through decoration-ember/60">a dog</span>. GoodBoy knows{" "}
            <span className="font-semibold text-leaf">sit</span> from{" "}
            <span className="font-semibold text-sky">down</span> from{" "}
            <span className="font-semibold text-ember-300">stand</span> — because it runs a state-of-the-art
            vision model, live, right in your browser.
          </p>
          <div className="mt-7 flex flex-wrap justify-center gap-2.5">
            <Chip>real-time transformer</Chip>
            <Chip>NMS-free</Chip>
            <Chip>100% on-device</Chip>
            <Chip>95% posture accuracy</Chip>
            <Chip>34 MB · runs in-browser</Chip>
          </div>
        </section>

        <section className="grid gap-5 sm:grid-cols-2">
          <Card
            icon="🧠"
            title="What RF-DETR is"
            body={
              <>
                A 2025 real-time <span className="text-bone">Detection Transformer</span> (the DETR family,
                from Roboflow). It localizes objects with end-to-end set prediction — no anchor boxes and{" "}
                <span className="text-bone">no non-max-suppression</span> to tune.
              </>
            }
          />
          <Card
            icon="🔒"
            title="Runs on your device"
            body={
              <>
                We exported the model to ONNX and run it client-side via{" "}
                <span className="text-bone">onnxruntime-web</span> — WebGPU on desktop, WASM on phones. Your
                camera frames <span className="text-bone">never leave your device</span>. No server, no upload.
              </>
            }
          />
          <Card
            icon="🐕🐕"
            title="Why NMS-free matters here"
            body={
              <>
                Because RF-DETR predicts a clean <span className="text-bone">set</span> of objects, it
                separates multiple dogs in frame without the merge/flicker that anchor+NMS detectors hit — so
                GoodBoy can verify each pup independently.
              </>
            }
          />
          <Card
            icon="🎯"
            title="Tuned for dogs"
            body={
              <>
                RF-DETR's self-supervised backbone adapts to new domains from little data. We fine-tuned the{" "}
                <span className="text-bone">Nano</span> variant on dog-posture images and reached{" "}
                <span className="text-bone">95% accuracy</span> on a held-out set of sit / down / stand.
              </>
            }
          />
        </section>

        <section className="mt-8 rounded-[2rem] border border-white/10 bg-gradient-to-br from-ink-800 to-ink-900 p-7 sm:p-10">
          <div className="font-mono text-xs uppercase tracking-[0.18em] text-ember-300">How we built it</div>
          <ol className="mt-5 space-y-4 text-[15px] leading-relaxed text-muted">
            <li>
              <span className="font-semibold text-bone">1. Auto-labeled data.</span> Ran a pretrained RF-DETR
              over an open dog-pose image set to draw each dog's box, then attached its pose label — a
              detection dataset with zero hand-annotation.
            </li>
            <li>
              <span className="font-semibold text-bone">2. Fine-tuned RF-DETR-Nano</span> on sit / down /
              stand to 95% test accuracy.
            </li>
            <li>
              <span className="font-semibold text-bone">3. Exported + quantized</span> to a 34 MB int8 ONNX —
              small enough to download once and cache in your browser.
            </li>
            <li>
              <span className="font-semibold text-bone">4. Shipped it client-side</span> so the trainer is
              free, private, and works with no backend.
            </li>
          </ol>
          <p className="mt-6 text-xs text-muted/70">
            Honest note: it's an MVP. Accuracy varies with breed, angle, and lighting — and your specific dog
            improves a lot with a short fine-tune. RF-DETR is open-source (Apache-2.0) by Roboflow.
          </p>
        </section>

        <section className="mt-10 text-center">
          <h2 className="font-display text-2xl font-semibold text-bone sm:text-3xl">See it for yourself.</h2>
          <div className="mt-5 flex flex-wrap justify-center gap-3">
            <Link
              href="/try"
              className="rounded-full bg-ember px-7 py-3.5 font-semibold text-ink-900 hover:bg-ember-300"
            >
              Try the live trainer — free
            </Link>
            <Link
              href="/#pricing"
              className="rounded-full border border-white/15 px-7 py-3.5 font-medium text-bone hover:border-white/30"
            >
              Founding access
            </Link>
          </div>
        </section>
      </main>

      <footer className="border-t border-white/10 bg-ink-900/60">
        <div className="mx-auto max-w-5xl px-5 py-7 text-center text-xs text-muted/80 sm:px-8">
          GoodBoy · built for the fivedevs hackathon · vision by RF-DETR
        </div>
      </footer>
    </div>
  );
}
