function lastUpdatedLabel(
  lastUpdatedIdx: number | null,
  selectedChapterIdx: number | null,
): string | null {
  if (lastUpdatedIdx === null) return null;
  if (selectedChapterIdx === null) return null;
  const delta = selectedChapterIdx - lastUpdatedIdx;
  if (delta === 0) return "Last updated: this chapter";
  if (delta === 1) return "Last updated: last chapter";
  return `Last updated: ${delta} chapters ago`;
}

type LastUpdatedTagProps = {
  /** Chapter index at which this field was last edited; null hides the tag. */
  lastUpdatedIdx: number | null;
  /** The viewer's current chapter cutoff index, used to compute the delta. */
  selectedChapterIdx: number | null;
};

/**
 * Badge showing how many chapters ago a field was last updated relative to the viewer's cutoff.
 * Renders nothing when either index is null.
 *
 * @example
 * <LastUpdatedTag lastUpdatedIdx={5} selectedChapterIdx={7} />
 */
export function LastUpdatedTag(props: LastUpdatedTagProps) {
  const { lastUpdatedIdx, selectedChapterIdx } = props;
  const label = lastUpdatedLabel(lastUpdatedIdx, selectedChapterIdx);
  if (!label) return null;
  const isCurrent = lastUpdatedIdx === selectedChapterIdx;
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
        isCurrent
          ? "bg-accent text-accent-foreground"
          : "bg-muted text-muted-foreground"
      }`}
    >
      {label}
    </span>
  );
}
