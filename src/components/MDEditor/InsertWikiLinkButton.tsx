"use client";

import { useCallback, useContext, useRef, useState } from "react";
import { ButtonWithTooltip } from "@mdxeditor/editor";
import { Link2 } from "lucide-react";
import { WikiLinkContext } from "./WikiLinkContext";
import { WikiLinkEditPopover } from "./WikiLinkEditPopover";

/**
 * Toolbar button that opens a form popover for inserting a wiki link with an
 * optional alias. Reads data and callbacks from `WikiLinkContext` (always
 * fresh), keeping the plugins useMemo closure dep-free.
 * Delegates popover UI to `WikiLinkEditPopover`.
 *
 * @example
 * toolbarContents: () => (
 *   <DiffSourceToggleWrapper>
 *     <InsertWikiLinkButton />
 *   </DiffSourceToggleWrapper>
 * )
 */
export function InsertWikiLinkButton() {
  const { insertWikiLink, focusEditor } = useContext(WikiLinkContext);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const [anchorRect, setAnchorRect] = useState<DOMRect | null>(null);

  const handleButtonClick = useCallback(() => {
    if (anchorRect) {
      setAnchorRect(null);
      return;
    }
    const rect = buttonRef.current?.getBoundingClientRect();
    if (rect) setAnchorRect(rect);
  }, [anchorRect]);

  function handleConfirm(token: string, alias: string | undefined) {
    setAnchorRect(null);
    insertWikiLink(token, alias);
    requestAnimationFrame(() => focusEditor());
  }

  function handleClose() {
    setAnchorRect(null);
    focusEditor();
  }

  return (
    <>
      <ButtonWithTooltip
        title="Insert wiki link"
        ref={buttonRef}
        onClick={handleButtonClick}
        aria-expanded={!!anchorRect}
        aria-haspopup="dialog"
      >
        <Link2 className="size-4" />
      </ButtonWithTooltip>

      {anchorRect && (
        <WikiLinkEditPopover
          anchorRect={anchorRect}
          onConfirm={handleConfirm}
          onClose={handleClose}
        />
      )}
    </>
  );
}
