import { findAndReplace } from "mdast-util-find-and-replace";
import type { Root, Text, Html, Nodes } from "mdast";
import type { Plugin } from "unified";

/**
 * Remark plugin that transforms `{{ref|token}}` inline citations into numbered
 * superscript anchors.
 *
 * Two-pass strategy:
 *   Pass 1 — walk all text nodes, collect `{{ref|…}}` tokens in document order,
 *             build a dedup map (token → ordinal, assigned by first appearance).
 *   Pass 2 — use findAndReplace to replace each `{{ref|token}}` with an `html`
 *             superscript node.
 *
 * When `externalOrdinalMap` is supplied (e.g. from `WikiPageRefsProvider`), the
 * plugin skips local token collection and uses the externally computed global
 * ordinals instead. This enables consistent cross-section ref numbering.
 *
 * @example
 * remarkPlugins={[remarkWikiLinks(serialSlug, pageTitles, opts), remarkRefs({ externalOrdinalMap })]}
 */

const REF_RE = /\{\{ref\|([^}]+)\}\}/g;

/**
 * Returns the remark-refs plugin.
 *
 * @example
 * remarkPlugins={[remarkWikiLinks(serialSlug, pageTitles, opts), remarkRefs()]}
 */
export function remarkRefs(options?: {
  /**
   * When provided, skips local Pass-1 token collection and uses these
   * globally computed ordinals instead. Supplied by `WikiPageRefsProvider`
   * so ref numbers are consistent across all page sections.
   */
  externalOrdinalMap?: Map<string, number>;
}): Plugin<[], Root> {
  return () => (tree) => {
    const { externalOrdinalMap } = options ?? {};
    let ordinalMap: Map<string, number>;

    if (externalOrdinalMap && externalOrdinalMap.size > 0) {
      ordinalMap = externalOrdinalMap;
      // Skip processing if this section has no local refs to replace.
      let hasLocalRef = false;
      walkTextNodes(tree, (t) => {
        if (t.includes("{{ref|")) hasLocalRef = true;
      });
      if (!hasLocalRef) return;
    } else {
      // ── Pass 1: collect all ref tokens in document order ──────────────────
      ordinalMap = new Map<string, number>(); // token → 1-based ordinal

      walkTextNodes(tree, (text) => {
        if (!text.includes("{{ref|")) return;
        REF_RE.lastIndex = 0;
        let m: RegExpExecArray | null;
        while ((m = REF_RE.exec(text)) !== null) {
          const token = m[1].trim();
          if (!ordinalMap.has(token)) {
            ordinalMap.set(token, ordinalMap.size + 1);
          }
        }
      });

      if (ordinalMap.size === 0) return;
    }

    // ── Pass 2: replace {{ref|token}} with superscript html nodes ───────────
    findAndReplace(tree, [
      REF_RE,
      (match: string, tokenRaw: string) => {
        void match;
        const token = tokenRaw.trim();
        const n = ordinalMap.get(token) ?? ordinalMap.size + 1;
        return {
          type: "html",
          value: `<sup id="ref-cite-${n}" data-ref-token="${encodeURIComponent(token)}">[${n}]</sup>`,
        } as Html;
      },
    ]);
  };
}

// ── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Calls `cb` with the `.value` of every `text` node in the tree.
 * Implemented without `unist-util-visit` to avoid an extra dependency.
 */
function walkTextNodes(node: Nodes | Root, cb: (text: string) => void): void {
  if (node.type === "text") {
    cb((node as Text).value);
    return;
  }
  if ("children" in node && Array.isArray(node.children)) {
    for (const child of node.children) {
      walkTextNodes(child as Nodes, cb);
    }
  }
}
