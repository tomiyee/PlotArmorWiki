"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faShieldHalved } from "@fortawesome/free-solid-svg-icons";
import { useNavbarSerialContext } from "@/contexts/NavbarSerialContext";
import { PagesDropdown } from "@/components/navbar/PagesDropdown";
import { SerialSearch } from "@/components/navbar/SerialSearch";
import { ThemeToggle } from "@/components/ThemeToggle";
import { Box } from "./ui/Box";

type NavbarProps = {
  /** Server-rendered auth controls (sign-in button or avatar + sign-out). Passed as a slot from the server layout so `auth()` can be called there. */
  authSlot: ReactNode;
};

/**
 * Global top navbar. When on a serial route, the serial layout injects typed
 * data (serial title + schemas) and a pre-rendered ChapterSelector via
 * NavbarSerialContext. When not on a serial route, only the logo and auth
 * controls are shown.
 *
 * `authSlot` is passed from the root server layout (which can call `auth()`)
 * so the Navbar can remain a client component while still displaying
 * server-side auth state.
 *
 * The dynamic containers use `suppressHydrationWarning` because data is
 * injected client-side via `useLayoutEffect` — the server renders them empty
 * and the client fills them in before the first paint.
 *
 * @example
 * // Rendered once in the root layout:
 * <Navbar authSlot={<AuthControls />} />
 */
export default function Navbar(props: NavbarProps) {
  const { authSlot } = props;
  const { serialData, chapterSelectorSlot, tocSlot } = useNavbarSerialContext();

  return (
    <nav className="sticky top-0 z-10 border-b bg-background px-4 py-2 flex items-center justify-between gap-4 min-h-13.5">
      {/* Left — logo + serial breadcrumb + Pages dropdown */}
      <div className="flex items-center gap-2 min-w-0" suppressHydrationWarning>
        <Link
          href="/"
          className="flex items-center gap-2 text-xl font-bold tracking-tight shrink-0"
        >
          <FontAwesomeIcon icon={faShieldHalved} className="size-5" />
          <span className="hidden sm:inline">PlotArmor</span>
        </Link>
        {serialData && (
          <>
            <Link
              href={`/${serialData.serialSlug}`}
              className="truncate text-sm font-medium text-foreground/70 hover:text-foreground max-w-40 shrink-0"
            >
              {serialData.serialTitle}
            </Link>
            <PagesDropdown
              serialSlug={serialData.serialSlug}
              categories={serialData.categories}
            />
          </>
        )}
      </div>
      <Box className="gap-2 items-center">
        {tocSlot}
        {serialData && <SerialSearch serialSlug={serialData.serialSlug} />}
        {chapterSelectorSlot}
        <ThemeToggle />
        {authSlot}
      </Box>
    </nav>
  );
}
