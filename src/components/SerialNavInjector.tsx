"use client";

import { useLayoutEffect, type ReactNode } from "react";
import { useNavbarSerialContext } from "@/contexts/NavbarSerialContext";
import { NavbarSerialData } from "@/types";

interface Props {
  data: NavbarSerialData;
  chapterSelectorSlot: ReactNode;
}

/**
 * Injects typed serial data and the pre-rendered ChapterSelector into the
 * navbar for the lifetime of this component. Cleared on unmount, restoring the
 * default navbar appearance.
 *
 * Uses `useLayoutEffect` so data is injected synchronously before the browser
 * paints — no flash of empty navbar on navigation.
 *
 * Mount this as a sibling of the serial page content inside the serial layout
 * (a Server Component). This component itself renders nothing to the DOM.
 *
 * @example
 * <SerialNavInjector data={serialNavData} chapterSelectorSlot={<ChapterSelector ... />} />
 */
export function SerialNavInjector({ data, chapterSelectorSlot }: Props) {
  const { setSerial, clearSerial } = useNavbarSerialContext();

  useLayoutEffect(() => {
    setSerial(data, chapterSelectorSlot);
    return clearSerial;
    // `data` and `chapterSelectorSlot` are new references every render (RSC
    // serialisation); we only need to set on mount/unmount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return null;
}
