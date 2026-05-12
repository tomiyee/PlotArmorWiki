/**
 * Shared wiki link parsing utilities.
 *
 * Centralising parsing here prevents the remark plugin and the autocomplete
 * component from drifting apart over time. All wiki link parsing goes through
 * this module.
 *
 * Wiki link syntax: `[[PageName]]` — links directly to a page within the
 * current serial. The old `[[Category:Page]]` form is still parsed for
 * backwards compatibility; the category segment is ignored in URL generation
 * (URLs are now 2-level: `/{serial}/{page-slug}`).
 *
 * @example
 * const parts = parseWikiLink("Harry Potter");
 * // → { page: "Harry Potter" }
 *
 * @example
 * const parts = parseWikiLink("Characters:Harry Potter");
 * // → { page: "Harry Potter" }  (category ignored)
 */

export interface WikiLinkParts {
  page: string;
  /** Reserved for future `[[Page|Alias]]` syntax. */
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
 * Parse the inner content of a `[[…]]` token into its page component.
 * Accepts both `[[PageName]]` and the legacy `[[Category:Page]]` form —
 * in the latter case the category prefix is stripped and only the page name
 * is returned.
 *
 * Returns `null` if the content is empty after trimming.
 *
 * @example
 * parseWikiLink("Harry Potter") // → { page: "Harry Potter" }
 * parseWikiLink("Characters:Harry Potter") // → { page: "Harry Potter" }
 * parseWikiLink("Harry Potter|Harry") // → { page: "Harry Potter", alias: "Harry" }
 */
export function parseWikiLink(raw: string, alias?: string): WikiLinkParts | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;

  // Strip legacy `Category:Page` prefix — keep only the page part.
  const colonIdx = trimmed.indexOf(":");
  const page = colonIdx !== -1 ? trimmed.slice(colonIdx + 1).trim() : trimmed;

  if (!page) return null;

  return {
    page,
    alias: alias?.trim() || undefined,
  };
}

/**
 * Canonical URL slug for a wiki page name.
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
