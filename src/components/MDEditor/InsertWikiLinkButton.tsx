"use client";

import { useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ButtonWithTooltip } from "@mdxeditor/editor";
import { Link2 } from "lucide-react";
import { WikiLinkContext } from "./WikiLinkContext";
import { Select, type Option } from "@/components/ui/Select";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";

/**
 * Toolbar button that opens a form popover for inserting a wiki link with an
 * optional alias. Reads data and callbacks from `WikiLinkContext` (always
 * fresh), keeping the plugins useMemo closure dep-free. The popover tracks
 * the button's position during scroll and resize.
 *
 * @example
 * toolbarContents: () => (
 *   <DiffSourceToggleWrapper>
 *     <InsertWikiLinkButton />
 *   </DiffSourceToggleWrapper>
 * )
 */
export function InsertWikiLinkButton() {
  const { wikiPages, wikiChapters, chapterType, insertWikiLink, focusEditor } =
    useContext(WikiLinkContext);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [selectedToken, setSelectedToken] = useState<string | undefined>(undefined);
  const [alias, setAlias] = useState("");
  const [popoverPos, setPopoverPos] = useState<{ top: number; left: number }>({
    top: 0,
    left: 0,
  });

  const updatePosition = useCallback(() => {
    const rect = buttonRef.current?.getBoundingClientRect();
    if (rect) {
      setPopoverPos({ top: rect.bottom + 4, left: rect.left });
    }
  }, []);

  // Reposition the fixed popover whenever the user scrolls, resizes, or the
  // iOS virtual keyboard opens/closes (visualViewport resize).
  useEffect(() => {
    if (!isOpen) return;
    window.addEventListener("scroll", updatePosition, true);
    window.addEventListener("resize", updatePosition);
    window.visualViewport?.addEventListener("resize", updatePosition);
    window.visualViewport?.addEventListener("scroll", updatePosition);
    return () => {
      window.removeEventListener("scroll", updatePosition, true);
      window.removeEventListener("resize", updatePosition);
      window.visualViewport?.removeEventListener("resize", updatePosition);
      window.visualViewport?.removeEventListener("scroll", updatePosition);
    };
  }, [isOpen, updatePosition]);

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
      updatePosition();
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

      {isOpen &&
        createPortal(
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
          </div>,
          document.body,
        )}
    </>
  );
}
