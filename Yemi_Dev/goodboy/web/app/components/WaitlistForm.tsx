"use client";

import { useState } from "react";

type Status = "idle" | "loading" | "success" | "error";

export default function WaitlistForm() {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [message, setMessage] = useState("");

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (status === "loading") return;
    setStatus("loading");
    setMessage("");

    try {
      const res = await fetch("/api/waitlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const data = (await res.json()) as { ok: boolean; error?: string };

      if (res.ok && data.ok) {
        setStatus("success");
      } else {
        setStatus("error");
        setMessage(data.error || "Something went wrong. Try again.");
      }
    } catch {
      setStatus("error");
      setMessage("Network hiccup — please try again.");
    }
  }

  if (status === "success") {
    return (
      <div
        className="flex flex-col items-center gap-3 rounded-2xl border border-leaf/30 bg-leaf/10 px-6 py-8 text-center"
        role="status"
        aria-live="polite"
      >
        <div className="grid h-14 w-14 place-items-center rounded-full bg-leaf/20 text-3xl animate-pop-badge">
          🦴
        </div>
        <h3 className="font-display text-2xl font-semibold text-bone">
          You&rsquo;re on the list!
        </h3>
        <p className="max-w-sm text-sm text-muted">
          Good human. We&rsquo;ll email{" "}
          <span className="font-medium text-bone">{email}</span> the moment your
          founding spot opens. Keep the treats handy.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="w-full" noValidate>
      <div className="flex flex-col gap-3 sm:flex-row">
        <div className="relative flex-1">
          <input
            type="email"
            inputMode="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => {
              setEmail(e.target.value);
              if (status === "error") setStatus("idle");
            }}
            placeholder="you@goodhuman.com"
            aria-label="Email address"
            aria-invalid={status === "error"}
            className="w-full rounded-xl border border-white/12 bg-ink-800/70 px-4 py-3.5 text-base text-bone placeholder:text-muted/70 outline-none transition focus:border-ember/60 focus:ring-2 focus:ring-ember/25"
          />
        </div>
        <button
          type="submit"
          disabled={status === "loading"}
          className="shrink-0 rounded-xl bg-ember px-6 py-3.5 text-base font-semibold text-ink-900 shadow-[0_10px_30px_-10px_rgba(255,107,53,0.8)] transition-transform hover:-translate-y-0.5 hover:bg-ember-300 disabled:cursor-not-allowed disabled:opacity-70"
        >
          {status === "loading" ? "Saving…" : "Join the waitlist"}
        </button>
      </div>
      <p
        className={`mt-2.5 min-h-[1.25rem] text-sm ${
          status === "error" ? "text-ember-300" : "text-muted"
        }`}
        aria-live="polite"
      >
        {status === "error"
          ? message
          : "No spam. Just a heads-up when founding spots open."}
      </p>
    </form>
  );
}
