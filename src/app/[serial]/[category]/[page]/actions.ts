"use server";

import { db } from "@/db/index";
import {
  serials,
  pageCategories,
  pages,
  chapters,
  volumes,
  categorySections,
  categoryFloaterRows,
  pageSectionVersions,
  pageSummaries,
  pageFloaterVersions,
  pageFloaterRowVersions,
} from "@/db/schema";
import { and, asc, desc, eq, isNull, lte, max } from "drizzle-orm";

/**
 * Resolves the latest chapter (highest idx) for a given serial.
 * Edits always write at head so the new version is immediately visible
 * to readers who are fully caught up.
 */
async function getHeadChapterId(serialId: number): Promise<number> {
  const [row] = await db
    .select({ id: chapters.id })
    .from(chapters)
    .innerJoin(volumes, eq(chapters.volumeId, volumes.id))
    .where(eq(volumes.serialId, serialId))
    .orderBy(desc(chapters.idx))
    .limit(1);

  if (!row) throw new Error("Serial has no chapters — cannot save content.");
  return row.id;
}

/**
 * Resolves the database IDs for a given serial, page category, and page.
 *
 * This function takes slug identifiers for a serial, category, and page, and
 * retrieves their corresponding database IDs. It performs three sequential
 * database queries to find the serial, category, and page, throwing an error
 * if any of them are not found.
 *
 * @param serialSlug - The URL-friendly slug identifier for the serial
 * @param categoryName - The name of the page category to find
 * @param pageName - The name of the page to find
 * @returns An object containing the serial ID, category object (with hasFloater property), and page ID
 * @throws Error if the serial, category, or page is not found in the database
 */
async function resolvePageIds(
  serialSlug: string,
  categoryName: string,
  pageName: string,
) {
  const [serial] = await db
    .select({ id: serials.id })
    .from(serials)
    .where(eq(serials.slug, serialSlug))
    .limit(1);
  if (!serial) throw new Error("Serial not found");

  const [category] = await db
    .select({ id: pageCategories.id, hasFloater: pageCategories.hasFloater })
    .from(pageCategories)
    .where(
      and(
        eq(pageCategories.serialId, serial.id),
        eq(pageCategories.name, categoryName),
      ),
    )
    .limit(1);
  if (!category) throw new Error("Category not found");

  const [page] = await db
    .select({ id: pages.id })
    .from(pages)
    .where(and(eq(pages.categoryId, category.id), eq(pages.name, pageName)))
    .limit(1);
  if (!page) throw new Error("Page not found");

  return { serialId: serial.id, category, pageId: page.id };
}

/**
 * Saves all page content at the specified chapter, or the head chapter when
 * no target is given. Passing `targetChapterId` lets editors backfill or
 * overwrite content at any chapter without touching newer revisions.
 *
 * Each section/floater field is an upsert keyed by (pageId, …, chapterId).
 * Readers at an earlier chapter cutoff see the previous version via the
 * max-idx subquery read path. `summaryContent` is saved to the dedicated
 * `page_summaries` table using the same versioning pattern.
 *
 * @example
 * // Write at head (default behaviour — UI passes undefined)
 * await savePageContent(serialSlug, categoryName, pageName, summaryContent, sectionContent, floaterImageUrl, floaterRowContent);
 *
 * @example
 * // Write at a specific chapter (used by the chapter selector in edit mode)
 * await savePageContent(serialSlug, categoryName, pageName, summaryContent, sectionContent, floaterImageUrl, floaterRowContent, chapterId);
 */
export async function savePageContent(
  serialSlug: string,
  categoryName: string,
  pageName: string,
  summaryContent: string,
  sectionContent: Record<number, string>,
  floaterImageUrl: string | null,
  floaterRowContent: Record<number, string>,
  targetChapterId?: number,
): Promise<void> {
  const { serialId, category, pageId } = await resolvePageIds(
    serialSlug,
    categoryName,
    pageName,
  );
  const headChapterId = targetChapterId ?? (await getHeadChapterId(serialId));

  await db.transaction(async (tx) => {
    // Upsert the summary content
    await tx
      .insert(pageSummaries)
      .values({ pageId, chapterId: headChapterId, content: summaryContent })
      .onConflictDoUpdate({
        target: [pageSummaries.pageId, pageSummaries.chapterId],
        set: { content: summaryContent },
      });

    for (const [sectionIdStr, content] of Object.entries(sectionContent)) {
      const sectionId = parseInt(sectionIdStr, 10);
      await tx
        .insert(pageSectionVersions)
        .values({ pageId, sectionId, chapterId: headChapterId, content })
        .onConflictDoUpdate({
          target: [
            pageSectionVersions.pageId,
            pageSectionVersions.sectionId,
            pageSectionVersions.chapterId,
          ],
          set: { content },
        });
    }

    if (category.hasFloater) {
      await tx
        .insert(pageFloaterVersions)
        .values({ pageId, chapterId: headChapterId, imageUrl: floaterImageUrl })
        .onConflictDoUpdate({
          target: [pageFloaterVersions.pageId, pageFloaterVersions.chapterId],
          set: { imageUrl: floaterImageUrl },
        });

      for (const [floaterRowIdStr, content] of Object.entries(
        floaterRowContent,
      )) {
        const floaterRowId = parseInt(floaterRowIdStr, 10);
        await tx
          .insert(pageFloaterRowVersions)
          .values({ pageId, floaterRowId, chapterId: headChapterId, content })
          .onConflictDoUpdate({
            target: [
              pageFloaterRowVersions.pageId,
              pageFloaterRowVersions.floaterRowId,
              pageFloaterRowVersions.chapterId,
            ],
            set: { content },
          });
      }
    }
  });
}

/**
 * Fetches page content as it exists at a specific chapter cutoff, using the
 * same max-idx subquery join as the reader path in page.tsx. Intended for
 * pre-filling the edit form when an editor selects a target chapter so they
 * can see (and then overwrite) what readers at that chapter currently see.
 *
 * `chapterId` is the DB primary key of the chapter (not the idx). The function
 * resolves it to `chapters.idx` to use as the upper-bound for the subquery.
 *
 * Returns empty arrays / null when no content exists at or before the given
 * chapter — the caller should treat these as blank-slate values.
 *
 * @example
 * const data = await getPageContentAtChapter('my-serial', 'Characters', 'Anya', 42);
 * // data.summaryContent: '...'
 * // data.sections: [{ id: 1, content: '...' }, ...]
 * // data.floaterImageUrl: 'https://...' | null
 * // data.floaterRows: [{ id: 3, content: '...' }, ...]
 */
export async function getPageContentAtChapter(
  serialSlug: string,
  categoryName: string,
  pageName: string,
  chapterId: number,
): Promise<{
  summaryContent: string;
  sections: { id: number; content: string }[];
  floaterImageUrl: string | null;
  floaterRows: { id: number; content: string }[];
}> {
  const [{ category, pageId }, [targetChapter]] = await Promise.all([
    resolvePageIds(serialSlug, categoryName, pageName),
    db
      .select({ idx: chapters.idx })
      .from(chapters)
      .where(eq(chapters.id, chapterId))
      .limit(1),
  ]);
  if (!targetChapter) throw new Error("Chapter not found");

  const cutoffIdx = targetChapter.idx;

  // Summary max-idx subquery
  const summaryMaxIdxSq = db
    .select({ maxIdx: max(chapters.idx).as("max_idx") })
    .from(pageSummaries)
    .innerJoin(chapters, eq(pageSummaries.chapterId, chapters.id))
    .where(
      and(eq(pageSummaries.pageId, pageId), lte(chapters.idx, cutoffIdx)),
    )
    .as("summary_max_idx_sq");

  const sectionMaxIdxSq = db
    .select({
      sectionId: pageSectionVersions.sectionId,
      maxIdx: max(chapters.idx).as("max_idx"),
    })
    .from(pageSectionVersions)
    .innerJoin(chapters, eq(pageSectionVersions.chapterId, chapters.id))
    .where(
      and(eq(pageSectionVersions.pageId, pageId), lte(chapters.idx, cutoffIdx)),
    )
    .groupBy(pageSectionVersions.sectionId)
    .as("section_max_idx_sq");

  const [summaryVersions, activeSections, sectionVersions] = await Promise.all([
    db
      .select({ content: pageSummaries.content })
      .from(pageSummaries)
      .innerJoin(chapters, eq(pageSummaries.chapterId, chapters.id))
      .innerJoin(summaryMaxIdxSq, eq(chapters.idx, summaryMaxIdxSq.maxIdx))
      .where(eq(pageSummaries.pageId, pageId))
      .limit(1),
    db
      .select({ id: categorySections.id })
      .from(categorySections)
      .where(
        and(
          eq(categorySections.categoryId, category.id),
          isNull(categorySections.deletedAt),
        ),
      )
      .orderBy(asc(categorySections.displayOrder)),
    db
      .select({
        sectionId: pageSectionVersions.sectionId,
        content: pageSectionVersions.content,
      })
      .from(pageSectionVersions)
      .innerJoin(chapters, eq(pageSectionVersions.chapterId, chapters.id))
      .innerJoin(
        sectionMaxIdxSq,
        and(
          eq(pageSectionVersions.sectionId, sectionMaxIdxSq.sectionId),
          eq(chapters.idx, sectionMaxIdxSq.maxIdx),
        ),
      )
      .where(eq(pageSectionVersions.pageId, pageId)),
  ]);

  const summaryContent = summaryVersions[0]?.content ?? "";
  const contentBySectionId = new Map(
    sectionVersions.map((v) => [v.sectionId, v.content]),
  );
  const sections = activeSections.map((s) => ({
    id: s.id,
    content: contentBySectionId.get(s.id) ?? "",
  }));

  if (!category.hasFloater) {
    return { summaryContent, sections, floaterImageUrl: null, floaterRows: [] };
  }

  const floaterMaxIdxSq = db
    .select({ maxIdx: max(chapters.idx).as("max_idx") })
    .from(pageFloaterVersions)
    .innerJoin(chapters, eq(pageFloaterVersions.chapterId, chapters.id))
    .where(
      and(eq(pageFloaterVersions.pageId, pageId), lte(chapters.idx, cutoffIdx)),
    )
    .as("floater_max_idx_sq");

  const floaterRowMaxIdxSq = db
    .select({
      floaterRowId: pageFloaterRowVersions.floaterRowId,
      maxIdx: max(chapters.idx).as("max_idx"),
    })
    .from(pageFloaterRowVersions)
    .innerJoin(chapters, eq(pageFloaterRowVersions.chapterId, chapters.id))
    .where(
      and(
        eq(pageFloaterRowVersions.pageId, pageId),
        lte(chapters.idx, cutoffIdx),
      ),
    )
    .groupBy(pageFloaterRowVersions.floaterRowId)
    .as("floater_row_max_idx_sq");

  const [[floaterVersion], activeFloaterRows, floaterRowVersions] =
    await Promise.all([
      db
        .select({ imageUrl: pageFloaterVersions.imageUrl })
        .from(pageFloaterVersions)
        .innerJoin(chapters, eq(pageFloaterVersions.chapterId, chapters.id))
        .innerJoin(floaterMaxIdxSq, eq(chapters.idx, floaterMaxIdxSq.maxIdx))
        .where(eq(pageFloaterVersions.pageId, pageId))
        .limit(1),
      db
        .select({ id: categoryFloaterRows.id })
        .from(categoryFloaterRows)
        .where(
          and(
            eq(categoryFloaterRows.categoryId, category.id),
            isNull(categoryFloaterRows.deletedAt),
          ),
        )
        .orderBy(asc(categoryFloaterRows.displayOrder)),
      db
        .select({
          floaterRowId: pageFloaterRowVersions.floaterRowId,
          content: pageFloaterRowVersions.content,
        })
        .from(pageFloaterRowVersions)
        .innerJoin(chapters, eq(pageFloaterRowVersions.chapterId, chapters.id))
        .innerJoin(
          floaterRowMaxIdxSq,
          and(
            eq(
              pageFloaterRowVersions.floaterRowId,
              floaterRowMaxIdxSq.floaterRowId,
            ),
            eq(chapters.idx, floaterRowMaxIdxSq.maxIdx),
          ),
        )
        .where(eq(pageFloaterRowVersions.pageId, pageId)),
    ]);

  const rowContentMap = new Map(
    floaterRowVersions.map((v) => [v.floaterRowId, v.content]),
  );
  return {
    summaryContent,
    sections,
    floaterImageUrl: floaterVersion?.imageUrl ?? null,
    floaterRows: activeFloaterRows.map((r) => ({
      id: r.id,
      content: rowContentMap.get(r.id) ?? "",
    })),
  };
}
