"use client";

import { useContext, useMemo, useRef, useEffect, useState } from "react";
import { XIcon } from "lucide-react";
import { WikiLinkContext } from "./WikiLinkContext";
import { Select, type Option } from "@/components/ui/Select";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { Text } from "@/components/ui/Text";

type WikiLinkEditPopoverProps = {
  /** Bounding rect of the anchor element (button or chip) used to position the fixed popover. */
  anchorRect: DOMRect;
  /** Pre-fills the page/chapter selector, e.g. `"page:luffy"`. */
  initialToken?: string;
  /** Pre-fills the alias input. */
  initialAlias?: string;
  /**
   * When true, the alias input receives focus on mount and its text is fully selected.
   * Used in the post-autocomplete alias step.
   */
  autoFocusAlias?: boolean;
  /** Called when the user confirms the link selection. */
  onConfirm: (token: string, alias: string | undefined) => void;
  /** Called when the user dismisses the popover (Escape, backdrop click, or × button). */
  onClose: () => void;
};

/**
 * Shared popover for inserting or editing a wiki link.
 * Rendered at a fixed position derived from `anchorRect` and re-anchors on
 * scroll and resize so it stays aligned while the page moves.
 *
 * Extracted from `InsertWikiLinkButton` so the same form is reused for:
 * - toolbar "Insert wiki link" button
 * - clicking an existing chip to edit it
 * - the alias input step that fires after autocomplete selection
 *
 * @example
 * <WikiLinkEditPopover
 *   anchorRect={chipEl.getBoundingClientRect()}
 *   initialToken="page:luffy"
 *   initialAlias="Luffy"
 *   onConfirm={(token, alias) => updateNode(token, alias)}
 *   onClose={() => setEditing(false)}
 * />
 */
export function WikiLinkEditPopover(props: WikiLinkEditPopoverProps) {
  const {
    anchorRect,
    initialToken,
    initialAlias = "",
    autoFocusAlias = false,
    onConfirm,
    onClose,
  } = props;
  const { wikiPages, wikiChapters, chapterType } = useContext(WikiLinkContext);

  const [selectedToken, setSelectedToken] = useState<string | undefined>(initialToken);
  const [alias, setAlias] = useState(initialAlias);
  const aliasInputRef = useRef<HTMLInputElement>(null);

  // Auto-focus alias input when requested (post-autocomplete alias step).
  useEffect(() => {
    if (autoFocusAlias) {
      aliasInputRef.current?.select();
    }
  }, [autoFocusAlias]);

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

  function handleTokenChange(token: string) {
    setSelectedToken(token);
    const pageMatch = wikiPages.find((p) => `page:${p.slug}` === token);
    const chapterMatch = wikiChapters.find(
      (c) => `${chapterType}:${c.name}` === token,
    );
    setAlias(pageMatch?.name ?? chapterMatch?.name ?? "");
  }

  function handleConfirm() {
    if (!selectedToken) return;
    onConfirm(selectedToken, alias.trim() || undefined);
  }

  return (
    <>
      {/* Transparent backdrop — clicking outside the popover closes it. */}
      <div className="fixed inset-0 z-[49]" onMouseDown={onClose} />
      <div
        style={{
          top: anchorRect.bottom + 4,
          left: anchorRect.left,
        }}
        className="fixed z-50 w-80 rounded-lg border border-border bg-popover p-3 shadow-md flex flex-col gap-3"
        onMouseDown={(e) => e.preventDefault()}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            onClose();
          }
        }}
      >
        <div className="flex items-center justify-between">
          <Text variant="label">{initialToken ? "Edit Wiki Link" : "Insert Wiki Link"}</Text>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={onClose}
            className="size-6 shrink-0"
          >
            <XIcon className="size-4" />
          </Button>
        </div>
        <Select<string>
          options={selectOptions}
          value={selectedToken}
          onChange={handleTokenChange}
          placeholder="Select a page or chapter…"
          popupWidth="320px"
        />
        <Input
          ref={aliasInputRef}
          value={alias}
          onChange={(e) => setAlias(e.target.value)}
          placeholder="Link text"
          autoFocus={autoFocusAlias}
          onMouseDown={(e) => e.stopPropagation()}
          onKeyDown={(e) => {
            if (e.key === "Enter") handleConfirm();
          }}
        />
        <Button
          type="button"
          onClick={handleConfirm}
          disabled={!selectedToken}
          className="w-full"
        >
          {initialToken ? "Update Wiki Link" : "Insert Wiki Link"}
        </Button>
      </div>
    </>
  );
}
