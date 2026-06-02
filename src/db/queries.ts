import { db } from "@/db/index";
import {
  chapters,
  pageTitles,
  pageRelationships,
  pageSectionRevisions,
  pageInfoboxRevisions,
  serials,
  volumes,
} from "@/db/schema";
import { and, eq, inArray, lte, max } from "drizzle-orm";

/**
 * Resolves chapter-versioned display titles for a set of pages at a given reading position.
 *
 * Returns the pageTitles entry whose chapter has the highest idx ≤ cutoffIdx —
 * the name the reader should see at their current position. Pages with no
 * pageTitles row at or before the cutoff are omitted; callers fall back to
 * pages.name.
 *
 * @example
 * const titleMap = await resolvePageTitlesAtIdx(pageIds, cutoffIdx);
 * const displayName = titleMap.get(page.id) ?? page.name;
 */
export async function resolvePageTitlesAtIdx(
  pageIds: number[],
  cutoffIdx: number,
): Promise<Map<number, string>> {
  if (pageIds.length === 0) return new Map();

  const maxIdxSq = db
    .select({
      pageId: pageTitles.pageId,
      maxIdx: max(chapters.idx).as("max_idx"),
    })
    .from(pageTitles)
    .innerJoin(chapters, eq(pageTitles.chapterId, chapters.id))
    .where(
      and(
        inArray(pageTitles.pageId, pageIds),
        lte(chapters.idx, cutoffIdx),
      ),
    )
    .groupBy(pageTitles.pageId)
    .as("page_title_max_idx_sq");

  const rows = await db
    .select({ pageId: pageTitles.pageId, title: pageTitles.title })
    .from(pageTitles)
    .innerJoin(chapters, eq(pageTitles.chapterId, chapters.id))
    .innerJoin(
      maxIdxSq,
      and(
        eq(pageTitles.pageId, maxIdxSq.pageId),
        eq(chapters.idx, maxIdxSq.maxIdx),
      ),
    );

  return new Map(rows.map((r) => [r.pageId, r.title]));
}

/**
 * Returns the set of page IDs (from `pageIds`) that have at least one active
 * child relationship at `cutoffIdx` — i.e. pages that should render a folder
 * icon rather than a document icon in the sub-pages list.
 *
 * Uses the max-idx pattern: the latest `pageRelationships` revision per
 * (parent, child) pair at or before `cutoffIdx` must have `isActive = true`.
 *
 * @example
 * const hasChildrenSet = await resolveHasChildrenSet(childPageIds, cutoffIdx);
 * const hasChildren = hasChildrenSet.has(page.id);
 */
export async function resolveHasChildrenSet(
  pageIds: number[],
  cutoffIdx: number,
): Promise<Set<number>> {
  if (pageIds.length === 0) return new Set();

  const grandchildRelMaxIdxSq = db
    .select({
      parentPageId: pageRelationships.parentPageId,
      childPageId: pageRelationships.childPageId,
      maxIdx: max(chapters.idx).as("max_idx"),
    })
    .from(pageRelationships)
    .innerJoin(chapters, eq(pageRelationships.chapterId, chapters.id))
    .where(
      and(
        inArray(pageRelationships.parentPageId, pageIds),
        lte(chapters.idx, cutoffIdx),
      ),
    )
    .groupBy(pageRelationships.parentPageId, pageRelationships.childPageId)
    .as("grandchild_rel_max_idx_sq");

  const rows = await db
    .select({ parentPageId: pageRelationships.parentPageId })
    .from(pageRelationships)
    .innerJoin(chapters, eq(pageRelationships.chapterId, chapters.id))
    .innerJoin(
      grandchildRelMaxIdxSq,
      and(
        eq(pageRelationships.parentPageId, grandchildRelMaxIdxSq.parentPageId),
        eq(pageRelationships.childPageId, grandchildRelMaxIdxSq.childPageId),
        eq(chapters.idx, grandchildRelMaxIdxSq.maxIdx),
      ),
    )
    .where(
      and(
        inArray(pageRelationships.parentPageId, pageIds),
        eq(pageRelationships.isActive, true),
      ),
    );

  return new Set(rows.map((r) => r.parentPageId));
}

/**
 * Returns the Drizzle subquery that, for each section of `pageId`, finds the
 * highest `chapters.idx` ≤ `cutoffIdx` at which a revision exists. Callers
 * join this subquery to `pageSectionRevisions` + `chapters` to obtain the
 * chapter-versioned content at the reader's cutoff.
 *
 * Returns a subquery object — callers must await their own `db.select(…).from(…)
 * .innerJoin(sq, …)` call. This keeps the helper composable with different
 * outer SELECT projections.
 *
 * @example
 * const sq = sectionMaxIdxSq(pageId, cutoffIdx);
 * const rows = await db
 *   .select({ sectionId: pageSectionRevisions.sectionId, content: pageSectionRevisions.content })
 *   .from(pageSectionRevisions)
 *   .innerJoin(chapters, eq(pageSectionRevisions.chapterId, chapters.id))
 *   .innerJoin(sq, and(eq(pageSectionRevisions.sectionId, sq.sectionId), eq(chapters.idx, sq.maxIdx)))
 *   .where(eq(pageSectionRevisions.pageId, pageId));
 */
export function sectionMaxIdxSq(pageId: number, cutoffIdx: number) {
  return db
    .select({
      sectionId: pageSectionRevisions.sectionId,
      maxIdx: max(chapters.idx).as("max_idx"),
    })
    .from(pageSectionRevisions)
    .innerJoin(chapters, eq(pageSectionRevisions.chapterId, chapters.id))
    .where(
      and(
        eq(pageSectionRevisions.pageId, pageId),
        lte(chapters.idx, cutoffIdx),
      ),
    )
    .groupBy(pageSectionRevisions.sectionId)
    .as("section_max_idx_sq");
}

/**
 * Returns the Drizzle subquery that, for each infobox row of `pageId`, finds
 * the highest `chapters.idx` ≤ `cutoffIdx` at which a revision exists. Callers
 * join this to `pageInfoboxRevisions` + `chapters` to get chapter-versioned
 * infobox content.
 *
 * Returns a subquery object — callers must await their own query.
 *
 * @example
 * const sq = infoboxRowMaxIdxSq(pageId, cutoffIdx);
 * const rows = await db
 *   .select({ infoboxSectionId: pageInfoboxRevisions.infoboxSectionId, content: pageInfoboxRevisions.content })
 *   .from(pageInfoboxRevisions)
 *   .innerJoin(chapters, eq(pageInfoboxRevisions.chapterId, chapters.id))
 *   .innerJoin(sq, and(eq(pageInfoboxRevisions.infoboxSectionId, sq.infoboxSectionId), eq(chapters.idx, sq.maxIdx)))
 *   .where(eq(pageInfoboxRevisions.pageId, pageId));
 */
export function infoboxRowMaxIdxSq(pageId: number, cutoffIdx: number) {
  return db
    .select({
      infoboxSectionId: pageInfoboxRevisions.infoboxSectionId,
      maxIdx: max(chapters.idx).as("max_idx"),
    })
    .from(pageInfoboxRevisions)
    .innerJoin(chapters, eq(pageInfoboxRevisions.chapterId, chapters.id))
    .where(
      and(
        eq(pageInfoboxRevisions.pageId, pageId),
        lte(chapters.idx, cutoffIdx),
      ),
    )
    .groupBy(pageInfoboxRevisions.infoboxSectionId)
    .as("infobox_row_max_idx_sq");
}

/**
 * Returns the Drizzle subquery that, for each child of `parentPageId`, finds
 * the highest `chapters.idx` ≤ `cutoffIdx` at which a relationship revision
 * exists. Callers join this to `pageRelationships` + `chapters` to obtain the
 * latest active/inactive state per child at the reader's cutoff.
 *
 * Pass `Number.MAX_SAFE_INTEGER` as `cutoffIdx` to get the latest state across
 * all chapters (no cutoff), as used in the navbar where spoiler filtering is
 * not applied.
 *
 * @example
 * const sq = childRelMaxIdxSq(homePage.id, cutoffIdx);
 * const rows = await db
 *   .select({ id: pages.id, isActive: pageRelationships.isActive })
 *   .from(pageRelationships)
 *   .innerJoin(pages, eq(pageRelationships.childPageId, pages.id))
 *   .innerJoin(chapters, eq(pageRelationships.chapterId, chapters.id))
 *   .innerJoin(sq, and(eq(pageRelationships.childPageId, sq.childPageId), eq(chapters.idx, sq.maxIdx)))
 *   .where(eq(pageRelationships.parentPageId, homePage.id));
 */
export function childRelMaxIdxSq(parentPageId: number, cutoffIdx: number) {
  return db
    .select({
      childPageId: pageRelationships.childPageId,
      maxIdx: max(chapters.idx).as("max_idx"),
    })
    .from(pageRelationships)
    .innerJoin(chapters, eq(pageRelationships.chapterId, chapters.id))
    .where(
      and(
        eq(pageRelationships.parentPageId, parentPageId),
        lte(chapters.idx, cutoffIdx),
      ),
    )
    .groupBy(pageRelationships.childPageId)
    .as("rel_max_idx_sq");
}

/**
 * Fetches a serial row by its URL slug. Returns `undefined` when no serial
 * matches, so callers can short-circuit with `notFound()` or return `null`.
 *
 * Includes `chapterType` alongside `id` because most callsites that look up
 * a serial also need `chapterType` for display labels ("Chapter 5", "Episode 5").
 *
 * @example
 * const serial = await getSerialBySlug("one-piece");
 * if (!serial) return null;
 */
export async function getSerialBySlug(
  serialSlug: string,
): Promise<{ id: number; chapterType: "Chapter" | "Episode" | "Issue" | "Part" } | undefined> {
  const [row] = await db
    .select({ id: serials.id, chapterType: serials.chapterType })
    .from(serials)
    .where(eq(serials.slug, serialSlug))
    .limit(1);
  return row;
}

/**
 * Fetches the `idx` for a chapter by its primary key. Returns `null` when the
 * chapter does not exist, so callers can fall back to a default cutoff of 0.
 *
 * @example
 * const idx = await getChapterIdxById(chapterId);
 * const cutoffIdx = idx ?? 0;
 */
export async function getChapterIdxById(
  chapterId: number,
): Promise<number | null> {
  const [row] = await db
    .select({ idx: chapters.idx })
    .from(chapters)
    .where(eq(chapters.id, chapterId))
    .limit(1);
  return row?.idx ?? null;
}

/**
 * Fetches the chapter id for a given serial + chapter idx combination.
 * Returns `undefined` when no matching chapter exists.
 *
 * Uses an inner join through `volumes` to scope the lookup to the correct serial
 * (chapter idx values are unique within a serial but not globally).
 *
 * @example
 * const chapter = await getChapterBySerialAndIdx(serial.id, 5);
 * if (!chapter) throw new Error("Chapter not found");
 */
export async function getChapterBySerialAndIdx(
  serialId: number,
  chapterIdx: number,
): Promise<{ id: number } | undefined> {
  const [row] = await db
    .select({ id: chapters.id })
    .from(chapters)
    .innerJoin(volumes, eq(chapters.volumeId, volumes.id))
    .where(and(eq(volumes.serialId, serialId), eq(chapters.idx, chapterIdx)))
    .limit(1);
  return row;
}
