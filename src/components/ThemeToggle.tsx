"use client";

import { useTheme } from "next-themes";
import { useSyncExternalStore } from "react";
import { Button } from "@/components/ui/Button";
import { SunIcon, MoonIcon } from "lucide-react";

/**
 * Returns `true` on the client after hydration, `false` on the server.
 * Uses `useSyncExternalStore` so the server snapshot (`false`) and the
 * client snapshot (`true`) match Next.js hydration expectations without
 * triggering the `react-hooks/set-state-in-effect` lint rule.
 */
function useHasMounted() {
  return useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );
}

/**
 * Icon button that cycles between light and dark themes.
 * Renders a placeholder until mounted to avoid hydration mismatch (the server
 * doesn't know the stored theme preference).
 *
 * @example
 * // Drop anywhere in the navbar or settings panel:
 * <ThemeToggle />
 */
export function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  const hasMounted = useHasMounted();

  if (!hasMounted) {
    // Reserve space so the navbar doesn't shift on hydration.
    return <div className="size-7" />;
  }

  const isDark = resolvedTheme === "dark";

  function toggleTheme() {
    setTheme(isDark ? "light" : "dark");
  }

  return (
    <Button
      variant="ghost"
      size="icon-sm"
      onClick={toggleTheme}
      aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
    >
      {isDark ? <SunIcon className="size-4" /> : <MoonIcon className="size-4" />}
    </Button>
  );
}
