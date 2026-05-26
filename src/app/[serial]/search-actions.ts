"use server";

import { db } from "@/db/index";
import { pages, chapters, serials, pageTitles } from "@/db/schema";
import { and, asc, eq, inArray, isNull, lte, max, or } from "drizzle-orm";
import { cookies } from "next/headers";

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
 * excluded -the same spoiler rule used by page rendering.
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
  const [serial] = await db
    .select({ id: serials.id })
    .from(serials)
    .where(eq(serials.slug, serialSlug))
    .limit(1);

  if (!serial) return [];

  // Read the chapter cutoff from the progress cookie written by ChapterSelector.
  const cookieStore = await cookies();
  const raw = cookieStore.get(`plotarmor_chapter_${serial.id}`)?.value;
  let cutoffIdx = 0;
  if (raw) {
    const chapterId = parseInt(raw, 10);
    if (!isNaN(chapterId)) {
      const [row] = await db
        .select({ idx: chapters.idx })
        .from(chapters)
        .where(eq(chapters.id, chapterId))
        .limit(1);
      if (row) cutoffIdx = row.idx;
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
        // Exclude the home page -users navigate to it via the serial breadcrumb.
        eq(pages.isHomePage, false),
        or(isNull(pages.introChapterId), lte(chapters.idx, cutoffIdx)),
      ),
    )
    .orderBy(asc(pages.name));

  if (rawPages.length === 0) return [];

  // Step 2: resolve each page's chapter-versioned title at the cutoff.
  // Mirrors the same max-idx pattern used by the page view.
  const pageIds = rawPages.map((p) => p.id);
  const titleMaxIdxSq = db
    .select({
      pageId: pageTitles.pageId,
      maxIdx: max(chapters.idx).as("max_idx"),
    })
    .from(pageTitles)
    .innerJoin(chapters, eq(pageTitles.chapterId, chapters.id))
    .where(
      and(inArray(pageTitles.pageId, pageIds), lte(chapters.idx, cutoffIdx)),
    )
    .groupBy(pageTitles.pageId)
    .as("title_max_idx_sq");

  const titleRows = await db
    .select({ pageId: pageTitles.pageId, title: pageTitles.title })
    .from(pageTitles)
    .innerJoin(chapters, eq(pageTitles.chapterId, chapters.id))
    .innerJoin(
      titleMaxIdxSq,
      and(
        eq(pageTitles.pageId, titleMaxIdxSq.pageId),
        eq(chapters.idx, titleMaxIdxSq.maxIdx),
      ),
    );

  const titleByPageId = new Map(titleRows.map((r) => [r.pageId, r.title]));

  return rawPages.map((p) => ({
    id: p.id,
    // Fall back to pages.name for pages without any pageTitles entry yet.
    name: titleByPageId.get(p.id) ?? p.name,
    slug: p.slug,
  }));
}
