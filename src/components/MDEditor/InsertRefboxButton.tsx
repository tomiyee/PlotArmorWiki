"use client";

import { useContext } from "react";
import { ButtonWithTooltip } from "@mdxeditor/editor";
import { ListOrdered } from "lucide-react";
import { RefContext } from "./RefContext";

/**
 * Toolbar button that inserts a `{{refbox}}` block at the current cursor
 * position and moves focus to a new paragraph below it.
 *
 * @example
 * toolbarContents: () => (
 *   <DiffSourceToggleWrapper>
 *     <InsertRefButton />
 *     <InsertRefboxButton />
 *   </DiffSourceToggleWrapper>
 * )
 */
export function InsertRefboxButton() {
  const { insertRefbox } = useContext(RefContext);

  return (
    <ButtonWithTooltip title="Insert references box" onClick={insertRefbox}>
      <ListOrdered className="size-4" />
    </ButtonWithTooltip>
  );
}
