"use client";

import Link from "next/link";
import { Box } from "@/components/ui/Box";
import { Text } from "@/components/ui/Text";
import { PendingSuggestionReviewCard } from "./[page]/PendingSuggestionReviewCard";
import type { PendingSuggestionDetail } from "@/types";

type SerialSuggestionQueueProps = {
  /** All pending suggestions across the serial, oldest first. */
  suggestions: PendingSuggestionDetail[];
  /** Slug of the serial, used for links and wiki-link resolution. */
  serialSlug: string;
  /** The serial's chapter type label (e.g. "Chapter", "Episode"). */
  chapterType?: string;
  /** The admin's reading cutoff idx; suggestions targeting later chapters are hidden. */
  readerCutoffIdx: number | null;
  /** Wiki pages for `[[Page]]` autocomplete in carry-forward editors. */
  wikiPages?: { name: string; slug: string }[];
  /** Chapters for `[[Chapter:Name]]` autocomplete in carry-forward editors. */
  wikiChapters?: { name: string; idx: number }[];
};

/**
 * Admin review queue on the serial home page: every unreviewed suggestion in
 * the serial, grouped by page, fully reviewable in place (approve / reject /
 * carry forward) without visiting each page. Suggestions targeting chapters
 * beyond the admin's reading progress are hidden behind a count, matching the
 * per-page review panel's spoiler gating.
 *
 * @example
 * <SerialSuggestionQueue
 *   suggestions={queue}
 *   serialSlug="one-piece"
 *   chapterType="Chapter"
 *   readerCutoffIdx={12}
 * />
 */
export function SerialSuggestionQueue(props: SerialSuggestionQueueProps) {
  const {
    suggestions,
    serialSlug,
    chapterType,
    readerCutoffIdx,
    wikiPages,
    wikiChapters,
  } = props;

  const visible = suggestions.filter(
    (s) => readerCutoffIdx === null || s.targetChapterIdx <= readerCutoffIdx,
  );
  const hiddenCount = suggestions.length - visible.length;

  if (visible.length === 0 && hiddenCount === 0) return null;

  // Group by page, preserving oldest-first order within and across groups.
  const byPage = new Map<
    number,
    { pageSlug: string; pageName: string; items: PendingSuggestionDetail[] }
  >();
  for (const suggestion of visible) {
    const group = byPage.get(suggestion.pageId) ?? {
      pageSlug: suggestion.pageSlug,
      pageName: suggestion.pageName,
      items: [],
    };
    group.items.push(suggestion);
    byPage.set(suggestion.pageId, group);
  }

  return (
    <Box
      col
      className="gap-4 rounded-lg border border-amber-400/40 bg-amber-50/30 dark:bg-amber-950/10 p-4"
    >
      <Text variant="h3">
        Suggestions awaiting review{visible.length > 0 && ` (${visible.length})`}
      </Text>

      {[...byPage.values()].map((group) => (
        <Box col key={group.pageSlug} className="gap-3">
          <Text className="text-sm font-medium">
            <Link
              href={`/${serialSlug}/${group.pageSlug}`}
              className="hover:underline"
            >
              {group.pageName}
            </Link>{" "}
            <Text as="span" muted>
              · {group.items.length}{" "}
              {group.items.length === 1 ? "suggestion" : "suggestions"}
            </Text>
          </Text>
          {group.items.map((suggestion) => (
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
      ))}

      {hiddenCount > 0 && (
        <Text className="text-sm text-amber-700 dark:text-amber-400">
          {hiddenCount} pending {hiddenCount === 1 ? "suggestion" : "suggestions"}{" "}
          target{hiddenCount === 1 ? "s" : ""} chapters beyond your current
          reading progress — advance your chapter to review{" "}
          {hiddenCount === 1 ? "it" : "them"}.
        </Text>
      )}
    </Box>
  );
}
