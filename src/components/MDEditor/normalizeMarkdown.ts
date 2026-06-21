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

/**
 * Prepares stored markdown for MDXEditor's initial load (via `markdown=` prop
 * or `setMarkdown()`). Applies all normalizations from `normalizeMarkdown`,
 * then additionally protects wiki-link alias escape sequences from MDXEditor's
 * CommonMark parser, which decodes both `\]` → `]` and `\\` → `\`.
 *
 * Doubling every `\` in the alias (`\` → `\\`) ensures CommonMark's pairwise
 * decoding produces the original single `\`, so `WIKI_LINK_RE` sees the full
 * two-level escape intact (`\\` → `\`, `\]` → `]`).
 *
 * NOT used on the `onChange` / save path — that path emits escape sequences
 * directly and stores them verbatim, where they are read by the remark plugin
 * (which does not go through the CommonMark parser).
 *
 * @example
 * // initialValue fed to MDXEditorClient:
 * const [initialValue] = useState(() => prepareMarkdownForEditor(value));
 */
export function prepareMarkdownForEditor(md: string): string {
  return normalizeMarkdown(md).replace(
    WIKI_LINK_RE,
    (_match, path: string, alias: string | undefined) => {
      if (!alias) return `[[${path}]]`;
      // Double every \ so CommonMark's pairwise decoding restores each one:
      //   \\   → \ (escaped backslash survives as \)
      //   \]   → \] after CommonMark strips one level: \\] → \]
      const editorAlias = alias.replace(/\\/g, "\\\\");
      return `[[${path}|${editorAlias}]]`;
    },
  );
}
