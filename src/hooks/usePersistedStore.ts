"use client";

import { useState, useEffect, useCallback, Dispatch, SetStateAction } from "react";

/**
 * A drop-in replacement for `React.useState` that persists to `localStorage`
 * and syncs across browser tabs via the `storage` event.
 *
 * - On the server (SSR) the `defaultValue` is always returned so hydration is
 *   deterministic — the real stored value is loaded client-side in a
 *   `useEffect` immediately after mount.
 * - Within the same tab, updates are broadcast via a custom `storage` event so
 *   other components using the same key also re-render.
 * - Across tabs, the browser fires the native `storage` event automatically.
 *
 * @param key          The localStorage key. Use a unique, namespaced string
 *                     (e.g. `"plotarmor:progress:42"`).
 * @param defaultValue The value to use when no stored value exists yet.
 * @returns            `[value, setValue]` — same shape as `React.useState`.
 *
 * @example
 * const [count, setCount] = usePersistedStore("demo:counter", 0);
 */
export function usePersistedStore<T>(
  key: string,
  defaultValue: T
): [T, Dispatch<SetStateAction<T>>] {
  // Always start with defaultValue to keep SSR and first client render in sync.
  const [state, setStateRaw] = useState<T>(defaultValue);

  // After mount, read the persisted value from localStorage.
  useEffect(() => {
    try {
      const raw = localStorage.getItem(key);
      if (raw !== null) {
        setStateRaw(JSON.parse(raw) as T);
      }
    } catch {
      // Corrupted JSON or storage unavailable — stay with defaultValue.
    }
  }, [key]);

  // Listen for changes from other tabs (native storage event) and from the
  // same tab (our custom "persisted-store" event).
  useEffect(() => {
    function handleChange(e: StorageEvent) {
      if (e.key !== key) return;
      try {
        if (e.newValue === null) {
          setStateRaw(defaultValue);
        } else {
          setStateRaw(JSON.parse(e.newValue) as T);
        }
      } catch {
        // Ignore parse errors from external writes.
      }
    }

    window.addEventListener("storage", handleChange);
    return () => window.removeEventListener("storage", handleChange);
  }, [key, defaultValue]);

  // Wrapped setter: persists to localStorage and broadcasts to same-tab
  // listeners before delegating to React's own setState.
  const setValue: Dispatch<SetStateAction<T>> = useCallback(
    (action) => {
      setStateRaw((prev) => {
        const next =
          typeof action === "function"
            ? (action as (prev: T) => T)(prev)
            : action;

        try {
          const serialized = JSON.stringify(next);
          localStorage.setItem(key, serialized);

          // Dispatch a synthetic StorageEvent so same-tab listeners fire too.
          // The native `storage` event only fires in *other* tabs.
          window.dispatchEvent(
            new StorageEvent("storage", {
              key,
              newValue: serialized,
              oldValue: JSON.stringify(prev),
              storageArea: localStorage,
              url: window.location.href,
            })
          );
        } catch {
          // Storage quota exceeded or unavailable — value still updates in memory.
        }

        return next;
      });
    },
    [key]
  );

  return [state, setValue];
}
