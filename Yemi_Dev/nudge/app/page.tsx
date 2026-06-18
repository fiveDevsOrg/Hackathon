"use client";

/**
 * Nudge — the AI copilot that points; you click.
 * --------------------------------------------------------------------------
 * Single page. A practice sandbox (fake "computer" of real clickable DOM) +
 * a guidance overlay that POINTS at the next thing to click. The user always
 * does the clicking — Nudge never clicks for them.
 *
 * Two modes:
 *   • Guided demo  — the local heuristic planner (always works, offline)
 *   • AI brain     — calls /api/guide (Claude Haiku); falls back to the
 *                    heuristic if no API key / non-200.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import Sandbox, { ScreenId } from "./components/Sandbox";
import Guide from "./components/Guide";
import Confetti from "./components/Confetti";
import {
  scanMarks,
  planNext,
  stepNumber,
  STEPS,
  type Mark,
  type Plan,
} from "./lib/engine";

type Mode = "guided" | "ai";

const TASK_DEFAULT = "Sign into a Google account";

export default function Page() {
  const [task, setTask] = useState(TASK_DEFAULT);
  const [mode, setMode] = useState<Mode>("guided");
  const [guiding, setGuiding] = useState(false);
  const [screen, setScreen] = useState<ScreenId>("desktop");
  const [plan, setPlan] = useState<Plan>({
    targetId: null,
    instruction: "",
    done: false,
  });
  const [history, setHistory] = useState<string[]>([]);
  const [clicks, setClicks] = useState(0);
  const [wrongClick, setWrongClick] = useState(false);
  const [aiNotice, setAiNotice] = useState(false); // shown when AI falls back
  const [thinking, setThinking] = useState(false);

  const wrongTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const historyRef = useRef<string[]>([]);
  historyRef.current = history;

  // Re-plan: read live marks, then either ask the AI brain or run the heuristic.
  const replan = useCallback(
    async (hist: string[]) => {
      const marks: Mark[] = scanMarks();

      if (mode === "ai") {
        setThinking(true);
        try {
          const res = await fetch("/api/guide", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ task, marks: stripRects(marks), history: hist }),
          });
          if (res.ok) {
            const data = (await res.json()) as Plan;
            setThinking(false);
            // Trust the AI's choice, but ensure the target actually exists.
            const present = new Set(marks.map((m) => m.id));
            if (data.done || (data.targetId && present.has(data.targetId))) {
              setAiNotice(false);
              setPlan(data);
              return;
            }
          }
          // Non-200, or AI named a missing target → fall back.
          setAiNotice(true);
        } catch {
          setAiNotice(true);
        }
        setThinking(false);
      }

      // Heuristic (default mode, or AI fallback).
      setPlan(planNext(task, marks, hist));
    },
    [mode, task],
  );

  // Start guiding from the current screen.
  const start = useCallback(() => {
    setGuiding(true);
    setClicks(0);
    setHistory([]);
    setWrongClick(false);
    setAiNotice(false);
    void replan([]);
  }, [replan]);

  // Restart back to the desktop.
  const restart = useCallback(() => {
    setScreen("desktop");
    setGuiding(false);
    setPlan({ targetId: null, instruction: "", done: false });
    setHistory([]);
    setClicks(0);
    setWrongClick(false);
    setAiNotice(false);
    setThinking(false);
  }, []);

  // Every click on a [data-nudge] target in the sandbox lands here.
  const onTargetClick = useCallback(
    (id: string) => {
      setClicks((c) => c + 1);

      if (!guiding) return;

      const expected = plan.targetId;
      if (expected && id !== expected) {
        // Wrong target — gentle correction, don't advance.
        setWrongClick(true);
        if (wrongTimer.current) clearTimeout(wrongTimer.current);
        wrongTimer.current = setTimeout(() => setWrongClick(false), 1600);
        return;
      }

      setWrongClick(false);
      const nextHistory = [...historyRef.current, id];
      setHistory(nextHistory);
      // The sandbox advances the screen on its own; wait a tick for the new
      // DOM to mount, then re-read marks and plan the next nudge.
      setTimeout(() => void replan(nextHistory), 90);
    },
    [guiding, plan.targetId, replan],
  );

  // Keep the overlay correct if the screen changes while guiding (e.g. an
  // auto-fill that resizes a field). Cheap re-plan on screen swaps.
  useEffect(() => {
    if (guiding && !plan.done) {
      const t = setTimeout(() => void replan(historyRef.current), 60);
      return () => clearTimeout(t);
    }
  }, [screen]); // eslint-disable-line react-hooks/exhaustive-deps

  const done = guiding && plan.done;
  const step = stepNumber(plan.targetId);

  return (
    <main className="bg-atmosphere relative min-h-screen overflow-x-hidden">
      <Confetti show={done} />

      {/* Header */}
      <header className="relative z-10 mx-auto max-w-5xl px-5 pt-8 sm:pt-12">
        <div className="reveal flex flex-col items-start gap-3">
          <span className="inline-flex items-center gap-2 rounded-full border border-ink-600 bg-ink-800/60 px-3 py-1 font-mono text-[10px] uppercase tracking-[0.22em] text-ember-300">
            <span className="h-1.5 w-1.5 animate-blink-rec rounded-full bg-ember" />
            guided overlay copilot
          </span>
          <h1 className="font-display text-3xl leading-[1.05] text-bone sm:text-5xl">
            🧭 <span className="text-gradient-ember">Nudge</span>
            <span className="text-bone/70"> — the AI copilot that </span>
            <span className="italic">points</span>
            <span className="text-bone/70">; you click.</span>
          </h1>
          <p className="max-w-2xl text-sm text-muted sm:text-base">
            It reads the screen, figures out the next step, and puts a glowing
            arrow on exactly what to tap. You stay in control of every click —
            the AI never clicks for you.
          </p>
        </div>
      </header>

      {/* Control bar */}
      <section
        className="reveal relative z-10 mx-auto mt-7 max-w-5xl px-5"
        style={{ animationDelay: "0.08s" }}
      >
        <div className="rounded-2xl border border-ink-600 bg-ink-800/55 p-4 backdrop-blur sm:p-5">
          {/* Task input + start */}
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <label className="flex-1">
              <span className="mb-1.5 block font-mono text-[10px] uppercase tracking-[0.2em] text-muted">
                What do you want to do?
              </span>
              <input
                value={task}
                onChange={(e) => setTask(e.target.value)}
                className="h-11 w-full rounded-xl border border-ink-600 bg-ink-900 px-3.5 text-sm text-bone outline-none transition placeholder:text-muted/70 focus:border-ember/60 focus:ring-2 focus:ring-ember/30"
                placeholder="Describe a task…"
                aria-label="Task to be guided through"
              />
            </label>
            <button
              type="button"
              onClick={guiding ? restart : start}
              className="h-11 shrink-0 rounded-xl bg-ember px-5 text-sm font-semibold text-ink-900 shadow-glow transition hover:bg-ember-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-bone"
            >
              {guiding ? "↺ Restart" : "▶ Start guiding"}
            </button>
          </div>

          {/* Preset chip + mode toggle */}
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted">
                preset
              </span>
              <button
                type="button"
                onClick={() => setTask(TASK_DEFAULT)}
                className={`rounded-full border px-3 py-1 text-xs transition ${
                  task === TASK_DEFAULT
                    ? "border-ember/60 bg-ember/15 text-ember-300"
                    : "border-ink-600 bg-ink-900 text-muted hover:border-ember/40"
                }`}
              >
                Sign into a Google account
              </button>
            </div>

            {/* Mode toggle */}
            <div
              className="inline-flex rounded-full border border-ink-600 bg-ink-900 p-0.5"
              role="group"
              aria-label="Guidance mode"
            >
              <button
                type="button"
                onClick={() => setMode("guided")}
                aria-pressed={mode === "guided"}
                className={`rounded-full px-3 py-1 text-xs font-medium transition ${
                  mode === "guided"
                    ? "bg-ember text-ink-900"
                    : "text-muted hover:text-bone"
                }`}
              >
                Guided demo
              </button>
              <button
                type="button"
                onClick={() => setMode("ai")}
                aria-pressed={mode === "ai"}
                className={`rounded-full px-3 py-1 text-xs font-medium transition ${
                  mode === "ai" ? "bg-ember text-ink-900" : "text-muted hover:text-bone"
                }`}
              >
                🧠 AI brain
              </button>
            </div>
          </div>

          {/* Status line */}
          <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-ink-600/60 pt-3 text-xs text-muted">
            <span>
              status:{" "}
              <span className={guiding ? "text-leaf" : "text-muted"}>
                {done ? "complete" : guiding ? "guiding" : "idle"}
              </span>
            </span>
            {guiding && !done && (
              <span className="font-mono text-ember-300">
                step {step} / {STEPS}
              </span>
            )}
            <span className="font-mono">clicks: {clicks}</span>
            {thinking && (
              <span className="text-sky">🧠 thinking…</span>
            )}
          </div>

          {aiNotice && (
            <p className="mt-2 rounded-lg border border-sky/30 bg-sky/5 px-3 py-2 text-[11px] text-sky/90">
              AI brain needs an API key — using the guided demo.
            </p>
          )}
        </div>
      </section>

      {/* Sandbox + idle prompt */}
      <section
        className="reveal relative z-10 mx-auto mt-7 max-w-5xl px-5 pb-4"
        style={{ animationDelay: "0.16s" }}
      >
        <Sandbox
          screen={screen}
          onScreenChange={setScreen}
          onTargetClick={onTargetClick}
        />

        {!guiding && (
          <p className="mt-4 text-center text-sm text-muted">
            Press{" "}
            <span className="font-semibold text-ember-300">▶ Start guiding</span>{" "}
            and follow the glowing arrow.
          </p>
        )}

        {done && (
          <div className="animate-fade-up mx-auto mt-5 max-w-md rounded-2xl border border-leaf/40 bg-leaf/10 px-5 py-4 text-center">
            <p className="font-display text-lg text-bone">
              🎉 You did it — Nudge guided you in {clicks}{" "}
              {clicks === 1 ? "click" : "clicks"}.
            </p>
            <button
              type="button"
              onClick={restart}
              className="mt-3 rounded-full border border-leaf/50 px-4 py-1.5 text-sm font-medium text-leaf transition hover:bg-leaf/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-leaf"
            >
              ↺ Run it again
            </button>
          </div>
        )}
      </section>

      {/* The overlay itself */}
      {guiding && !done && (
        <Guide
          targetId={plan.targetId}
          instruction={plan.instruction}
          step={step}
          totalSteps={STEPS}
          wrongClick={wrongClick}
        />
      )}

      {/* Footer */}
      <footer className="relative z-10 mx-auto mt-6 max-w-5xl px-5 pb-12">
        <div className="rounded-xl border border-ink-600/60 bg-ink-800/40 px-4 py-3 text-[12px] leading-relaxed text-muted">
          This is a safe practice sandbox — Nudge points, you click. The real
          product overlays your actual screen via a desktop app + on-device
          vision (RF-DETR); this MVP proves the guidance UX on a DOM sandbox.
        </div>
      </footer>
    </main>
  );
}

/** Drop rects before sending to the AI brain — it reasons over id/label/role. */
function stripRects(marks: Mark[]) {
  return marks.map(({ id, label, role }) => ({ id, label, role }));
}
