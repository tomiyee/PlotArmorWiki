"use client";

import { useCallback, useContext, useRef } from "react";
import { ButtonWithTooltip } from "@mdxeditor/editor";
import { Link2 } from "lucide-react";
import { WikiLinkContext } from "./WikiLinkContext";

/**
 * Toolbar button that opens a wiki-link insert popover.
 * Delegates popover rendering to WikiLinkMDEditor via `openInsertMenu` so the
 * popover is mounted outside the MDXEditor toolbar DOM subtree — keeping its
 * appearance consistent with the chip-click edit popover.
 *
 * @example
 * toolbarContents: () => (
 *   <DiffSourceToggleWrapper>
 *     <InsertWikiLinkButton />
 *   </DiffSourceToggleWrapper>
 * )
 */
export function InsertWikiLinkButton() {
  const { openInsertMenu } = useContext(WikiLinkContext);
  const buttonRef = useRef<HTMLButtonElement>(null);

  const handleButtonClick = useCallback(() => {
    const rect = buttonRef.current?.getBoundingClientRect();
    if (rect) openInsertMenu(rect);
  }, [openInsertMenu]);

  return (
    <ButtonWithTooltip
      title="Insert wiki link"
      ref={buttonRef}
      onClick={handleButtonClick}
      aria-haspopup="dialog"
    >
      <Link2 className="size-4" />
    </ButtonWithTooltip>
  );
}
