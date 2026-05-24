"use client";

import { useMemo, useRef, useState, useCallback, useEffect } from "react";
import type { MDXEditorMethods, RealmPlugin } from "@mdxeditor/editor";
import {
  headingsPlugin,
  listsPlugin,
  quotePlugin,
  thematicBreakPlugin,
  markdownShortcutPlugin,
  linkPlugin,
  linkDialogPlugin,
  tablePlugin,
  codeBlockPlugin,
  toolbarPlugin,
  diffSourcePlugin,
  BoldItalicUnderlineToggles,
  BlockTypeSelect,
  UndoRedo,
  ListsToggle,
  InsertTable,
  InsertThematicBreak,
  DiffSourceToggleWrapper,
  CodeToggle,
  Separator,
} from "@mdxeditor/editor";
import { MDXEditorClient } from "@/components/MDEditor";

interface WikiPage {
  /** Display title of the wiki page, used for filtering and shown in the dropdown. */
  name: string;
  /** URL slug used as the `[[slug]]` token inserted on selection. */
  slug: string;
}

interface WikiChapter {
  /** Chapter display name (e.g. "Chapter 5"), used for filtering and shown in the dropdown. */
  name: string;
  /** Numeric chapter idx, used to verify the chapter exists. */
  idx: number;
}

type WikiLinkMDEditorProps = {
  /** Current markdown content. */
  value: string;
  /** Called when content changes. */
  onChange: (val: string | undefined) => void;
  /** Editor height in pixels. */
  height?: number;
  /**
   * Kept for API compatibility with existing callers. Has no effect: MDXEditor
   * is always WYSIWYG; a "Source" toggle in the toolbar gives access to raw markdown.
   */
  preview?: "edit" | "live" | "preview";
  /** All wiki pages visible to the reader at their current chapter cutoff. */
  wikiPages: WikiPage[];
  /** Slug of the serial being edited — used to build preview links. */
  serialSlug: string;
  /**
   * All chapters for this serial. When provided, typing `[[` also shows chapter
   * suggestions as a separate group. Selecting one inserts
   * `[[{chapterType}:{displayName}]]`.
   */
  wikiChapters?: WikiChapter[];
  /**
   * The serial's chapter type label (e.g. `"Chapter"`, `"Episode"`).
   * Required when `wikiChapters` is provided so the correct namespace prefix
   * is inserted (`[[Episode:Episode 3]]` vs `[[Chapter:Chapter 5]]`).
   */
  chapterType?: string;
};

type SuggestionKind = "page" | "chapter";

interface Suggestion {
  kind: SuggestionKind;
  name: string;
  /** For page suggestions: the slug. For chapter suggestions: the display name. */
  slug: string;
}

/**
 * Wraps MDXEditor (WYSIWYG) with `[[Page]]` wiki link autocomplete.
 *
 * Autocomplete is triggered by typing `[[` anywhere in the editor. The dropdown
 * filters pages and chapters by name (substring match) as the user types and is
 * positioned at the cursor's pixel location via the DOM Selection API.
 *
 * Selecting a suggestion replaces the open `[[…` fragment with `[[token]]` by
 * calling `editorRef.setMarkdown()` on the modified markdown string.
 *
 * The `preview` prop is accepted for API compatibility but has no effect:
 * MDXEditor is always WYSIWYG. A "Source" toggle in the toolbar allows raw
 * markdown editing when needed.
 *
 * Keyboard navigation uses `onKeyDownCapture` on the wrapper div to fire before
 * MDXEditor's Lexical key handlers, ensuring the dropdown always wins.
 *
 * IME composition state is tracked via `onCompositionStart`/`onCompositionEnd`
 * so dropdown keyboard navigation is suppressed during CJK input.
 *
 * @example
 * <WikiLinkMDEditor
 *   value={draft}
 *   onChange={(v) => setDraft(v ?? "")}
 *   wikiPages={wikiPages}
 *   wikiChapters={chapters}
 *   chapterType="Chapter"
 *   serialSlug="one-piece"
 * />
 */
export function WikiLinkMDEditor(props: WikiLinkMDEditorProps) {
  const {
    value,
    onChange,
    height = 300,
    wikiPages,
    wikiChapters = [],
    chapterType,
  } = props;

  const editorRef = useRef<MDXEditorMethods>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Tracks the last markdown value we emitted so applySuggestion can read it.
  const lastEmittedRef = useRef<string>(value);
  // True while we are programmatically calling setMarkdown to apply a suggestion,
  // so the onChange handler does not re-open the dropdown.
  const isApplyingRef = useRef(false);
  // Track the previous `value` prop so we can sync external changes into the editor.
  const prevValueRef = useRef<string>(value);

  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [activeIndex, setActiveIndex] = useState(0);
  const [isOpen, setIsOpen] = useState(false);
  const [isComposing, setIsComposing] = useState(false);
  const [dropdownPos, setDropdownPos] = useState<{
    top: number;
    left: number;
  } | null>(null);

  // Sync external value changes (e.g. chapter switch pre-fills draft) into the editor.
  useEffect(() => {
    if (value !== prevValueRef.current) {
      prevValueRef.current = value;
      lastEmittedRef.current = value;
      editorRef.current?.setMarkdown(value);
    }
  }, [value]);

  function closeSuggestions() {
    setIsOpen(false);
    setSuggestions([]);
    setActiveIndex(0);
    setDropdownPos(null);
  }

  /**
   * Reads the cursor's pixel position from the DOM Selection API and returns
   * coordinates relative to `containerRef` so the autocomplete dropdown
   * appears just below the current insertion point.
   */
  function getCursorPos(): { top: number; left: number } | null {
    const container = containerRef.current;
    if (!container) return null;

    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return null;

    const range = sel.getRangeAt(0);
    const rect = range.getBoundingClientRect();
    const containerRect = container.getBoundingClientRect();

    // If the selection rect is zero-size the caret is at the start of a block;
    // fall back to positioning at the top of the editor.
    if (rect.width === 0 && rect.height === 0) return null;

    const lineH = 24; // approximate line height in px
    return {
      top: rect.bottom - containerRect.top + lineH / 4,
      // Keep w-72 (288 px) dropdown horizontally inside the container
      left: Math.max(
        0,
        Math.min(rect.left - containerRect.left, containerRect.width - 288),
      ),
    };
  }

  /**
   * Called on every MDXEditor onChange event. Detects the `[[` trigger by
   * looking for the last `[[` in the markdown that does not have a closing `]]`
   * after it — this represents the fragment the user is currently typing.
   *
   * When the dropdown is active the suggestions are updated on every keystroke.
   * When there is no open trigger the dropdown is closed.
   */
  const handleChange = useCallback(
    (markdown: string) => {
      // Skip re-processing when we ourselves called setMarkdown to apply a suggestion.
      if (isApplyingRef.current) return;

      lastEmittedRef.current = markdown;
      prevValueRef.current = markdown;
      onChange(markdown);

      // Find the last unclosed `[[` in the full markdown string.
      const lastOpen = markdown.lastIndexOf("[[");
      if (lastOpen === -1 || markdown.indexOf("]]", lastOpen) !== -1) {
        closeSuggestions();
        return;
      }

      const triggerText = markdown.slice(lastOpen + 2);
      const colonIdx = triggerText.indexOf(":");
      // When user types a namespace prefix (e.g. "Chapter:"), restrict suggestions.
      const prefixTyped =
        colonIdx !== -1 ? triggerText.slice(0, colonIdx).toLowerCase() : null;
      const query = (
        colonIdx !== -1 ? triggerText.slice(colonIdx + 1) : triggerText
      ).toLowerCase();

      const isChapterPrefix =
        prefixTyped !== null &&
        chapterType !== undefined &&
        prefixTyped === chapterType.toLowerCase();
      const isExplicitPagePrefix = prefixTyped === "page";
      const showPages = prefixTyped === null || isExplicitPagePrefix;
      const showChapters = prefixTyped === null || isChapterPrefix;

      const pageSuggestions: Suggestion[] = showPages
        ? wikiPages
            .filter((p) => p.name.toLowerCase().includes(query))
            .map((p) => ({
              kind: "page" as SuggestionKind,
              name: p.name,
              slug: p.slug,
            }))
        : [];

      const chapterSuggestions: Suggestion[] =
        showChapters && wikiChapters.length > 0
          ? wikiChapters
              .filter((c) => c.name.toLowerCase().includes(query))
              .map((c) => ({
                kind: "chapter" as SuggestionKind,
                name: c.name,
                slug: c.name,
              }))
          : [];

      const next: Suggestion[] = [...pageSuggestions, ...chapterSuggestions];

      if (next.length === 0) {
        closeSuggestions();
        return;
      }

      setSuggestions(next);
      setActiveIndex(0);
      setIsOpen(true);
      setDropdownPos(getCursorPos());
    },
    [onChange, wikiPages, wikiChapters, chapterType],
  );

  /**
   * Replaces the open `[[…` fragment with the chosen `[[token]]` by calling
   * `setMarkdown` on the full markdown string, then re-focuses the editor.
   */
  const applySuggestion = useCallback(
    (suggestion: Suggestion) => {
      const current = lastEmittedRef.current;
      const lastOpen = current.lastIndexOf("[[");
      if (lastOpen === -1) return;

      const token =
        suggestion.kind === "chapter" && chapterType
          ? `${chapterType}:${suggestion.name}`
          : `page:${suggestion.slug}`;
      const replacement = `[[${token}]]`;

      // Determine the end of the trigger fragment — either the closing `]]` if
      // present (e.g. user typed `[[Foo]]` manually) or end of string.
      const afterOpen = current.slice(lastOpen + 2);
      const closingIdx = afterOpen.indexOf("]]");
      const endOfTrigger =
        lastOpen +
        2 +
        (closingIdx !== -1 ? closingIdx + 2 : afterOpen.length);

      const newMarkdown =
        current.slice(0, lastOpen) +
        replacement +
        current.slice(endOfTrigger);

      isApplyingRef.current = true;
      editorRef.current?.setMarkdown(newMarkdown);
      lastEmittedRef.current = newMarkdown;
      prevValueRef.current = newMarkdown;
      onChange(newMarkdown);

      // Reset the guard flag after a tick so the onChange fired by setMarkdown is skipped.
      requestAnimationFrame(() => {
        isApplyingRef.current = false;
        editorRef.current?.focus();
      });

      closeSuggestions();
    },
    [chapterType, onChange],
  );

  /**
   * Intercepts dropdown navigation keys in the capture phase on the wrapper div.
   * Capture fires before MDXEditor's Lexical key handlers, so our handler always
   * wins when the dropdown is open. `stopPropagation` prevents Enter from
   * inserting a newline and ArrowUp/Down from moving the Lexical cursor.
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
        setActiveIndex(
          (i) => (i - 1 + suggestions.length) % suggestions.length,
        );
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

  // Standard plugin set for a wiki content editor.
  // Memoised so the plugin array identity is stable across re-renders.
  const plugins = useMemo((): RealmPlugin[] => {
    return [
      toolbarPlugin({
        toolbarContents: () => (
          <DiffSourceToggleWrapper>
            <UndoRedo />
            <Separator />
            <BlockTypeSelect />
            <Separator />
            <BoldItalicUnderlineToggles options={["Bold", "Italic"]} />
            <CodeToggle />
            <Separator />
            <ListsToggle />
            <Separator />
            <InsertTable />
            <InsertThematicBreak />
          </DiffSourceToggleWrapper>
        ),
      }),
      headingsPlugin({ allowedHeadingLevels: [1, 2, 3, 4] }),
      listsPlugin(),
      quotePlugin(),
      thematicBreakPlugin(),
      markdownShortcutPlugin(),
      linkPlugin(),
      linkDialogPlugin(),
      tablePlugin(),
      codeBlockPlugin(),
      diffSourcePlugin({ viewMode: "rich-text" }),
    ];
  }, []);

  const pos = dropdownPos ?? { top: 0, left: 0 };

  return (
    <div
      ref={containerRef}
      className="relative rounded border border-border"
      onKeyDownCapture={handleKeyDownCapture}
      onCompositionStart={() => setIsComposing(true)}
      onCompositionEnd={() => setIsComposing(false)}
    >
      <MDXEditorClient
        ref={editorRef}
        markdown={value}
        onChange={handleChange}
        plugins={plugins}
        className="mdx-editor-wiki"
        contentEditableClassName="prose prose-sm max-w-none px-4 py-3 focus:outline-none"
      />
      {/* Apply the height constraint to MDXEditor's content-editable area */}
      <style>{`.mdx-editor-wiki .mdxeditor-root-contenteditable { min-height: ${height}px; }`}</style>

      {isOpen && suggestions.length > 0 && (
        <ul
          role="listbox"
          style={{ top: pos.top, left: pos.left }}
          className="absolute z-50 max-h-48 w-72 overflow-y-auto rounded border border-border bg-popover shadow-lg"
        >
          {suggestions.map((s, i) => (
            <li
              key={`${s.kind}:${s.name}`}
              role="option"
              aria-selected={i === activeIndex}
              className={`flex cursor-pointer select-none items-baseline gap-1.5 px-3 py-2 text-sm ${
                i === activeIndex ? "bg-accent" : "hover:bg-muted"
              }`}
              onMouseDown={(e) => {
                e.preventDefault();
                applySuggestion(s);
              }}
            >
              <span className="text-foreground font-medium">{s.name}</span>
              {s.kind === "chapter" && chapterType && (
                <span className="text-xs text-muted-foreground ml-auto shrink-0">
                  {chapterType}
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
