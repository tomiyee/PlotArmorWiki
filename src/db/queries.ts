import { db } from "@/db/index";
import { chapters, pageTitles, pageRelationships } from "@/db/schema";
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
