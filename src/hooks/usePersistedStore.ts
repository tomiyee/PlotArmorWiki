"use client";

import {
  useCallback,
  useRef,
  useSyncExternalStore,
  Dispatch,
  SetStateAction,
} from "react";

/**
 * A drop-in replacement for `React.useState` that persists to `localStorage`
 * and syncs across browser tabs via the `storage` event.
 *
 * Built on `useSyncExternalStore` so it is hydration-safe:
 * - The server snapshot always returns `defaultValue`.
 * - The client snapshot reads from `localStorage` after hydration.
 * - Cross-tab sync is handled by the native `storage` event.
 * - Same-tab sync uses a synthetic `StorageEvent` dispatched on write.
 *
 * `defaultValue` is captured via a ref so callers can pass inline objects
 * (e.g. `{}`) without triggering snapshot churn and the "getSnapshot should
 * be cached" infinite-loop warning from `useSyncExternalStore`.
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
  defaultValue: T,
): [T, Dispatch<SetStateAction<T>>] {
  // Stabilize defaultValue so inline object literals don't cause snapshot churn.
  const defaultRef = useRef(defaultValue);

  // Cache the last snapshot keyed by raw localStorage string so getSnapshot
  // returns a stable reference when the underlying value hasn't changed.
  // `undefined` as the initial sentinel distinguishes "never read" from
  // "key absent" (null).
  const cacheRef = useRef<{ raw: string | null | undefined; value: T }>({
    raw: undefined,
    value: defaultValue,
  });

  const subscribe = useCallback(
    (onStoreChange: () => void) => {
      function handleStorage(e: StorageEvent) {
        if (e.key === key) onStoreChange();
      }
      window.addEventListener("storage", handleStorage);
      return () => window.removeEventListener("storage", handleStorage);
    },
    [key],
  );

  const getSnapshot = useCallback((): T => {
    let raw: string | null = null;
    try {
      raw = localStorage.getItem(key);
    } catch {}

    if (cacheRef.current.raw === raw) {
      return cacheRef.current.value;
    }

    let value: T;
    try {
      value = raw !== null ? (JSON.parse(raw) as T) : defaultRef.current;
    } catch {
      value = defaultRef.current;
    }

    cacheRef.current = { raw, value };
    return value;
  }, [key]);

  // Returns a stable default on the server to prevent SSR/client hydration mismatch.
  const getServerSnapshot = useCallback((): T => defaultRef.current, []);

  const value = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  const setValue: Dispatch<SetStateAction<T>> = useCallback(
    (action) => {
      let prevRaw: string | null = null;
      let prev: T = defaultRef.current;
      try {
        prevRaw = localStorage.getItem(key);
        if (prevRaw !== null) prev = JSON.parse(prevRaw) as T;
      } catch {}

      const next =
        typeof action === "function"
          ? (action as (prev: T) => T)(prev)
          : action;

      try {
        const serialized = JSON.stringify(next);
        if (serialized === prevRaw) return;
        localStorage.setItem(key, serialized);

        // The native `storage` event only fires in *other* tabs.
        window.dispatchEvent(
          new StorageEvent("storage", {
            key,
            newValue: serialized,
            oldValue: prevRaw,
            storageArea: localStorage,
            url: window.location.href,
          }),
        );
      } catch {}
    },
    [key],
  );

  return [value, setValue];
}
