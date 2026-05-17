"use client";

import { useTheme } from "next-themes";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import { SunIcon, MoonIcon } from "lucide-react";

/**
 * Icon button that cycles between light and dark themes.
 * Renders nothing until mounted to avoid hydration mismatch (the server
 * doesn't know the stored theme preference).
 *
 * @example
 * // Drop anywhere in the navbar or settings panel:
 * <ThemeToggle />
 */
export function ThemeToggle() {
  const { theme, setTheme, resolvedTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  // Only render after mount so the icon matches the actual resolved theme.
  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    // Reserve space so the navbar doesn't shift on hydration.
    return <div className="size-7" />;
  }

  const isDark = resolvedTheme === "dark";

  function toggleTheme() {
    // If currently following system, pin explicitly to the opposite of resolved.
    if (theme === "system") {
      setTheme(isDark ? "light" : "dark");
    } else {
      setTheme(isDark ? "light" : "dark");
    }
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
