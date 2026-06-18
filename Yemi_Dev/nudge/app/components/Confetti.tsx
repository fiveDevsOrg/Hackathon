"use client";

/**
 * Confetti — a lightweight, dependency-free celebration burst.
 * Fixed, pointer-events-none. Disabled under prefers-reduced-motion.
 * Auto-clears after the burst falls away, and uses fill-mode:forwards so the
 * pieces hold their off-screen end state instead of snapping back to the top.
 */

import { useEffect, useMemo, useState } from "react";

const COLORS = ["#FF6B35", "#FF8A5E", "#7BD389", "#5BC0EB", "#F6EFE4"];
const MAX_LIFE_MS = 5200; // > max(delay 0.5s + duration 4.2s) — then unmount

export default function Confetti({ show }: { show: boolean }) {
  const [reduced, setReduced] = useState(false);
  const [active, setActive] = useState(false);

  useEffect(() => {
    setReduced(window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  }, []);

  // Run the burst when `show` flips true, then clear it so nothing lingers.
  useEffect(() => {
    if (!show) {
      setActive(false);
      return;
    }
    setActive(true);
    const t = setTimeout(() => setActive(false), MAX_LIFE_MS);
    return () => clearTimeout(t);
  }, [show]);

  const pieces = useMemo(
    () =>
      Array.from({ length: 70 }, (_, i) => ({
        id: i,
        left: Math.random() * 100,
        delay: Math.random() * 0.5,
        duration: 2.4 + Math.random() * 1.8,
        size: 6 + Math.random() * 8,
        color: COLORS[i % COLORS.length],
        rounded: Math.random() > 0.5,
      })),
    [],
  );

  if (!active || reduced) return null;

  return (
    <div className="pointer-events-none fixed inset-0 z-[60] overflow-hidden" aria-hidden="true">
      {pieces.map((p) => (
        <span
          key={p.id}
          className="absolute top-0 block"
          style={{
            left: `${p.left}%`,
            width: p.size,
            height: p.size * (p.rounded ? 1 : 1.6),
            background: p.color,
            borderRadius: p.rounded ? "9999px" : "2px",
            // `both` keeps the piece off-screen during the start delay AND after
            // it falls — so it's never a static bar parked at top:0.
            animation: `nudge-confetti-fall ${p.duration}s linear ${p.delay}s both`,
          }}
        />
      ))}
    </div>
  );
}
