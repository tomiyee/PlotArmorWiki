"use server";

import { cookies } from "next/headers";
import { db } from "@/db/index";
import {
  pages,
  chapters,
  chapterSynopses,
  volumes,
  pageInfoboxSections,
  pageInfoboxRevisions,
  pageInfoboxImageRevisions,
  pageSections,
  pageSectionRevisions,
} from "@/db/schema";
import { and, asc, eq, isNull, lte, max } from "drizzle-orm";
import {
  resolvePageTitlesAtIdx,
  getSerialBySlug,
  getChapterIdxById,
  sectionMaxIdxSq,
  infoboxRowMaxIdxSq,
} from "@/db/queries";

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
  /** slug → chapter-versioned title at the user's cutoff, for resolving [[slug]] wiki links. */
  pageTitles: Record<string, string>;
}

/**
 * Fetches a compact preview of a wiki page for use in hover cards.
 * Respects the user's chapter cutoff cookie - hidden pages return `hidden: true`
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
  const serial = await getSerialBySlug(serialSlug);
  if (!serial) return null;

  // Read chapter cutoff from cookie (same pattern as page.tsx)
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

  // Resolve page by slug within the serial
  const [page] = await db
    .select({
      id: pages.id,
      name: pages.name,
      introChapterId: pages.introChapterId,
    })
    .from(pages)
    .where(and(eq(pages.serialId, serial.id), eq(pages.slug, pageSlug)))
    .limit(1);
  if (!page) return null;

  // Resolve intro chapter name (introChapterId is null for the home page)
  const introChapterRow = page.introChapterId
    ? await db
        .select({ displayName: chapters.displayName, idx: chapters.idx })
        .from(chapters)
        .where(eq(chapters.id, page.introChapterId))
        .limit(1)
        .then((rows) => rows[0] ?? null)
    : null;

  const introChapterName = introChapterRow
    ? `${serial.chapterType} ${introChapterRow.displayName}`
    : null;

  // Fetch slug → title map for all visible pages at the cutoff (used by MarkdownRenderer
  // to resolve [[slug]] display text inside the preview content and floater rows).
  const allPageRows = await db
    .select({ id: pages.id, slug: pages.slug, name: pages.name })
    .from(pages)
    .where(eq(pages.serialId, serial.id));

  let resolvedPageTitles: Record<string, string> = {};
  if (allPageRows.length > 0) {
    const pageIds = allPageRows.map((p) => p.id);
    const titleByPageId = await resolvePageTitlesAtIdx(pageIds, cutoffIdx);
    resolvedPageTitles = Object.fromEntries(
      allPageRows.map((p) => [p.slug, titleByPageId.get(p.id) ?? p.name]),
    );
  }

  // Check spoiler visibility
  if (introChapterRow && introChapterRow.idx > cutoffIdx) {
    return {
      pageName: page.name,
      introChapterName,
      hidden: true,
      firstSectionContent: "",
      floaterImageUrl: null,
      floaterRows: [],
      pageTitles: resolvedPageTitles,
    };
  }

  // Fetch the first section content at the user's cutoff
  const secMaxIdxSq = sectionMaxIdxSq(page.id, cutoffIdx);

  const [firstSection] = await db
    .select({ content: pageSectionRevisions.content })
    .from(pageSectionRevisions)
    .innerJoin(chapters, eq(pageSectionRevisions.chapterId, chapters.id))
    .innerJoin(
      pageSections,
      eq(pageSectionRevisions.sectionId, pageSections.id),
    )
    .innerJoin(
      secMaxIdxSq,
      and(
        eq(pageSectionRevisions.sectionId, secMaxIdxSq.sectionId),
        eq(chapters.idx, secMaxIdxSq.maxIdx),
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

    const ibRowMaxIdxSq = infoboxRowMaxIdxSq(page.id, cutoffIdx);

    const [[floaterVersion], infoboxRowVersions] = await Promise.all([
      db
        .select({ imageUrl: pageInfoboxImageRevisions.imageUrl })
        .from(pageInfoboxImageRevisions)
        .innerJoin(
          chapters,
          eq(pageInfoboxImageRevisions.chapterId, chapters.id),
        )
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
          ibRowMaxIdxSq,
          and(
            eq(
              pageInfoboxRevisions.infoboxSectionId,
              ibRowMaxIdxSq.infoboxSectionId,
            ),
            eq(chapters.idx, ibRowMaxIdxSq.maxIdx),
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
    pageTitles: resolvedPageTitles,
  };
}

export interface ChapterLinkPreviewData {
  /** Full display name of the chapter (e.g. "Chapter 5"). */
  displayName: string;
  /** Volume this chapter belongs to (e.g. "Volume 1"). */
  volumeName: string;
  /** The chapter type label from the serial (e.g. "Chapter", "Episode"). */
  chapterType: string;
  /** First 200 characters of the chapter synopsis, or empty string. */
  synopsisSnippet: string;
  /** Whether the chapter is beyond the user's reading cutoff. */
  hidden: boolean;
}

/**
 * Fetches a compact preview for a chapter link (`/{serial}/chapter/{idx}`).
 * Respects the user's chapter cutoff - chapters beyond the cutoff return
 * `hidden: true` so the UI can show a spoiler-safe placeholder.
 *
 * Returns `null` when the serial or chapter cannot be resolved.
 *
 * @example
 * const preview = await getChapterLinkPreview("one-piece", 5);
 * if (preview?.hidden) { ... }
 */
export async function getChapterLinkPreview(
  serialSlug: string,
  chapterIdx: number,
): Promise<ChapterLinkPreviewData | null> {
  // Resolve serial
  const serial = await getSerialBySlug(serialSlug);
  if (!serial) return null;

  // Read chapter cutoff from cookie
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

  // Resolve chapter by serial + idx — need full row for displayName/idx/volumeId
  const [chapter] = await db
    .select({
      id: chapters.id,
      displayName: chapters.displayName,
      idx: chapters.idx,
      volumeId: chapters.volumeId,
    })
    .from(chapters)
    .innerJoin(volumes, eq(chapters.volumeId, volumes.id))
    .where(and(eq(volumes.serialId, serial.id), eq(chapters.idx, chapterIdx)))
    .limit(1);
  if (!chapter) return null;

  // Resolve volume name
  const [volume] = await db
    .select({ displayName: volumes.displayName })
    .from(volumes)
    .where(eq(volumes.id, chapter.volumeId))
    .limit(1);

  const hidden = chapter.idx > cutoffIdx;

  if (hidden) {
    return {
      displayName: chapter.displayName,
      volumeName: volume?.displayName ?? "",
      chapterType: serial.chapterType,
      synopsisSnippet: "",
      hidden: true,
    };
  }

  // Fetch synopsis snippet
  const [synopsisRow] = await db
    .select({ content: chapterSynopses.content })
    .from(chapterSynopses)
    .where(eq(chapterSynopses.chapterId, chapter.id))
    .limit(1);

  const synopsis = synopsisRow?.content ?? "";
  const synopsisSnippet =
    synopsis.length > 200 ? synopsis.slice(0, 200).trimEnd() + "…" : synopsis;

  return {
    displayName: chapter.displayName,
    volumeName: volume?.displayName ?? "",
    chapterType: serial.chapterType,
    synopsisSnippet,
    hidden: false,
  };
}

/**
 * Returns the `pages.name` for a page identified by serial + page slug.
 * Used by BackBreadcrumb to resolve the "← Back to …" title from document.referrer
 * without requiring the full wiki-link preview query.
 *
 * @example
 * const name = await getPageNameBySlug("one-piece", "erin-solstice");
 */
export async function getPageNameBySlug(
  serialSlug: string,
  pageSlug: string,
): Promise<string | null> {
  const serial = await getSerialBySlug(serialSlug);
  if (!serial) return null;

  const [page] = await db
    .select({ name: pages.name })
    .from(pages)
    .where(and(eq(pages.serialId, serial.id), eq(pages.slug, pageSlug)))
    .limit(1);

  return page?.name ?? null;
}
