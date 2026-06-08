"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

const REF_TOKEN_RE = /\{\{ref\|([^}]+)\}\}/g;

/** Extracts first-appearance {{ref|token}} values from a markdown string. */
function extractRefTokens(markdown: string): string[] {
  const seen = new Set<string>();
  const tokens: string[] = [];
  REF_TOKEN_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = REF_TOKEN_RE.exec(markdown)) !== null) {
    const token = m[1].trim();
    if (!seen.has(token)) {
      seen.add(token);
      tokens.push(token);
    }
  }
  return tokens;
}

/**
 * Walks `orderedSectionKeys` in order, assigning 1-based ordinals to each
 * token on its first appearance across all sections.
 */
function computeOrdinalMap(
  orderedSectionKeys: string[],
  registry: Map<string, string[]>,
): Map<string, number> {
  const map = new Map<string, number>();
  for (const key of orderedSectionKeys) {
    for (const token of registry.get(key) ?? []) {
      if (!map.has(token)) map.set(token, map.size + 1);
    }
  }
  return map;
}

type WikiPageRefsContextValue = {
  /** Global token→ordinal map, computed across all registered sections in page order. */
  ordinalMap: Map<string, number>;
  /** Adds or replaces a section's token list. Pass an empty array to clear. */
  registerSection: (key: string, tokens: string[]) => void;
  /** Removes a section's registration entirely (call on unmount). */
  unregisterSection: (key: string) => void;
};

const WikiPageRefsContext = createContext<WikiPageRefsContextValue>({
  ordinalMap: new Map(),
  registerSection: () => {},
  unregisterSection: () => {},
});

type OrderedSection = {
  /** Stable identifier (e.g. `"infobox-1"`, `"section-42"`). */
  key: string;
  /** Raw markdown content; scanned for `{{ref|token}}` occurrences. */
  markdown: string;
};

type WikiPageRefsProviderProps = {
  /**
   * Ordered section keys defining the global ref numbering sequence.
   * Infobox row keys must appear before page section keys so infobox refs
   * are numbered first. Both groups should be sorted by `displayOrder`.
   */
  orderedSectionKeys: string[];
  /**
   * Pre-seeded section data for synchronous initial ordinal computation,
   * so the first render already shows globally correct reference numbers.
   */
  initialSections: OrderedSection[];
  children: ReactNode;
};

/**
 * Provides globally consistent reference ordinals across all sections of a wiki
 * page. Infobox row refs are numbered before page section refs; within each
 * group, refs are numbered by section order then first-appearance order within
 * each section's markdown.
 *
 * Wrap the read-mode page content with this provider, then call
 * `useWikiPageRefOrdinals` in each rendered section to receive the global ordinal
 * map and pass it to `MarkdownRenderer` as `refOrdinalMap`.
 *
 * @example
 * <WikiPageRefsProvider
 *   orderedSectionKeys={["infobox-1", "section-10", "section-11"]}
 *   initialSections={[{ key: "infobox-1", markdown: row.content }, ...]}
 * >
 *   {children}
 * </WikiPageRefsProvider>
 */
export function WikiPageRefsProvider(props: WikiPageRefsProviderProps) {
  const { orderedSectionKeys, initialSections, children } = props;

  // Pre-seed the registry from initialSections so the first render is correct.
  const [registry, setRegistry] = useState<Map<string, string[]>>(() => {
    const map = new Map<string, string[]>();
    for (const { key, markdown } of initialSections) {
      const tokens = extractRefTokens(markdown);
      if (tokens.length > 0) map.set(key, tokens);
    }
    return map;
  });

  const ordinalMap = useMemo(
    () => computeOrdinalMap(orderedSectionKeys, registry),
    [orderedSectionKeys, registry],
  );

  const registerSection = useCallback((key: string, tokens: string[]) => {
    setRegistry((prev) => {
      const next = new Map(prev);
      if (tokens.length === 0) next.delete(key);
      else next.set(key, tokens);
      return next;
    });
  }, []);

  const unregisterSection = useCallback((key: string) => {
    setRegistry((prev) => {
      if (!prev.has(key)) return prev;
      const next = new Map(prev);
      next.delete(key);
      return next;
    });
  }, []);

  const value = useMemo(
    () => ({ ordinalMap, registerSection, unregisterSection }),
    [ordinalMap, registerSection, unregisterSection],
  );

  return (
    <WikiPageRefsContext.Provider value={value}>
      {children}
    </WikiPageRefsContext.Provider>
  );
}

/**
 * Registers this section's ref tokens with the page-level context and returns
 * the full global ordinal map so `MarkdownRenderer` can number refs correctly
 * across all sections. Unregisters on unmount so ordinals update when sections
 * are removed.
 *
 * Must be called inside a `WikiPageRefsProvider`. Pass the returned map to
 * `MarkdownRenderer` as `refOrdinalMap`.
 *
 * @example
 * const ordinals = useWikiPageRefOrdinals("section-42", section.content);
 * return <MarkdownRenderer refOrdinalMap={ordinals}>{section.content}</MarkdownRenderer>;
 */
export function useWikiPageRefOrdinals(
  sectionKey: string,
  markdown: string,
): Map<string, number> {
  const { ordinalMap, registerSection, unregisterSection } = useContext(WikiPageRefsContext);

  // Stable reference: only recomputed when markdown changes.
  const tokens = useMemo(() => extractRefTokens(markdown), [markdown]);

  useEffect(() => {
    registerSection(sectionKey, tokens);
    return () => {
      unregisterSection(sectionKey);
    };
  }, [sectionKey, tokens, registerSection, unregisterSection]);

  // Return the full global map so {{refbox}} in this section lists all page refs.
  return ordinalMap;
}
