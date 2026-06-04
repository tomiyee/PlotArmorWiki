import { useRef, useEffect, useCallback, type RefObject } from "react";
import type { MDXEditorMethods } from "@mdxeditor/editor";
import {
  $getSelection,
  $isRangeSelection,
  $isTextNode,
  getNearestEditorFromDOMNode,
} from "lexical";
import { WikiLinkNode } from "./WikiLinkNode";
import { normalizeMarkdown } from "./normalizeMarkdown";

// ── Types ─────────────────────────────────────────────────────────────────────

export type SuggestionKind = "page" | "chapter";

export interface Suggestion {
  kind: SuggestionKind;
  name: string;
  /** For page suggestions: the slug. For chapter suggestions: the display name. */
  slug: string;
}

type UseApplySuggestionParams = {
  /** Ref to the editor wrapper div, used to locate the Lexical contenteditable. */
  containerRef: RefObject<HTMLDivElement | null>;
  /** Ref to MDXEditorMethods, used as fallback to call setMarkdown. */
  editorRef: RefObject<MDXEditorMethods | null>;
  /** Current markdown value; initializes internal refs and triggers editor sync on change. */
  value: string;
  /** Closes the autocomplete dropdown and resets its state. */
  closeSuggestions: () => void;
  /** Chapter type label (e.g. `"Chapter"`) used to build `Chapter:Name` tokens. */
  chapterType: string | undefined;
  /** Parent onChange handler; called with the new markdown after a fallback insertion. */
  onChange: (val: string | undefined) => void;
  /**
   * Called after the WikiLinkNode is inserted, with the Lexical node key and the
   * chip's DOM element so the caller can open the alias-input step with live positioning.
   * Not called when the node key or DOM span could not be located.
   */
  onAfterInsert?: (nodeKey: string, el: HTMLElement) => void;
};

// ── Hook ──────────────────────────────────────────────────────────────────────

/**
 * Inserts a WikiLinkNode at the cursor, replacing the open `[[query` fragment.
 *
 * Uses Lexical's `editor.update()` + `selection.setTextNodeRange` +
 * `selection.insertNodes` so the cursor lands immediately after the chip
 * rather than jumping to end-of-document (which happened with `setMarkdown`).
 *
 * Falls back to the `setMarkdown` path when the Lexical editor is not
 * reachable from the DOM (e.g. component just mounted).
 *
 * @example
 * const { applySuggestion } = useApplySuggestion({ containerRef, editorRef, value, ... });
 * applySuggestion({ kind: "page", name: "Luffy", slug: "luffy" });
 */
export function useApplySuggestion(params: UseApplySuggestionParams) {
  const {
    containerRef,
    editorRef,
    value,
    closeSuggestions,
    chapterType,
    onChange,
    onAfterInsert,
  } = params;

  const isApplyingRef = useRef(false);
  const lastEmittedRef = useRef<string>(normalizeMarkdown(value));
  const prevValueRef = useRef<string>(value);

  // Sync external value changes (e.g. chapter switch pre-fills draft) into the editor.
  useEffect(() => {
    if (value !== prevValueRef.current) {
      prevValueRef.current = value;
      lastEmittedRef.current = normalizeMarkdown(value);
      editorRef.current?.setMarkdown(normalizeMarkdown(value));
    }
  }, [value, editorRef]);

  const applySuggestion = useCallback(
    (suggestion: Suggestion) => {
      const token =
        suggestion.kind === "chapter" && chapterType
          ? `${chapterType}:${suggestion.name}`
          : `page:${suggestion.slug}`;

      closeSuggestions();

      // Access the Lexical editor from the DOM at call time rather than storing
      // a ref during render (avoids react-hooks/refs lint violation).
      const editorEl = containerRef.current?.querySelector<HTMLElement>(
        '[contenteditable="true"]',
      );
      const lexEditor = editorEl ? getNearestEditorFromDOMNode(editorEl) : null;

      if (lexEditor) {
        isApplyingRef.current = true;
        let insertedKey: string | null = null;
        lexEditor.update(() => {
          const sel = $getSelection();
          if (!$isRangeSelection(sel)) {
            isApplyingRef.current = false;
            return;
          }

          const anchor = sel.anchor;
          const anchorNode = anchor.getNode();
          if (!$isTextNode(anchorNode)) {
            isApplyingRef.current = false;
            return;
          }

          const text = anchorNode.getTextContent();
          const offset = anchor.offset;
          const lastOpen = text.slice(0, offset).lastIndexOf("[[");

          if (lastOpen === -1) {
            isApplyingRef.current = false;
            return;
          }

          // Select the [[query fragment and replace it with the chip node.
          const node = new WikiLinkNode(token);
          insertedKey = node.getKey();
          sel.setTextNodeRange(anchorNode, lastOpen, anchorNode, offset);
          sel.insertNodes([node]);
        });

        requestAnimationFrame(() => {
          isApplyingRef.current = false;
          // If a callback is registered, find the inserted chip's DOM span and
          // hand off the alias-input step instead of returning focus to the editor.
          if (onAfterInsert && insertedKey) {
            const chipSpan = containerRef.current?.querySelector<HTMLElement>(
              `[data-wiki-key="${insertedKey}"]`,
            );
            if (chipSpan) {
              onAfterInsert(insertedKey, chipSpan);
              return;
            }
          }
          lexEditor.focus();
        });
        return;
      }

      // ── Fallback: setMarkdown (cursor goes to end of document) ──
      const current = lastEmittedRef.current;
      const lastOpen = current.lastIndexOf("[[");
      if (lastOpen === -1) return;

      const afterOpen = current.slice(lastOpen + 2);
      const closingIdx = afterOpen.indexOf("]]");
      const endOfTrigger =
        lastOpen + 2 + (closingIdx !== -1 ? closingIdx + 2 : afterOpen.length);

      const newMarkdown =
        current.slice(0, lastOpen) +
        `[[${token}]]` +
        current.slice(endOfTrigger);

      isApplyingRef.current = true;
      editorRef.current?.setMarkdown(newMarkdown);
      lastEmittedRef.current = newMarkdown;
      prevValueRef.current = newMarkdown;
      onChange(newMarkdown);

      requestAnimationFrame(() => {
        isApplyingRef.current = false;
        editorRef.current?.focus();
      });
    },
    [chapterType, closeSuggestions, containerRef, editorRef, onChange, onAfterInsert],
  );

  return { applySuggestion, isApplyingRef, lastEmittedRef, prevValueRef };
}
