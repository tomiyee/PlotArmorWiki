"use client";

import { Popover as PopoverPrimitive } from "@base-ui/react/popover";
import type { CSSProperties, ReactNode, RefObject } from "react";
import { cn } from "@/lib/utils";

type TriggerPopoverProps = {
  /** The trigger element that opens the popover on click. Required when not using `anchor`. */
  children: ReactNode;
  anchor?: never;
  open?: never;
  onOpenChange?: never;
  modal?: never;
  /** Forwarded to the popup element as `id` (e.g. for `aria-controls`). */
  popupId?: never;
  /** Forwarded to the popup element as `role`. */
  popupRole?: never;
  /** Ref attached to the popup element (e.g. for click-outside detection). */
  popupRef?: never;
  /** Inline styles merged onto the popup element. */
  popupStyle?: never;
  /** Whether the popup steals focus on open. Defaults to the base-ui default. */
  initialFocus?: never;
};

type AnchorPopoverProps = {
  children?: never;
  /** Ref to an existing DOM element used as the positioning anchor. Enables controlled mode. */
  anchor: RefObject<Element | null>;
  /** Controlled open state. Required when using `anchor`. */
  open: boolean;
  /** Called when base-ui requests an open-state change. */
  onOpenChange?: (open: boolean) => void;
  /** Whether the popover is modal (traps focus). Defaults to `true`. */
  modal?: boolean;
  popupId?: string;
  popupRole?: string;
  popupRef?: RefObject<HTMLDivElement | null>;
  popupStyle?: CSSProperties;
  /** Pass `false` to prevent the popup from stealing focus on open. */
  initialFocus?: boolean;
};

type BasePopoverProps = {
  /** Content rendered inside the popover popup. */
  content: ReactNode;
  /** Which side of the trigger/anchor to render the popup on. Defaults to `"bottom"`. */
  side?: "top" | "right" | "bottom" | "left";
  /** Alignment of the popup relative to the trigger/anchor. Defaults to `"start"`. */
  align?: "start" | "center" | "end";
  /** Pixel gap between anchor and popup. Defaults to `8`. */
  sideOffset?: number;
  /** Additional classes merged onto the popup container. */
  className?: string;
};

export type PopoverProps = BasePopoverProps & (TriggerPopoverProps | AnchorPopoverProps);

/**
 * Composable popover with two usage modes:
 *
 * **Trigger mode** — wraps `children` as the click trigger; manages its own open state.
 *
 * **Anchor mode** — anchors to an existing DOM ref and delegates open state to the
 * caller. Used by `Combobox` to position a dropdown under an input without a
 * separate trigger element.
 *
 * @example
 * // Trigger mode
 * <Popover content={<p>Details here</p>} side="bottom" align="start">
 *   <Button>Open</Button>
 * </Popover>
 *
 * @example
 * // Anchor mode
 * <Popover
 *   anchor={inputRef}
 *   open={isOpen}
 *   modal={false}
 *   popupRef={popupRef}
 *   side="bottom"
 *   align="start"
 *   sideOffset={4}
 *   initialFocus={false}
 *   popupStyle={{ width: "var(--anchor-width)" }}
 *   content={dropdownContent}
 * />
 */
export function Popover(props: PopoverProps) {
  const {
    content,
    side = "bottom",
    align = "start",
    sideOffset = 8,
    className,
  } = props;

  const isAnchorMode = "anchor" in props && props.anchor !== undefined;

  const rootProps = isAnchorMode
    ? { open: props.open, onOpenChange: props.onOpenChange, modal: props.modal }
    : {};

  const positionerAnchor = isAnchorMode ? props.anchor : undefined;

  const popupExtraProps = isAnchorMode
    ? {
        ref: props.popupRef,
        id: props.popupId,
        role: props.popupRole,
        style: props.popupStyle,
        initialFocus: props.initialFocus,
      }
    : {};

  return (
    <PopoverPrimitive.Root {...rootProps}>
      {!isAnchorMode && (
        <PopoverPrimitive.Trigger render={<span />}>
          {props.children}
        </PopoverPrimitive.Trigger>
      )}
      <PopoverPrimitive.Portal>
        <PopoverPrimitive.Positioner
          anchor={positionerAnchor}
          side={side}
          align={align}
          sideOffset={sideOffset}
        >
          <PopoverPrimitive.Popup
            {...popupExtraProps}
            className={cn(
              "z-50 rounded-lg border border-border bg-popover text-popover-foreground shadow-md",
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
