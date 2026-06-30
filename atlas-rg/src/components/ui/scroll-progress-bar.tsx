import * as React from "react";
import { motion, useMotionValueEvent, useScroll, useTransform } from "framer-motion";

import { cn } from "@/lib/utils";

interface ScrollProgressBarProps {
  type?: "circle" | "bar";
  position?: "top-right" | "bottom-right" | "top-left" | "bottom-left" | "top" | "right" | "bottom" | "left";
  orientation?: "horizontal" | "vertical";
  color?: string;
  strokeSize?: number;
  showPercentage?: boolean;
}

export default function ScrollProgressBar({
  type = "bar",
  position = "top-right",
  orientation = "horizontal",
  color = "#18181b",
  strokeSize = 2,
  showPercentage = false,
}: ScrollProgressBarProps) {
  const { scrollYProgress } = useScroll();
  const scrollPercentage = useTransform(scrollYProgress, [0, 1], [0, 100]);
  const [percentage, setPercentage] = React.useState(0);
  const draggingRef = React.useRef(false);
  const positionClass = {
    "top-right": "right-0 top-0",
    "bottom-right": "bottom-0 right-0",
    "top-left": "left-0 top-0",
    "bottom-left": "bottom-0 left-0",
    top: "right-0 top-0",
    right: "right-0 top-0",
    bottom: "bottom-0 right-0",
    left: "left-0 top-0",
  }[position];

  useMotionValueEvent(scrollPercentage, "change", (latest) => {
    setPercentage(Math.round(latest));
  });

  const scrollToPointer = React.useCallback((clientY: number) => {
    const maxScroll = Math.max(0, document.documentElement.scrollHeight - window.innerHeight);
    const ratio = Math.min(1, Math.max(0, clientY / Math.max(1, window.innerHeight)));
    window.scrollTo({ top: maxScroll * ratio, behavior: "auto" });
  }, []);

  const scrollByRatio = React.useCallback((delta: number) => {
    const maxScroll = Math.max(0, document.documentElement.scrollHeight - window.innerHeight);
    const currentRatio = maxScroll ? window.scrollY / maxScroll : 0;
    window.scrollTo({ top: maxScroll * Math.min(1, Math.max(0, currentRatio + delta)), behavior: "auto" });
  }, []);

  React.useEffect(() => {
    if (orientation !== "vertical") return undefined;

    const handlePointerMove = (event: PointerEvent) => {
      if (!draggingRef.current) return;
      event.preventDefault();
      scrollToPointer(event.clientY);
    };
    const handlePointerUp = () => {
      draggingRef.current = false;
      document.body.style.userSelect = "";
    };

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);
    window.addEventListener("pointercancel", handlePointerUp);
    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
      window.removeEventListener("pointercancel", handlePointerUp);
      document.body.style.userSelect = "";
    };
  }, [orientation, scrollToPointer]);

  if (type === "bar") {
    if (orientation === "vertical") {
      const sideClass = position === "left" || position === "top-left" || position === "bottom-left"
        ? "left-0"
        : "right-0";
      return (
        <div
          className={cn("fixed inset-y-0 z-[2147483646] cursor-default bg-transparent", sideClass)}
          onPointerDown={(event) => {
            draggingRef.current = true;
            document.body.style.userSelect = "none";
            scrollToPointer(event.clientY);
          }}
          onKeyDown={(event) => {
            if (event.key === "ArrowDown") {
              event.preventDefault();
              scrollByRatio(0.05);
            }
            if (event.key === "ArrowUp") {
              event.preventDefault();
              scrollByRatio(-0.05);
            }
            if (event.key === "PageDown") {
              event.preventDefault();
              scrollByRatio(0.2);
            }
            if (event.key === "PageUp") {
              event.preventDefault();
              scrollByRatio(-0.2);
            }
            if (event.key === "Home") {
              event.preventDefault();
              window.scrollTo({ top: 0, behavior: "auto" });
            }
            if (event.key === "End") {
              event.preventDefault();
              window.scrollTo({ top: document.documentElement.scrollHeight, behavior: "auto" });
            }
          }}
          role="scrollbar"
          aria-label="Page scroll progress"
          aria-orientation="vertical"
          aria-valuemax={100}
          aria-valuemin={0}
          aria-valuenow={percentage}
          tabIndex={0}
          style={{ width: `${Math.max(12, strokeSize + 8)}px` }}
        >
          <motion.span
            className="absolute inset-y-0 block origin-top rounded-full"
            style={{
              backgroundColor: color,
              right: position === "left" || position === "top-left" || position === "bottom-left" ? "auto" : 0,
              left: position === "left" || position === "top-left" || position === "bottom-left" ? 0 : "auto",
              width: `${strokeSize + 2}px`,
              scaleY: scrollYProgress,
            }}
          />
          <span
            className="absolute rounded-full bg-zinc-950"
            style={{
              height: `${Math.max(14, strokeSize * 4)}px`,
              width: `${strokeSize + 2}px`,
              top: `calc(${percentage}% - ${Math.max(14, strokeSize * 4) / 2}px)`,
              right: position === "left" || position === "top-left" || position === "bottom-left" ? "auto" : 0,
              left: position === "left" || position === "top-left" || position === "bottom-left" ? 0 : "auto",
            }}
          />
        </div>
      );
    }

    const edgeClass = position === "bottom" || position === "bottom-left" || position === "bottom-right"
      ? "bottom-0"
      : "top-0";
    return (
      <div
        className={cn("pointer-events-none fixed inset-x-0 z-[2147483646] bg-transparent", edgeClass)}
        style={{ height: `${strokeSize + 2}px` }}
        aria-hidden="true"
      >
        <motion.span
          className="block h-full origin-left"
          style={{ backgroundColor: color, scaleX: scrollYProgress }}
        />
      </div>
    );
  }

  return (
    <div
      className={cn("pointer-events-none fixed z-[2147483646] flex items-center justify-center", positionClass)}
    >
      {percentage > 0 && (
        <>
          <svg width="100" height="100" viewBox="0 0 100 100">
            <circle cx="50" cy="50" r="30" fill="none" strokeWidth={strokeSize} />
            <motion.circle
              cx="50"
              cy="50"
              r="30"
              pathLength="1"
              stroke={color}
              fill="none"
              strokeDashoffset="0"
              strokeWidth={strokeSize}
              style={{ pathLength: scrollYProgress }}
            />
          </svg>
          {showPercentage && <span className="absolute ml-2 text-sm">{percentage}%</span>}
        </>
      )}
    </div>
  );
}
