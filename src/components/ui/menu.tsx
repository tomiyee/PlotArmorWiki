"use client";

import * as React from "react";
import { ChevronDownIcon } from "lucide-react";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Menu
// ---------------------------------------------------------------------------

interface MenuProps {
  isOpen: boolean;
  onClose: () => void;
  /** Panel contents rendered below the trigger when open. */
  contents: React.ReactNode;
  /** Trigger element(s). The consumer owns the open/close interaction. */
  children: React.ReactNode;
  align?: "left" | "right";
  panelClassName?: string;
  /** ARIA role for the panel div (default: `"listbox"`). */
  role?: string;
  "aria-label"?: string;
}

/**
 * Controlled floating menu that renders a panel below the trigger (`children`)
 * when `isOpen`. Calls `onClose` on click-outside. The caller owns all state.
 *
 * @example
 * const [open, setOpen] = useState(false);
 * <Menu
 *   isOpen={open}
 *   onClose={() => setOpen(false)}
 *   contents={<MenuItem onClick={() => setOpen(false)}>Option</MenuItem>}
 * >
 *   <Button onClick={() => setOpen(v => !v)}>Open</Button>
 * </Menu>
 */
function Menu({
  isOpen,
  onClose,
  contents,
  children,
  align = "left",
  panelClassName,
  role = "listbox",
  "aria-label": ariaLabel,
}: MenuProps) {
  const containerRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (!isOpen) return;
    function handleOutsideClick(e: MouseEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        onClose();
      }
    }
    document.addEventListener("mousedown", handleOutsideClick);
    return () => document.removeEventListener("mousedown", handleOutsideClick);
  }, [isOpen, onClose]);

  return (
    <div ref={containerRef} className="relative">
      {children}
      {isOpen && (
        <div
          role={role}
          aria-label={ariaLabel}
          className={cn(
            "absolute top-full z-50 mt-1 min-w-40 rounded-lg border border-border bg-background shadow-md py-1 overflow-y-auto",
            align === "right" ? "right-0" : "left-0",
            panelClassName,
          )}
        >
          {contents}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// MenuItem
// ---------------------------------------------------------------------------

interface MenuItemBaseProps extends React.ComponentProps<"button"> {
  group?: false;
  selected?: boolean;
}

interface MenuItemGroupProps {
  group: true;
  /** Header text rendered on the collapsible group row. */
  label: React.ReactNode;
  /** Whether the group body is expanded. */
  isOpen?: boolean;
  onClick?: () => void;
  children?: React.ReactNode;
  className?: string;
}

type MenuItemProps = MenuItemBaseProps | MenuItemGroupProps;

/**
 * A selectable row inside a `Menu`. When `group` is true, renders as a
 * collapsible group header; `children` are shown beneath it when `isOpen`.
 *
 * @example
 * // Regular item
 * <MenuItem selected={active} onClick={() => pick(id)}>Chapter 5</MenuItem>
 *
 * // Collapsible group
 * <MenuItem group label="Volume 1" isOpen={expanded} onClick={toggle}>
 *   <MenuItem onClick={() => pick(id)}>Chapter 1</MenuItem>
 * </MenuItem>
 */
function MenuItem(props: MenuItemProps) {
  if (props.group) {
    const { isOpen, label, onClick, children, className } = props;
    return (
      <div>
        <button
          type="button"
          onClick={onClick}
          className={cn(
            "flex w-full items-center gap-1.5 px-3 py-1.5 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground hover:bg-muted",
            className,
          )}
        >
          <ChevronDownIcon
            aria-hidden
            className={cn(
              "size-3 shrink-0 transition-transform",
              !isOpen && "-rotate-90",
            )}
          />
          {label}
        </button>
        {isOpen && children}
      </div>
    );
  }

  const { selected, className, group: _group, ...rest } = props as MenuItemBaseProps;
  return (
    <button
      type="button"
      role="option"
      aria-selected={selected}
      className={cn(
        "w-full px-3 py-1.5 text-left text-sm hover:bg-muted",
        selected ? "bg-primary/10 font-medium text-primary" : "text-foreground",
        className,
      )}
      {...rest}
    />
  );
}

export { Menu, MenuItem };
