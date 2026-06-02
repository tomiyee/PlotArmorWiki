/**
 * Shared Tailwind class string for the wiki-link chip visual treatment.
 *
 * Used by `WikiLinkChip` (editor) and the read-mode preview components
 * (`WikiLinkPreview`, `ChapterLinkPreview`) so both surfaces stay in sync.
 * Append interaction classes (e.g. `cursor-pointer`) per callsite as needed.
 *
 * @example
 * import { WIKI_LINK_CHIP_CLASSES } from "@/components/MDEditor/wikiLinkChipClasses";
 * <span className={`${WIKI_LINK_CHIP_CLASSES} cursor-pointer`} />
 */
export const WIKI_LINK_CHIP_CLASSES =
  "inline-flex select-none items-baseline gap-1 rounded bg-muted px-1.5 py-0.5 text-sm font-medium text-foreground";
