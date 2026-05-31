/**
 * MDXEditor's markdown serializer (mdast-util-to-markdown) escapes `[` to `\[`,
 * turning `[[wiki-link]]` into `\[\[wiki-link]]` in the string emitted by
 * onChange. This reversal is applied before trigger detection so `[[` is always
 * found correctly.
 *
 * Also strips HTML/JSX tags from wiki link aliases. MDXEditor parses markdown as
 * MDX, so angle brackets in alias text are treated as JSX element syntax and
 * produce `mdxJsxTextElement` mdast nodes — which crash on Lexical import
 * because no visitor is registered for that type. Aliases are plain display
 * text; HTML markup there is meaningless and safe to strip.
 */
export function normalizeMarkdown(md: string): string {
  return md
    .replace(/\\\[\\\[/g, "[[")
    .replace(/\[\[([^|]+)(?:\|([^\]]*))?\]\]/g, (_match, path, alias) => {
      if (alias === undefined) return `[[${path}]]`;
      const plainAlias = (alias as string).replace(/<[^>]*>/g, "").trim();
      return plainAlias ? `[[${path}|${plainAlias}]]` : `[[${path}]]`;
    });
}
