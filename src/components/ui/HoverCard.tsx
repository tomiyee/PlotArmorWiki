"use client";

import { PreviewCard as PreviewCardPrimitive } from "@base-ui/react/preview-card";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

interface HoverCardProps {
  /** The trigger element (must be a single anchor or focusable element). */
  trigger: ReactNode;
  /** Content to show inside the hover card popup. */
  children: ReactNode;
  /** Which side of the trigger to render the popup on. Defaults to "bottom". */
  side?: "top" | "right" | "bottom" | "left";
  /** Extra classes merged onto the popup container. */
  className?: string;
}

/**
 * Hover card popup built on `@base-ui/react/preview-card`. Renders rich
 * preview content when the user hovers over a trigger (link, image, etc.).
 * Unlike `<Tooltip>`, the popup can receive pointer events and display
 * interactive content.
 *
 * Delay is 400 ms open / 300 ms close — long enough to avoid noise when
 * mousing past links, short enough to feel responsive when intentional.
 *
 * @example
 * <HoverCard trigger={<a href="/foo">Foo</a>}>
 *   <p>Preview content for Foo</p>
 * </HoverCard>
 */
export function HoverCard(props: HoverCardProps) {
  const { trigger, children, side = "bottom", className } = props;
  return (
    <PreviewCardPrimitive.Root>
      <PreviewCardPrimitive.Trigger
        delay={400}
        closeDelay={300}
        render={<span className="inline" />}
      >
        {trigger}
      </PreviewCardPrimitive.Trigger>
      <PreviewCardPrimitive.Portal>
        <PreviewCardPrimitive.Positioner
          side={side}
          sideOffset={8}
          align="start"
        >
          <PreviewCardPrimitive.Popup
            className={cn(
              "z-50 w-72 rounded-lg border border-gray-200 bg-white p-4 shadow-lg",
              "data-starting-style:opacity-0 data-ending-style:opacity-0",
              "transition-opacity duration-150",
              className,
            )}
          >
            {children}
          </PreviewCardPrimitive.Popup>
        </PreviewCardPrimitive.Positioner>
      </PreviewCardPrimitive.Portal>
    </PreviewCardPrimitive.Root>
  );
}
