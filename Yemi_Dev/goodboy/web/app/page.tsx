import Nav from "./components/Nav";
import TrainerMock from "./components/TrainerMock";
import WaitlistForm from "./components/WaitlistForm";
import Faq from "./components/Faq";

// A real Stripe Payment Link gets swapped in here later. All "$7" CTAs point to it.
const STRIPE_LINK = "#";

export default function Home() {
  return (
    <div id="top" className="relative min-h-screen overflow-x-clip bg-atmosphere">
      {/* subtle paw-dot grid overlay */}
      <div className="pointer-events-none absolute inset-0 bg-dotgrid opacity-60" />
      {/* film grain */}
      <div className="pointer-events-none absolute inset-0 bg-grain opacity-[0.04] mix-blend-soft-light" />

      <Nav ctaHref={STRIPE_LINK} />

      <main className="relative">
        {/* ============================== HERO ============================== */}
        <section className="mx-auto max-w-6xl px-5 pb-16 pt-28 sm:px-8 sm:pt-36 lg:pb-24 lg:pt-40">
          <div className="grid items-center gap-12 lg:grid-cols-[1.05fr_0.95fr] lg:gap-10">
            {/* Left: copy */}
            <div>
              <span
                className="reveal inline-flex items-center gap-2 rounded-full border border-ember/30 bg-ember/10 px-3.5 py-1.5 text-xs font-medium text-ember-300"
                style={{ animationDelay: "0.05s" }}
              >
                <span className="h-1.5 w-1.5 rounded-full bg-ember animate-blink-rec" />
                Founding access — 50% off for life
              </span>

              <h1
                className="reveal mt-6 font-display text-[2.6rem] font-semibold leading-[1.02] tracking-tight text-bone sm:text-6xl lg:text-[4.1rem]"
                style={{ animationDelay: "0.12s" }}
              >
                Train your dog at home.{" "}
                <span className="text-gradient-ember italic">
                  The AI checks its work.
                </span>
              </h1>

              <p
                className="reveal mt-6 max-w-xl text-lg leading-relaxed text-muted"
                style={{ animationDelay: "0.2s" }}
              >
                Point your phone at your dog. GoodBoy calls{" "}
                <span className="font-mono text-bone">“SIT,”</span> watches with
                a state-of-the-art vision model, and{" "}
                <span className="text-bone">verifies your pup actually did it</span>
                {" "}— scoring every rep like a tireless clicker-trainer. No $90
                sessions required.
              </p>

              <div
                className="reveal mt-8 flex flex-col gap-3 sm:flex-row sm:items-center"
                style={{ animationDelay: "0.28s" }}
              >
                <a
                  href={STRIPE_LINK}
                  className="group inline-flex items-center justify-center gap-2 rounded-full bg-ember px-7 py-4 text-base font-semibold text-ink-900 shadow-glow transition-transform hover:-translate-y-0.5 hover:bg-ember-300"
                >
                  Lock founding access — $7
                  <svg
                    width="18"
                    height="18"
                    viewBox="0 0 24 24"
                    fill="none"
                    className="transition-transform group-hover:translate-x-1"
                  >
                    <path
                      d="M5 12h14M13 6l6 6-6 6"
                      stroke="currentColor"
                      strokeWidth="2.2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </a>
                <a
                  href="#see"
                  className="inline-flex items-center justify-center gap-2 rounded-full border border-white/15 bg-white/[0.03] px-7 py-4 text-base font-medium text-bone transition-colors hover:border-white/30 hover:bg-white/[0.06]"
                >
                  <span aria-hidden>▶</span> See it work
                </a>
              </div>

              <p
                className="reveal mt-5 text-sm text-muted/80"
                style={{ animationDelay: "0.34s" }}
              >
                <span className="text-bone">$7 refundable deposit</span> · locks
                you in at <span className="text-bone">$6/mo for life</span> ·
                cancel anytime
              </p>
            </div>

            {/* Right: live trainer mock */}
            <div
              className="reveal relative"
              style={{ animationDelay: "0.4s" }}
            >
              {/* glow puddle behind frame */}
              <div className="absolute left-1/2 top-1/2 -z-10 h-[420px] w-[420px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-ember/15 blur-[90px]" />
              <TrainerMock />
            </div>
          </div>
        </section>

        {/* ========================== TRUST STRIP ========================== */}
        <section
          aria-label="Technology"
          className="border-y border-white/10 bg-ink-900/50"
        >
          <div className="mx-auto flex max-w-6xl flex-col items-center gap-4 px-5 py-6 sm:flex-row sm:justify-between sm:px-8">
            <p className="text-center text-sm text-muted sm:text-left">
              Runs on a{" "}
              <span className="font-medium text-bone">
                state-of-the-art real-time vision model
              </span>{" "}
              <span className="font-mono text-ember-300">(RF-DETR)</span>.
            </p>
            <div className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2 font-mono text-[11px] uppercase tracking-[0.16em] text-muted/80">
              <span>On-device</span>
              <span className="text-white/15">·</span>
              <span>Real-time</span>
              <span className="text-white/15">·</span>
              <span>2025 SOTA detector</span>
              <span className="text-white/15">·</span>
              <span>Private by default</span>
            </div>
          </div>
        </section>

        {/* ============================ PROBLEM ============================ */}
        <section className="mx-auto max-w-6xl px-5 py-20 sm:px-8 lg:py-28">
          <div className="grid gap-10 lg:grid-cols-[0.9fr_1.1fr] lg:gap-16">
            <div>
              <SectionKicker>The problem</SectionKicker>
              <h2 className="mt-4 font-display text-3xl font-semibold leading-tight text-bone sm:text-[2.6rem]">
                Training a dog alone is{" "}
                <span className="italic text-ember-300">guesswork</span>.
              </h2>
            </div>
            <div className="grid gap-5 sm:grid-cols-3">
              <ProblemCard
                emoji="💸"
                title="Pros are pricey"
                body="A certified trainer runs $75–100 a session. Most new owners can’t book that every week."
              />
              <ProblemCard
                emoji="🤷"
                title="Books don’t watch"
                body="YouTube and PDFs tell you what to do — but never tell you if your dog actually did it right."
              />
              <ProblemCard
                emoji="📵"
                title="Apps can’t tell"
                body="Generic pet apps see “a dog.” They can’t tell a real sit from a wiggly almost-sit."
              />
            </div>
          </div>
        </section>

        {/* ========================== HOW IT WORKS ========================= */}
        <section id="how" className="relative scroll-mt-24">
          <div className="mx-auto max-w-6xl px-5 py-20 sm:px-8 lg:py-28">
            <div className="mx-auto max-w-2xl text-center">
              <SectionKicker center>How it works</SectionKicker>
              <h2 className="mt-4 font-display text-3xl font-semibold text-bone sm:text-[2.8rem]">
                Three steps to a{" "}
                <span className="text-gradient-ember">very good boy</span>.
              </h2>
              <p className="mt-4 text-muted">
                No equipment, no setup. Just you, your camera, and a pocket of
                treats.
              </p>
            </div>

            <div className="mt-14 grid gap-6 md:grid-cols-3">
              <StepCard
                n="01"
                title="Pick a command"
                body="Choose what you’re working on today — sit, down, stand, or stay — and GoodBoy queues the cue."
                icon={<IconTarget />}
              />
              <StepCard
                n="02"
                title="Show your dog"
                body="Prop your phone or laptop so your pup is in frame. GoodBoy speaks the cue and starts watching."
                icon={<IconCamera />}
              />
              <StepCard
                n="03"
                title="Get verified + scored"
                body="The instant your dog nails it, you get a green ✓, a confidence score, and points toward the streak."
                icon={<IconCheckBadge />}
                highlight
              />
            </div>
          </div>
        </section>

        {/* ========================== SEE IT WORK ========================= */}
        <section id="see" className="relative scroll-mt-24">
          <div className="mx-auto max-w-6xl px-5 py-20 sm:px-8 lg:py-28">
            <div className="grid items-center gap-10 lg:grid-cols-[0.9fr_1.1fr] lg:gap-14">
              <div>
                <SectionKicker>See it work</SectionKicker>
                <h2 className="mt-4 font-display text-3xl font-semibold leading-tight text-bone sm:text-[2.6rem]">
                  Real dogs.{" "}
                  <span className="text-gradient-ember italic">Real verdicts.</span>
                </h2>
                <p className="mt-5 max-w-lg text-lg leading-relaxed text-muted">
                  This is the actual GoodBoy model running on dogs it has never
                  seen — calling{" "}
                  <span className="font-semibold text-leaf">sit</span>,{" "}
                  <span className="font-semibold text-sky">down</span>, and{" "}
                  <span className="font-semibold text-ember-300">stand</span>{" "}
                  with a live confidence score.
                </p>
                <div className="mt-7 flex flex-wrap gap-x-6 gap-y-2 font-mono text-[12px] uppercase tracking-[0.14em] text-muted/80">
                  <span><span className="text-bone">95%</span> posture accuracy</span>
                  <span className="text-white/15">·</span>
                  <span><span className="text-bone">real-time</span> on one GPU</span>
                  <span className="text-white/15">·</span>
                  <span>held-out test set</span>
                </div>
              </div>
              <div className="relative">
                <div className="absolute left-1/2 top-1/2 -z-10 h-[360px] w-[360px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-ember/15 blur-[90px]" />
                <div className="overflow-hidden rounded-3xl border border-white/12 bg-ink-900 shadow-card">
                  <div className="flex items-center gap-2 border-b border-white/10 bg-ink-800/60 px-4 py-2.5">
                    <span className="h-2.5 w-2.5 rounded-full bg-ember animate-blink-rec" />
                    <span className="font-mono text-[11px] uppercase tracking-[0.16em] text-muted">
                      GoodBoy · live verify
                    </span>
                  </div>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src="/demo.gif"
                    alt="GoodBoy verifying real dogs performing sit, down, and stand"
                    className="block w-full"
                  />
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ========================= DIFFERENTIATOR ======================= */}
        <section className="mx-auto max-w-6xl px-5 py-20 sm:px-8 lg:py-28">
          <div className="relative overflow-hidden rounded-[2rem] border border-white/10 bg-gradient-to-br from-ink-800 to-ink-900 px-6 py-12 shadow-card sm:px-12 lg:py-16">
            <div className="pointer-events-none absolute -right-20 -top-24 h-72 w-72 rounded-full bg-ember/15 blur-[80px]" />
            <div className="relative grid items-center gap-10 lg:grid-cols-[1.15fr_0.85fr]">
              <div>
                <SectionKicker>Why GoodBoy is different</SectionKicker>
                <h2 className="mt-4 font-display text-3xl font-semibold leading-tight text-bone sm:text-[2.6rem]">
                  Most dog apps just see{" "}
                  <span className="text-muted line-through decoration-ember/60">
                    a dog
                  </span>
                  .
                </h2>
                <p className="mt-5 max-w-xl text-lg leading-relaxed text-muted">
                  GoodBoy knows{" "}
                  <span className="font-semibold text-leaf">sit</span> vs{" "}
                  <span className="font-semibold text-sky">down</span> vs{" "}
                  <span className="font-semibold text-ember-300">stand</span> —
                  and tells you the{" "}
                  <span className="text-bone">instant your pup gets it right</span>.
                </p>
                <p className="mt-5 max-w-xl text-[15px] leading-relaxed text-muted/90">
                  It’s powered by{" "}
                  <span className="font-mono text-bone">RF-DETR</span>, a 2025
                  state-of-the-art real-time detection model. That’s the
                  difference between an app that nods along and a trainer that
                  actually grades the rep.
                </p>
              </div>

              {/* Pose comparison chips */}
              <div className="grid grid-cols-3 gap-3">
                <PoseChip label="SIT" score="0.92" color="leaf" active />
                <PoseChip label="DOWN" score="0.04" color="muted" />
                <PoseChip label="STAND" score="0.04" color="muted" />
                <div className="col-span-3 rounded-2xl border border-white/10 bg-ink-900/60 p-4">
                  <div className="mb-2 flex items-center justify-between font-mono text-[11px] uppercase tracking-[0.14em] text-muted">
                    <span>Model confidence</span>
                    <span className="text-leaf">verified</span>
                  </div>
                  <div className="h-2.5 w-full overflow-hidden rounded-full bg-white/8">
                    <div className="h-full w-[92%] rounded-full bg-gradient-to-r from-leaf/70 to-leaf" />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ============================ PRICING =========================== */}
        <section id="pricing" className="relative scroll-mt-24">
          <div className="mx-auto max-w-6xl px-5 py-20 sm:px-8 lg:py-28">
            <div className="mx-auto max-w-2xl text-center">
              <SectionKicker center>Founding offer</SectionKicker>
              <h2 className="mt-4 font-display text-3xl font-semibold text-bone sm:text-[2.8rem]">
                One price. <span className="text-gradient-ember">Locked for life.</span>
              </h2>
              <p className="mt-4 text-muted">
                A $7 refundable deposit holds your founding rate before public
                launch. That’s less than one treat-bag.
              </p>
            </div>

            <div className="mx-auto mt-12 max-w-md">
              <div className="relative overflow-hidden rounded-3xl border border-ember/30 bg-ink-800/70 p-7 shadow-glow sm:p-9">
                <div className="pointer-events-none absolute -right-16 -top-16 h-48 w-48 rounded-full bg-ember/20 blur-[60px]" />

                <div className="relative">
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-ember px-3 py-1 text-xs font-bold uppercase tracking-wide text-ink-900">
                    🐾 Founding member — 50% off for life
                  </span>

                  <div className="mt-6 flex items-end gap-3">
                    <span className="font-display text-6xl font-semibold leading-none text-bone">
                      $6
                    </span>
                    <span className="pb-2 text-lg text-muted">/mo</span>
                    <span className="pb-2.5 font-mono text-lg text-muted line-through decoration-ember/60">
                      $12/mo
                    </span>
                  </div>
                  <p className="mt-1.5 text-sm text-ember-300">
                    That rate never goes up. Ever.
                  </p>

                  <ul className="mt-7 space-y-3 text-[15px] text-bone/90">
                    {[
                      "AI-verified reps for sit, down, stand & stay",
                      "Confidence score + streak on every session",
                      "On-device, private video — nothing uploaded",
                      "New commands added free as the model grows",
                      "Founding-member badge & priority on new features",
                    ].map((f) => (
                      <li key={f} className="flex items-start gap-3">
                        <span className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full bg-leaf/15 text-leaf">
                          <svg width="11" height="11" viewBox="0 0 24 24" fill="none">
                            <path
                              d="M20 6 9 17l-5-5"
                              stroke="currentColor"
                              strokeWidth="3"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            />
                          </svg>
                        </span>
                        {f}
                      </li>
                    ))}
                  </ul>

                  <a
                    href={STRIPE_LINK}
                    className="mt-8 flex w-full items-center justify-center gap-2 rounded-2xl bg-ember px-6 py-4 text-base font-semibold text-ink-900 shadow-[0_14px_36px_-12px_rgba(255,107,53,0.9)] transition-transform hover:-translate-y-0.5 hover:bg-ember-300"
                  >
                    Lock founding access — $7
                  </a>
                  <p className="mt-3 text-center text-xs text-muted">
                    $7 refundable deposit · fully refunded if you’re not in.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ========================= WAITLIST CAPTURE ===================== */}
        <section className="mx-auto max-w-6xl px-5 pb-20 sm:px-8 lg:pb-28">
          <div className="relative overflow-hidden rounded-[2rem] border border-white/10 bg-gradient-to-br from-ember/15 via-ink-800 to-ink-900 px-6 py-12 sm:px-12 lg:py-16">
            <div className="pointer-events-none absolute -left-20 bottom-0 h-64 w-64 rounded-full bg-ember/20 blur-[90px]" />
            <div className="relative mx-auto max-w-xl text-center">
              <span className="text-4xl animate-float-soft inline-block">🐕</span>
              <h2 className="mt-4 font-display text-3xl font-semibold text-bone sm:text-4xl">
                Not ready for the deposit?
              </h2>
              <p className="mx-auto mt-3 max-w-md text-muted">
                Get on the founding waitlist. We’ll hold a spot and ping you the
                second the first cohort opens.
              </p>
              <div className="mx-auto mt-8 max-w-lg text-left">
                <WaitlistForm />
              </div>
            </div>
          </div>
        </section>

        {/* ============================== FAQ ============================= */}
        <section className="mx-auto max-w-6xl px-5 py-12 sm:px-8 lg:py-16">
          <div className="mx-auto max-w-2xl text-center">
            <SectionKicker center>Questions</SectionKicker>
            <h2 className="mt-4 font-display text-3xl font-semibold text-bone sm:text-[2.6rem]">
              Good questions, good answers.
            </h2>
          </div>
          <div className="mt-12">
            <Faq />
          </div>
        </section>

        {/* ============================ FINAL CTA ========================= */}
        <section className="mx-auto max-w-6xl px-5 py-16 sm:px-8 lg:py-24">
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="font-display text-3xl font-semibold leading-tight text-bone sm:text-[3rem]">
              Your dog is ready to be{" "}
              <span className="text-gradient-ember italic">a good boy</span>.
            </h2>
            <p className="mt-4 text-lg text-muted">
              Lock your founding rate before public launch. $7, refundable, gone
              in two clicks.
            </p>
            <a
              href={STRIPE_LINK}
              className="mt-8 inline-flex items-center justify-center gap-2 rounded-full bg-ember px-8 py-4 text-base font-semibold text-ink-900 shadow-glow transition-transform hover:-translate-y-0.5 hover:bg-ember-300"
            >
              Lock founding access — $7
            </a>
          </div>
        </section>
      </main>

      {/* ============================== FOOTER ========================== */}
      <footer className="border-t border-white/10 bg-ink-900/60">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 px-5 py-8 sm:flex-row sm:px-8">
          <div className="flex items-center gap-2 font-display text-base font-semibold">
            <span className="text-lg">🐕</span>
            <span>
              Good<span className="text-gradient-ember">Boy</span>
            </span>
            <span className="ml-2 text-sm font-sans font-normal text-muted">
              · built for the fivedevs hackathon
            </span>
          </div>
          <p className="text-center text-xs text-muted/80 sm:text-right">
            © {new Date().getFullYear()} GoodBoy. Treats not included. Always
            train with kindness.
          </p>
        </div>
      </footer>
    </div>
  );
}

/* ----------------------------- small bits ----------------------------- */

function SectionKicker({
  children,
  center,
}: {
  children: React.ReactNode;
  center?: boolean;
}) {
  return (
    <div
      className={`flex items-center gap-2.5 ${center ? "justify-center" : ""}`}
    >
      <span className="h-px w-8 bg-ember/60" />
      <span className="font-mono text-xs uppercase tracking-[0.22em] text-ember-300">
        {children}
      </span>
    </div>
  );
}

function ProblemCard({
  emoji,
  title,
  body,
}: {
  emoji: string;
  title: string;
  body: string;
}) {
  return (
    <div className="rounded-2xl border border-white/10 bg-ink-800/40 p-5 transition-colors hover:border-white/20">
      <span className="text-2xl">{emoji}</span>
      <h3 className="mt-3 font-display text-lg font-semibold text-bone">
        {title}
      </h3>
      <p className="mt-1.5 text-sm leading-relaxed text-muted">{body}</p>
    </div>
  );
}

function StepCard({
  n,
  title,
  body,
  icon,
  highlight,
}: {
  n: string;
  title: string;
  body: string;
  icon: React.ReactNode;
  highlight?: boolean;
}) {
  return (
    <div
      className={`group relative overflow-hidden rounded-3xl border p-7 transition-all duration-300 hover:-translate-y-1 ${
        highlight
          ? "border-ember/40 bg-gradient-to-b from-ember/10 to-ink-800/50 shadow-glow"
          : "border-white/10 bg-ink-800/40 hover:border-white/20"
      }`}
    >
      <div className="flex items-center justify-between">
        <span
          className={`grid h-12 w-12 place-items-center rounded-2xl ${
            highlight ? "bg-ember/20 text-ember" : "bg-white/5 text-bone"
          }`}
        >
          {icon}
        </span>
        <span className="font-display text-4xl font-semibold text-white/8 transition-colors group-hover:text-white/15">
          {n}
        </span>
      </div>
      <h3 className="mt-5 font-display text-xl font-semibold text-bone">
        {title}
      </h3>
      <p className="mt-2 text-[15px] leading-relaxed text-muted">{body}</p>
    </div>
  );
}

function PoseChip({
  label,
  score,
  color,
  active,
}: {
  label: string;
  score: string;
  color: "leaf" | "sky" | "ember" | "muted";
  active?: boolean;
}) {
  const ring = active
    ? "border-leaf/50 bg-leaf/10"
    : "border-white/10 bg-ink-900/50";
  const text =
    color === "leaf"
      ? "text-leaf"
      : color === "sky"
        ? "text-sky"
        : color === "ember"
          ? "text-ember-300"
          : "text-muted";
  return (
    <div className={`rounded-2xl border p-4 text-center ${ring}`}>
      <div className="font-mono text-xs uppercase tracking-[0.12em] text-muted">
        {label}
      </div>
      <div className={`mt-1.5 font-display text-2xl font-semibold ${text}`}>
        {score}
      </div>
    </div>
  );
}

/* simple inline icons */
function IconTarget() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
      <circle cx="12" cy="12" r="8" stroke="currentColor" strokeWidth="2" />
      <circle cx="12" cy="12" r="3.4" stroke="currentColor" strokeWidth="2" />
      <circle cx="12" cy="12" r="0.6" fill="currentColor" />
    </svg>
  );
}
function IconCamera() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
      <path
        d="M3 8.5A2.5 2.5 0 0 1 5.5 6h1.2l1-1.6A1 1 0 0 1 8.5 4h7a1 1 0 0 1 .85.4l1 1.6h1.15A2.5 2.5 0 0 1 21 8.5v8A2.5 2.5 0 0 1 18.5 19h-13A2.5 2.5 0 0 1 3 16.5v-8Z"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinejoin="round"
      />
      <circle cx="12" cy="12.5" r="3.3" stroke="currentColor" strokeWidth="2" />
    </svg>
  );
}
function IconCheckBadge() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
      <path
        d="m12 2.5 2.2 1.6 2.7-.2 1 2.5 2.3 1.4-.5 2.7 1.4 2.3-1.4 2.3.5 2.7-2.3 1.4-1 2.5-2.7-.2L12 21.5l-2.2-1.6-2.7.2-1-2.5-2.3-1.4.5-2.7L2.4 11l1.4-2.3-.5-2.7 2.3-1.4 1-2.5 2.7.2L12 2.5Z"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
      <path
        d="m8.6 12.2 2.2 2.2 4.6-4.8"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
