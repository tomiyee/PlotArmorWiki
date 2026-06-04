"use client";

import type { ReactElement } from "react";
import {
  DecoratorNode,
  type LexicalEditor,
  type EditorConfig,
  type NodeKey,
  type SerializedLexicalNode,
  type LexicalNode,
  $getRoot,
} from "lexical";
import { $isRefNode } from "./RefNode";

// ── RefboxNode ───────────────────────────────────────────────────────────────

/**
 * Custom Lexical DecoratorNode for the `{{refbox}}` placeholder.
 *
 * Renders a live preview of all `{{ref|token}}` nodes currently in the editor,
 * deduplicated in document order and displayed as a numbered list.
 * On export, produces `{{refbox}}` verbatim for the remark-refs plugin to handle.
 *
 * @example
 * const node = new RefboxNode();
 */
export class RefboxNode extends DecoratorNode<ReactElement> {
  static getType(): string {
    return "refbox";
  }

  static clone(node: RefboxNode): RefboxNode {
    return new RefboxNode(node.__key);
  }

  static importJSON(_serialized: SerializedLexicalNode): RefboxNode {
    return new RefboxNode();
  }

  constructor(key?: NodeKey) {
    super(key);
  }

  exportJSON(): SerializedLexicalNode {
    return {
      ...super.exportJSON(),
      type: "refbox",
      version: 1,
    };
  }

  createDOM(_config: EditorConfig): HTMLElement {
    const div = document.createElement("div");
    return div;
  }

  updateDOM(): false {
    return false;
  }

  isInline(): boolean {
    return false;
  }

  getTextContent(): string {
    return "{{refbox}}";
  }

  decorate(editor: LexicalEditor, _config: EditorConfig): ReactElement {
    return <RefboxPreview editor={editor} />;
  }
}

export function $isRefboxNode(
  node: LexicalNode | null | undefined,
): node is RefboxNode {
  return node instanceof RefboxNode;
}

// ── RefboxPreview ─────────────────────────────────────────────────────────────

type RefboxPreviewProps = {
  /** The Lexical editor instance, used to read all RefNode tokens from state. */
  editor: LexicalEditor;
};

/**
 * Live preview chip for the `{{refbox}}` block node in the WYSIWYG editor.
 *
 * Reads all `RefNode`s from the Lexical editor state at render time to
 * produce a deduplicated ordered list, matching what the remark-refs plugin
 * will render at read time.
 *
 * @example
 * <RefboxPreview editor={lexicalEditor} />
 */
function RefboxPreview(props: RefboxPreviewProps) {
  const { editor } = props;

  // Collect unique tokens in document order.
  const tokens: string[] = [];
  const seen = new Set<string>();

  editor.getEditorState().read(() => {
    function collectRefs(node: LexicalNode) {
      if ($isRefNode(node)) {
        if (!seen.has(node.__token)) {
          seen.add(node.__token);
          tokens.push(node.__token);
        }
        return;
      }
      // @ts-expect-error: getChildren is available on ElementNodes
      const children: LexicalNode[] = node.getChildren?.() ?? [];
      for (const child of children) {
        collectRefs(child);
      }
    }
    collectRefs($getRoot());
  });

  return (
    <div
      contentEditable={false}
      className="my-2 rounded border border-border bg-muted/40 px-3 py-2"
    >
      <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        References
      </p>
      {tokens.length === 0 ? (
        <p className="text-sm text-muted-foreground italic">
          No references cited above yet.
        </p>
      ) : (
        <ol className="list-decimal list-inside space-y-0.5 text-sm">
          {tokens.map((token, i) => {
            const colonIdx = token.indexOf(":");
            const displayValue =
              colonIdx !== -1 ? token.slice(colonIdx + 1) : token;
            return (
              <li key={token} className="text-foreground/80">
                <span className="text-foreground font-medium">{displayValue}</span>
                {" "}
                <span className="text-xs text-muted-foreground">
                  [{i + 1}]
                </span>
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}
