"use client";

import { Popover as PopoverPrimitive } from "@base-ui/react/popover";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export const PopoverRoot = PopoverPrimitive.Root;
export const PopoverTrigger = PopoverPrimitive.Trigger;
export const PopoverPortal = PopoverPrimitive.Portal;
export const PopoverPositioner = PopoverPrimitive.Positioner;
export const PopoverClose = PopoverPrimitive.Close;

interface PopoverContentProps {
  children: ReactNode;
  className?: string;
  side?: "top" | "right" | "bottom" | "left";
  align?: "start" | "center" | "end";
  sideOffset?: number;
}

/**
 * Styled popover popup composed from `@base-ui/react/popover` primitives.
 * Use with `PopoverRoot` and `PopoverTrigger` from this module.
 *
 * @example
 * <PopoverRoot open={open} onOpenChange={setOpen}>
 *   <PopoverTrigger render={<Button />}>Open</PopoverTrigger>
 *   <PopoverContent side="bottom">Content here</PopoverContent>
 * </PopoverRoot>
 */
export function PopoverContent({
  children,
  className,
  side = "bottom",
  align = "start",
  sideOffset = 8,
}: PopoverContentProps) {
  return (
    <PopoverPortal>
      <PopoverPositioner side={side} align={align} sideOffset={sideOffset}>
        <PopoverPrimitive.Popup
          className={cn(
            "z-50 w-72 rounded-lg border border-border bg-popover text-popover-foreground shadow-md",
            "data-[starting-style]:opacity-0 data-[ending-style]:opacity-0 transition-[opacity,transform] duration-150",
            "data-[starting-style]:scale-95 data-[ending-style]:scale-95",
            className,
          )}
        >
          {children}
        </PopoverPrimitive.Popup>
      </PopoverPositioner>
    </PopoverPortal>
  );
}
