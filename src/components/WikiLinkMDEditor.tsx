"use client";

import {
  createContext,
  useContext,
  useMemo,
  useRef,
  useState,
  useCallback,
  useEffect,
  type ReactElement,
} from "react";
import type {
  MDXEditorMethods,
  RealmPlugin,
  MdastImportVisitor,
  LexicalExportVisitor,
} from "@mdxeditor/editor";
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
  realmPlugin,
  addLexicalNode$,
  addImportVisitor$,
  addExportVisitor$,
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
import {
  DecoratorNode,
  ElementNode,
  $createTextNode,
  $isTextNode,
  $getSelection,
  $isRangeSelection,
  getNearestEditorFromDOMNode,
  type LexicalEditor,
  type EditorConfig,
  type NodeKey,
  type SerializedLexicalNode,
  type LexicalNode,
} from "lexical";
import type * as Mdast from "mdast";
import { MDXEditorClient } from "@/components/MDEditor";

// ── WikiLinkNode ─────────────────────────────────────────────────────────────

interface SerializedWikiLinkNode extends SerializedLexicalNode {
  token: string;
}

/**
 * Context that feeds wiki page and chapter data into WikiLinkChip decorators.
 * Wrapped around MDXEditorClient so decorator elements rendered inside Lexical
 * can look up display names from page slugs without prop-drilling.
 */
const WikiLinkContext = createContext<{
  wikiPages: { name: string; slug: string }[];
  chapterType?: string;
}>({ wikiPages: [] });

/**
 * Inline chip rendered inside the WYSIWYG editor for a resolved wiki link.
 * Reads page names from WikiLinkContext so slugs show as human-readable titles.
 */
function WikiLinkChip({ token }: { token: string }) {
  const { wikiPages, chapterType } = useContext(WikiLinkContext);

  const colonIdx = token.indexOf(":");
  const category = colonIdx !== -1 ? token.slice(0, colonIdx) : "page";
  const value = colonIdx !== -1 ? token.slice(colonIdx + 1) : token;

  let label: string;
  if (category === "page") {
    const page = wikiPages.find((p) => p.slug === value);
    // Fall back to slug with dashes replaced by spaces and title-cased
    label =
      page?.name ??
      value
        .split("-")
        .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
        .join(" ");
  } else {
    label = value; // chapter display name is already human-readable
  }

  const isChapter = chapterType && category === chapterType;

  return (
    <span
      contentEditable={false}
      className="inline-flex select-none items-baseline gap-1 rounded bg-blue-100 px-1.5 py-0.5 text-sm font-medium text-blue-800 dark:bg-blue-900/40 dark:text-blue-200"
    >
      {label}
      {isChapter && (
        <span className="ml-0.5 shrink-0 text-xs text-blue-500 dark:text-blue-400">
          {chapterType}
        </span>
      )}
    </span>
  );
}

/**
 * Custom Lexical DecoratorNode for wiki links.
 *
 * Stores the raw token string (e.g. `page:luffy` or `Chapter:Chapter 5`) and
 * renders as a styled chip in the WYSIWYG editor. On export, produces a plain
 * mdast text node with value `[[token]]` so the markdown stored in the DB
 * is unchanged from the previous format.
 */
class WikiLinkNode extends DecoratorNode<ReactElement> {
  __token: string;

  static getType(): string {
    return "wiki-link";
  }

  static clone(node: WikiLinkNode): WikiLinkNode {
    return new WikiLinkNode(node.__token, node.__key);
  }

  static importJSON(serialized: SerializedWikiLinkNode): WikiLinkNode {
    return new WikiLinkNode(serialized.token);
  }

  constructor(token: string, key?: NodeKey) {
    super(key);
    this.__token = token;
  }

  exportJSON(): SerializedWikiLinkNode {
    return {
      ...super.exportJSON(),
      type: "wiki-link",
      token: this.__token,
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
    return `[[${this.__token}]]`;
  }

  decorate(_editor: LexicalEditor, _config: EditorConfig): ReactElement {
    return <WikiLinkChip token={this.__token} />;
  }
}

function $isWikiLinkNode(
  node: LexicalNode | null | undefined,
): node is WikiLinkNode {
  return node instanceof WikiLinkNode;
}

// ── MDXEditor import visitor: text → WikiLinkNode ────────────────────────────

const WIKI_LINK_RE = /\[\[([^\]]+)\]\]/g;

/**
 * Intercepts mdast text nodes that contain `[[token]]` patterns and splits
 * them into a mix of plain TextNodes and WikiLinkNodes.
 *
 * Priority 1 ensures this runs before MDXEditor's built-in text visitor
 * (priority 0). For text nodes with no wiki links, `actions.nextVisitor()`
 * delegates back to the default handler.
 */
const WikiLinkTextVisitor: MdastImportVisitor<Mdast.Text> = {
  testNode: "text",
  priority: 1,
  visitNode({ mdastNode, lexicalParent, actions }) {
    const text = mdastNode.value;
    if (!text.includes("[[")) {
      actions.nextVisitor();
      return;
    }

    const formatting = actions.getParentFormatting();
    let lastIndex = 0;
    let match: RegExpExecArray | null;
    WIKI_LINK_RE.lastIndex = 0;

    while ((match = WIKI_LINK_RE.exec(text)) !== null) {
      if (match.index > lastIndex) {
        const before = $createTextNode(text.slice(lastIndex, match.index));
        before.setFormat(formatting);
        (lexicalParent as ElementNode).append(before);
      }
      (lexicalParent as ElementNode).append(new WikiLinkNode(match[1]));
      lastIndex = match.index + match[0].length;
    }

    if (lastIndex < text.length) {
      const after = $createTextNode(text.slice(lastIndex));
      after.setFormat(formatting);
      (lexicalParent as ElementNode).append(after);
    }
  },
};

// ── MDXEditor export visitor: WikiLinkNode → text ────────────────────────────

const WikiLinkExportVisitor: LexicalExportVisitor<WikiLinkNode, Mdast.Text> = {
  testLexicalNode: $isWikiLinkNode,
  visitLexicalNode({ lexicalNode, mdastParent, actions }) {
    actions.appendToParent(mdastParent as Mdast.Parent, {
      type: "text",
      value: `[[${lexicalNode.__token}]]`,
    });
  },
};

// ── Interfaces ────────────────────────────────────────────────────────────────

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

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * MDXEditor's markdown serializer (mdast-util-to-markdown) escapes `[` to `\[`,
 * turning `[[wiki-link]]` into `\[\[wiki-link]]` in the string emitted by
 * onChange. This reversal is applied before trigger detection so `[[` is always
 * found correctly.
 */
function normalizeMarkdown(md: string): string {
  return md.replace(/\\\[\\\[/g, "[[");
}

// ── Component ─────────────────────────────────────────────────────────────────

/**
 * Wraps MDXEditor (WYSIWYG) with `[[Page]]` wiki link autocomplete and chip
 * rendering for existing wiki links.
 *
 * Autocomplete is triggered by typing `[[` anywhere in the editor. The dropdown
 * filters pages and chapters by name (substring match) as the user types and is
 * positioned at the cursor's pixel location via the DOM Selection API.
 *
 * Selecting a suggestion replaces the open `[[…` fragment with a `WikiLinkNode`
 * chip via Lexical's `editor.update()` + `selection.insertNodes`, placing the
 * cursor immediately after the chip rather than at end-of-document.
 *
 * Existing `[[token]]` patterns in loaded markdown are automatically converted
 * to chips by the `WikiLinkTextVisitor` import visitor (priority 1).
 *
 * The `preview` prop is accepted for API compatibility but has no effect:
 * MDXEditor is always WYSIWYG. A "Source" toggle in the toolbar allows raw
 * markdown editing when needed.
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
  // Snapshot of value on mount — used as the diff baseline so "Diff" mode shows
  // changes made in this editing session relative to what was loaded from the server.
  const [initialValue] = useState(() => normalizeMarkdown(value));
  const containerRef = useRef<HTMLDivElement>(null);
  const listboxRef = useRef<HTMLUListElement>(null);

  // Tracks the last NORMALIZED markdown we emitted so applySuggestion can read it.
  const lastEmittedRef = useRef<string>(normalizeMarkdown(value));
  // True while we are programmatically inserting a WikiLinkNode, so the onChange
  // handler does not re-open the dropdown.
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
      lastEmittedRef.current = normalizeMarkdown(value);
      editorRef.current?.setMarkdown(normalizeMarkdown(value));
    }
  }, [value]);

  useEffect(() => {
    listboxRef.current
      ?.querySelector<HTMLElement>('[aria-selected="true"]')
      ?.scrollIntoView({ block: "nearest" });
  }, [activeIndex]);

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

    if (rect.width === 0 && rect.height === 0) return null;

    const lineH = 24;
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
   * Called on every MDXEditor onChange event. Normalizes the escaped `\[\[`
   * sequences produced by mdast-util-to-markdown before trigger detection.
   *
   * Reads the Lexical text node's content up to the cursor position so that
   * `[[links]]` elsewhere in the document don't interfere with trigger detection.
   * Falls back to full-document markdown analysis when the Lexical editor is
   * not yet mounted.
   */
  const handleChange = useCallback(
    (rawMarkdown: string) => {
      const markdown = normalizeMarkdown(rawMarkdown).trimEnd();
      lastEmittedRef.current = markdown;
      prevValueRef.current = markdown;
      onChange(markdown);

      if (isApplyingRef.current) return;

      // Resolve the text before the cursor inside the active Lexical text node.
      // This is cursor-aware: only the text in the current node up to the caret
      // is examined, so existing [[closed]] links after the cursor are invisible.
      const editorEl = containerRef.current?.querySelector<HTMLElement>(
        '[contenteditable="true"]',
      );
      const lexEditor = editorEl ? getNearestEditorFromDOMNode(editorEl) : null;

      let triggerText: string | null = null;

      if (lexEditor) {
        lexEditor.read(() => {
          const sel = $getSelection();
          if (!$isRangeSelection(sel)) return;
          const anchor = sel.anchor;
          const anchorNode = anchor.getNode();
          if (!$isTextNode(anchorNode)) return;

          const textBefore = anchorNode.getTextContent().slice(0, anchor.offset);
          const lastOpen = textBefore.lastIndexOf("[[");
          if (lastOpen === -1) return;
          const fragment = textBefore.slice(lastOpen + 2);
          if (fragment.includes("]]")) return;
          triggerText = fragment;
        });
      } else {
        // Fallback: scan the full markdown string (cursor position unknown).
        const lastOpen = markdown.lastIndexOf("[[");
        if (lastOpen !== -1 && markdown.indexOf("]]", lastOpen) === -1) {
          triggerText = markdown.slice(lastOpen + 2);
        }
      }

      if (triggerText === null) {
        closeSuggestions();
        return;
      }

      const colonIdx = (triggerText as string).indexOf(":");
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
   * Inserts a WikiLinkNode at the cursor, replacing the open `[[query` fragment.
   *
   * Uses Lexical's `editor.update()` + `selection.setTextNodeRange` +
   * `selection.insertNodes` so the cursor lands immediately after the chip
   * rather than jumping to end-of-document (which happened with `setMarkdown`).
   *
   * Falls back to the `setMarkdown` path when the Lexical editor ref is not yet
   * available (e.g. component just mounted).
   */
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
          sel.setTextNodeRange(anchorNode, lastOpen, anchorNode, offset);
          sel.insertNodes([new WikiLinkNode(token)]);
        });

        requestAnimationFrame(() => {
          isApplyingRef.current = false;
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
    [chapterType, onChange],
  );

  /**
   * Intercepts dropdown navigation keys in the capture phase on the wrapper div.
   * Capture fires before MDXEditor's Lexical key handlers, so our handler always
   * wins when the dropdown is open.
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

  // Plugin array — memoised so identity is stable across re-renders.
  const plugins = useMemo((): RealmPlugin[] => {
    const wikiPlugin = realmPlugin({
      init(realm) {
        realm.pubIn({
          [addLexicalNode$]: WikiLinkNode,
          [addImportVisitor$]: WikiLinkTextVisitor,
          [addExportVisitor$]: WikiLinkExportVisitor,
        });
      },
    })();

    return [
      wikiPlugin,
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
      diffSourcePlugin({ viewMode: "rich-text", diffMarkdown: initialValue }),
    ];
  }, [initialValue]);

  const pos = dropdownPos ?? { top: 0, left: 0 };

  return (
    <div
      ref={containerRef}
      className="relative rounded border border-border"
      onKeyDownCapture={handleKeyDownCapture}
      onCompositionStart={() => setIsComposing(true)}
      onCompositionEnd={() => setIsComposing(false)}
    >
      <WikiLinkContext.Provider value={{ wikiPages, chapterType }}>
        <MDXEditorClient
          ref={editorRef}
          markdown={initialValue}
          onChange={handleChange}
          plugins={plugins}
          className="mdx-editor-wiki"
          contentEditableClassName="max-w-none px-4 py-3 focus:outline-none"
        />
      </WikiLinkContext.Provider>
      {/* Apply the height constraint to MDXEditor's content-editable area */}
      <style>{`.mdx-editor-wiki .mdxeditor-root-contenteditable { min-height: ${height}px; }`}</style>

      {isOpen && suggestions.length > 0 && (
        <ul
          ref={listboxRef}
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
