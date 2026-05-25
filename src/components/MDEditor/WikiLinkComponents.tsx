"use client";

import { useContext, useMemo, useRef, useState } from "react";
import { ButtonWithTooltip } from "@mdxeditor/editor";
import { Link2 } from "lucide-react";
import { WikiLinkContext } from "./WikiLinkContext";
import { Select, type Option } from "@/components/ui/Select";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";

// ── WikiLinkChip ──────────────────────────────────────────────────────────────

/**
 * Inline chip rendered inside the WYSIWYG editor for a resolved wiki link.
 * Reads page names from WikiLinkContext so slugs show as human-readable titles.
 * When an explicit `alias` is provided it is displayed directly, bypassing the lookup.
 */
export function WikiLinkChip({ token, alias }: { token: string; alias?: string }) {
  const { wikiPages, chapterType } = useContext(WikiLinkContext);

  const colonIdx = token.indexOf(":");
  const category = colonIdx !== -1 ? token.slice(0, colonIdx) : "page";
  const value = colonIdx !== -1 ? token.slice(colonIdx + 1) : token;

  let actualName: string;
  if (category === "page") {
    const page = wikiPages.find((p) => p.slug === value);
    // Fall back to slug with dashes replaced by spaces and title-cased
    actualName =
      page?.name ??
      value
        .split("-")
        .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
        .join(" ");
  } else {
    actualName = value; // chapter display name is already human-readable
  }

  const label = alias ?? actualName;
  const showActualName = alias && alias !== actualName;
  const isChapter = !alias && chapterType && category === chapterType;

  return (
    <span
      contentEditable={false}
      className="inline-flex select-none items-baseline gap-1 rounded bg-blue-100 px-1.5 py-0.5 text-sm font-medium text-blue-800 dark:bg-blue-900/40 dark:text-blue-200"
    >
      {label}
      {showActualName && (
        <span className="text-xs font-normal opacity-70">({actualName})</span>
      )}
      {isChapter && (
        <span className="ml-0.5 shrink-0 text-xs text-blue-500 dark:text-blue-400">
          {chapterType}
        </span>
      )}
    </span>
  );
}

// ── InsertWikiLinkButton ──────────────────────────────────────────────────────

/**
 * Toolbar button that opens a form popover for inserting a wiki link with an
 * optional alias. Reads data and callbacks from `WikiLinkContext` (always
 * fresh), keeping the plugins useMemo closure dep-free.
 *
 * @example
 * toolbarContents: () => (
 *   <DiffSourceToggleWrapper>
 *     ...
 *     <InsertWikiLinkButton />
 *   </DiffSourceToggleWrapper>
 * )
 */
export function InsertWikiLinkButton() {
  const { wikiPages, wikiChapters, chapterType, insertWikiLink, focusEditor } =
    useContext(WikiLinkContext);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [selectedToken, setSelectedToken] = useState<string | undefined>(
    undefined,
  );
  const [alias, setAlias] = useState("");
  // Popover position captured at click-time (outside render) to avoid the
  // react-hooks/refs lint error from reading buttonRef.current during render.
  const [popoverPos, setPopoverPos] = useState<{ top: number; left: number }>({
    top: 0,
    left: 0,
  });

  const selectOptions = useMemo((): Option<string>[] => {
    const hasChapters = wikiChapters.length > 0 && !!chapterType;
    if (hasChapters) {
      return [
        ...(wikiPages.length > 0
          ? [
              {
                label: "Pages",
                value: null as unknown as string,
                structural: true,
                children: wikiPages.map((p) => ({
                  label: p.name,
                  value: `page:${p.slug}`,
                })),
              },
            ]
          : []),
        {
          label: `${chapterType}s`,
          value: null as unknown as string,
          structural: true,
          children: wikiChapters.map((c) => ({
            label: c.name,
            value: `${chapterType}:${c.name}`,
          })),
        },
      ];
    }
    return wikiPages.map((p) => ({ label: p.name, value: `page:${p.slug}` }));
  }, [wikiPages, wikiChapters, chapterType]);

  function handleButtonClick() {
    if (!isOpen) {
      const rect = buttonRef.current?.getBoundingClientRect();
      setPopoverPos({
        top: rect ? rect.bottom + 4 : 0,
        left: rect ? rect.left : 0,
      });
      setSelectedToken(undefined);
      setAlias("");
    }
    setIsOpen((prev) => !prev);
  }

  function handleTokenChange(token: string) {
    setSelectedToken(token);
    const pageMatch = wikiPages.find((p) => `page:${p.slug}` === token);
    const chapterMatch = wikiChapters.find(
      (c) => `${chapterType}:${c.name}` === token,
    );
    setAlias(pageMatch?.name ?? chapterMatch?.name ?? "");
  }

  function handleInsert() {
    if (!selectedToken) return;
    setIsOpen(false);
    insertWikiLink(selectedToken, alias.trim() || undefined);
    requestAnimationFrame(() => focusEditor());
  }

  return (
    <>
      <ButtonWithTooltip
        title="Insert wiki link"
        ref={buttonRef}
        onClick={handleButtonClick}
        aria-expanded={isOpen}
        aria-haspopup="dialog"
      >
        <Link2 className="size-4" />
      </ButtonWithTooltip>

      {isOpen && (
        <div
          style={{
            position: "fixed",
            zIndex: 9999,
            top: popoverPos.top,
            left: popoverPos.left,
          }}
          className="w-80 rounded-lg border border-border bg-popover p-3 shadow-md flex flex-col gap-3"
          onMouseDown={(e) => e.preventDefault()}
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              setIsOpen(false);
              focusEditor();
            }
          }}
        >
          <Select<string>
            options={selectOptions}
            value={selectedToken}
            onChange={handleTokenChange}
            placeholder="Select a page or chapter…"
            popupWidth="320px"
          />
          <Input
            value={alias}
            onChange={(e) => setAlias(e.target.value)}
            placeholder="Link text"
            onMouseDown={(e) => e.stopPropagation()}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleInsert();
            }}
          />
          <Button
            type="button"
            onClick={handleInsert}
            disabled={!selectedToken}
            className="w-full"
          >
            Insert Wiki Link
          </Button>
        </div>
      )}
    </>
  );
}
