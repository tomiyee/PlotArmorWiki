"use client";

import type { ReactNode } from "react";
import { ThemeProvider as NextThemesProvider } from "next-themes";

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
