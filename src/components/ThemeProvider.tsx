"use client";

import type { ReactNode } from "react";
import { ThemeProvider as NextThemesProvider } from "next-themes";

// next-themes 0.4.x injects an inline <script> to set the theme class before
// hydration (preventing FOUC). React 19 warns whenever a <script> tag is
// rendered inside a component on the client because it won't re-execute there —
// but that's intentional here: the script runs once server-side, then
// next-themes takes over via React state. The warning is a false positive.
if (process.env.NODE_ENV === "development") {
  const orig = console.error.bind(console);
  console.error = (...args: unknown[]) => {
    if (typeof args[0] === "string" && args[0].includes("script tag while rendering")) return;
    orig(...args);
  };
}

type ThemeProviderProps = {
  /** Page tree to wrap with theme context. */
  children: ReactNode;
};

/**
 * Thin wrapper around next-themes that configures class-based dark mode,
 * system-preference detection, and persisted theme preference.
 *
 * Use `class` attribute strategy so Tailwind's `.dark` variant works.
 *
 * @example
 * // In root layout:
 * <ThemeProvider>
 *   {children}
 * </ThemeProvider>
 */
export function ThemeProvider(props: ThemeProviderProps) {
  const { children } = props;
  return (
    <NextThemesProvider
      attribute="class"
      defaultTheme="system"
      enableSystem
      disableTransitionOnChange
    >
      {children}
    </NextThemesProvider>
  );
}
