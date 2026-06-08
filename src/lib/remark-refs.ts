import { findAndReplace } from "mdast-util-find-and-replace";
import type { Root, Text, Html, List, ListItem, Paragraph, Nodes, Link } from "mdast";
import type { Plugin } from "unified";
import { slugifyWikiName, isChapterCategory } from "./wiki-links";

/**
 * Remark plugin that transforms `{{ref|token}}` inline citations and
 * `{{refbox}}` placeholders in markdown.
 *
 * Must be added to the plugin chain **after** `remarkWikiLinks`. When
 * `serialSlug` is supplied, refbox list entries are emitted as mdast `link`
 * nodes using the same URL shapes that `remarkWikiLinks` produces, so
 * `makeAnchorComponent` in MarkdownRenderer wraps them with hover-card
 * previews automatically.
 *
 * Two-pass strategy:
 *   Pass 1 — walk all text nodes, collect `{{ref|…}}` tokens in document order,
 *             build a dedup map (token → ordinal, assigned by first appearance).
 *   Pass 2 — use findAndReplace to replace each `{{ref|token}}` with an `html`
 *             superscript node; replace each `{{refbox}}` with a sentinel html
 *             node, then post-process paragraphs containing only the sentinel
 *             into proper ordered-list mdast nodes.
 *
 * @example
 * // In a remarkPlugins array (must come after remarkWikiLinks):
 * remarkPlugins={[remarkWikiLinks(serialSlug, ...), remarkRefs(serialSlug, pageTitles, { chapterType, chapters })]}
 */

const REF_RE = /\{\{ref\|([^}]+)\}\}/g;
const REFBOX_RE = /\{\{refbox\}\}/g;
const REFBOX_SENTINEL = "{{refbox-sentinel-placeholder}}";

/**
 * Returns the remark-refs plugin.
 *
 * When `serialSlug` is provided, refbox list entries are emitted as clickable
 * links with hover-card previews (page links → `WikiLinkPreview`, chapter links
 * → `ChapterLinkPreview`). Without `serialSlug`, entries fall back to plain text.
 *
 * When `externalOrdinalMap` is supplied (e.g. from `WikiPageRefsProvider`), the
 * plugin skips local token collection and uses the externally computed global
 * ordinals instead. This enables consistent cross-section ref numbering.
 *
 * @example
 * remarkPlugins={[remarkWikiLinks(serialSlug, pageTitles, opts), remarkRefs(serialSlug, pageTitles, opts)]}
 */
export function remarkRefs(
  serialSlug?: string,
  pageTitles?: Record<string, string>,
  options?: {
    /** The serial's chapter type (e.g. "Chapter", "Episode"). */
    chapterType?: string;
    /** Map of chapter display name → chapter idx for URL resolution. */
    chapters?: Record<string, number>;
    /**
     * When provided, skips local Pass-1 token collection and uses these
     * globally computed ordinals instead. Supplied by `WikiPageRefsProvider`
     * so ref numbers are consistent across all page sections.
     */
    externalOrdinalMap?: Map<string, number>;
  },
): Plugin<[], Root> {
  return () => (tree) => {
    const { externalOrdinalMap } = options ?? {};
    let ordinalMap: Map<string, number>;

    if (externalOrdinalMap && externalOrdinalMap.size > 0) {
      ordinalMap = externalOrdinalMap;
      // Skip processing if this section has neither local refs nor a refbox.
      let hasLocalRef = false;
      walkTextNodes(tree, (t) => {
        if (t.includes("{{ref|")) hasLocalRef = true;
      });
      if (!hasLocalRef && !hasRefbox(tree)) return;
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

      // Nothing to do if no refs or refbox found.
      if (ordinalMap.size === 0 && !hasRefbox(tree)) return;
    }

    // ── Pass 2a: replace {{ref|token}} with superscript html nodes ──────────
    findAndReplace(tree, [
      REF_RE,
      (match: string, tokenRaw: string) => {
        void match;
        const token = tokenRaw.trim();
        const n = ordinalMap.get(token) ?? (ordinalMap.size + 1);
        return {
          type: "html",
          value: `<sup id="ref-cite-${n}"><a href="#ref-${n}">[${n}]</a></sup>`,
        } as Html;
      },
    ]);

    // ── Pass 2b: replace {{refbox}} with a sentinel html node ───────────────
    findAndReplace(tree, [
      REFBOX_RE,
      () => {
        return {
          type: "html",
          value: REFBOX_SENTINEL,
        } as Html;
      },
    ]);

    // ── Pass 3: replace sentinel paragraphs with an ordered list ────────────
    // findAndReplace inserted the sentinel as an html node inside paragraphs.
    // Walk the top-level children and any block-level descendants to find
    // paragraphs that consist solely of the sentinel node and replace them.
    replaceRefboxParagraphs(tree, ordinalMap, serialSlug, pageTitles, options);
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

/** Returns true if the tree contains at least one `{{refbox}}` text node. */
function hasRefbox(node: Nodes | Root): boolean {
  if (node.type === "text" && (node as Text).value.includes("{{refbox}}")) {
    return true;
  }
  if ("children" in node && Array.isArray(node.children)) {
    for (const child of node.children) {
      if (hasRefbox(child as Nodes)) return true;
    }
  }
  return false;
}

/**
 * Walks block-level children of `node`, replacing any `paragraph` that
 * contains only the refbox sentinel html node with an ordered list.
 */
function replaceRefboxParagraphs(
  node: { children: Nodes[] },
  ordinalMap: Map<string, number>,
  serialSlug?: string,
  pageTitles?: Record<string, string>,
  options?: { chapterType?: string; chapters?: Record<string, number> },
): void {
  const children = node.children as Nodes[];
  for (let i = 0; i < children.length; i++) {
    const child = children[i];

    // Check if this paragraph is a refbox sentinel wrapper.
    if (
      child.type === "paragraph" &&
      isSentinelParagraph(child as Paragraph)
    ) {
      children.splice(i, 1, buildRefboxList(ordinalMap, serialSlug, pageTitles, options));
      // i stays the same — no need to revisit the replacement list node.
      continue;
    }

    // Recurse into block-level containers (blockquote, listItem, etc.).
    if ("children" in child && Array.isArray((child as { children: Nodes[] }).children)) {
      replaceRefboxParagraphs(child as { children: Nodes[] }, ordinalMap, serialSlug, pageTitles, options);
    }
  }
}

/** Returns true if the paragraph consists solely of the refbox sentinel html node. */
function isSentinelParagraph(para: Paragraph): boolean {
  if (para.children.length === 0) return false;
  // Allow one or more html sentinel nodes (findAndReplace may produce multiples
  // if {{refbox}} appeared more than once — though unusual).
  return para.children.every(
    (c) => c.type === "html" && (c as Html).value === REFBOX_SENTINEL,
  );
}

/** Builds an mdast ordered list from the ordinalMap. */
function buildRefboxList(
  ordinalMap: Map<string, number>,
  serialSlug?: string,
  pageTitles?: Record<string, string>,
  options?: { chapterType?: string; chapters?: Record<string, number> },
): List {
  const items: ListItem[] = [];

  ordinalMap.forEach((n, token) => {
    const backLink = `<a id="ref-${n}" href="#ref-cite-${n}">[${n}]</a>`;
    const contentNode: Text | Link = serialSlug
      ? buildRefLink(token, serialSlug, pageTitles, options)
      : ({ type: "text", value: tokenToDisplayText(token) } as Text);

    const itemParagraph: Paragraph = {
      type: "paragraph",
      children: [
        { type: "html", value: backLink } as Html,
        { type: "text", value: " " } as Text,
        contentNode,
      ],
    };
    items.push({
      type: "listItem",
      spread: false,
      children: [itemParagraph],
    });
  });

  return {
    type: "list",
    ordered: true,
    start: 1,
    spread: false,
    children: items,
  };
}

/**
 * Converts a ref token into an mdast `link` node using the same URL shapes
 * that `remarkWikiLinks` produces, so `makeAnchorComponent` wraps them with
 * hover-card previews automatically.
 *
 * Falls back to a plain `text` node for unresolvable chapter tokens.
 */
function buildRefLink(
  token: string,
  serialSlug: string,
  pageTitles?: Record<string, string>,
  options?: { chapterType?: string; chapters?: Record<string, number> },
): Link | Text {
  const colonIdx = token.indexOf(":");
  const { chapterType, chapters } = options ?? {};

  if (colonIdx !== -1) {
    const category = token.slice(0, colonIdx);
    const value = token.slice(colonIdx + 1).trim();

    if (chapterType && isChapterCategory(category, chapterType)) {
      const idx = chapters?.[value];
      if (idx !== undefined) {
        return {
          type: "link",
          url: `/${serialSlug}/chapter/${idx}`,
          children: [{ type: "text", value }],
        } as Link;
      }
      // Unknown chapter name — fall back to plain text.
      return { type: "text", value } as Text;
    }

    // Explicit "page:" prefix or any other unrecognised category — treat as page.
    // `value` is the slug; look up a chapter-accurate display title if available.
    const displayText = pageTitles?.[value] ?? value;
    return {
      type: "link",
      url: `/${serialSlug}/${slugifyWikiName(value)}`,
      children: [{ type: "text", value: displayText }],
    } as Link;
  }

  // No colon — treat the whole token as a page slug.
  const displayText = pageTitles?.[token] ?? token;
  return {
    type: "link",
    url: `/${serialSlug}/${slugifyWikiName(token)}`,
    children: [{ type: "text", value: displayText }],
  } as Link;
}

/**
 * Converts a ref token (e.g. `page:luffy` or `Chapter:Chapter 5`) into a
 * human-readable display string for plain-text refbox fallback (no serialSlug).
 */
function tokenToDisplayText(token: string): string {
  const colonIdx = token.indexOf(":");
  if (colonIdx === -1) return token;
  return token.slice(colonIdx + 1).trim();
}
