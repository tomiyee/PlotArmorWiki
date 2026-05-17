function lastUpdatedLabel(
  lastUpdatedIdx: number | null,
  selectedChapterIdx: number | null,
): string | null {
  if (lastUpdatedIdx === null) return null;
  if (selectedChapterIdx === null) return null;
  const delta = selectedChapterIdx - lastUpdatedIdx;
  if (delta === 0) return "This Chapter";
  if (delta === 1) return "Last Updated 1 Chapter Ago";
  return `Last Updated ${delta} Chapters Ago`;
}

export function LastUpdatedTag({
  lastUpdatedIdx,
  selectedChapterIdx,
}: {
  lastUpdatedIdx: number | null;
  selectedChapterIdx: number | null;
}) {
  const label = lastUpdatedLabel(lastUpdatedIdx, selectedChapterIdx);
  if (!label) return null;
  const isCurrent = lastUpdatedIdx === selectedChapterIdx;
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
        isCurrent ? "bg-accent text-accent-foreground" : "bg-muted text-muted-foreground"
      }`}
    >
      {label}
    </span>
  );
}
