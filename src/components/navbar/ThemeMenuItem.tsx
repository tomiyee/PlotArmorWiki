"use client";

import { useSyncExternalStore } from "react";
import { useTheme } from "next-themes";
import { SunIcon, MoonIcon } from "lucide-react";
import { MenuItem } from "@/components/ui/Menu";

function useHasMounted() {
  return useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );
}

/**
 * Full-width menu row that toggles light/dark theme. Mirrors the icon-left
 * style of Help and Sign out items in the user dropdown.
 *
 * @example
 * <ThemeMenuItem />
 */
export function ThemeMenuItem() {
  const { resolvedTheme, setTheme } = useTheme();
  const hasMounted = useHasMounted();

  if (!hasMounted) {
    return <div className="h-8" />;
  }

  const isDark = resolvedTheme === "dark";

  return (
    <MenuItem
      onClick={() => setTheme(isDark ? "light" : "dark")}
      aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
    >
      {isDark ? (
        <SunIcon className="size-4" />
      ) : (
        <MoonIcon className="size-4" />
      )}
      Theme
    </MenuItem>
  );
}
