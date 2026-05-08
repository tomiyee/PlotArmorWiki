"use client";

import { useRef, useState } from "react";
import { MDEditor } from "@/components/MDEditor";
import { MarkdownRenderer } from "@/components/ui/markdown-renderer";

interface WikiPage {
  category: string;
  name: string;
}

interface Props {
  value: string;
  onChange: (val: string | undefined) => void;
  height?: number;
  preview?: "edit" | "live" | "preview";
  /** All wiki pages visible to the reader at their current chapter cutoff. */
  wikiPages: WikiPage[];
  /** Slug of the serial being edited — used to build preview links. */
  serialSlug: string;
}

interface Suggestion {
  category: string;
  name: string;
}

/**
 * Wraps `<MDEditor>` with `[[Category:Page]]` wiki link autocomplete.
 *
 * Autocomplete is triggered by typing `[[` anywhere in the editor. Before the
 * `:` the dropdown filters by category name; after the `:` it filters by page
 * name within that category. Selecting a suggestion replaces the open `[[…`
 * fragment with the completed `[[Category:Page]]` token.
 *
 * Uses `onInput` (not `onKeyUp`) to catch paste, IME, and programmatic edits.
 * IME composition state is tracked via `onCompositionStart`/`onCompositionEnd`
 * so dropdown keyboard navigation is suppressed during CJK input.
 *
 * @example
 * <WikiLinkMDEditor
 *   value={draft}
 *   onChange={(v) => setDraft(v ?? "")}
 *   wikiPages={wikiPages}
 *   serialSlug="one-piece"
 * />
 */
export function WikiLinkMDEditor({
  value,
  onChange,
  height = 300,
  preview = "edit",
  wikiPages,
  serialSlug,
}: Props) {

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [activeIndex, setActiveIndex] = useState(0);
  const [isOpen, setIsOpen] = useState(false);
  const [isComposing, setIsComposing] = useState(false);

  /** Close the dropdown and reset suggestion state. */
  function closeSuggestions() {
    setIsOpen(false);
    setSuggestions([]);
    setActiveIndex(0);
  }

  /**
   * Recompute suggestions from the text before the cursor.
   * Called on every `input` event.
   */
  function handleInput() {
    const ta = textareaRef.current;
    if (!ta) return;

    const before = ta.value.substring(0, ta.selectionStart ?? ta.value.length);
    const lastOpen = before.lastIndexOf("[[");

    // No open trigger, or a closing `]]` already follows the last `[[`.
    if (lastOpen === -1 || before.indexOf("]]", lastOpen) !== -1) {
      closeSuggestions();
      return;
    }

    const triggerText = before.slice(lastOpen + 2); // text after `[[`
    const colonIdx = triggerText.indexOf(":");

    let next: Suggestion[];

    if (colonIdx === -1) {
      // Before colon → filter categories, show first page per matching category
      const query = triggerText.toLowerCase();
      const seen = new Set<string>();
      next = wikiPages
        .filter((p) => {
          if (!p.category.toLowerCase().startsWith(query)) return false;
          if (seen.has(p.category)) return false;
          seen.add(p.category);
          return true;
        })
        .map((p) => ({ category: p.category, name: "" }));
    } else {
      // After colon → filter pages within the typed category
      const categoryQuery = triggerText.slice(0, colonIdx).trim().toLowerCase();
      const pageQuery = triggerText.slice(colonIdx + 1).toLowerCase();
      next = wikiPages.filter(
        (p) =>
          p.category.toLowerCase() === categoryQuery &&
          p.name.toLowerCase().startsWith(pageQuery),
      );
    }

    if (next.length === 0) {
      closeSuggestions();
      return;
    }

    setSuggestions(next);
    setActiveIndex(0);
    setIsOpen(true);
  }

  /**
   * Apply the selected suggestion, replacing the open `[[…` fragment with
   * the completed `[[Category:Page]]` token.
   */
  function applySuggestion(suggestion: Suggestion) {
    const ta = textareaRef.current;
    if (!ta) return;

    const cursorPos = ta.selectionStart ?? ta.value.length;
    const before = ta.value.substring(0, cursorPos);
    const after = ta.value.substring(cursorPos);
    const lastOpen = before.lastIndexOf("[[");

    const replacement =
      suggestion.name
        ? `[[${suggestion.category}:${suggestion.name}]]`
        : `[[${suggestion.category}:`;

    const newValue = before.slice(0, lastOpen) + replacement + after;
    onChange(newValue);

    // Move cursor to end of replacement (or after colon for category-only)
    const newCursor = lastOpen + replacement.length;
    requestAnimationFrame(() => {
      ta.setSelectionRange(newCursor, newCursor);
      ta.focus();
      // Trigger input handler so category mode re-opens suggestions after inserting `:`
      if (!suggestion.name) {
        handleInput();
      }
    });

    if (suggestion.name) {
      closeSuggestions();
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (!isOpen) return;

    switch (e.key) {
      case "ArrowDown":
        if (isComposing) return;
        e.preventDefault();
        setActiveIndex((i) => (i + 1) % suggestions.length);
        break;
      case "ArrowUp":
        if (isComposing) return;
        e.preventDefault();
        setActiveIndex((i) => (i - 1 + suggestions.length) % suggestions.length);
        break;
      case "Enter":
        if (isComposing) return;
        e.preventDefault();
        applySuggestion(suggestions[activeIndex]);
        break;
      case "Escape":
        e.preventDefault();
        closeSuggestions();
        break;
    }
  }

  return (
    <div className="relative" data-color-mode="light">
      <MDEditor
        value={value}
        onChange={onChange}
        height={height}
        preview={preview}
        components={{
          preview: (source) => (
            <MarkdownRenderer serialSlug={serialSlug} className="p-4">
              {source}
            </MarkdownRenderer>
          ),
        }}
        textareaProps={{
          ref: textareaRef,
          onInput: handleInput,
          onKeyDown: handleKeyDown,
          onCompositionStart: () => setIsComposing(true),
          onCompositionEnd: () => setIsComposing(false),
        }}
      />

      {isOpen && suggestions.length > 0 && (
        <ul
          role="listbox"
          className="absolute left-0 top-full z-50 mt-1 max-h-48 w-72 overflow-y-auto rounded border border-gray-200 bg-white shadow-lg"
        >
          {suggestions.map((s, i) => (
            <li
              key={`${s.category}:${s.name}`}
              role="option"
              aria-selected={i === activeIndex}
              className={`flex cursor-pointer select-none items-baseline gap-1.5 px-3 py-2 text-sm ${
                i === activeIndex ? "bg-blue-50" : "hover:bg-gray-50"
              }`}
              onMouseDown={(e) => {
                // Prevent textarea blur before we can read selectionStart
                e.preventDefault();
                applySuggestion(s);
              }}
            >
              <span className="text-gray-400 shrink-0">{s.category}</span>
              {s.name && (
                <>
                  <span className="text-gray-400">›</span>
                  <span className="text-gray-900 font-medium">{s.name}</span>
                </>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
