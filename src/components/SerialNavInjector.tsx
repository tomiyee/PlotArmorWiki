"use client";

import { useLayoutEffect, type ReactNode } from "react";
import { useNavbarSerialContext } from "@/contexts/NavbarSerialContext";

interface Props {
  slot: ReactNode;
}

/**
 * Injects `slot` into the navbar serial slot for the lifetime of this
 * component. Cleared on unmount, restoring the default navbar appearance.
 *
 * Uses `useLayoutEffect` so the slot is injected synchronously before the
 * browser paints — no flash of empty navbar on navigation.
 *
 * Mount this as a sibling of the serial page content inside the serial layout
 * (a Server Component). The slot content is rendered inside the Navbar via
 * React context; this component itself renders nothing to the DOM.
 *
 * @example
 * <SerialNavInjector slot={<><Link>My Serial</Link><ChapterSelector /></>} />
 */
export function SerialNavInjector({ slot }: Props) {
  const { setSerialSlot, clearSerialSlot } = useNavbarSerialContext();

  useLayoutEffect(() => {
    setSerialSlot(slot);
    return () => {
      clearSerialSlot();
    };
    // `slot` is a new ReactNode reference every render (RSC serialisation);
    // We only need to set on mount/unmount. Re-renders within the same serial
    // route do not change the slot shape, only ChapterSelector's internal state.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return null;
}
