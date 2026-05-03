"use client";

import {
  createContext,
  useContext,
  useState,
  useCallback,
  type ReactNode,
} from "react";

interface NavbarSerialContextValue {
  /** The slot content injected by the current serial route. Null when not on a serial page. */
  serialSlot: ReactNode;
  /** Called by the serial layout to inject its title + chapter selector into the navbar. */
  setSerialSlot: (slot: ReactNode) => void;
  /** Called on unmount to clear the slot. */
  clearSerialSlot: () => void;
}

const NavbarSerialContext = createContext<NavbarSerialContextValue | null>(
  null,
);

/**
 * Provides a slot in the navbar for serial-scoped content (title + chapter
 * selector). Wrap the root layout with this provider so any serial route can
 * inject content without prop-drilling across layout boundaries.
 *
 * @example
 * <NavbarSerialProvider>
 *   <Navbar />
 *   {children}
 * </NavbarSerialProvider>
 */
export function NavbarSerialProvider({ children }: { children: ReactNode }) {
  const [serialSlot, setSerialSlotState] = useState<ReactNode>(null);

  const setSerialSlot = useCallback((slot: ReactNode) => {
    setSerialSlotState(slot);
  }, []);

  const clearSerialSlot = useCallback(() => {
    setSerialSlotState(null);
  }, []);

  return (
    <NavbarSerialContext.Provider
      value={{ serialSlot, setSerialSlot, clearSerialSlot }}
    >
      {children}
    </NavbarSerialContext.Provider>
  );
}

/**
 * Returns the navbar serial slot context. Throws if used outside
 * `<NavbarSerialProvider>`.
 *
 * @example
 * const { serialSlot } = useNavbarSerialContext();
 */
export function useNavbarSerialContext(): NavbarSerialContextValue {
  const ctx = useContext(NavbarSerialContext);
  if (!ctx) {
    throw new Error(
      "useNavbarSerialContext must be used within NavbarSerialProvider",
    );
  }
  return ctx;
}
