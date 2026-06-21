import {
  chapters,
  pageSectionRevisions,
  pageInfoboxRevisions,
} from "@/db/schema";
import { and, eq, inArray, lt, max } from "drizzle-orm";
import { db } from "@/db/index";

/** Drizzle transaction type inferred from the db client. */
type Tx = Parameters<Parameters<(typeof db)["transaction"]>[0]>[0];

/**
 * Applies section and infobox-row content revisions inside an existing
 * transaction, enforcing the invariant that consecutive revisions must differ.
 *
 * For each section/infobox ID the helper:
 * 1. Fetches the previous revision (highest `chapters.idx` strictly less than
 *    `targetIdx`) to determine baseline content.
 * 2. If the proposed content matches the previous content — or is empty when
 *    `deleteIfEmpty` is true — **deletes** any existing revision at
 *    `targetChapterId` so the reader falls through to the prior revision.
 * 3. Otherwise **upserts** the revision at `targetChapterId`.
 *
 * This is the canonical write-invariant path shared by `savePageContent` and
 * `approveSuggestion`. Any future change to the write invariant (e.g. a new
 * content type or a stricter equality check) should be made here.
 *
 * @example
 * await db.transaction(async (tx) => {
 *   await applyPageContentRevisions(tx, pageId, chapterId, chapterIdx,
 *     { [sectionId]: "New body text" },
 *     { [infoboxRowId]: "42" },
 *   );
 * });
 */
export async function applyPageContentRevisions(
  tx: Tx,
  pageId: number,
  targetChapterId: number,
  targetIdx: number,
  sectionChanges: Record<number, string>,
  infoboxChanges: Record<number, string>,
  /**
   * When true, a proposed content value that is empty (blank/whitespace) is
   * treated the same as a match with the previous revision and causes the
   * revision at `targetChapterId` to be deleted. `savePageContent` passes
   * true; `approveSuggestion` passes false because suggestions should never
   * arrive with empty content.
   */
  deleteIfEmpty = false,
): Promise<void> {
  // ── Section revisions ───────────────────────────────────────────────────────
  const sectionIds = Object.keys(sectionChanges).map(Number);
  let prevContentBySectionId = new Map<number, string>();
  if (sectionIds.length > 0 && targetIdx > 0) {
    const prevMaxSq = tx
      .select({
        sectionId: pageSectionRevisions.sectionId,
        maxPrevIdx: max(chapters.idx).as("max_prev_idx"),
      })
      .from(pageSectionRevisions)
      .innerJoin(chapters, eq(pageSectionRevisions.chapterId, chapters.id))
      .where(
        and(
          eq(pageSectionRevisions.pageId, pageId),
          inArray(pageSectionRevisions.sectionId, sectionIds),
          lt(chapters.idx, targetIdx),
        ),
      )
      .groupBy(pageSectionRevisions.sectionId)
      .as("prev_max_sq");

    const prevRevisions = await tx
      .select({
        sectionId: pageSectionRevisions.sectionId,
        content: pageSectionRevisions.content,
      })
      .from(pageSectionRevisions)
      .innerJoin(chapters, eq(pageSectionRevisions.chapterId, chapters.id))
      .innerJoin(
        prevMaxSq,
        and(
          eq(pageSectionRevisions.sectionId, prevMaxSq.sectionId),
          eq(chapters.idx, prevMaxSq.maxPrevIdx),
        ),
      )
      .where(eq(pageSectionRevisions.pageId, pageId));

    prevContentBySectionId = new Map(
      prevRevisions.map((r) => [r.sectionId, r.content ?? ""]),
    );
  }

  for (const [sectionIdStr, content] of Object.entries(sectionChanges)) {
    const sectionId = parseInt(sectionIdStr, 10);
    const prevContent = prevContentBySectionId.get(sectionId) ?? "";
    if ((deleteIfEmpty && !content.trim()) || content === prevContent) {
      // Uphold the invariant: consecutive revisions must differ.
      // Also never write empty revisions (when deleteIfEmpty is requested).
      await tx
        .delete(pageSectionRevisions)
        .where(
          and(
            eq(pageSectionRevisions.pageId, pageId),
            eq(pageSectionRevisions.sectionId, sectionId),
            eq(pageSectionRevisions.chapterId, targetChapterId),
          ),
        );
      continue;
    }
    await tx
      .insert(pageSectionRevisions)
      .values({ pageId, sectionId, chapterId: targetChapterId, content })
      .onConflictDoUpdate({
        target: [
          pageSectionRevisions.pageId,
          pageSectionRevisions.sectionId,
          pageSectionRevisions.chapterId,
        ],
        set: { content },
      });
  }

  // ── Infobox row revisions ───────────────────────────────────────────────────
  const infoboxIds = Object.keys(infoboxChanges).map(Number);
  let prevContentByInfoboxId = new Map<number, string>();
  if (infoboxIds.length > 0 && targetIdx > 0) {
    const ibPrevMaxSq = tx
      .select({
        infoboxSectionId: pageInfoboxRevisions.infoboxSectionId,
        maxPrevIdx: max(chapters.idx).as("max_prev_idx"),
      })
      .from(pageInfoboxRevisions)
      .innerJoin(chapters, eq(pageInfoboxRevisions.chapterId, chapters.id))
      .where(
        and(
          eq(pageInfoboxRevisions.pageId, pageId),
          inArray(pageInfoboxRevisions.infoboxSectionId, infoboxIds),
          lt(chapters.idx, targetIdx),
        ),
      )
      .groupBy(pageInfoboxRevisions.infoboxSectionId)
      .as("ib_prev_max_sq");

    const ibPrevRevisions = await tx
      .select({
        infoboxSectionId: pageInfoboxRevisions.infoboxSectionId,
        content: pageInfoboxRevisions.content,
      })
      .from(pageInfoboxRevisions)
      .innerJoin(chapters, eq(pageInfoboxRevisions.chapterId, chapters.id))
      .innerJoin(
        ibPrevMaxSq,
        and(
          eq(
            pageInfoboxRevisions.infoboxSectionId,
            ibPrevMaxSq.infoboxSectionId,
          ),
          eq(chapters.idx, ibPrevMaxSq.maxPrevIdx),
        ),
      )
      .where(eq(pageInfoboxRevisions.pageId, pageId));

    prevContentByInfoboxId = new Map(
      ibPrevRevisions.map((r) => [r.infoboxSectionId, r.content ?? ""]),
    );
  }

  for (const [infoboxSectionIdStr, content] of Object.entries(infoboxChanges)) {
    const infoboxSectionId = parseInt(infoboxSectionIdStr, 10);
    const prevContent = prevContentByInfoboxId.get(infoboxSectionId) ?? "";
    if ((deleteIfEmpty && !content.trim()) || content === prevContent) {
      await tx
        .delete(pageInfoboxRevisions)
        .where(
          and(
            eq(pageInfoboxRevisions.pageId, pageId),
            eq(pageInfoboxRevisions.infoboxSectionId, infoboxSectionId),
            eq(pageInfoboxRevisions.chapterId, targetChapterId),
          ),
        );
      continue;
    }
    await tx
      .insert(pageInfoboxRevisions)
      .values({
        pageId,
        infoboxSectionId,
        chapterId: targetChapterId,
        content,
      })
      .onConflictDoUpdate({
        target: [
          pageInfoboxRevisions.pageId,
          pageInfoboxRevisions.infoboxSectionId,
          pageInfoboxRevisions.chapterId,
        ],
        set: { content },
      });
  }
}
