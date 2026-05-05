"use client";

import {
  createContext,
  useContext,
  useState,
  useCallback,
  type ReactNode,
} from "react";
import { NavbarSerialData } from "@/types";

interface NavbarSerialContextValue {
  /** Typed left-side data for the serial breadcrumb and Pages dropdown. Null when not on a serial page. */
  serialData: NavbarSerialData | null;
  /** Pre-rendered ChapterSelector for the right side of the navbar. */
  chapterSelectorSlot: ReactNode;
  /** Pre-rendered SerialTOCDrawer (mobile Contents button) for the right side of the navbar. */
  tocSlot: ReactNode;
  /** Called by SerialNavInjector on mount to populate both sides of the navbar. */
  setSerial: (data: NavbarSerialData, chapterSlot: ReactNode, tocSlot: ReactNode) => void;
  /** Called by SerialNavInjector on unmount to restore the default navbar. */
  clearSerial: () => void;
}

const NavbarSerialContext = createContext<NavbarSerialContextValue | null>(
  null,
);

/**
 * Provides typed serial data and a pre-rendered ChapterSelector slot for the
 * navbar. Wrap the root layout with this provider so any serial route can
 * inject content without prop-drilling across layout boundaries.
 *
 * @example
 * <NavbarSerialProvider>
 *   <Navbar />
 *   {children}
 * </NavbarSerialProvider>
 */
export function NavbarSerialProvider({ children }: { children: ReactNode }) {
  const [serialData, setSerialData] = useState<NavbarSerialData | null>(null);
  const [chapterSelectorSlot, setChapterSelectorSlot] =
    useState<ReactNode>(null);
  const [tocSlot, setTocSlot] = useState<ReactNode>(null);

  const setSerial = useCallback(
    (data: NavbarSerialData, chapterSlot: ReactNode, toc: ReactNode) => {
      setSerialData(data);
      setChapterSelectorSlot(chapterSlot);
      setTocSlot(toc);
    },
    [],
  );

  const clearSerial = useCallback(() => {
    setSerialData(null);
    setChapterSelectorSlot(null);
    setTocSlot(null);
  }, []);

  return (
    <NavbarSerialContext.Provider
      value={{ serialData, chapterSelectorSlot, tocSlot, setSerial, clearSerial }}
    >
      {children}
    </NavbarSerialContext.Provider>
  );
}

/**
 * Returns the navbar serial context. Throws if used outside
 * `<NavbarSerialProvider>`.
 *
 * @example
 * const { serialData, chapterSelectorSlot } = useNavbarSerialContext();
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
