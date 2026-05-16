"use client";

import { useState, useRef, useEffect } from "react";
import type { ReactNode } from "react";
import Link from "next/link";
import { MenuIcon, XIcon } from "lucide-react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faShieldHalved } from "@fortawesome/free-solid-svg-icons";
import { useNavbarSerialContext } from "@/contexts/NavbarSerialContext";
import { PagesDropdown } from "@/components/navbar/PagesDropdown";
import { Button } from "@/components/ui/Button";
import { Text } from "@/components/ui/Text";
import { cn } from "@/lib/utils";

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
  const [menuOpen, setMenuOpen] = useState(false);
  const rightRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    function onOutsideClick(e: MouseEvent) {
      if (rightRef.current && !rightRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", onOutsideClick);
    return () => document.removeEventListener("mousedown", onOutsideClick);
  }, [menuOpen]);

  return (
    <nav className="sticky top-0 z-10 border-b bg-white px-4 py-2 flex items-center justify-between gap-4 min-h-[54px]">
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
            <Text muted aria-hidden>
              /
            </Text>
            <Link
              href={`/${serialData.serialSlug}`}
              className="truncate text-sm font-medium text-gray-700 hover:text-gray-900 max-w-40 shrink-0"
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

      {/* Right — hamburger toggle (mobile) + items */}
      <div ref={rightRef} className="flex items-center gap-3 shrink-0">
        {/* Hamburger: only visible on mobile */}
        <Button
          variant="ghost"
          size="icon"
          className="sm:hidden"
          onClick={() => setMenuOpen((v) => !v)}
          aria-label={menuOpen ? "Close menu" : "Open menu"}
          aria-expanded={menuOpen}
        >
          {menuOpen ? (
            <XIcon className="size-5" />
          ) : (
            <MenuIcon className="size-5" />
          )}
        </Button>

        {/* Items: inline row on sm+; absolute dropdown panel on mobile when open */}
        <div
          suppressHydrationWarning
          className={cn(
            "sm:flex sm:flex-row sm:items-center sm:gap-3 sm:static sm:bg-transparent sm:border-0 sm:shadow-none sm:rounded-none sm:p-0",
            menuOpen
              ? "flex flex-col items-stretch absolute top-full right-0 bg-white border border-border shadow-md rounded-lg p-3 gap-3 z-50 min-w-48"
              : "hidden",
          )}
        >
          {tocSlot}
          {chapterSelectorSlot}
          {authSlot}
        </div>
      </div>
    </nav>
  );
}
