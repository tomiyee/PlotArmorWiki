import type {
  LexicalExportVisitor,
  ToMarkdownExtension,
} from "@mdxeditor/editor";
import {
  addLexicalNode$,
  addExportVisitor$,
  createRootEditorSubscription$,
  realmPlugin,
} from "@mdxeditor/editor";
import {
  TextNode,
  $createTextNode,
  $createParagraphNode,
  $isParagraphNode,
  $getSelection,
  $isRangeSelection,
  KEY_BACKSPACE_COMMAND,
  COMMAND_PRIORITY_LOW,
} from "lexical";
import type { LexicalNode } from "lexical";
import type * as Mdast from "mdast";
import { RefNode, $isRefNode } from "./RefNode";
import { RefboxNode, $isRefboxNode } from "./RefboxNode";

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
 * Realm plugin that registers RefNode, RefboxNode, export visitors, a TextNode
 * transform (auto-replaces typed `{{refbox}}` with a RefboxNode + new
 * paragraph), and a Backspace command handler (deletes the RefboxNode paragraph
 * when the cursor is at the start of the line after it).
 *
 * @example
 * plugins={[wikiPlugin, refPlugin, toolbarPlugin({ ... }), ...]}
 */
export const refPlugin = realmPlugin({
  init(realm) {
    realm.pubIn({
      [addLexicalNode$]: RefNode,
      [addExportVisitor$]: RefExportVisitor,
    });
    realm.pubIn({
      [addLexicalNode$]: RefboxNode,
      [addExportVisitor$]: RefboxExportVisitor,
    });

    realm.pub(createRootEditorSubscription$, (editor) => {
      // ── TextNode transform: auto-replace typed {{refbox}} ──────────────────
      const cleanupTransform = editor.registerNodeTransform(TextNode, (textNode) => {
        const text = textNode.getTextContent();
        const idx = text.indexOf("{{refbox}}");
        if (idx === -1) return;

        const before = text.slice(0, idx);
        const after = text.slice(idx + "{{refbox}}".length);

        const parentParagraph = textNode.getParent();
        if (!$isParagraphNode(parentParagraph)) return;

        const refboxParagraph = $createParagraphNode();
        refboxParagraph.append(new RefboxNode());

        const afterParagraph = $createParagraphNode();
        if (after) afterParagraph.append($createTextNode(after));

        if (before) {
          textNode.setTextContent(before);
          parentParagraph.insertAfter(refboxParagraph);
        } else if (parentParagraph.getChildrenSize() === 1) {
          // Text node is the sole child — replace the paragraph wholesale.
          parentParagraph.replace(refboxParagraph);
        } else {
          // Other nodes precede the trigger; remove only the text node.
          textNode.remove();
          parentParagraph.insertAfter(refboxParagraph);
        }
        refboxParagraph.insertAfter(afterParagraph);
        afterParagraph.selectStart();
      });

      // ── Backspace command: delete refbox when cursor is right after it ──────
      const cleanupCommand = editor.registerCommand(
        KEY_BACKSPACE_COMMAND,
        (event) => {
          const selection = $getSelection();
          if (!$isRangeSelection(selection) || !selection.isCollapsed()) return false;

          const anchor = selection.anchor;
          if (anchor.offset !== 0) return false;

          // Resolve the block-level node the cursor is at the start of.
          const anchorNode: LexicalNode = anchor.getNode();
          let currentBlock: LexicalNode | null = null;
          if ($isParagraphNode(anchorNode)) {
            currentBlock = anchorNode;
          } else {
            const parent = anchorNode.getParent();
            if ($isParagraphNode(parent) && anchorNode.getPreviousSibling() === null) {
              currentBlock = parent;
            }
          }
          if (!currentBlock) return false;

          const prevSibling = currentBlock.getPreviousSibling();
          if (!$isParagraphNode(prevSibling)) return false;

          const prevChildren = prevSibling.getChildren();
          if (prevChildren.length !== 1 || !$isRefboxNode(prevChildren[0])) return false;

          event?.preventDefault();
          prevSibling.remove();
          return true;
        },
        COMMAND_PRIORITY_LOW,
      );

      return () => {
        cleanupTransform();
        cleanupCommand();
      };
    });
  },
})();
