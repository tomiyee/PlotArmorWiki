/**
 * MDXEditor's markdown serializer (mdast-util-to-markdown) escapes `[` to `\[`,
 * turning `[[wiki-link]]` into `\[\[wiki-link]]` in the string emitted by
 * onChange. This reversal is applied before trigger detection so `[[` is always
 * found correctly.
 */
export function normalizeMarkdown(md: string): string {
  return md.replace(/\\\[\\\[/g, "[[");
}
