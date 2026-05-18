"use client";

import type { ReactNode } from "react";
import { Info } from "lucide-react";
import { Tooltip } from "@/components/ui/Tooltip";

interface InfoIconProps {
  /** Tooltip content shown on hover/focus. */
  contents: ReactNode;
}

/**
 * An inline info icon that reveals `contents` in a tooltip on hover/focus.
 * Use next to a label or heading when a brief explanation needs to stay
 * out of the way until the user asks for it.
 *
 * @example
 * <InfoIcon contents="Shown at the top of the page with no heading." />
 */
export function InfoIcon(props: InfoIconProps) {
  const { contents } = props;
  return (
    <Tooltip content={contents} side="right">
      <button
        type="button"
        aria-label="More info"
        className="inline-flex items-center text-muted-foreground hover:text-foreground focus:outline-none"
      >
        <Info size={15} />
      </button>
    </Tooltip>
  );
}
