import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { AnimatePresence, motion } from "framer-motion";
import { AlertTriangle, CheckCircle2, Info, X, XOctagon } from "lucide-react";

import { cn } from "@/lib/utils";

const alertToastVariants = cva(
  "relative w-full max-w-sm overflow-hidden rounded-lg border bg-white shadow-lg flex items-start p-4 space-x-4",
  {
    variants: {
      variant: {
        success: "border-green-200 text-zinc-950",
        warning: "border-yellow-200 text-zinc-950",
        info: "border-blue-200 text-zinc-950",
        error: "border-red-200 text-zinc-950",
      },
    },
    defaultVariants: {
      variant: "info",
    },
  }
);

const iconMap = {
  success: CheckCircle2,
  warning: AlertTriangle,
  info: Info,
  error: XOctagon,
};

const iconColorClasses = {
  success: "text-green-500",
  warning: "text-yellow-500",
  info: "text-blue-500",
  error: "text-red-500",
};

export interface AlertToastProps
  extends VariantProps<typeof alertToastVariants> {
  className?: string;
  title: string;
  description: string;
  onClose: () => void;
}

const AlertToast = React.forwardRef<HTMLDivElement, AlertToastProps>(
  ({ className, variant = "info", title, description, onClose }, ref) => {
    const Icon = iconMap[variant || "info"];

    return (
      <motion.div
        ref={ref}
        role="alert"
        layout
        initial={{ opacity: 0, y: 50, scale: 0.3 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 20, scale: 0.5 }}
        transition={{ type: "spring", stiffness: 260, damping: 20 }}
        className={cn(alertToastVariants({ variant }), className)}
      >
        <div className="flex-shrink-0">
          <Icon className={cn("h-6 w-6", iconColorClasses[variant || "info"])} aria-hidden="true" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold">{title}</p>
          <p className="text-sm text-zinc-600">{description}</p>
        </div>
        <button
          onClick={onClose}
          aria-label="Close"
          className="flex-shrink-0 rounded-full p-1 text-zinc-500 opacity-80 transition hover:bg-zinc-100 hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-zinc-300"
          type="button"
        >
          <X className="h-5 w-5" />
        </button>
      </motion.div>
    );
  }
);

AlertToast.displayName = "AlertToast";

export type ToastItem = {
  id: string;
  variant: NonNullable<AlertToastProps["variant"]>;
  title: string;
  description: string;
};

export function AlertToastViewport({
  toasts,
  onClose,
}: {
  toasts: ToastItem[];
  onClose: (id: string) => void;
}) {
  return (
    <div className="pointer-events-none fixed bottom-5 right-5 z-[2147483647] flex w-[min(24rem,calc(100vw-2rem))] flex-col gap-3">
      <AnimatePresence initial={false}>
        {toasts.map((toast) => (
          <AlertToast
            key={toast.id}
            variant={toast.variant}
            title={toast.title}
            description={toast.description}
            onClose={() => onClose(toast.id)}
            className="pointer-events-auto"
          />
        ))}
      </AnimatePresence>
    </div>
  );
}

export { AlertToast, alertToastVariants };
