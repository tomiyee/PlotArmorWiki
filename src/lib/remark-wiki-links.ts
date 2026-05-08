import { findAndReplace } from "mdast-util-find-and-replace";
import type { Root } from "mdast";
import type { Plugin } from "unified";
import { WIKI_LINK_RE, parseWikiLink, slugifyWikiName } from "./wiki-links";

/**
 * Remark plugin that transforms `[[Category:Page]]` wiki link syntax into
 * standard markdown link nodes. Receives `serialSlug` as a closure parameter
 * so the generated URLs are always scoped to the current serial.
 *
 * Links inside backtick code spans (`[[Foo:Bar]]`) are NOT converted —
 * `findAndReplace` automatically skips `code` and `inlineCode` nodes.
 *
 * @example
 * // In a ReactMarkdown remarkPlugins array:
 * remarkPlugins={[remarkGfm, remarkWikiLinks("one-piece")]}
 */
export function remarkWikiLinks(serialSlug: string): Plugin<[], Root> {
  return () => (tree) => {
    findAndReplace(tree, [
      WIKI_LINK_RE,
      (match: string, inner: string, alias: string | undefined) => {
        void match; // capture groups are what we need; full match unused
        const parts = parseWikiLink(inner, alias);
        if (!parts) return false; // leave as literal text
        return {
          type: "link",
          url: `/${serialSlug}/${slugifyWikiName(parts.category)}/${slugifyWikiName(parts.page)}`,
          children: [{ type: "text", value: parts.alias ?? parts.page }],
        };
      },
    ]);
  };
}
