"use client";

import Link from "next/link";
import { useNavbarSerialContext } from "@/contexts/NavbarSerialContext";

/**
 * Global top navbar. When on a serial route the serial layout injects a slot
 * (serial title + chapter selector) into the right side via NavbarSerialContext.
 * When not on a serial route the slot is null and only the logo is shown.
 *
 * The right-side container uses `suppressHydrationWarning` because the slot is
 * injected client-side via `useLayoutEffect` — the server renders it empty and
 * the client fills it in before the first paint.
 *
 * @example
 * // Rendered once in the root layout; no props needed.
 * <Navbar />
 */
export default function Navbar() {
  const { serialSlot } = useNavbarSerialContext();

  return (
    <nav className="sticky top-0 z-10 border-b bg-white px-6 py-3 flex items-center justify-between gap-4">
      <Link href="/" className="text-xl font-bold tracking-tight shrink-0">
        PlotArmor
      </Link>
      {/* suppressHydrationWarning: slot is injected client-side by SerialNavInjector */}
      <div className="flex items-center gap-4 min-w-0" suppressHydrationWarning>
        {serialSlot}
      </div>
    </nav>
  );
}
