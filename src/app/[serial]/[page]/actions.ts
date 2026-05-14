"use server";

import { db } from "@/db/index";
import {
  serials,
  pages,
  chapters,
  volumes,
  pageSections,
  pageSectionRevisions,
  pageInfoboxSections,
  pageInfoboxRevisions,
  pageInfoboxImageRevisions,
  pageTitles,
} from "@/db/schema";
import { and, asc, count, desc, eq, isNull, lte, max } from "drizzle-orm";

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
 * Resolves the database IDs for a given serial and page slug.
 *
 * @param serialSlug - The URL-friendly slug identifier for the serial
 * @param pageSlug - The slug of the page to find
 * @returns An object containing the serial ID and page record
 * @throws Error if the serial or page is not found in the database
 */
async function resolvePageIds(serialSlug: string, pageSlug: string) {
  const [serial] = await db
    .select({ id: serials.id })
    .from(serials)
    .where(eq(serials.slug, serialSlug))
    .limit(1);
  if (!serial) throw new Error("Serial not found");

  const [page] = await db
    .select({ id: pages.id })
    .from(pages)
    .where(and(eq(pages.serialId, serial.id), eq(pages.slug, pageSlug)))
    .limit(1);
  if (!page) throw new Error("Page not found");

  return { serialId: serial.id, pageId: page.id };
}

/**
 * Saves all page content at the specified chapter, or the head chapter when
 * no target is given. Passing `targetChapterId` lets editors backfill or
 * overwrite content at any chapter without touching newer revisions.
 *
 * Each section/infobox field is an upsert keyed by (pageId, …, chapterId).
 * Readers at an earlier chapter cutoff see the previous version via the
 * max-idx subquery read path.
 *
 * @example
 * // Write at head (default behaviour — UI passes undefined)
 * await savePageContent(serialSlug, pageName, summaryContent, sectionContent, floaterImageUrl, floaterRowContent);
 *
 * @example
 * // Write at a specific chapter (used by the chapter selector in edit mode)
 * await savePageContent(serialSlug, pageName, summaryContent, sectionContent, floaterImageUrl, floaterRowContent, chapterId);
 */
export async function savePageContent(
  serialSlug: string,
  pageSlug: string,
  _summaryContent: string,
  sectionContent: Record<number, string>,
  floaterImageUrl: string | null,
  floaterRowContent: Record<number, string>,
  targetChapterId?: number,
): Promise<void> {
  const { serialId, pageId } = await resolvePageIds(serialSlug, pageSlug);
  const headChapterId = targetChapterId ?? (await getHeadChapterId(serialId));

  await db.transaction(async (tx) => {
    for (const [sectionIdStr, content] of Object.entries(sectionContent)) {
      const sectionId = parseInt(sectionIdStr, 10);
      await tx
        .insert(pageSectionRevisions)
        .values({ pageId, sectionId, chapterId: headChapterId, content })
        .onConflictDoUpdate({
          target: [
            pageSectionRevisions.pageId,
            pageSectionRevisions.sectionId,
            pageSectionRevisions.chapterId,
          ],
          set: { content },
        });
    }

    if (floaterImageUrl !== null || Object.keys(floaterRowContent).length > 0) {
      await tx
        .insert(pageInfoboxImageRevisions)
        .values({ pageId, chapterId: headChapterId, imageUrl: floaterImageUrl })
        .onConflictDoUpdate({
          target: [pageInfoboxImageRevisions.pageId, pageInfoboxImageRevisions.chapterId],
          set: { imageUrl: floaterImageUrl },
        });

      for (const [infoboxSectionIdStr, content] of Object.entries(floaterRowContent)) {
        const infoboxSectionId = parseInt(infoboxSectionIdStr, 10);
        await tx
          .insert(pageInfoboxRevisions)
          .values({ pageId, infoboxSectionId, chapterId: headChapterId, content })
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
  });
}

/**
 * Fetches page content as it exists at a specific chapter cutoff, using the
 * same max-idx subquery join as the reader path in page.tsx. Intended for
 * pre-filling the edit form when an editor selects a target chapter so they
 * can see (and then overwrite) what readers at that chapter currently see.
 *
 * Returns empty arrays / null when no content exists at or before the given
 * chapter — the caller should treat these as blank-slate values.
 *
 * @example
 * const data = await getPageContentAtChapter('my-serial', 'anya', 42);
 * // data.sections: [{ id: 1, content: '...' }, ...]
 * // data.floaterImageUrl: 'https://...' | null
 * // data.floaterRows: [{ id: 3, content: '...' }, ...]
 */
export async function getPageContentAtChapter(
  serialSlug: string,
  pageSlug: string,
  chapterId: number,
): Promise<{
  summaryContent: string;
  summaryLastUpdatedChapterIdx: number | null;
  sections: { id: number; content: string; lastUpdatedChapterIdx: number | null }[];
  floaterImageUrl: string | null;
  floaterRows: { id: number; content: string }[];
}> {
  const [{ pageId }, [targetChapter]] = await Promise.all([
    resolvePageIds(serialSlug, pageSlug),
    db
      .select({ idx: chapters.idx })
      .from(chapters)
      .where(eq(chapters.id, chapterId))
      .limit(1),
  ]);
  if (!targetChapter) throw new Error("Chapter not found");

  const cutoffIdx = targetChapter.idx;

  const sectionMaxIdxSq = db
    .select({
      sectionId: pageSectionRevisions.sectionId,
      maxIdx: max(chapters.idx).as("max_idx"),
    })
    .from(pageSectionRevisions)
    .innerJoin(chapters, eq(pageSectionRevisions.chapterId, chapters.id))
    .where(
      and(eq(pageSectionRevisions.pageId, pageId), lte(chapters.idx, cutoffIdx)),
    )
    .groupBy(pageSectionRevisions.sectionId)
    .as("section_max_idx_sq");

  const [activeSections, sectionVersions] = await Promise.all([
    db
      .select({ id: pageSections.id })
      .from(pageSections)
      .where(
        and(
          eq(pageSections.pageId, pageId),
          isNull(pageSections.deletedAt),
        ),
      )
      .orderBy(asc(pageSections.displayOrder)),
    db
      .select({
        sectionId: pageSectionRevisions.sectionId,
        content: pageSectionRevisions.content,
        chapterIdx: chapters.idx,
      })
      .from(pageSectionRevisions)
      .innerJoin(chapters, eq(pageSectionRevisions.chapterId, chapters.id))
      .innerJoin(
        sectionMaxIdxSq,
        and(
          eq(pageSectionRevisions.sectionId, sectionMaxIdxSq.sectionId),
          eq(chapters.idx, sectionMaxIdxSq.maxIdx),
        ),
      )
      .where(eq(pageSectionRevisions.pageId, pageId)),
  ]);

  const versionBySectionId = new Map(
    sectionVersions.map((v) => [v.sectionId, { content: v.content, chapterIdx: v.chapterIdx }]),
  );
  const sections = activeSections.map((s) => {
    const v = versionBySectionId.get(s.id);
    return {
      id: s.id,
      content: v?.content ?? "",
      lastUpdatedChapterIdx: v?.chapterIdx ?? null,
    };
  });

  const floaterMaxIdxSq = db
    .select({ maxIdx: max(chapters.idx).as("max_idx") })
    .from(pageInfoboxImageRevisions)
    .innerJoin(chapters, eq(pageInfoboxImageRevisions.chapterId, chapters.id))
    .where(
      and(eq(pageInfoboxImageRevisions.pageId, pageId), lte(chapters.idx, cutoffIdx)),
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
        eq(pageInfoboxRevisions.pageId, pageId),
        lte(chapters.idx, cutoffIdx),
      ),
    )
    .groupBy(pageInfoboxRevisions.infoboxSectionId)
    .as("infobox_row_max_idx_sq");

  const [[floaterVersion], activeInfoboxRows, infoboxRowVersions] =
    await Promise.all([
      db
        .select({ imageUrl: pageInfoboxImageRevisions.imageUrl })
        .from(pageInfoboxImageRevisions)
        .innerJoin(chapters, eq(pageInfoboxImageRevisions.chapterId, chapters.id))
        .innerJoin(floaterMaxIdxSq, eq(chapters.idx, floaterMaxIdxSq.maxIdx))
        .where(eq(pageInfoboxImageRevisions.pageId, pageId))
        .limit(1),
      db
        .select({ id: pageInfoboxSections.id })
        .from(pageInfoboxSections)
        .where(
          and(
            eq(pageInfoboxSections.pageId, pageId),
            isNull(pageInfoboxSections.deletedAt),
          ),
        )
        .orderBy(asc(pageInfoboxSections.displayOrder)),
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
        .where(eq(pageInfoboxRevisions.pageId, pageId)),
    ]);

  const rowContentMap = new Map(
    infoboxRowVersions.map((v) => [v.infoboxSectionId, v.content]),
  );

  return {
    summaryContent: "",
    summaryLastUpdatedChapterIdx: null,
    sections,
    floaterImageUrl: floaterVersion?.imageUrl ?? null,
    floaterRows: activeInfoboxRows.map((r) => ({
      id: r.id,
      content: rowContentMap.get(r.id) ?? "",
    })),
  };
}

/**
 * Inserts or replaces a page title revision at the given chapter. If a title
 * already exists for this (page, chapter) pair it is overwritten in-place.
 *
 * @example
 * await addPageTitle('my-serial', 'luffy', 42, 'Monkey D. Luffy');
 */
export async function addPageTitle(
  serialSlug: string,
  pageSlug: string,
  chapterId: number,
  title: string,
): Promise<void> {
  const { pageId } = await resolvePageIds(serialSlug, pageSlug);
  await db
    .insert(pageTitles)
    .values({ pageId, chapterId, title: title.trim() })
    .onConflictDoUpdate({
      target: [pageTitles.pageId, pageTitles.chapterId],
      set: { title: title.trim() },
    });
}

/**
 * Deletes the page title revision for a specific (page, chapter) pair.
 * Guards against deleting the last remaining title — a page must always
 * have at least one title revision.
 *
 * @example
 * await deletePageTitle('my-serial', 'luffy', 42);
 */
export async function deletePageTitle(
  serialSlug: string,
  pageSlug: string,
  chapterId: number,
): Promise<{ error?: string }> {
  const { pageId } = await resolvePageIds(serialSlug, pageSlug);

  // Count existing titles for this page to prevent deleting the last one.
  const existing = await db
    .select({ chapterId: pageTitles.chapterId })
    .from(pageTitles)
    .where(eq(pageTitles.pageId, pageId));

  if (existing.length <= 1) {
    return { error: "Cannot delete the last title revision." };
  }

  await db
    .delete(pageTitles)
    .where(
      and(eq(pageTitles.pageId, pageId), eq(pageTitles.chapterId, chapterId)),
    );

  return {};
}

// ── Page section structure management ────────────────────────────────────────
// These actions manage the wall-clock-versioned `page_sections` rows (add,
// delete, rename, reorder). Content is managed separately via savePageContent.

/**
 * Adds a new section to a page. The section is appended after all existing
 * active sections.
 *
 * @example
 * const fd = new FormData();
 * fd.set('pageId', '42');
 * fd.set('name', 'Biography');
 * await addPageSection(fd);
 */
export async function addPageSection(formData: FormData): Promise<void> {
  const pageId = parseInt(formData.get("pageId") as string, 10);
  const name = (formData.get("name") as string)?.trim();
  if (!pageId || !name) throw new Error("pageId and name are required");

  // Find the next displayOrder by counting active sections.
  const [{ cnt }] = await db
    .select({ cnt: count() })
    .from(pageSections)
    .where(and(eq(pageSections.pageId, pageId), isNull(pageSections.deletedAt)));

  await db.insert(pageSections).values({
    pageId,
    name,
    displayOrder: cnt,
  });
}

/**
 * Soft-deletes a page section. Rejects if the section has any content
 * revisions to prevent accidental data loss.
 *
 * @example
 * const fd = new FormData();
 * fd.set('sectionId', '7');
 * await deletePageSection(fd);
 */
export async function deletePageSection(
  formData: FormData,
): Promise<{ error?: string }> {
  const sectionId = parseInt(formData.get("sectionId") as string, 10);
  if (!sectionId) return { error: "sectionId is required" };

  // Guard: reject if any content revisions exist for this section.
  const [{ cnt }] = await db
    .select({ cnt: count() })
    .from(pageSectionRevisions)
    .where(eq(pageSectionRevisions.sectionId, sectionId));

  if (cnt > 0) {
    return {
      error:
        "This section has content revisions and cannot be deleted. Clear all content first.",
    };
  }

  await db
    .update(pageSections)
    .set({ deletedAt: new Date() })
    .where(eq(pageSections.id, sectionId));

  return {};
}

/**
 * Renames a page section.
 *
 * @example
 * const fd = new FormData();
 * fd.set('sectionId', '7');
 * fd.set('name', 'Early Life');
 * await renamePageSection(fd);
 */
export async function renamePageSection(formData: FormData): Promise<void> {
  const sectionId = parseInt(formData.get("sectionId") as string, 10);
  const name = (formData.get("name") as string)?.trim();
  if (!sectionId || !name) throw new Error("sectionId and name are required");

  await db
    .update(pageSections)
    .set({ name })
    .where(eq(pageSections.id, sectionId));
}

/**
 * Reorders sections by assigning new `displayOrder` values matching the
 * provided ordered array of section IDs.
 *
 * @example
 * const fd = new FormData();
 * fd.set('orderedIds', JSON.stringify([3, 1, 2]));
 * await reorderPageSections(fd);
 */
export async function reorderPageSections(formData: FormData): Promise<void> {
  const raw = formData.get("orderedIds") as string;
  const orderedIds: number[] = JSON.parse(raw);

  await db.transaction(async (tx) => {
    for (let i = 0; i < orderedIds.length; i++) {
      await tx
        .update(pageSections)
        .set({ displayOrder: i })
        .where(eq(pageSections.id, orderedIds[i]));
    }
  });
}
