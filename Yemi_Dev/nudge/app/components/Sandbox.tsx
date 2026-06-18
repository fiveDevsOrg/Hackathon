"use client";

/**
 * Sandbox — a fake "computer" rendered as real, same-origin, clickable DOM.
 * --------------------------------------------------------------------------
 * A framed device screen (~16/10) that swaps between SCREENS based on React
 * state. Every interactive target carries a `data-nudge="<id>"` attribute plus
 * visible text / aria-label — that's the set-of-mark the planner reasons over.
 *
 * Everything is CLICK-ONLY: fields auto-fill on click (no real typing needed),
 * so the whole flow is point-and-click and trivial to test. The parent owns
 * the current screen and is notified of every click via `onTargetClick`.
 */

import { useEffect, useState } from "react";

export type ScreenId =
  | "desktop"
  | "browser"
  | "google-email"
  | "google-pass"
  | "done";

export type SandboxProps = {
  screen: ScreenId;
  onScreenChange: (next: ScreenId) => void;
  /** Fired for every click on a [data-nudge] target, with its id. */
  onTargetClick: (id: string) => void;
};

const clock = () =>
  new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

export default function Sandbox({
  screen,
  onScreenChange,
  onTargetClick,
}: SandboxProps) {
  // Field "values" only appear after the user clicks them (auto-fill on click).
  const [addressFilled, setAddressFilled] = useState(false);
  const [emailFilled, setEmailFilled] = useState(false);
  const [passFilled, setPassFilled] = useState(false);
  const [time, setTime] = useState("");

  useEffect(() => {
    setTime(clock());
    const t = setInterval(() => setTime(clock()), 30_000);
    return () => clearInterval(t);
  }, []);

  // Reset transient field state whenever we return to the desktop.
  useEffect(() => {
    if (screen === "desktop") {
      setAddressFilled(false);
      setEmailFilled(false);
      setPassFilled(false);
    }
  }, [screen]);

  const tap = (id: string, fn?: () => void) => {
    onTargetClick(id);
    fn?.();
  };

  return (
    <div className="relative mx-auto w-full max-w-3xl">
      {/* Device bezel */}
      <div className="rounded-[1.6rem] border border-ink-600 bg-ink-700 p-2.5 shadow-card sm:p-3">
        {/* Screen */}
        <div className="relative aspect-[16/10] w-full overflow-hidden rounded-[1.1rem] bg-ink-900 ring-1 ring-inset ring-ink-600">
          {screen === "desktop" && (
            <DesktopScreen
              time={time}
              onOpenBrowser={() => tap("open-browser", () => onScreenChange("browser"))}
            />
          )}

          {screen === "browser" && (
            <BrowserScreen
              addressFilled={addressFilled}
              onAddressBar={() => tap("address-bar", () => setAddressFilled(true))}
              onGo={() => tap("go", () => onScreenChange("google-email"))}
            />
          )}

          {screen === "google-email" && (
            <GoogleEmailScreen
              emailFilled={emailFilled}
              onEmail={() => tap("email", () => setEmailFilled(true))}
              onNext={() => tap("email-next", () => onScreenChange("google-pass"))}
            />
          )}

          {screen === "google-pass" && (
            <GooglePassScreen
              passFilled={passFilled}
              onPassword={() => tap("password", () => setPassFilled(true))}
              onSignin={() => tap("signin", () => onScreenChange("done"))}
            />
          )}

          {screen === "done" && <DoneScreen />}
        </div>
      </div>

      {/* device "chin" label */}
      <div className="mt-3 text-center font-mono text-[10px] uppercase tracking-[0.3em] text-muted">
        practice sandbox · same-origin DOM
      </div>
    </div>
  );
}

/* ----------------------------------------------------------------------- */
/* Screen 1 — Desktop                                                       */
/* ----------------------------------------------------------------------- */
function DesktopScreen({
  time,
  onOpenBrowser,
}: {
  time: string;
  onOpenBrowser: () => void;
}) {
  return (
    <div className="relative flex h-full flex-col">
      {/* wallpaper */}
      <div
        className="absolute inset-0"
        style={{
          backgroundImage:
            "radial-gradient(40rem 30rem at 20% 0%, rgba(255,107,53,0.22), transparent 60%), radial-gradient(36rem 28rem at 100% 100%, rgba(91,192,235,0.14), transparent 55%), linear-gradient(160deg,#16140f,#0e0d0c)",
        }}
      />
      <div className="bg-dotgrid absolute inset-0 opacity-60" />

      {/* desktop label */}
      <div className="relative z-10 flex flex-1 items-center justify-center px-4 text-center">
        <div>
          <p className="font-display text-2xl italic text-bone/90 sm:text-3xl">
            Your desktop
          </p>
          <p className="mt-1 text-xs text-muted">
            Find the browser in the taskbar below.
          </p>
        </div>
      </div>

      {/* Taskbar */}
      <div className="relative z-10 flex items-center justify-between gap-2 border-t border-ink-600/70 bg-ink-800/80 px-3 py-2 backdrop-blur">
        <div className="flex items-center gap-2">
          {/* Start orb (decoy, not a nudge target) */}
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-ink-700 text-bone/60">
            <span className="text-sm">⊞</span>
          </div>

          {/* Browser icon — the nudge target */}
          <button
            type="button"
            data-nudge="open-browser"
            aria-label="Browser"
            onClick={onOpenBrowser}
            className="group flex h-9 items-center gap-2 rounded-lg bg-ink-700 px-2.5 text-bone transition hover:bg-ink-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-ember"
          >
            <BrowserGlyph />
            <span className="text-xs font-medium">Browser</span>
          </button>

          {/* Decoy apps */}
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-ink-700 text-bone/55">
            <span className="text-sm">📁</span>
          </div>
          <div className="hidden h-9 w-9 items-center justify-center rounded-lg bg-ink-700 text-bone/55 sm:flex">
            <span className="text-sm">✉️</span>
          </div>
        </div>
        <div className="font-mono text-[11px] tabular-nums text-muted">{time}</div>
      </div>
    </div>
  );
}

/* ----------------------------------------------------------------------- */
/* Screen 2 — Browser chrome                                                */
/* ----------------------------------------------------------------------- */
function BrowserScreen({
  addressFilled,
  onAddressBar,
  onGo,
}: {
  addressFilled: boolean;
  onAddressBar: () => void;
  onGo: () => void;
}) {
  return (
    <div className="flex h-full flex-col bg-ink-900">
      {/* tab + toolbar */}
      <div className="border-b border-ink-600/70 bg-ink-800/90 px-3 pt-2">
        <div className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full bg-ember/80" />
          <span className="h-2.5 w-2.5 rounded-full bg-leaf/70" />
          <span className="h-2.5 w-2.5 rounded-full bg-sky/70" />
          <div className="ml-3 flex h-7 items-center gap-2 rounded-t-lg bg-ink-900 px-3 text-[11px] text-bone/80">
            <BrowserGlyph small />
            New Tab
          </div>
        </div>

        {/* address bar row */}
        <div className="flex items-center gap-2 py-2">
          <span className="text-bone/40">‹</span>
          <span className="text-bone/40">›</span>
          <button
            type="button"
            data-nudge="address-bar"
            aria-label="Address bar"
            onClick={onAddressBar}
            className="flex h-9 flex-1 items-center gap-2 rounded-full border border-ink-600 bg-ink-700 px-3 text-left text-[13px] transition hover:border-ember/50 focus:outline-none focus-visible:ring-2 focus-visible:ring-ember"
          >
            <span className="text-bone/40">🔒</span>
            <span className={addressFilled ? "text-bone" : "text-muted"}>
              {addressFilled ? "accounts.google.com" : "Search or type a URL"}
            </span>
          </button>
          <button
            type="button"
            data-nudge="go"
            aria-label="Go"
            onClick={onGo}
            className="h-9 rounded-full bg-ember px-4 text-[13px] font-semibold text-ink-900 transition hover:bg-ember-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-bone"
          >
            Go
          </button>
        </div>
      </div>

      {/* viewport */}
      <div className="flex flex-1 items-center justify-center px-6 text-center">
        <div>
          <p className="font-display text-xl italic text-bone/80">
            {addressFilled ? "Ready to go." : "Where to?"}
          </p>
          <p className="mt-1 text-xs text-muted">
            {addressFilled
              ? "Hit Go to load the page."
              : "Click the address bar — we'll fill it in for you."}
          </p>
        </div>
      </div>
    </div>
  );
}

/* ----------------------------------------------------------------------- */
/* Screen 3 — Google "Sign in" (email)                                      */
/* ----------------------------------------------------------------------- */
function GoogleEmailScreen({
  emailFilled,
  onEmail,
  onNext,
}: {
  emailFilled: boolean;
  onEmail: () => void;
  onNext: () => void;
}) {
  return (
    <GoogleShell>
      <h2 className="font-display text-[22px] text-bone">Sign in</h2>
      <p className="mt-1 text-[13px] text-muted">to continue to your account</p>

      <button
        type="button"
        data-nudge="email"
        aria-label="Email or phone"
        onClick={onEmail}
        className="mt-6 flex h-12 w-full items-center rounded-lg border border-ink-600 bg-ink-900 px-3 text-left text-[14px] transition hover:border-ember/50 focus:outline-none focus-visible:ring-2 focus-visible:ring-ember"
      >
        <span className={emailFilled ? "text-bone" : "text-muted"}>
          {emailFilled ? "you@gmail.com" : "Email or phone"}
        </span>
      </button>

      <div className="mt-5 flex items-center justify-between">
        <span className="text-[13px] font-medium text-sky">Create account</span>
        <button
          type="button"
          data-nudge="email-next"
          aria-label="Next"
          onClick={onNext}
          className="rounded-full bg-ember px-6 py-2 text-[14px] font-semibold text-ink-900 transition hover:bg-ember-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-bone"
        >
          Next
        </button>
      </div>
    </GoogleShell>
  );
}

/* ----------------------------------------------------------------------- */
/* Screen 4 — Google password                                               */
/* ----------------------------------------------------------------------- */
function GooglePassScreen({
  passFilled,
  onPassword,
  onSignin,
}: {
  passFilled: boolean;
  onPassword: () => void;
  onSignin: () => void;
}) {
  return (
    <GoogleShell>
      <h2 className="font-display text-[22px] text-bone">Welcome</h2>
      <div className="mt-2 inline-flex items-center gap-2 rounded-full border border-ink-600 bg-ink-900 px-3 py-1 text-[12px] text-bone/80">
        <span className="flex h-4 w-4 items-center justify-center rounded-full bg-ember text-[9px] text-ink-900">
          Y
        </span>
        you@gmail.com
      </div>

      <button
        type="button"
        data-nudge="password"
        aria-label="Enter your password"
        onClick={onPassword}
        className="mt-6 flex h-12 w-full items-center rounded-lg border border-ink-600 bg-ink-900 px-3 text-left text-[14px] transition hover:border-ember/50 focus:outline-none focus-visible:ring-2 focus-visible:ring-ember"
      >
        <span className={passFilled ? "tracking-[0.3em] text-bone" : "text-muted"}>
          {passFilled ? "••••••••" : "Enter your password"}
        </span>
      </button>

      <div className="mt-5 flex items-center justify-between">
        <span className="text-[13px] font-medium text-sky">Forgot password?</span>
        <button
          type="button"
          data-nudge="signin"
          aria-label="Sign in"
          onClick={onSignin}
          className="rounded-full bg-ember px-6 py-2 text-[14px] font-semibold text-ink-900 transition hover:bg-ember-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-bone"
        >
          Sign in
        </button>
      </div>
    </GoogleShell>
  );
}

/* ----------------------------------------------------------------------- */
/* Screen 5 — Done                                                          */
/* ----------------------------------------------------------------------- */
function DoneScreen() {
  return (
    <div className="flex h-full items-center justify-center bg-gradient-to-b from-ink-800 to-ink-900 px-6 text-center">
      <div className="animate-pop-badge">
        <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-leaf/15 text-3xl ring-1 ring-leaf/40">
          🎉
        </div>
        <p className="font-display text-2xl text-bone">Signed in!</p>
        <p className="mt-1 text-[13px] text-muted">
          You followed every nudge, click by click.
        </p>
      </div>
    </div>
  );
}

/* ----------------------------------------------------------------------- */
/* Shared bits                                                              */
/* ----------------------------------------------------------------------- */
function GoogleShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-full items-center justify-center bg-gradient-to-b from-ink-800 to-ink-900 px-4 py-6">
      <div className="w-full max-w-[300px] rounded-2xl border border-ink-600 bg-ink-800/70 px-6 py-7 shadow-card">
        <div className="mb-4 flex justify-center">
          <GoogleWordmark />
        </div>
        {children}
      </div>
    </div>
  );
}

function GoogleWordmark() {
  // Stylized, non-trademark "G" mark to evoke a sign-in card.
  return (
    <div className="flex items-center gap-1 font-display text-lg tracking-tight">
      <span className="text-ember">G</span>
      <span className="text-sky">o</span>
      <span className="text-leaf">o</span>
      <span className="text-ember-300">g</span>
      <span className="text-sky">l</span>
      <span className="text-leaf">e</span>
    </div>
  );
}

function BrowserGlyph({ small = false }: { small?: boolean }) {
  const s = small ? 14 : 18;
  return (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="9" stroke="#FF8A5E" strokeWidth="1.8" />
      <circle cx="12" cy="12" r="3.4" fill="#5BC0EB" />
      <path d="M12 3 L12 8.6 M12 15.4 L12 21 M3 12 L8.6 12 M15.4 12 L21 12" stroke="#FF8A5E" strokeWidth="1.4" />
    </svg>
  );
}
