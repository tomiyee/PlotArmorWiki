import { findAndReplace } from "mdast-util-find-and-replace";
import type { Root } from "mdast";
import type { Plugin } from "unified";
import {
  DECODED_WIKI_LINK_RE,
  parseWikiLink,
  slugifyWikiName,
  isChapterCategory,
} from "./wiki-links";

/**
 * Remark plugin that transforms `[[slug]]` (and `[[slug|text]]`) wiki link
 * syntax into standard markdown link nodes. Receives `serialSlug` as a
 * closure parameter so the generated URLs are always scoped to the current
 * serial.
 *
 * Supported syntaxes:
 * - `[[PageName]]` or `[[page:PageName]]` - wiki page link (`/{serial}/{slug}`)
 * - `[[Chapter:Chapter 5]]` - chapter link (`/{serial}/chapter/{idx}`); the
 *   category keyword must match the serial's `chapterType` value.
 * - `[[Target|alias]]` - alias overrides the display text for any form above.
 *
 * When `pageTitles` is supplied, a page link with no explicit alias resolves
 * its display text from the map (slug → chapter-versioned title at the current
 * cutoff), falling back to the raw slug if no entry is found.
 *
 * When `chapters` is supplied, a chapter link whose display name is found in
 * the map is resolved to the numeric idx and emitted as
 * `/{serial}/chapter/{idx}`. If the name is not found, the link is left as
 * literal text.
 *
 * Links inside backtick code spans (`[[Foo]]`) are NOT converted -
 * `findAndReplace` automatically skips `code` and `inlineCode` nodes.
 *
 * @example
 * // In a ReactMarkdown remarkPlugins array:
 * remarkPlugins={[remarkWikiLinks("one-piece", pageTitles, {
 *   chapterType: "Chapter",
 *   chapters: { "Chapter 5": 5, "Chapter 6": 6 },
 * })]}
 */
export function remarkWikiLinks(
  serialSlug: string,
  pageTitles?: Record<string, string>,
  options?: {
    /** The serial's chapter type (e.g. "Chapter", "Episode"). */
    chapterType?: string;
    /** Map of chapter display name → chapter idx for chapter link resolution. */
    chapters?: Record<string, number>;
  },
): Plugin<[], Root> {
  const { chapterType, chapters } = options ?? {};

  return () => (tree) => {
    findAndReplace(tree, [
      DECODED_WIKI_LINK_RE,
      (match: string, inner: string, alias: string | undefined) => {
        void match; // capture groups are what we need; full match unused
        const parts = parseWikiLink(inner, alias);
        if (!parts) return false; // leave as literal text

        // Chapter link: category matches the serial's chapterType.
        if (chapterType && isChapterCategory(parts.category, chapterType)) {
          const idx = chapters?.[parts.page];
          if (idx === undefined) return false; // unknown chapter - leave as text
          const displayText = parts.alias ?? parts.page;
          return {
            type: "link",
            url: `/${serialSlug}/chapter/${idx}`,
            children: [{ type: "text", value: displayText }],
          };
        }

        // Page link: no category, explicit "page:" prefix, or any other prefix
        // (backwards-compatible with old [[Category:Page]] usage).
        const displayText =
          parts.alias ?? pageTitles?.[parts.page] ?? parts.page;
        return {
          type: "link",
          url: `/${serialSlug}/${slugifyWikiName(parts.page)}`,
          children: [{ type: "text", value: displayText }],
        };
      },
    ]);
  };
}
