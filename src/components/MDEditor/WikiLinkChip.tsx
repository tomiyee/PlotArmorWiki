"use client";

import { useContext } from "react";
import { WikiLinkContext } from "./WikiLinkContext";

type WikiLinkChipProps = {
  /** Wiki link token in `category:value` format, resolved to a display name via WikiLinkContext. */
  token: string;
  /** When provided, shown instead of the resolved page or chapter name. */
  alias?: string;
};

/**
 * Inline chip rendered inside the WYSIWYG editor for a resolved wiki link.
 * Reads page names from WikiLinkContext so slugs show as human-readable titles.
 * When an explicit alias is provided it is displayed directly, bypassing the lookup.
 *
 * @example
 * <WikiLinkChip token="page:luffy" />
 * <WikiLinkChip token="Chapter:Chapter 5" alias="Ch. 5" />
 */
export function WikiLinkChip(props: WikiLinkChipProps) {
  const { token, alias } = props;
  const { wikiPages, chapterType } = useContext(WikiLinkContext);

  const colonIdx = token.indexOf(":");
  const category = colonIdx !== -1 ? token.slice(0, colonIdx) : "page";
  const value = colonIdx !== -1 ? token.slice(colonIdx + 1) : token;

  let actualName: string;
  if (category === "page") {
    const page = wikiPages.find((p) => p.slug === value);
    actualName =
      page?.name ??
      value
        .split("-")
        .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
        .join(" ");
  } else {
    actualName = value;
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
