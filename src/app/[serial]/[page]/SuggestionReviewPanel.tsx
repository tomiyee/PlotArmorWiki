"use client";

import { Box } from "@/components/ui/Box";
import { Text } from "@/components/ui/Text";
import { PendingSuggestionReviewCard } from "./PendingSuggestionReviewCard";
import type { PendingSuggestionDetail } from "@/types";

type SuggestionReviewPanelProps = {
  /** Pending suggestions to review, fetched server-side. */
  suggestions: PendingSuggestionDetail[];
  /** Slug of the serial, used for MarkdownRenderer wiki links. */
  serialSlug: string;
  /** The serial's chapter type label (e.g. "Chapter", "Episode"). */
  chapterType?: string;
  /** The admin's reading cutoff idx, for spoiler badges on later revisions. */
  readerCutoffIdx?: number | null;
  /** Wiki pages for `[[Page]]` autocomplete in carry-forward editors. */
  wikiPages?: { name: string; slug: string }[];
  /** Chapters for `[[Chapter:Name]]` autocomplete in carry-forward editors. */
  wikiChapters?: { name: string; idx: number }[];
};

/**
 * Admin review panel listing pending suggestions for a wiki page.
 * Each card shows a before/after diff per change, the citation, an optional
 * carry-forward panel for later revisions, and approve/reject controls.
 *
 * @example
 * <SuggestionReviewPanel suggestions={pendingSuggestions} serialSlug="one-piece" />
 */
export function SuggestionReviewPanel(props: SuggestionReviewPanelProps) {
  const {
    suggestions,
    serialSlug,
    chapterType,
    readerCutoffIdx,
    wikiPages,
    wikiChapters,
  } = props;

  if (suggestions.length === 0) {
    return (
      <Box
        col
        className="gap-2 rounded-lg border border-border bg-muted/20 p-4"
      >
        <Text variant="h3">Pending suggestions</Text>
        <Text muted className="text-sm">
          No pending suggestions for this page.
        </Text>
      </Box>
    );
  }

  return (
    <Box col className="gap-4">
      <Text variant="h3">Pending suggestions ({suggestions.length})</Text>
      {suggestions.map((suggestion) => (
        <PendingSuggestionReviewCard
          key={suggestion.id}
          suggestion={suggestion}
          serialSlug={serialSlug}
          chapterType={chapterType}
          readerCutoffIdx={readerCutoffIdx}
          wikiPages={wikiPages}
          wikiChapters={wikiChapters}
        />
      ))}
    </Box>
  );
}
