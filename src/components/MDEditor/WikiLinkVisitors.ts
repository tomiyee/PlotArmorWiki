import type {
  MdastImportVisitor,
  LexicalExportVisitor,
  ToMarkdownExtension,
} from "@mdxeditor/editor";
import {
  addLexicalNode$,
  addImportVisitor$,
  addExportVisitor$,
  realmPlugin,
} from "@mdxeditor/editor";
import { ElementNode, $createTextNode } from "lexical";
import type * as Mdast from "mdast";
import { WikiLinkNode, $isWikiLinkNode } from "./WikiLinkNode";
import { WIKI_LINK_RE } from "@/lib/wiki-links";

// ── MDXEditor import visitor: text → WikiLinkNode ────────────────────────────

/**
 * Intercepts mdast text nodes that contain `[[token]]` patterns and splits
 * them into a mix of plain TextNodes and WikiLinkNodes.
 *
 * Priority 1 ensures this runs before MDXEditor's built-in text visitor
 * (priority 0). For text nodes with no wiki links, `actions.nextVisitor()`
 * delegates back to the default handler.
 */
export const WikiLinkTextVisitor: MdastImportVisitor<Mdast.Text> = {
  testNode: "text",
  priority: 1,
  visitNode({ mdastNode, lexicalParent, actions }) {
    const text = mdastNode.value;
    if (!text.includes("[[")) {
      actions.nextVisitor();
      return;
    }

    const formatting = actions.getParentFormatting();
    let lastIndex = 0;
    let match: RegExpExecArray | null;
    WIKI_LINK_RE.lastIndex = 0;

    while ((match = WIKI_LINK_RE.exec(text)) !== null) {
      if (match.index > lastIndex) {
        const before = $createTextNode(text.slice(lastIndex, match.index));
        before.setFormat(formatting);
        (lexicalParent as ElementNode).append(before);
      }
      const alias = match[2]?.trim() || undefined;
      (lexicalParent as ElementNode).append(new WikiLinkNode(match[1], alias));
      lastIndex = match.index + match[0].length;
    }

    if (lastIndex < text.length) {
      const after = $createTextNode(text.slice(lastIndex));
      after.setFormat(formatting);
      (lexicalParent as ElementNode).append(after);
    }
  },
};

// ── MDXEditor export visitor: WikiLinkNode → wikiLink mdast node ─────────────

// Custom mdast node - not part of the standard Mdast.Nodes union.
interface MdastWikiLinkNode {
  type: "wikiLink";
  value: string;
  alias?: string;
}

export const WikiLinkExportVisitor: LexicalExportVisitor<
  WikiLinkNode,
  Mdast.Text
> = {
  testLexicalNode: $isWikiLinkNode,
  visitLexicalNode({ lexicalNode, mdastParent, actions }) {
    // Produce a custom "wikiLink" node so the toMarkdown handler below can
    // emit [[token]] without mdast-util-to-markdown escaping the [ character.
    actions.appendToParent(mdastParent, {
      type: "wikiLink",
      value: lexicalNode.__token,
      alias: lexicalNode.__alias,
    } as unknown as Mdast.Text);
  },
};

// Passed to MDXEditorClient.toMarkdownOptions - emits [[token]] or [[token|alias]] verbatim.
// mdast-util-to-markdown escapes [ in text nodes; a custom handler bypasses that.
export const wikiLinkToMarkdownExtension = {
  handlers: {
    wikiLink: (node: MdastWikiLinkNode) =>
      node.alias ? `[[${node.value}|${node.alias}]]` : `[[${node.value}]]`,
  },
} as unknown as ToMarkdownExtension;

/**
 * Realm plugin that registers the WikiLinkNode, import visitor, and export
 * visitor with the MDXEditor Lexical realm.
 *
 * @example
 * plugins={[wikiPlugin, toolbarPlugin({ ... }), ...]}
 */
export const wikiPlugin = realmPlugin({
  init(realm) {
    realm.pubIn({
      [addLexicalNode$]: WikiLinkNode,
      [addImportVisitor$]: WikiLinkTextVisitor,
      [addExportVisitor$]: WikiLinkExportVisitor,
    });
  },
})();
