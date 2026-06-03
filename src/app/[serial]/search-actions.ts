"use server";

import { db } from "@/db/index";
import { pages, chapters } from "@/db/schema";
import { and, asc, eq, isNull, lte, or } from "drizzle-orm";
import { cookies } from "next/headers";
import {
  resolvePageTitlesAtIdx,
  getSerialBySlug,
  getChapterIdxById,
} from "@/db/queries";

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

  // Read the chapter cutoff from the progress cookie written by ChapterSelector.
  const cookieStore = await cookies();
  const raw = cookieStore.get(`plotarmor_chapter_${serial.id}`)?.value;
  let cutoffIdx = 0;
  if (raw) {
    const chapterId = parseInt(raw, 10);
    if (!isNaN(chapterId)) {
      const idx = await getChapterIdxById(chapterId);
      if (idx !== null) cutoffIdx = idx;
    }
  }

  // Step 1: pages visible at the cutoff (same filter as page rendering).
  const rawPages = await db
    .select({ id: pages.id, name: pages.name, slug: pages.slug })
    .from(pages)
    .leftJoin(chapters, eq(pages.introChapterId, chapters.id))
    .where(
      and(
        eq(pages.serialId, serial.id),
        // Exclude the home page - users navigate to it via the serial breadcrumb.
        eq(pages.isHomePage, false),
        or(isNull(pages.introChapterId), lte(chapters.idx, cutoffIdx)),
      ),
    )
    .orderBy(asc(pages.name));

  if (rawPages.length === 0) return [];

  // Step 2: resolve each page's chapter-versioned title at the cutoff.
  const pageIds = rawPages.map((p) => p.id);
  const titleByPageId = await resolvePageTitlesAtIdx(pageIds, cutoffIdx);

  return rawPages.map((p) => ({
    id: p.id,
    // Fall back to pages.name for pages without any pageTitles entry yet.
    name: titleByPageId.get(p.id) ?? p.name,
    slug: p.slug,
  }));
}
