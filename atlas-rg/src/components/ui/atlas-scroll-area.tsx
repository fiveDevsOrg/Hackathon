import * as React from "react";

import { cn } from "@/lib/utils";

interface AtlasScrollAreaProps extends React.HTMLAttributes<HTMLDivElement> {
  viewportClassName?: string;
  children: React.ReactNode;
}

export function AtlasScrollArea({
  className,
  viewportClassName,
  children,
  ...props
}: AtlasScrollAreaProps) {
  const viewportRef = React.useRef<HTMLDivElement>(null);
  const draggingRef = React.useRef(false);
  const [metrics, setMetrics] = React.useState({ top: 0, visible: false });

  const updateMetrics = React.useCallback(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    const maxScroll = Math.max(0, viewport.scrollHeight - viewport.clientHeight);
    setMetrics({
      top: maxScroll ? viewport.scrollTop / maxScroll : 0,
      visible: maxScroll > 1,
    });
  }, []);

  React.useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return undefined;

    updateMetrics();
    const ResizeObserverCtor = globalThis.ResizeObserver;
    const resizeObserver = ResizeObserverCtor ? new ResizeObserverCtor(updateMetrics) : null;
    resizeObserver?.observe(viewport);
    resizeObserver?.observe(viewport.firstElementChild || viewport);
    viewport.addEventListener("scroll", updateMetrics, { passive: true });
    window.addEventListener("resize", updateMetrics);
    const interval = resizeObserver ? 0 : window.setInterval(updateMetrics, 500);

    return () => {
      resizeObserver?.disconnect();
      if (interval) window.clearInterval(interval);
      viewport.removeEventListener("scroll", updateMetrics);
      window.removeEventListener("resize", updateMetrics);
    };
  }, [updateMetrics]);

  const scrollToClientY = React.useCallback((clientY: number) => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    const rect = viewport.getBoundingClientRect();
    const ratio = Math.min(1, Math.max(0, (clientY - rect.top) / Math.max(1, rect.height)));
    const maxScroll = Math.max(0, viewport.scrollHeight - viewport.clientHeight);
    viewport.scrollTop = maxScroll * ratio;
  }, []);

  React.useEffect(() => {
    const handlePointerMove = (event: PointerEvent) => {
      if (!draggingRef.current) return;
      event.preventDefault();
      scrollToClientY(event.clientY);
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
  }, [scrollToClientY]);

  const scrollByRatio = React.useCallback((delta: number) => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    const maxScroll = Math.max(0, viewport.scrollHeight - viewport.clientHeight);
    const currentRatio = maxScroll ? viewport.scrollTop / maxScroll : 0;
    viewport.scrollTop = maxScroll * Math.min(1, Math.max(0, currentRatio + delta));
  }, []);

  return (
    <div className={cn("relative min-h-0 overflow-hidden", className)} {...props}>
      <div
        ref={viewportRef}
        className={cn("atlas-scroll-viewport h-full max-h-[inherit] min-h-0 overflow-auto", viewportClassName)}
      >
        {children}
      </div>
      {metrics.visible && (
        <div
          className="absolute inset-y-0 right-0 z-20 w-3 cursor-default bg-transparent"
          onPointerDown={(event) => {
            draggingRef.current = true;
            document.body.style.userSelect = "none";
            scrollToClientY(event.clientY);
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
              if (viewportRef.current) viewportRef.current.scrollTop = 0;
            }
            if (event.key === "End") {
              event.preventDefault();
              if (viewportRef.current) viewportRef.current.scrollTop = viewportRef.current.scrollHeight;
            }
          }}
          role="scrollbar"
          aria-label="Scrollable panel progress"
          aria-orientation="vertical"
          aria-valuemax={100}
          aria-valuemin={0}
          aria-valuenow={Math.round(metrics.top * 100)}
          tabIndex={0}
        >
          <span
            className="absolute right-0 top-0 block w-[5px] origin-top rounded-full bg-zinc-950"
            style={{ height: `${Math.max(0, metrics.top * 100)}%` }}
          />
          <span
            className="absolute right-0 h-3.5 w-[5px] rounded-full bg-zinc-950"
            style={{ top: `calc(${metrics.top * 100}% - 7px)` }}
          />
        </div>
      )}
    </div>
  );
}

export default AtlasScrollArea;
