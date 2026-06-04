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
import { RefNode, $isRefNode } from "./RefNode";
import { RefboxNode, $isRefboxNode } from "./RefboxNode";

// ── MDXEditor import visitor: text → RefNode / RefboxNode ────────────────────

/**
 * Intercepts mdast text nodes that contain `{{ref|token}}` or `{{refbox}}`
 * patterns and splits them into plain TextNodes, RefNodes, and RefboxNodes.
 *
 * Priority 1 ensures this runs before MDXEditor's built-in text visitor.
 */
export const RefTextVisitor: MdastImportVisitor<Mdast.Text> = {
  testNode: "text",
  priority: 1,
  visitNode({ mdastNode, lexicalParent, actions }) {
    const text = mdastNode.value;
    const hasRef = text.includes("{{ref|");
    const hasRefbox = text.includes("{{refbox}}");

    if (!hasRef && !hasRefbox) {
      actions.nextVisitor();
      return;
    }

    const formatting = actions.getParentFormatting();

    // Combined pattern — refs first so {{refbox}} is caught by its own branch.
    const COMBINED = /\{\{ref\|([^}]+)\}\}|\{\{refbox\}\}/g;
    let lastIndex = 0;
    let match: RegExpExecArray | null;
    COMBINED.lastIndex = 0;

    while ((match = COMBINED.exec(text)) !== null) {
      if (match.index > lastIndex) {
        const before = $createTextNode(text.slice(lastIndex, match.index));
        before.setFormat(formatting);
        (lexicalParent as ElementNode).append(before);
      }

      if (match[0].startsWith("{{ref|")) {
        const token = match[1].trim();
        (lexicalParent as ElementNode).append(new RefNode(token));
      } else {
        // {{refbox}} — block node; append inline here (Lexical will normalise).
        (lexicalParent as ElementNode).append(new RefboxNode());
      }

      lastIndex = match.index + match[0].length;
    }

    if (lastIndex < text.length) {
      const after = $createTextNode(text.slice(lastIndex));
      after.setFormat(formatting);
      (lexicalParent as ElementNode).append(after);
    }
  },
};

// ── MDXEditor export visitors ────────────────────────────────────────────────

// Custom mdast node types — not part of the standard Mdast.Nodes union.
interface MdastRefNode {
  type: "refCitation";
  token: string;
}

interface MdastRefboxNode {
  type: "refbox";
}

export const RefExportVisitor: LexicalExportVisitor<RefNode, Mdast.Text> = {
  testLexicalNode: $isRefNode,
  visitLexicalNode({ lexicalNode, mdastParent, actions }) {
    actions.appendToParent(mdastParent, {
      type: "refCitation",
      token: lexicalNode.__token,
    } as unknown as Mdast.Text);
  },
};

export const RefboxExportVisitor: LexicalExportVisitor<
  RefboxNode,
  Mdast.Text
> = {
  testLexicalNode: $isRefboxNode,
  visitLexicalNode({ mdastParent, actions }) {
    actions.appendToParent(mdastParent, {
      type: "refbox",
    } as unknown as Mdast.Text);
  },
};

// ── toMarkdown handlers ──────────────────────────────────────────────────────

/**
 * Passed to MDXEditorClient.toMarkdownOptions. Emits `{{ref|token}}` and
 * `{{refbox}}` verbatim — mdast-util-to-markdown would otherwise escape `{`.
 */
export const refToMarkdownExtension = {
  handlers: {
    refCitation: (node: MdastRefNode) => `{{ref|${node.token}}}`,
    refbox: (_node: MdastRefboxNode) => "{{refbox}}",
  },
} as unknown as ToMarkdownExtension;

// ── realmPlugin ──────────────────────────────────────────────────────────────

/**
 * Realm plugin that registers RefNode, RefboxNode, import visitors, and export
 * visitors with the MDXEditor Lexical realm.
 *
 * @example
 * plugins={[wikiPlugin, refPlugin, toolbarPlugin({ ... }), ...]}
 */
export const refPlugin = realmPlugin({
  init(realm) {
    realm.pubIn({
      [addLexicalNode$]: RefNode,
      [addImportVisitor$]: RefTextVisitor,
      [addExportVisitor$]: RefExportVisitor,
    });
    realm.pubIn({
      [addLexicalNode$]: RefboxNode,
      [addExportVisitor$]: RefboxExportVisitor,
    });
  },
})();
