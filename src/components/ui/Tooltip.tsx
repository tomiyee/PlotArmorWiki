"use client";

import { Tooltip as TooltipPrimitive } from "@base-ui/react/tooltip";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * Re-exported tooltip provider from `@base-ui/react`. Mount once in the root
 * layout so all `<Tooltip>` components share a single delay group.
 *
 * @example
 * // In layout.tsx:
 * <TooltipProvider delay={600}>
 *   {children}
 * </TooltipProvider>
 */
export const TooltipProvider = TooltipPrimitive.Provider;

interface TooltipProps {
  /** The label shown inside the tooltip bubble. */
  content: ReactNode;
  /** Which side of the trigger to render the tooltip on. Defaults to `"top"`. */
  side?: "top" | "right" | "bottom" | "left";
  /** The trigger element — must be a single focusable element. */
  children: ReactNode;
  /** Extra classes merged onto the tooltip popup. */
  className?: string;
}

/**
 * Wraps an icon-only button (or any focusable element) with an accessible
 * tooltip. Uses `@base-ui/react/tooltip` so it integrates with the shared
 * `<TooltipPrimitive.Provider>` mounted in the root layout.
 *
 * The trigger element receives pointer and keyboard focus events automatically;
 * you do not need to add `title` or `aria-label` manually when this wrapper is
 * used (though `aria-label` on the child is still recommended for screen readers).
 *
 * @example
 * <Tooltip content="Delete section">
 *   <Button variant="ghost" size="icon-sm" aria-label="Delete section">
 *     <TrashIcon />
 *   </Button>
 * </Tooltip>
 */
export function Tooltip(props: TooltipProps) {
  const { content, side = "top", children, className } = props;
  return (
    <TooltipPrimitive.Root>
      <TooltipPrimitive.Trigger render={<span className="inline-flex" />}>
        {children}
      </TooltipPrimitive.Trigger>
      <TooltipPrimitive.Portal>
        <TooltipPrimitive.Positioner
          side={side}
          sideOffset={6}
          className="z-50"
        >
          <TooltipPrimitive.Popup
            className={cn(
              "rounded-md bg-foreground px-2.5 py-1 text-xs font-medium text-background shadow-md",
              "data-starting-style:opacity-0 data-ending-style:opacity-0 transition-opacity duration-100",
              className,
            )}
          >
            {content}
          </TooltipPrimitive.Popup>
        </TooltipPrimitive.Positioner>
      </TooltipPrimitive.Portal>
    </TooltipPrimitive.Root>
  );
}
