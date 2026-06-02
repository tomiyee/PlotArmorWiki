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
import { WikiLinkChip } from "./WikiLinkChip";

// ── WikiLinkNode ─────────────────────────────────────────────────────────────

interface SerializedWikiLinkNode extends SerializedLexicalNode {
  token: string;
  alias?: string;
}

/**
 * Custom Lexical DecoratorNode for wiki links.
 *
 * Stores the raw token string (e.g. `page:luffy` or `Chapter:Chapter 5`) and
 * an optional display alias. On export, produces `[[token]]` or
 * `[[token|alias]]` so the markdown stored in the DB round-trips correctly
 * through the remark plugin.
 */
export class WikiLinkNode extends DecoratorNode<ReactElement> {
  __token: string;
  __alias?: string;

  static getType(): string {
    return "wiki-link";
  }

  static clone(node: WikiLinkNode): WikiLinkNode {
    return new WikiLinkNode(node.__token, node.__alias, node.__key);
  }

  static importJSON(serialized: SerializedWikiLinkNode): WikiLinkNode {
    return new WikiLinkNode(serialized.token, serialized.alias);
  }

  constructor(token: string, alias?: string, key?: NodeKey) {
    super(key);
    this.__token = token;
    this.__alias = alias;
  }

  exportJSON(): SerializedWikiLinkNode {
    return {
      ...super.exportJSON(),
      type: "wiki-link",
      token: this.__token,
      alias: this.__alias,
      version: 1,
    };
  }

  createDOM(_config: EditorConfig): HTMLElement {
    const span = document.createElement("span");
    span.style.display = "inline";
    return span;
  }

  updateDOM(): false {
    return false;
  }

  isInline(): boolean {
    return true;
  }

  getTextContent(): string {
    return this.__alias
      ? `[[${this.__token}|${this.__alias}]]`
      : `[[${this.__token}]]`;
  }

  decorate(_editor: LexicalEditor, _config: EditorConfig): ReactElement {
    return <WikiLinkChip token={this.__token} alias={this.__alias} nodeKey={this.__key} />;
  }
}

export function $isWikiLinkNode(
  node: LexicalNode | null | undefined,
): node is WikiLinkNode {
  return node instanceof WikiLinkNode;
}
