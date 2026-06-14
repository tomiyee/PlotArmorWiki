"use server";

import { getSerialBySlug } from "@/data/serials/queries";
import { getChapterCutoff } from "@/data/chapters/queries";
import { fetchSearchablePagesAtIdx, resolvePageTitlesAtIdx } from "@/data/pages/queries";

export interface PageSearchResult {
  /** DB primary key. */
  id: number;
  /** Display name used as the search label. */
  name: string;
  /** URL slug for navigation to /{serial}/{slug}. */
  slug: string;
}

/**
 * Returns all non-home wiki pages in the given serial that are visible at the
 * user's current chapter cutoff (read from the progress cookie set by
 * ChapterSelector). Pages whose intro chapter is beyond the cutoff are
 * excluded - the same spoiler rule used by page rendering.
 *
 * Cutoff falls back to idx=0 when no progress cookie exists, so only pages
 * with no intro chapter (impossible in practice) would appear on first visit.
 *
 * @example
 * const results = await getVisiblePages("my-serial");
 */
export async function getVisiblePages(
  serialSlug: string,
): Promise<PageSearchResult[]> {
  const serial = await getSerialBySlug(serialSlug);

  if (!serial) return [];

  const { cutoffIdx } = await getChapterCutoff(serial.id);

  const rawPages = await fetchSearchablePagesAtIdx(serial.id, cutoffIdx);
  if (rawPages.length === 0) return [];

  const pageIds = rawPages.map((p) => p.id);
  const titleByPageId = await resolvePageTitlesAtIdx(pageIds, cutoffIdx);

  return rawPages.map((p) => ({
    id: p.id,
    // Fall back to pages.name for pages without any pageTitles entry yet.
    name: titleByPageId.get(p.id) ?? p.name,
    slug: p.slug,
  }));
}
