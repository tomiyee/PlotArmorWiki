"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Manages open/close state for a custom dropdown and wires up a click-outside
 * listener that closes it whenever the user clicks outside the container ref.
 *
 * Returns a ref to attach to the outermost dropdown wrapper, the current open
 * state, and a setter for toggling it. Automatically removes the listener when
 * the dropdown closes or the component unmounts.
 *
 * @example
 * const { containerRef, open, setOpen } = useDropdown();
 * return (
 *   <div ref={containerRef} className="relative">
 *     <button onClick={() => setOpen(v => !v)}>Trigger</button>
 *     {open && <div className="absolute …">…</div>}
 *   </div>
 * );
 */
export function useDropdown() {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handleOutsideClick(e: MouseEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleOutsideClick);
    return () => document.removeEventListener("mousedown", handleOutsideClick);
  }, [open]);

  return { containerRef, open, setOpen };
}
