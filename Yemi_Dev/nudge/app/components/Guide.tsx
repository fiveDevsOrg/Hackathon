"use client";

/**
 * Guide — the guidance overlay.
 * --------------------------------------------------------------------------
 * Given the active `targetId`, this renders a fixed, pointer-events-none layer
 * over the whole viewport containing:
 *   • a ghost cursor (SVG arrow) that glides to the CENTER of the target
 *   • a pulsing highlight ring around the target's bounding rect
 *   • a tooltip bubble near the target with the instruction + "Step N of M"
 *
 * Positions are recomputed from getBoundingClientRect via a ResizeObserver
 * (target + document body) AND a light rAF loop, so the overlay tracks the
 * target across screen swaps, scrolling, and window resizing. The user always
 * clicks the REAL element underneath — this layer never intercepts clicks.
 *
 * Respects prefers-reduced-motion: the cursor glide transition is disabled.
 */

import { useEffect, useRef, useState } from "react";

type Rect = { top: number; left: number; width: number; height: number };

export type GuideProps = {
  /** data-nudge id to point at; null hides the overlay */
  targetId: string | null;
  instruction: string;
  step: number;
  totalSteps: number;
  /** Briefly true after a wrong click, to show the correction toast */
  wrongClick?: boolean;
};

function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReduced(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);
  return reduced;
}

export default function Guide({
  targetId,
  instruction,
  step,
  totalSteps,
  wrongClick = false,
}: GuideProps) {
  const [rect, setRect] = useState<Rect | null>(null);
  const [vw, setVw] = useState(0);
  const [vh, setVh] = useState(0);
  const rafRef = useRef<number | null>(null);
  const reduced = usePrefersReducedMotion();

  // Track the target's live position. We re-measure on a rAF loop (cheap: a
  // single getBoundingClientRect) plus ResizeObserver, so the overlay stays
  // glued to the element through screen swaps, scrolls, and resizes.
  useEffect(() => {
    if (!targetId) {
      setRect(null);
      return;
    }

    let cancelled = false;

    const measure = () => {
      if (cancelled) return;
      const el = document.querySelector<HTMLElement>(
        `[data-nudge="${targetId}"]`,
      );
      if (el) {
        const r = el.getBoundingClientRect();
        if (r.width > 0 && r.height > 0) {
          setRect((prev) => {
            if (
              prev &&
              prev.top === r.top &&
              prev.left === r.left &&
              prev.width === r.width &&
              prev.height === r.height
            ) {
              return prev; // no change — avoid re-render churn
            }
            return { top: r.top, left: r.left, width: r.width, height: r.height };
          });
        }
      } else {
        setRect(null);
      }
      setVw(window.innerWidth);
      setVh(window.innerHeight);
      rafRef.current = window.requestAnimationFrame(measure);
    };

    rafRef.current = window.requestAnimationFrame(measure);

    const ro = new ResizeObserver(() => {
      /* measure() runs each frame; the observer just guarantees a tick after layout */
    });
    ro.observe(document.body);

    return () => {
      cancelled = true;
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      ro.disconnect();
    };
  }, [targetId]);

  if (!targetId || !rect) return null;

  const cx = rect.left + rect.width / 2;
  const cy = rect.top + rect.height / 2;

  // Tooltip placement: prefer below the target; flip above if it'd overflow.
  const TOOLTIP_W = 248;
  const placeBelow = rect.top + rect.height + 92 < vh;
  const bubbleTop = placeBelow
    ? rect.top + rect.height + 16
    : Math.max(12, rect.top - 96);
  let bubbleLeft = cx - TOOLTIP_W / 2;
  bubbleLeft = Math.max(12, Math.min(bubbleLeft, vw - TOOLTIP_W - 12));

  // Ring is sized to the target with a little breathing room.
  const PAD = 6;
  const ringTop = rect.top - PAD;
  const ringLeft = rect.left - PAD;
  const ringW = rect.width + PAD * 2;
  const ringH = rect.height + PAD * 2;

  return (
    <div
      aria-hidden="true"
      className="pointer-events-none fixed inset-0 z-50"
      data-testid="nudge-overlay"
    >
      {/* Pulsing highlight ring around the target */}
      <div
        className={`absolute rounded-xl ${
          reduced ? "" : "animate-ring-pulse"
        }`}
        style={{
          top: ringTop,
          left: ringLeft,
          width: ringW,
          height: ringH,
          boxShadow: reduced
            ? "0 0 0 2px rgba(255,138,94,0.95), 0 0 26px -2px rgba(255,107,53,0.7)"
            : undefined,
          transition: reduced
            ? "none"
            : "top .45s cubic-bezier(.22,1,.36,1), left .45s cubic-bezier(.22,1,.36,1), width .45s cubic-bezier(.22,1,.36,1), height .45s cubic-bezier(.22,1,.36,1)",
        }}
      />

      {/* Ghost cursor — glides to the center of the target */}
      <div
        className="absolute"
        style={{
          top: 0,
          left: 0,
          transform: `translate3d(${cx - 4}px, ${cy - 2}px, 0)`,
          transition: reduced
            ? "none"
            : "transform .55s cubic-bezier(.22,1,.36,1)",
          willChange: "transform",
        }}
      >
        <div className={reduced ? "" : "animate-cursor-tap"}>
          <svg
            width="30"
            height="34"
            viewBox="0 0 30 34"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            style={{
              filter:
                "drop-shadow(0 4px 10px rgba(0,0,0,0.55)) drop-shadow(0 0 8px rgba(255,107,53,0.55))",
            }}
          >
            <path
              d="M4 2 L4 27 L11 21 L15.5 31 L20 29 L15.5 19 L24 19 Z"
              fill="#FF6B35"
              stroke="#F6EFE4"
              strokeWidth="1.6"
              strokeLinejoin="round"
            />
          </svg>
        </div>
      </div>

      {/* Tooltip bubble */}
      <div
        className="absolute animate-bubble-in"
        style={{ top: bubbleTop, left: bubbleLeft, width: TOOLTIP_W }}
        key={`${targetId}-${step}`}
      >
        <div className="rounded-2xl border border-ember/40 bg-ink-800/95 px-4 py-3 shadow-glow backdrop-blur">
          <div className="mb-1 flex items-center gap-2">
            <span className="text-base leading-none">🧭</span>
            <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-ember-300">
              Step {step} of {totalSteps}
            </span>
          </div>
          <p className="text-[13px] leading-snug text-bone">{instruction}</p>
        </div>
        {/* little pointer notch toward the target (decorative) */}
        <div
          className="absolute h-3 w-3 rotate-45 border-ember/40 bg-ink-800"
          style={
            placeBelow
              ? { top: -6, left: Math.min(Math.max(cx - bubbleLeft - 6, 14), TOOLTIP_W - 22), borderTop: "1px solid", borderLeft: "1px solid" }
              : { bottom: -6, left: Math.min(Math.max(cx - bubbleLeft - 6, 14), TOOLTIP_W - 22), borderBottom: "1px solid", borderRight: "1px solid" }
          }
        />
      </div>

      {/* Wrong-click correction toast */}
      {wrongClick && (
        <div
          className="animate-shake-x absolute left-1/2 top-5 -translate-x-1/2 rounded-full border border-ember/50 bg-ink-800/95 px-4 py-2 text-[12px] font-medium text-ember-300 shadow-glow backdrop-blur"
          role="status"
        >
          Not that one — click the highlighted spot.
        </div>
      )}
    </div>
  );
}
