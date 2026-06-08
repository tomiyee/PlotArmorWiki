/**
 * Shared wiki link parsing utilities.
 *
 * Centralising parsing here prevents the remark plugin and the autocomplete
 * component from drifting apart over time. All wiki link parsing goes through
 * this module.
 *
 * Wiki link syntax:
 *   `[[PageName]]`           - links to a wiki page (no category = page link)
 *   `[[page:PageName]]`      - explicit page link (same behaviour, clearer)
 *   `[[Chapter:Chapter 5]]`  - chapter link; category must match the serial's
 *                              chapterType (Chapter/Episode/Issue/Part)
 *   `[[Page Name|alias]]`    - alias overrides the display text
 *
 * @example
 * const parts = parseWikiLink("Harry Potter");
 * // → { page: "Harry Potter", category: undefined }
 *
 * @example
 * const parts = parseWikiLink("page:Harry Potter");
 * // → { page: "Harry Potter", category: "page" }
 *
 * @example
 * const parts = parseWikiLink("Chapter:Chapter 5");
 * // → { page: "Chapter 5", category: "Chapter" }
 */

export interface WikiLinkParts {
  /** The target name - a page slug/name or a chapter display name. */
  page: string;
  /**
   * The namespace prefix before the first `:`, if present.
   * `"page"` means an explicit page link; a chapter type value (e.g.
   * `"Chapter"`, `"Episode"`) means a chapter link. `undefined` means no
   * prefix was supplied and the link defaults to a page link.
   */
  category?: string;
  /** Display text override from `[[Target|alias]]` syntax. */
  alias?: string;
}

/**
 * Broad outer regex that matches `[[…]]` wiki link syntax, including an
 * optional `|alias` suffix. Inner contents are parsed by `parseWikiLink`.
 *
 * The leading `\[?` optionally consumes one extra `[` that can appear before
 * `[[` in rendered text nodes (e.g. when markdown stores `\[[[token]]` — a
 * backslash-escaped `[` followed by a wiki link — remark produces the text
 * node `[[[token]]`). Consuming the leading `[` as part of the match prevents
 * it from appearing as orphaned literal text before the rendered chip/link.
 *
 * Group 1: inner path (everything before the optional `|`)
 * Group 2: alias (everything after `|`, if present); `\]` is an escape
 * sequence for a literal `]` inside the alias.
 *
 * Use this regex on **raw markdown** (where `\]` is still present as written).
 * For remark plugins that receive CommonMark-decoded text (where `\]` → `]`),
 * use `DECODED_WIKI_LINK_RE` instead.
 */
export const WIKI_LINK_RE = /\[?\[\[([^|\[\]]+)(?:\|((?:[^\]\\]|\\.)*))?\]\]/g;

/**
 * Variant of `WIKI_LINK_RE` for use in contexts where CommonMark backslash
 * escapes have already been decoded (i.e. `\]` is already `]`).
 *
 * The alias group uses `[^[]` (any non-`[` char, including `]`) together
 * with `\[(?!\[)` (a lone `[`), and relies on greedy backtracking to find
 * the outermost `]]` closer rather than the first `]` encountered.
 *
 * Example: decoded text `[[page:foo|[Chief]]]`
 * - WIKI_LINK_RE captures alias `[Chief` (stops at `]` before `]]`) → wrong
 * - DECODED_WIKI_LINK_RE captures alias `[Chief]` (backtracks to last `]]`) → correct
 *
 * Group 1 / Group 2: same semantics as `WIKI_LINK_RE`.
 */
export const DECODED_WIKI_LINK_RE =
  /\[?\[\[([^|\[\]]+)(?:\|((?:[^[]|\[(?!\[))*))?\]\]/g;

/**
 * Escapes an alias so it can be safely embedded in `[[token|alias]]`.
 *
 * Two-level scheme: `\` → `\\` first, then `]` → `\]`.
 * Escaping `\` first prevents the already-present `\` from being confused with
 * the `\]` escape that follows when the alias ends with a literal `\]`.
 */
export function escapeWikiAlias(alias: string): string {
  return alias.replace(/\\/g, "\\\\").replace(/\]/g, "\\]");
}

/**
 * Reverses `escapeWikiAlias`: decodes `\\` → `\` and `\]` → `]` in a single
 * left-to-right pass so that `\\]` (escaped backslash + escaped `]`) round-trips
 * correctly back to `\]`.
 */
export function unescapeWikiAlias(raw: string): string {
  return raw.replace(/\\([\]\\])/g, "$1");
}

/**
 * Parse the inner content of a `[[…]]` token into its structured parts.
 * Preserves the category prefix so callers can distinguish page links from
 * chapter links and other future namespaces.
 *
 * Returns `null` if the content is empty after trimming.
 *
 * @example
 * parseWikiLink("Harry Potter")          // → { page: "Harry Potter" }
 * parseWikiLink("page:Harry Potter")     // → { page: "Harry Potter", category: "page" }
 * parseWikiLink("Chapter:Chapter 5")     // → { page: "Chapter 5", category: "Chapter" }
 * parseWikiLink("Harry Potter|Harry")    // → { page: "Harry Potter", alias: "Harry" }
 */
export function parseWikiLink(
  raw: string,
  alias?: string,
): WikiLinkParts | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;

  const colonIdx = trimmed.indexOf(":");
  let page: string;
  let category: string | undefined;

  if (colonIdx !== -1) {
    category = trimmed.slice(0, colonIdx).trim() || undefined;
    page = trimmed.slice(colonIdx + 1).trim();
  } else {
    page = trimmed;
  }

  if (!page) return null;

  return {
    page,
    category,
    // Called from the remark plugin where text is already CommonMark-decoded —
    // escape sequences like \] are resolved to ] before we see them, so no
    // unescaping is needed here.
    alias: alias ? alias.trim() || undefined : undefined,
  };
}

/**
 * Canonical URL slug for a wiki page name.
 *
 * Starting simple with `encodeURIComponent` - centralising the call site
 * means it can evolve (e.g. case-normalisation, whitespace collapsing) without
 * touching every caller.
 *
 * @example
 * slugifyWikiName("Harry Potter") // → "Harry%20Potter"
 */
export function slugifyWikiName(name: string): string {
  return encodeURIComponent(name.trim());
}

/**
 * Returns `true` when `category` identifies a chapter link - i.e. when it
 * case-insensitively matches one of the serial's chapter type values.
 *
 * Used by both the remark plugin and the autocomplete component so the check
 * never drifts between the two.
 *
 * @example
 * isChapterCategory("Chapter", "Chapter")  // → true
 * isChapterCategory("Episode", "Episode")  // → true
 * isChapterCategory("page", "Chapter")     // → false
 * isChapterCategory(undefined, "Chapter")  // → false
 */
export function isChapterCategory(
  category: string | undefined,
  chapterType: string,
): boolean {
  if (!category) return false;
  return category.toLowerCase() === chapterType.toLowerCase();
}
