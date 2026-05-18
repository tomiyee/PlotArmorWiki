"use client";

import { useMemo, useRef, useState } from "react";
import type { JSX } from "react";
import { MDEditor } from "@/components/MDEditor";
import { MarkdownRenderer } from "@/components/ui/MarkdownRenderer";

interface WikiPage {
  /** Display title of the wiki page, used for filtering and shown in the dropdown. */
  name: string;
  /** URL slug used as the `[[slug]]` token inserted on selection. */
  slug: string;
}

type WikiLinkMDEditorProps = {
  /** Current markdown content. */
  value: string;
  /** Called when content changes. */
  onChange: (val: string | undefined) => void;
  /** Editor height in pixels. */
  height?: number;
  /** Which panel to show initially. */
  preview?: "edit" | "live" | "preview";
  /** All wiki pages visible to the reader at their current chapter cutoff. */
  wikiPages: WikiPage[];
  /** Slug of the serial being edited — used to build preview links. */
  serialSlug: string;
};

interface Suggestion {
  name: string;
  slug: string;
}

/**
 * Wraps `<MDEditor>` with `[[Page]]` wiki link autocomplete.
 *
 * Autocomplete is triggered by typing `[[` anywhere in the editor. The
 * dropdown filters pages by name (substring match) as the user types and is
 * positioned at the pixel location of the `[[` trigger character.
 *
 * Selecting a suggestion replaces the open `[[…` fragment with `[[PageName]]`.
 *
 * Keyboard navigation uses `onKeyDownCapture` on the container div rather than
 * `onKeyDown` on the textarea. MDEditor's `factory.js` attaches a native
 * `addEventListener('keydown', …)` to its internal textarea ref, which fires
 * before React synthetic bubble events. The capture phase on an ancestor fires
 * before any native listeners on descendants, guaranteeing our handler wins.
 *
 * The dropdown is positioned by measuring a hidden mirror div that replicates
 * the textarea's text layout (font, padding, word-wrap) to find the `[[`
 * trigger's pixel coordinates relative to the editor container.
 *
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
export function WikiLinkMDEditor(props: WikiLinkMDEditorProps) {
  const {
    value,
    onChange,
    height = 300,
    preview = "edit",
    wikiPages,
    serialSlug,
  } = props;

  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  // slug → display name map for the inline preview renderer.
  const pageTitles = useMemo(
    () => Object.fromEntries(wikiPages.map((p) => [p.slug, p.name])),
    [wikiPages],
  );

  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [activeIndex, setActiveIndex] = useState(0);
  const [isOpen, setIsOpen] = useState(false);
  const [isComposing, setIsComposing] = useState(false);
  const [dropdownPos, setDropdownPos] = useState<{
    top: number;
    left: number;
  } | null>(null);

  function closeSuggestions() {
    setIsOpen(false);
    setSuggestions([]);
    setActiveIndex(0);
    setDropdownPos(null);
  }

  /**
   * Compute the pixel position of character `index` within `ta`, relative to
   * `containerRef`. Appends a fixed-position mirror div to document.body that
   * replicates the textarea's text layout so word-wrap is accounted for.
   */
  function computeCaretPos(
    ta: HTMLTextAreaElement,
    index: number,
  ): { top: number; left: number } | null {
    const container = containerRef.current;
    if (!container) return null;

    const style = window.getComputedStyle(ta);
    const taRect = ta.getBoundingClientRect();
    const containerRect = container.getBoundingClientRect();

    const mirror = document.createElement("div");
    Object.assign(mirror.style, {
      position: "fixed",
      visibility: "hidden",
      pointerEvents: "none",
      zIndex: "-1",
      whiteSpace: "pre-wrap",
      wordBreak: "break-word",
      overflowWrap: "break-word",
      boxSizing: "border-box",
      // Offset by scrollTop so the mirror's text starts where the textarea's does
      top: `${taRect.top - ta.scrollTop}px`,
      left: `${taRect.left}px`,
      width: `${ta.clientWidth}px`,
      fontFamily: style.fontFamily,
      fontSize: style.fontSize,
      fontWeight: style.fontWeight,
      lineHeight: style.lineHeight,
      letterSpacing: style.letterSpacing,
      paddingTop: style.paddingTop,
      paddingRight: style.paddingRight,
      paddingBottom: style.paddingBottom,
      paddingLeft: style.paddingLeft,
    });

    mirror.appendChild(document.createTextNode(ta.value.substring(0, index)));
    const marker = document.createElement("span");
    marker.textContent = "​"; // zero-width space as measurement anchor
    mirror.appendChild(marker);

    document.body.appendChild(mirror);
    const markerRect = marker.getBoundingClientRect();
    document.body.removeChild(mirror);

    const lineH = parseFloat(style.lineHeight) || 20;
    // Place dropdown below the trigger line; clamp within the textarea bounds
    const top = Math.max(
      taRect.top - containerRect.top + lineH,
      Math.min(
        markerRect.bottom - containerRect.top + 2,
        taRect.bottom - containerRect.top,
      ),
    );
    // Keep w-72 (288px) dropdown horizontally inside the container
    const left = Math.max(
      0,
      Math.min(
        markerRect.left - containerRect.left,
        containerRect.width - 288,
      ),
    );

    return { top, left };
  }

  function handleInput(e: React.FormEvent<HTMLTextAreaElement>) {
    // MDEditor's cloneElement({ ref: textRef }) replaces our ref callback, so
    // we cache the element here instead — onInput is not overridden by cloneElement.
    textareaRef.current = e.currentTarget;
    const ta = e.currentTarget;
    const before = ta.value.substring(0, ta.selectionStart ?? ta.value.length);
    const lastOpen = before.lastIndexOf("[[");

    if (lastOpen === -1 || before.indexOf("]]", lastOpen) !== -1) {
      closeSuggestions();
      return;
    }

    const triggerText = before.slice(lastOpen + 2);
    const colonIdx = triggerText.indexOf(":");
    const pageQuery = (
      colonIdx !== -1 ? triggerText.slice(colonIdx + 1) : triggerText
    ).toLowerCase();

    const next: Suggestion[] = wikiPages
      .filter((p) => p.name.toLowerCase().includes(pageQuery))
      .map((p) => ({ name: p.name, slug: p.slug }));

    if (next.length === 0) {
      closeSuggestions();
      return;
    }

    setSuggestions(next);
    setActiveIndex(0);
    setIsOpen(true);
    setDropdownPos(computeCaretPos(ta, lastOpen));
  }

  function applySuggestion(suggestion: Suggestion) {
    const ta = textareaRef.current;
    if (!ta) return;

    const cursorPos = ta.selectionStart ?? ta.value.length;
    const before = ta.value.substring(0, cursorPos);
    const after = ta.value.substring(cursorPos);
    const lastOpen = before.lastIndexOf("[[");
    const replacement = `[[${suggestion.slug}]]`;
    const newValue = before.slice(0, lastOpen) + replacement + after;
    onChange(newValue);

    const newCursor = lastOpen + replacement.length;
    requestAnimationFrame(() => {
      ta.setSelectionRange(newCursor, newCursor);
      ta.focus();
    });

    closeSuggestions();
  }

  /**
   * Intercepts dropdown navigation keys in the capture phase on the container
   * div. The capture phase fires before MDEditor's native keydown listener on
   * the textarea, so our handler always wins when the dropdown is open.
   * `stopPropagation` prevents the event from reaching the textarea at all,
   * which avoids newline insertion on Enter and cursor movement on ArrowUp/Down.
   */
  function handleKeyDownCapture(e: React.KeyboardEvent<HTMLDivElement>) {
    if (!isOpen || isComposing) return;

    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        e.stopPropagation();
        setActiveIndex((i) => (i + 1) % suggestions.length);
        break;
      case "ArrowUp":
        e.preventDefault();
        e.stopPropagation();
        setActiveIndex((i) => (i - 1 + suggestions.length) % suggestions.length);
        break;
      case "Enter":
        e.preventDefault();
        e.stopPropagation();
        applySuggestion(suggestions[activeIndex]);
        break;
      case "Escape":
        e.preventDefault();
        e.stopPropagation();
        closeSuggestions();
        break;
    }
  }

  /**
   * Custom textarea renderer passed as the top-level `renderTextarea` prop to
   * MDEditor. MDEditor's `factory.js` calls
   * `React.cloneElement(renderTextarea(...), { ref: textRef })` — only the ref
   * is injected; our other props (onInput, onCompositionStart/End) survive.
   * We do not set a ref here because cloneElement replaces it; instead we
   * cache the element in `textareaRef` from the `onInput` event in `handleInput`.
   */
  function renderTextarea(
    taProps:
      | React.TextareaHTMLAttributes<HTMLTextAreaElement>
      | React.HTMLAttributes<HTMLDivElement>,
    _opts: Record<string, unknown>,
  ): JSX.Element {
    return (
      <textarea
        {...(taProps as React.TextareaHTMLAttributes<HTMLTextAreaElement>)}
        onInput={handleInput}
        onCompositionStart={() => setIsComposing(true)}
        onCompositionEnd={() => setIsComposing(false)}
      />
    );
  }

  const pos = dropdownPos ?? { top: 0, left: 0 };

  return (
    <div
      ref={containerRef}
      className="relative"
      data-color-mode="light"
      onKeyDownCapture={handleKeyDownCapture}
    >
      <MDEditor
        value={value}
        onChange={onChange}
        height={height}
        preview={preview}
        components={{
          preview: (source) => (
            <MarkdownRenderer
              serialSlug={serialSlug}
              pageTitles={pageTitles}
              className="p-4"
            >
              {source}
            </MarkdownRenderer>
          ),
        }}
        renderTextarea={renderTextarea}
      />

      {isOpen && suggestions.length > 0 && (
        <ul
          role="listbox"
          style={{ top: pos.top, left: pos.left }}
          className="absolute z-50 max-h-48 w-72 overflow-y-auto rounded border border-gray-200 bg-white shadow-lg"
        >
          {suggestions.map((s, i) => (
            <li
              key={s.name}
              role="option"
              aria-selected={i === activeIndex}
              className={`flex cursor-pointer select-none items-baseline gap-1.5 px-3 py-2 text-sm ${
                i === activeIndex ? "bg-blue-50" : "hover:bg-gray-50"
              }`}
              onMouseDown={(e) => {
                e.preventDefault();
                applySuggestion(s);
              }}
            >
              <span className="font-medium text-gray-900">{s.name}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
