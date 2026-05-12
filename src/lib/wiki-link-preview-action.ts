"use server";

import { cookies } from "next/headers";
import { db } from "@/db/index";
import {
  serials,
  pages,
  chapters,
  pageInfoboxSections,
  pageInfoboxRevisions,
  pageInfoboxImageRevisions,
  pageSections,
  pageSectionRevisions,
} from "@/db/schema";
import { and, asc, eq, isNull, lte, max } from "drizzle-orm";

export interface WikiLinkPreviewData {
  pageName: string;
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
 * Returns `null` when the serial/page cannot be resolved (e.g. a wiki link
 * that points to a page that doesn't exist yet).
 *
 * @example
 * const preview = await getWikiLinkPreview("one-piece", "luffy");
 * if (preview?.hidden) { ... }
 */
export async function getWikiLinkPreview(
  serialSlug: string,
  pageSlug: string,
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

  // Resolve page by slug within the serial
  const [page] = await db
    .select({ id: pages.id, name: pages.name, introChapterId: pages.introChapterId })
    .from(pages)
    .where(and(eq(pages.serialId, serial.id), eq(pages.slug, pageSlug)))
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
      pageName: page.name,
      introChapterName,
      hidden: true,
      firstSectionContent: "",
      floaterImageUrl: null,
      floaterRows: [],
    };
  }

  // Fetch the first section content at the user's cutoff
  const sectionMaxIdxSq = db
    .select({
      sectionId: pageSectionRevisions.sectionId,
      maxIdx: max(chapters.idx).as("max_idx"),
    })
    .from(pageSectionRevisions)
    .innerJoin(chapters, eq(pageSectionRevisions.chapterId, chapters.id))
    .where(
      and(
        eq(pageSectionRevisions.pageId, page.id),
        lte(chapters.idx, cutoffIdx),
      ),
    )
    .groupBy(pageSectionRevisions.sectionId)
    .as("section_max_idx_sq");

  const [firstSection] = await db
    .select({ content: pageSectionRevisions.content })
    .from(pageSectionRevisions)
    .innerJoin(chapters, eq(pageSectionRevisions.chapterId, chapters.id))
    .innerJoin(
      pageSections,
      eq(pageSectionRevisions.sectionId, pageSections.id),
    )
    .innerJoin(
      sectionMaxIdxSq,
      and(
        eq(pageSectionRevisions.sectionId, sectionMaxIdxSq.sectionId),
        eq(chapters.idx, sectionMaxIdxSq.maxIdx),
      ),
    )
    .where(
      and(
        eq(pageSectionRevisions.pageId, page.id),
        isNull(pageSections.deletedAt),
      ),
    )
    .orderBy(asc(pageSections.displayOrder))
    .limit(1);

  const firstSectionContent = firstSection?.content ?? "";

  // Fetch infobox data
  const activeInfoboxRows = await db
    .select({ id: pageInfoboxSections.id, label: pageInfoboxSections.label })
    .from(pageInfoboxSections)
    .where(
      and(
        eq(pageInfoboxSections.pageId, page.id),
        isNull(pageInfoboxSections.deletedAt),
      ),
    )
    .orderBy(asc(pageInfoboxSections.displayOrder));

  let floaterImageUrl: string | null = null;
  let floaterRows: { label: string; content: string }[] = [];

  if (activeInfoboxRows.length > 0) {
    const floaterMaxIdxSq = db
      .select({ maxIdx: max(chapters.idx).as("max_idx") })
      .from(pageInfoboxImageRevisions)
      .innerJoin(chapters, eq(pageInfoboxImageRevisions.chapterId, chapters.id))
      .where(
        and(
          eq(pageInfoboxImageRevisions.pageId, page.id),
          lte(chapters.idx, cutoffIdx),
        ),
      )
      .as("floater_max_idx_sq");

    const infoboxRowMaxIdxSq = db
      .select({
        infoboxSectionId: pageInfoboxRevisions.infoboxSectionId,
        maxIdx: max(chapters.idx).as("max_idx"),
      })
      .from(pageInfoboxRevisions)
      .innerJoin(chapters, eq(pageInfoboxRevisions.chapterId, chapters.id))
      .where(
        and(
          eq(pageInfoboxRevisions.pageId, page.id),
          lte(chapters.idx, cutoffIdx),
        ),
      )
      .groupBy(pageInfoboxRevisions.infoboxSectionId)
      .as("infobox_row_max_idx_sq");

    const [[floaterVersion], infoboxRowVersions] = await Promise.all([
      db
        .select({ imageUrl: pageInfoboxImageRevisions.imageUrl })
        .from(pageInfoboxImageRevisions)
        .innerJoin(chapters, eq(pageInfoboxImageRevisions.chapterId, chapters.id))
        .innerJoin(floaterMaxIdxSq, eq(chapters.idx, floaterMaxIdxSq.maxIdx))
        .where(eq(pageInfoboxImageRevisions.pageId, page.id))
        .limit(1),
      db
        .select({
          infoboxSectionId: pageInfoboxRevisions.infoboxSectionId,
          content: pageInfoboxRevisions.content,
        })
        .from(pageInfoboxRevisions)
        .innerJoin(chapters, eq(pageInfoboxRevisions.chapterId, chapters.id))
        .innerJoin(
          infoboxRowMaxIdxSq,
          and(
            eq(
              pageInfoboxRevisions.infoboxSectionId,
              infoboxRowMaxIdxSq.infoboxSectionId,
            ),
            eq(chapters.idx, infoboxRowMaxIdxSq.maxIdx),
          ),
        )
        .where(eq(pageInfoboxRevisions.pageId, page.id)),
    ]);

    floaterImageUrl = floaterVersion?.imageUrl ?? null;
    const rowContentMap = new Map(
      infoboxRowVersions.map((v) => [v.infoboxSectionId, v.content]),
    );
    floaterRows = activeInfoboxRows.map((r) => ({
      label: r.label,
      content: rowContentMap.get(r.id) ?? "",
    }));
  }

  return {
    pageName: page.name,
    introChapterName,
    hidden: false,
    firstSectionContent,
    floaterImageUrl,
    floaterRows,
  };
}
