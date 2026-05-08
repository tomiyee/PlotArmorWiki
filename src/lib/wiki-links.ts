/**
 * Shared wiki link parsing utilities.
 *
 * Centralising parsing here prevents the remark plugin and the autocomplete
 * component from drifting apart over time. All wiki link parsing goes through
 * this module.
 *
 * @example
 * const parts = parseWikiLink("Characters:Harry Potter");
 * // → { category: "Characters", page: "Harry Potter" }
 */

export interface WikiLinkParts {
  category: string;
  page: string;
  /** Reserved for future `[[Category:Page|Alias]]` syntax. */
  alias?: string;
}

/**
 * Broad outer regex that matches `[[…]]` wiki link syntax, including an
 * optional `|alias` suffix. Inner contents are parsed by `parseWikiLink`.
 *
 * Group 1: inner path (everything before the optional `|`)
 * Group 2: alias (everything after `|`, if present)
 *
 * Leaves room for future syntax extensions (anchors, embeds, etc.) by keeping
 * the outer match broad and delegating inner parsing to `parseWikiLink`.
 */
export const WIKI_LINK_RE = /\[\[([^|\]]+)(?:\|([^\]]*))?\]\]/g;

/**
 * Parse the inner content of a `[[…]]` token into its category and page
 * components. Returns `null` if the content is not a valid `Category:Page`
 * link (e.g. no colon).
 *
 * @example
 * parseWikiLink("Characters:Harry Potter") // → { category: "Characters", page: "Harry Potter" }
 * parseWikiLink("Characters:Harry Potter|Harry") // → { category: "Characters", page: "Harry Potter", alias: "Harry" }
 * parseWikiLink("NotALink") // → null
 */
export function parseWikiLink(raw: string, alias?: string): WikiLinkParts | null {
  const colonIdx = raw.indexOf(":");
  if (colonIdx === -1) return null;
  return {
    category: raw.slice(0, colonIdx).trim(),
    page: raw.slice(colonIdx + 1).trim(),
    alias: alias?.trim() || undefined,
  };
}

/**
 * Canonical URL slug for a wiki page or category name.
 *
 * Starting simple with `encodeURIComponent` — centralising the call site
 * means it can evolve (e.g. case-normalisation, whitespace collapsing) without
 * touching every caller.
 *
 * @example
 * slugifyWikiName("Harry Potter") // → "Harry%20Potter"
 */
export function slugifyWikiName(name: string): string {
  return encodeURIComponent(name.trim());
}
