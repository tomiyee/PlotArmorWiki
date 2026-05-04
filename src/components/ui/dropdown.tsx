"use client";

import * as React from "react";
import { ChevronDownIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { useDropdown } from "@/hooks/useDropdown";

export { useDropdown };

// ---------------------------------------------------------------------------
// DropdownRoot
// ---------------------------------------------------------------------------

/**
 * Outermost container for a custom dropdown.  Provides the click-outside
 * context via `useDropdown` and exposes `open` / `setOpen` through a render
 * prop so children can react to state without prop-drilling.
 *
 * Render-prop form is the primary API; pair with `DropdownTrigger` and
 * `DropdownPanel` for a complete dropdown.
 *
 * @example
 * <DropdownRoot>
 *   {({ open, setOpen, containerRef }) => (
 *     <div ref={containerRef} className="relative">
 *       <DropdownTrigger open={open} onToggle={() => setOpen(v => !v)}>
 *         Options
 *       </DropdownTrigger>
 *       <DropdownPanel open={open}>…</DropdownPanel>
 *     </div>
 *   )}
 * </DropdownRoot>
 */
function DropdownRoot({
  children,
}: {
  children: (ctx: {
    open: boolean;
    setOpen: React.Dispatch<React.SetStateAction<boolean>>;
    containerRef: React.RefObject<HTMLDivElement | null>;
  }) => React.ReactNode;
}) {
  const ctx = useDropdown();
  return <>{children(ctx)}</>;
}

// ---------------------------------------------------------------------------
// DropdownContainer
// ---------------------------------------------------------------------------

/**
 * A `position: relative` wrapper div that attaches a containerRef from
 * `useDropdown`.  Use this as the outermost element when you manage dropdown
 * state yourself with `useDropdown`.
 *
 * @example
 * const { containerRef, open, setOpen } = useDropdown();
 * return (
 *   <DropdownContainer ref={containerRef}>
 *     <DropdownTrigger open={open} onToggle={() => setOpen(v => !v)}>…</DropdownTrigger>
 *     <DropdownPanel open={open}>…</DropdownPanel>
 *   </DropdownContainer>
 * );
 */
const DropdownContainer = React.forwardRef<
  HTMLDivElement,
  React.ComponentProps<"div">
>(function DropdownContainer({ className, ...props }, ref) {
  return <div ref={ref} className={cn("relative", className)} {...props} />;
});

// ---------------------------------------------------------------------------
// DropdownTrigger
// ---------------------------------------------------------------------------

interface DropdownTriggerProps {
  open: boolean;
  onToggle: () => void;
  /** Width class applied to the trigger button (default: `w-auto`). */
  className?: string;
  children: React.ReactNode;
  /** aria-label for screen readers */
  "aria-label"?: string;
}

/**
 * Styled trigger button for a custom dropdown.  Renders a border/shadow button
 * matching the design-system `<Select>` trigger, with a rotating chevron.
 *
 * Prefer this over rolling a bespoke `<button>` so the visual language stays
 * consistent across all dropdowns in the app.
 *
 * @example
 * <DropdownTrigger open={open} onToggle={() => setOpen(v => !v)}>
 *   Chapter 5
 * </DropdownTrigger>
 */
function DropdownTrigger({
  open,
  onToggle,
  className,
  children,
  "aria-label": ariaLabel,
}: DropdownTriggerProps) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-haspopup="listbox"
      aria-expanded={open}
      aria-label={ariaLabel}
      className={cn(
        "flex h-9 w-auto items-center justify-between gap-2 rounded-lg border border-input bg-background px-3 py-1 pr-8 text-sm shadow-xs outline-none transition-[color,box-shadow] focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 truncate",
        className,
      )}
    >
      <span className="truncate">{children}</span>
      <ChevronDownIcon
        aria-hidden
        className={cn(
          "pointer-events-none absolute right-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground transition-transform",
          open && "rotate-180",
        )}
      />
    </button>
  );
}

// ---------------------------------------------------------------------------
// DropdownPanel
// ---------------------------------------------------------------------------

interface DropdownPanelProps {
  open: boolean;
  /** Horizontal alignment relative to the trigger (default: `left`). */
  align?: "left" | "right";
  className?: string;
  children: React.ReactNode;
  /** role applied to the panel div (default: `listbox`). */
  role?: string;
  "aria-label"?: string;
}

/**
 * Floating panel that appears below the trigger when `open` is true.
 * Renders `null` when closed so no DOM nodes are kept alive off-screen.
 *
 * @example
 * <DropdownPanel open={open} align="right" aria-label="Chapter list">
 *   …items…
 * </DropdownPanel>
 */
function DropdownPanel({
  open,
  align = "left",
  className,
  children,
  role = "listbox",
  "aria-label": ariaLabel,
}: DropdownPanelProps) {
  if (!open) return null;
  return (
    <div
      role={role}
      aria-label={ariaLabel}
      className={cn(
        "absolute top-full z-50 mt-1 min-w-40 rounded-lg border border-border bg-background shadow-md py-1 overflow-y-auto",
        align === "right" ? "right-0" : "left-0",
        className,
      )}
    >
      {children}
    </div>
  );
}

// ---------------------------------------------------------------------------
// DropdownItem
// ---------------------------------------------------------------------------

interface DropdownItemProps extends React.ComponentProps<"button"> {
  selected?: boolean;
}

/**
 * A single selectable item inside a `DropdownPanel`.  Highlighted when
 * `selected` is true.  Renders as a full-width button so it can accept any
 * content.
 *
 * @example
 * <DropdownItem selected={chapter.id === activeId} onClick={() => pick(chapter.id)}>
 *   Chapter 5
 * </DropdownItem>
 */
function DropdownItem({ selected, className, ...props }: DropdownItemProps) {
  return (
    <button
      type="button"
      role="option"
      aria-selected={selected}
      className={cn(
        "w-full px-3 py-1.5 text-left text-sm hover:bg-muted",
        selected
          ? "bg-primary/10 font-medium text-primary"
          : "text-foreground",
        className,
      )}
      {...props}
    />
  );
}

// ---------------------------------------------------------------------------
// DropdownGroupHeader
// ---------------------------------------------------------------------------

interface DropdownGroupHeaderProps extends React.ComponentProps<"button"> {
  collapsed?: boolean;
}

/**
 * A collapsible group header for use inside a `DropdownPanel`.  Shows a
 * chevron that points right when collapsed and down when expanded.
 *
 * @example
 * <DropdownGroupHeader
 *   collapsed={isCollapsed}
 *   onClick={() => toggleVolume(volume.id)}
 * >
 *   Volume 1
 * </DropdownGroupHeader>
 */
function DropdownGroupHeader({
  collapsed,
  className,
  children,
  ...props
}: DropdownGroupHeaderProps) {
  return (
    <button
      type="button"
      className={cn(
        "flex w-full items-center gap-1.5 px-3 py-1.5 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground hover:bg-muted",
        className,
      )}
      {...props}
    >
      <ChevronDownIcon
        aria-hidden
        className={cn(
          "size-3 shrink-0 transition-transform",
          collapsed && "-rotate-90",
        )}
      />
      {children}
    </button>
  );
}

// ---------------------------------------------------------------------------
// DropdownEmptyState
// ---------------------------------------------------------------------------

/**
 * Renders a muted placeholder text inside a `DropdownPanel` when there are
 * no items to show.
 *
 * @example
 * {items.length === 0 && <DropdownEmptyState>No pages yet</DropdownEmptyState>}
 */
function DropdownEmptyState({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <span className={cn("block px-3 py-2 text-sm text-muted-foreground", className)}>
      {children}
    </span>
  );
}

export {
  DropdownRoot,
  DropdownContainer,
  DropdownTrigger,
  DropdownPanel,
  DropdownItem,
  DropdownGroupHeader,
  DropdownEmptyState,
};
