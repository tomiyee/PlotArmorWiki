"use client";

import type { ReactElement } from "react";
import {
  DecoratorNode,
  type LexicalEditor,
  type EditorConfig,
  type NodeKey,
  type SerializedLexicalNode,
  type LexicalNode,
} from "lexical";

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

  decorate(_editor: LexicalEditor, _config: EditorConfig): ReactElement {
    return <RefboxPreview />;
  }
}

export function $isRefboxNode(
  node: LexicalNode | null | undefined,
): node is RefboxNode {
  return node instanceof RefboxNode;
}

// ── RefboxPreview ─────────────────────────────────────────────────────────────

/**
 * Static placeholder rendered in the WYSIWYG editor for the `{{refbox}}`
 * block node. The actual numbered list is generated at read time by the
 * remark-refs plugin; here we just indicate that the box will appear.
 *
 * @example
 * <RefboxPreview />
 */
function RefboxPreview() {
  return (
    <div
      contentEditable={false}
      className="my-2 rounded border border-border bg-muted/40 px-3 py-2"
    >
      <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        References
      </p>
      <p className="text-sm text-muted-foreground italic">
        The contents of the references box will be generated dynamically.
      </p>
    </div>
  );
}
