"use client";

import { useLayoutEffect, type ReactNode } from "react";
import { useNavbarSerialContext } from "@/contexts/NavbarSerialContext";
import { NavbarSerialData } from "@/types";

interface SerialNavInjectorProps {
  data: NavbarSerialData;
  chapterSelectorSlot: ReactNode;
  tocSlot: ReactNode;
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
 * <SerialNavInjector
 *   data={serialNavData}
 *   chapterSelectorSlot={<ChapterSelector ... />}
 *   tocSlot={<SerialTOCDrawer ... />}
 * />
 */
export function SerialNavInjector(props: SerialNavInjectorProps) {
  const { data, chapterSelectorSlot, tocSlot } = props;
  const { setSerial, clearSerial } = useNavbarSerialContext();

  // Update navbar context whenever props change (e.g. after router.refresh() adds chapters).
  // RSC serialisation always produces new object references, so this fires on every
  // RSC re-render — that's intentional and keeps the navbar in sync.
  useLayoutEffect(() => {
    setSerial(data, chapterSelectorSlot, tocSlot);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, chapterSelectorSlot, tocSlot]);

  // Separate cleanup effect so clearSerial only runs on unmount, not on every prop update.
  useLayoutEffect(() => {
    return clearSerial;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return null;
}
