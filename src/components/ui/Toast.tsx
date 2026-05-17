"use client";

import { createContext, useCallback, useContext, useState } from "react";
import type { ReactNode } from "react";
import { createPortal } from "react-dom";
import { XIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/Button";
import { Box } from "@/components/ui/Box";
import { Text } from "@/components/ui/Text";

// ── Types ────────────────────────────────────────────────────────────────────

type ToastVariant = "default" | "error" | "success";

type ToastData = {
  /** Unique identifier — assigned automatically by `toast()`. */
  id: string;
  /** Primary message text shown in bold. */
  title: string;
  /** Optional secondary text shown below the title. */
  description?: string;
  /** Visual style of the toast. Defaults to `"default"`. */
  variant?: ToastVariant;
};

type ToastInput = Omit<ToastData, "id">;

type ToastContextValue = {
  /** Push a new toast onto the stack. Auto-dismisses after 4 seconds. */
  toast: (data: ToastInput) => void;
};

// ── Context ──────────────────────────────────────────────────────────────────

const ToastContext = createContext<ToastContextValue | null>(null);

// ── ToastProvider ─────────────────────────────────────────────────────────────

type ToastProviderProps = {
  /** App subtree that can call `useToast()`. */
  children: ReactNode;
};

/**
 * Provides the `useToast()` hook to the component tree and renders a portal
 * with active toasts fixed to the bottom-right of the viewport. Mount once in
 * the root layout — no need to place `<Toaster>` separately.
 *
 * @example
 * // In layout.tsx:
 * <ToastProvider>
 *   {children}
 * </ToastProvider>
 */
export function ToastProvider(props: ToastProviderProps) {
  const { children } = props;
  const [toasts, setToasts] = useState<ToastData[]>([]);

  const toast = useCallback((data: ToastInput) => {
    const id = Math.random().toString(36).slice(2, 9);
    setToasts((prev) => [...prev, { ...data, id }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4000);
  }, []);

  const dismiss = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}
      <ToastPortal toasts={toasts} onDismiss={dismiss} />
    </ToastContext.Provider>
  );
}

// ── Internal portal ───────────────────────────────────────────────────────────

type ToastPortalProps = {
  toasts: ToastData[];
  onDismiss: (id: string) => void;
};

function ToastPortal(props: ToastPortalProps) {
  const { toasts, onDismiss } = props;

  // Toasts are client-only; returning null when empty satisfies SSR without a mounted-flag + setState-in-effect.
  if (toasts.length === 0 || typeof document === "undefined") return null;

  return createPortal(
    <div
      aria-live="polite"
      aria-label="Notifications"
      className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 w-full max-w-sm pointer-events-none"
    >
      {toasts.map((t) => (
        <ToastItem key={t.id} data={t} onDismiss={onDismiss} />
      ))}
    </div>,
    document.body,
  );
}

// ── ToastItem ─────────────────────────────────────────────────────────────────

type ToastItemProps = {
  data: ToastData;
  onDismiss: (id: string) => void;
};

function ToastItem(props: ToastItemProps) {
  const { data, onDismiss } = props;

  return (
    <Box
      role="status"
      className={cn(
        "pointer-events-auto items-start gap-3 rounded-xl border px-4 py-3 shadow-lg",
        "animate-in slide-in-from-right-4 fade-in-0 duration-200",
        data.variant === "error" &&
          "border-destructive/30 bg-destructive/10 text-destructive",
        data.variant === "success" &&
          "border-green-500/30 bg-green-500/10 text-green-700 dark:text-green-400",
        (!data.variant || data.variant === "default") &&
          "border-border bg-popover text-popover-foreground",
      )}
    >
      <Box col flex={1} className="min-w-0">
        <Text variant="label" as="p" className="leading-snug">
          {data.title}
        </Text>
        {data.description && (
          <Text variant="label" as="p" muted className="mt-0.5 font-normal">
            {data.description}
          </Text>
        )}
      </Box>
      <Button
        variant="ghost"
        size="icon-sm"
        onClick={() => onDismiss(data.id)}
        aria-label="Dismiss notification"
        className="shrink-0 mt-0.5 opacity-60 hover:opacity-100 hover:bg-transparent"
      >
        <XIcon className="size-4" />
      </Button>
    </Box>
  );
}

// ── useToast ──────────────────────────────────────────────────────────────────

/**
 * Returns `{ toast }` — call `toast({ title, variant })` to show a
 * self-dismissing notification. Must be used inside `<ToastProvider>`.
 *
 * @example
 * const { toast } = useToast();
 * toast({ title: "Saved!", variant: "success" });
 * toast({ title: "User not found.", variant: "error" });
 */
export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used inside <ToastProvider>");
  return ctx;
}
