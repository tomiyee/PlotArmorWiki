import { WIKI_LINK_RE } from "@/lib/wiki-links";

/**
 * MDXEditor's markdown serializer (mdast-util-to-markdown) escapes `[` to `\[`,
 * turning `[[wiki-link]]` into `\[\[wiki-link]]` in the string emitted by
 * onChange. This reversal is applied before trigger detection so `[[` is always
 * found correctly.
 *
 * Also HTML-escapes MDX-special characters in wiki link aliases (`&`, `<`,
 * `>`, `{`, `}`). MDXEditor parses markdown as MDX, so raw angle brackets
 * become `mdxJsxTextElement` nodes and `{...}` becomes a JSX expression —
 * both crash Lexical import because no visitor is registered for those types.
 * `&` is escaped first to avoid corrupting the entity sequences that follow.
 */
export function normalizeMarkdown(md: string): string {
  return md
    .replace(/\\\[\\\[/g, "[[")
    .replace(WIKI_LINK_RE, (_match, path: string, alias: string | undefined) => {
      if (!alias) return `[[${path}]]`;
      const cleanAlias = alias
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/\{/g, "&#123;")
        .replace(/\}/g, "&#125;")
        .trim();
      return cleanAlias ? `[[${path}|${cleanAlias}]]` : `[[${path}]]`;
    });
}
