"use client";

import { Popover as PopoverPrimitive } from "@base-ui/react/popover";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export type PopoverProps = {
  /** Content rendered inside the popover popup. */
  content: ReactNode;
  /** The trigger element that opens the popover. */
  children: ReactNode;
  /** Which side of the trigger to render the popup on. Defaults to `"bottom"`. */
  side?: "top" | "right" | "bottom" | "left";
  /** Alignment of the popup relative to the trigger. Defaults to `"start"`. */
  align?: "start" | "center" | "end";
  /** Additional classes merged onto the popup container. */
  className?: string;
};

/**
 * Composable popover that wraps `children` as the trigger and renders `content`
 * inside the popup. Internally uses `@base-ui/react/popover` primitives so
 * consumers never import `PopoverTrigger`, `PopoverContent`, or `PopoverPortal`.
 *
 * @example
 * <Popover content={<p>Details here</p>} side="bottom" align="start">
 *   <Button>Open</Button>
 * </Popover>
 */
export function Popover(props: PopoverProps) {
  const { content, children, side = "bottom", align = "start", className } =
    props;

  return (
    <PopoverPrimitive.Root>
      <PopoverPrimitive.Trigger render={<span />}>
        {children}
      </PopoverPrimitive.Trigger>
      <PopoverPrimitive.Portal>
        <PopoverPrimitive.Positioner side={side} align={align} sideOffset={8}>
          <PopoverPrimitive.Popup
            className={cn(
              "z-50 w-72 rounded-lg border border-border bg-popover text-popover-foreground shadow-md",
              "data-starting-style:opacity-0 data-ending-style:opacity-0 transition-[opacity,transform] duration-150",
              "data-starting-style:scale-95 data-ending-style:scale-95",
              className,
            )}
          >
            {content}
          </PopoverPrimitive.Popup>
        </PopoverPrimitive.Positioner>
      </PopoverPrimitive.Portal>
    </PopoverPrimitive.Root>
  );
}
