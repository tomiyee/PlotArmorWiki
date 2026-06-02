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
 * For each page in `pageIds`, determines whether it has at least one active
 * child relationship at `cutoffIdx` (highest chapter_idx ≤ cutoff resolves to
 * is_active = true). Used to decide folder vs. document icon in sub-page lists.
 *
 * @example
 * const hasChildren = await resolveHasChildrenAtIdx(childPageIds, cutoffIdx);
 * const icon = hasChildren.has(page.id) ? <Folder /> : <FileText />;
 */
export async function resolveHasChildrenAtIdx(
  pageIds: number[],
  cutoffIdx: number,
): Promise<Set<number>> {
  if (pageIds.length === 0) return new Set();

  const relMaxIdxSq = db
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
    .as("has_children_rel_max_idx_sq");

  const rows = await db
    .select({ parentPageId: pageRelationships.parentPageId })
    .from(pageRelationships)
    .innerJoin(chapters, eq(pageRelationships.chapterId, chapters.id))
    .innerJoin(
      relMaxIdxSq,
      and(
        eq(pageRelationships.parentPageId, relMaxIdxSq.parentPageId),
        eq(pageRelationships.childPageId, relMaxIdxSq.childPageId),
        eq(chapters.idx, relMaxIdxSq.maxIdx),
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
