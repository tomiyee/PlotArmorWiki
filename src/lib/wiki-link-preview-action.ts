"use server";

import { cookies } from "next/headers";
import { db } from "@/db/index";
import {
  serials,
  pageCategories,
  pages,
  chapters,
  categoryFloaterRows,
  categorySections,
  pageSummaries,
  pageSectionVersions,
  pageFloaterVersions,
  pageFloaterRowVersions,
} from "@/db/schema";
import { and, asc, eq, isNull, lte, max } from "drizzle-orm";

export interface WikiLinkPreviewData {
  pageName: string;
  categoryName: string;
  introChapterName: string | null;
  /** Whether the page is hidden due to the user's chapter cutoff. */
  hidden: boolean;
  /** First section content (truncated). Empty string if none. */
  firstSectionContent: string;
  /** Floater image URL, or null. */
  floaterImageUrl: string | null;
  /** Floater key-value rows. */
  floaterRows: { label: string; content: string }[];
}

/**
 * Fetches a compact preview of a wiki page for use in hover cards.
 * Respects the user's chapter cutoff cookie — hidden pages return `hidden: true`
 * so the UI can display a spoiler-safe placeholder instead.
 *
 * Returns `null` when the serial/category/page cannot be resolved (e.g. a
 * wiki link that points to a page that doesn't exist yet).
 *
 * @example
 * const preview = await getWikiLinkPreview("one-piece", "Characters", "Luffy");
 * if (preview?.hidden) { ... }
 */
export async function getWikiLinkPreview(
  serialSlug: string,
  categoryName: string,
  pageName: string,
): Promise<WikiLinkPreviewData | null> {
  // Resolve serial
  const [serial] = await db
    .select({ id: serials.id, chapterType: serials.chapterType })
    .from(serials)
    .where(eq(serials.slug, serialSlug))
    .limit(1);
  if (!serial) return null;

  // Read chapter cutoff from cookie (same pattern as page.tsx)
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

  // Resolve category
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
  if (!category) return null;

  // Resolve page
  const [page] = await db
    .select({ id: pages.id, introChapterId: pages.introChapterId })
    .from(pages)
    .where(and(eq(pages.categoryId, category.id), eq(pages.name, pageName)))
    .limit(1);
  if (!page) return null;

  // Resolve intro chapter name
  const [introChapterRow] = await db
    .select({ displayName: chapters.displayName, idx: chapters.idx })
    .from(chapters)
    .where(eq(chapters.id, page.introChapterId))
    .limit(1);

  const introChapterName = introChapterRow
    ? `${serial.chapterType} ${introChapterRow.displayName}`
    : null;

  // Check spoiler visibility
  if (introChapterRow && introChapterRow.idx > cutoffIdx) {
    return {
      pageName,
      categoryName,
      introChapterName,
      hidden: true,
      firstSectionContent: "",
      floaterImageUrl: null,
      floaterRows: [],
    };
  }

  // Fetch summary content at the user's cutoff — summary is always the first
  // thing shown in the hover card preview.
  const summaryMaxIdxSq = db
    .select({ maxIdx: max(chapters.idx).as("max_idx") })
    .from(pageSummaries)
    .innerJoin(chapters, eq(pageSummaries.chapterId, chapters.id))
    .where(
      and(
        eq(pageSummaries.pageId, page.id),
        lte(chapters.idx, cutoffIdx),
      ),
    )
    .as("summary_max_idx_sq");

  const [summaryVersion] = await db
    .select({ content: pageSummaries.content })
    .from(pageSummaries)
    .innerJoin(chapters, eq(pageSummaries.chapterId, chapters.id))
    .innerJoin(summaryMaxIdxSq, eq(chapters.idx, summaryMaxIdxSq.maxIdx))
    .where(eq(pageSummaries.pageId, page.id))
    .limit(1);

  let firstSectionContent = summaryVersion?.content ?? "";

  // Fall back to the first section if there is no summary yet
  if (!firstSectionContent) {
    const sectionMaxIdxSq = db
      .select({
        sectionId: pageSectionVersions.sectionId,
        maxIdx: max(chapters.idx).as("max_idx"),
      })
      .from(pageSectionVersions)
      .innerJoin(chapters, eq(pageSectionVersions.chapterId, chapters.id))
      .where(
        and(
          eq(pageSectionVersions.pageId, page.id),
          lte(chapters.idx, cutoffIdx),
        ),
      )
      .groupBy(pageSectionVersions.sectionId)
      .as("section_max_idx_sq");

    const [firstSection] = await db
      .select({ content: pageSectionVersions.content })
      .from(pageSectionVersions)
      .innerJoin(chapters, eq(pageSectionVersions.chapterId, chapters.id))
      .innerJoin(
        categorySections,
        eq(pageSectionVersions.sectionId, categorySections.id),
      )
      .innerJoin(
        sectionMaxIdxSq,
        and(
          eq(pageSectionVersions.sectionId, sectionMaxIdxSq.sectionId),
          eq(chapters.idx, sectionMaxIdxSq.maxIdx),
        ),
      )
      .where(
        and(
          eq(pageSectionVersions.pageId, page.id),
          isNull(categorySections.deletedAt),
        ),
      )
      .orderBy(asc(categorySections.displayOrder))
      .limit(1);

    firstSectionContent = firstSection?.content ?? "";
  }

  // Fetch floater data if the category has one
  let floaterImageUrl: string | null = null;
  let floaterRows: { label: string; content: string }[] = [];

  if (category.hasFloater) {
    const floaterMaxIdxSq = db
      .select({ maxIdx: max(chapters.idx).as("max_idx") })
      .from(pageFloaterVersions)
      .innerJoin(chapters, eq(pageFloaterVersions.chapterId, chapters.id))
      .where(
        and(
          eq(pageFloaterVersions.pageId, page.id),
          lte(chapters.idx, cutoffIdx),
        ),
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
          eq(pageFloaterRowVersions.pageId, page.id),
          lte(chapters.idx, cutoffIdx),
        ),
      )
      .groupBy(pageFloaterRowVersions.floaterRowId)
      .as("floater_row_max_idx_sq");

    const [
      [floaterVersion],
      activeFloaterRows,
      floaterRowVersions,
    ] = await Promise.all([
      db
        .select({ imageUrl: pageFloaterVersions.imageUrl })
        .from(pageFloaterVersions)
        .innerJoin(chapters, eq(pageFloaterVersions.chapterId, chapters.id))
        .innerJoin(floaterMaxIdxSq, eq(chapters.idx, floaterMaxIdxSq.maxIdx))
        .where(eq(pageFloaterVersions.pageId, page.id))
        .limit(1),
      db
        .select({
          id: categoryFloaterRows.id,
          label: categoryFloaterRows.label,
        })
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
        .innerJoin(
          chapters,
          eq(pageFloaterRowVersions.chapterId, chapters.id),
        )
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
        .where(eq(pageFloaterRowVersions.pageId, page.id)),
    ]);

    floaterImageUrl = floaterVersion?.imageUrl ?? null;
    const rowContentMap = new Map(
      floaterRowVersions.map((v) => [v.floaterRowId, v.content]),
    );
    floaterRows = activeFloaterRows.map((r) => ({
      label: r.label,
      content: rowContentMap.get(r.id) ?? "",
    }));
  }

  return {
    pageName,
    categoryName,
    introChapterName,
    hidden: false,
    firstSectionContent,
    floaterImageUrl,
    floaterRows,
  };
}
