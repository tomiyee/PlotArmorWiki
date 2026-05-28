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
  pageRelationships,
  pageTitles,
} from "@/db/schema";
import {
  and,
  asc,
  count,
  desc,
  eq,
  gt,
  inArray,
  isNull,
  lt,
  lte,
  max,
  min,
  ne,
} from "drizzle-orm";
import {
  requireSerialAdminBySlug,
  requireSerialAdminByPageId,
} from "@/lib/auth-guard";

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

  if (!row) throw new Error("Serial has no chapters - cannot save content.");
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
 * // Write at head (default behaviour - UI passes undefined)
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
  await requireSerialAdminBySlug(serialSlug);
  const { serialId, pageId } = await resolvePageIds(serialSlug, pageSlug);
  const headChapterId = targetChapterId ?? (await getHeadChapterId(serialId));

  await db.transaction(async (tx) => {
    // Resolve the idx of the target chapter so we can find the previous revision
    // (highest idx strictly less than headIdx) for each section and infobox row.
    const [targetChapterRow] = await tx
      .select({ idx: chapters.idx })
      .from(chapters)
      .where(eq(chapters.id, headChapterId))
      .limit(1);
    const headIdx = targetChapterRow?.idx ?? 0;

    // ── Section revisions ─────────────────────────────────────────────────────
    const sectionIds = Object.keys(sectionContent).map(Number);
    let prevContentBySectionId = new Map<number, string>();
    if (sectionIds.length > 0 && headIdx > 0) {
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
            lt(chapters.idx, headIdx),
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

    for (const [sectionIdStr, content] of Object.entries(sectionContent)) {
      const sectionId = parseInt(sectionIdStr, 10);
      const prevContent = prevContentBySectionId.get(sectionId) ?? "";
      if (!content.trim() || content === prevContent) {
        // Never write empty revisions; also delete if matching previous revision
        // to uphold the invariant: consecutive revisions must differ.
        await tx
          .delete(pageSectionRevisions)
          .where(
            and(
              eq(pageSectionRevisions.pageId, pageId),
              eq(pageSectionRevisions.sectionId, sectionId),
              eq(pageSectionRevisions.chapterId, headChapterId),
            ),
          );
        continue;
      }
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
          target: [
            pageInfoboxImageRevisions.pageId,
            pageInfoboxImageRevisions.chapterId,
          ],
          set: { imageUrl: floaterImageUrl },
        });

      // ── Infobox row revisions ───────────────────────────────────────────────
      const infoboxIds = Object.keys(floaterRowContent).map(Number);
      let prevContentByInfoboxId = new Map<number, string>();
      if (infoboxIds.length > 0 && headIdx > 0) {
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
              lt(chapters.idx, headIdx),
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

      for (const [infoboxSectionIdStr, content] of Object.entries(
        floaterRowContent,
      )) {
        const infoboxSectionId = parseInt(infoboxSectionIdStr, 10);
        const prevContent = prevContentByInfoboxId.get(infoboxSectionId) ?? "";
        if (!content.trim() || content === prevContent) {
          await tx
            .delete(pageInfoboxRevisions)
            .where(
              and(
                eq(pageInfoboxRevisions.pageId, pageId),
                eq(pageInfoboxRevisions.infoboxSectionId, infoboxSectionId),
                eq(pageInfoboxRevisions.chapterId, headChapterId),
              ),
            );
          continue;
        }
        await tx
          .insert(pageInfoboxRevisions)
          .values({
            pageId,
            infoboxSectionId,
            chapterId: headChapterId,
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
  });
}

/**
 * Fetches page content as it exists at a specific chapter cutoff, using the
 * same max-idx subquery join as the reader path in page.tsx. Intended for
 * pre-filling the edit form when an editor selects a target chapter so they
 * can see (and then overwrite) what readers at that chapter currently see.
 *
 * Returns empty arrays / null when no content exists at or before the given
 * chapter - the caller should treat these as blank-slate values.
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
  sections: {
    id: number;
    content: string;
    lastUpdatedChapterIdx: number | null;
    /** Content from the revision immediately before this chapter's revision. Empty when no prior revision exists. */
    previousContent: string;
    /** Chapter idx of the revision immediately before this chapter's revision, or null when no prior revision exists. */
    previousRevisionChapterIdx: number | null;
    /**
     * Chapter idx of the next revision strictly after this chapter, or null when
     * this is the most recent revision. Used by the remove-revision dialog to
     * compute the exact range of affected chapters.
     */
    nextRevisionChapterIdx: number | null;
  }[];
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
      and(
        eq(pageSectionRevisions.pageId, pageId),
        lte(chapters.idx, cutoffIdx),
      ),
    )
    .groupBy(pageSectionRevisions.sectionId)
    .as("section_max_idx_sq");

  // Previous revision: highest idx STRICTLY less than cutoffIdx.
  const sectionPrevMaxIdxSq = db
    .select({
      sectionId: pageSectionRevisions.sectionId,
      maxPrevIdx: max(chapters.idx).as("max_prev_idx"),
    })
    .from(pageSectionRevisions)
    .innerJoin(chapters, eq(pageSectionRevisions.chapterId, chapters.id))
    .where(
      and(eq(pageSectionRevisions.pageId, pageId), lt(chapters.idx, cutoffIdx)),
    )
    .groupBy(pageSectionRevisions.sectionId)
    .as("section_prev_max_idx_sq");

  // Next revision: lowest idx STRICTLY greater than cutoffIdx.
  const sectionNextMinIdxSq = db
    .select({
      sectionId: pageSectionRevisions.sectionId,
      minNextIdx: min(chapters.idx).as("min_next_idx"),
    })
    .from(pageSectionRevisions)
    .innerJoin(chapters, eq(pageSectionRevisions.chapterId, chapters.id))
    .where(
      and(eq(pageSectionRevisions.pageId, pageId), gt(chapters.idx, cutoffIdx)),
    )
    .groupBy(pageSectionRevisions.sectionId)
    .as("section_next_min_idx_sq");

  const [
    activeSections,
    sectionVersions,
    sectionPrevVersions,
    sectionNextRevisions,
  ] = await Promise.all([
    db
      .select({ id: pageSections.id })
      .from(pageSections)
      .where(
        and(eq(pageSections.pageId, pageId), isNull(pageSections.deletedAt)),
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
    db
      .select({
        sectionId: pageSectionRevisions.sectionId,
        content: pageSectionRevisions.content,
        chapterIdx: chapters.idx,
      })
      .from(pageSectionRevisions)
      .innerJoin(chapters, eq(pageSectionRevisions.chapterId, chapters.id))
      .innerJoin(
        sectionPrevMaxIdxSq,
        and(
          eq(pageSectionRevisions.sectionId, sectionPrevMaxIdxSq.sectionId),
          eq(chapters.idx, sectionPrevMaxIdxSq.maxPrevIdx),
        ),
      )
      .where(eq(pageSectionRevisions.pageId, pageId)),
    db
      .select({
        sectionId: pageSectionRevisions.sectionId,
        chapterIdx: chapters.idx,
      })
      .from(pageSectionRevisions)
      .innerJoin(chapters, eq(pageSectionRevisions.chapterId, chapters.id))
      .innerJoin(
        sectionNextMinIdxSq,
        and(
          eq(pageSectionRevisions.sectionId, sectionNextMinIdxSq.sectionId),
          eq(chapters.idx, sectionNextMinIdxSq.minNextIdx),
        ),
      )
      .where(eq(pageSectionRevisions.pageId, pageId)),
  ]);

  const versionBySectionId = new Map(
    sectionVersions.map((v) => [
      v.sectionId,
      { content: v.content, chapterIdx: v.chapterIdx },
    ]),
  );
  const prevContentBySectionId = new Map(
    sectionPrevVersions.map((v) => [v.sectionId, v.content ?? ""]),
  );
  const prevRevisionIdxBySectionId = new Map(
    sectionPrevVersions.map((v) => [v.sectionId, v.chapterIdx]),
  );
  const nextRevisionIdxBySectionId = new Map(
    sectionNextRevisions.map((v) => [v.sectionId, v.chapterIdx]),
  );
  const sections = activeSections.map((s) => {
    const v = versionBySectionId.get(s.id);
    return {
      id: s.id,
      content: v?.content ?? "",
      lastUpdatedChapterIdx: v?.chapterIdx ?? null,
      previousContent: prevContentBySectionId.get(s.id) ?? "",
      previousRevisionChapterIdx: prevRevisionIdxBySectionId.get(s.id) ?? null,
      nextRevisionChapterIdx: nextRevisionIdxBySectionId.get(s.id) ?? null,
    };
  });

  const floaterMaxIdxSq = db
    .select({ maxIdx: max(chapters.idx).as("max_idx") })
    .from(pageInfoboxImageRevisions)
    .innerJoin(chapters, eq(pageInfoboxImageRevisions.chapterId, chapters.id))
    .where(
      and(
        eq(pageInfoboxImageRevisions.pageId, pageId),
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
        .innerJoin(
          chapters,
          eq(pageInfoboxImageRevisions.chapterId, chapters.id),
        )
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
  await requireSerialAdminBySlug(serialSlug);
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
 * Guards against deleting the last remaining title - a page must always
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
  await requireSerialAdminBySlug(serialSlug);
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
  await requireSerialAdminByPageId(pageId);

  // Find the next displayOrder by counting active sections.
  const [{ cnt }] = await db
    .select({ cnt: count() })
    .from(pageSections)
    .where(
      and(eq(pageSections.pageId, pageId), isNull(pageSections.deletedAt)),
    );

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

  const [sectionRow] = await db
    .select({ pageId: pageSections.pageId })
    .from(pageSections)
    .where(eq(pageSections.id, sectionId))
    .limit(1);
  if (sectionRow) await requireSerialAdminByPageId(sectionRow.pageId);

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

  const [sectionRow] = await db
    .select({ pageId: pageSections.pageId })
    .from(pageSections)
    .where(eq(pageSections.id, sectionId))
    .limit(1);
  if (sectionRow) await requireSerialAdminByPageId(sectionRow.pageId);

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

  if (orderedIds.length > 0) {
    const [sectionRow] = await db
      .select({ pageId: pageSections.pageId })
      .from(pageSections)
      .where(eq(pageSections.id, orderedIds[0]))
      .limit(1);
    if (sectionRow) await requireSerialAdminByPageId(sectionRow.pageId);
  }

  await db.transaction(async (tx) => {
    for (let i = 0; i < orderedIds.length; i++) {
      await tx
        .update(pageSections)
        .set({ displayOrder: i })
        .where(eq(pageSections.id, orderedIds[i]));
    }
  });
}

// ── Infobox section structure management ──────────────────────────────────────
// These actions manage the wall-clock-versioned `page_infobox_sections` rows
// (add, delete, rename, reorder). Infobox content is managed via savePageContent.

/**
 * Adds a new infobox row to a page. The row is appended after all existing
 * active infobox rows.
 *
 * @example
 * const fd = new FormData();
 * fd.set('pageId', '42');
 * fd.set('label', 'Age');
 * await addInfoboxSection(fd);
 */
export async function addInfoboxSection(formData: FormData): Promise<void> {
  const pageId = parseInt(formData.get("pageId") as string, 10);
  const label = (formData.get("label") as string)?.trim();
  if (!pageId || !label) throw new Error("pageId and label are required");
  await requireSerialAdminByPageId(pageId);

  const [{ cnt }] = await db
    .select({ cnt: count() })
    .from(pageInfoboxSections)
    .where(
      and(
        eq(pageInfoboxSections.pageId, pageId),
        isNull(pageInfoboxSections.deletedAt),
      ),
    );

  await db.insert(pageInfoboxSections).values({
    pageId,
    label,
    displayOrder: cnt,
  });
}

/**
 * Soft-deletes an infobox row. Rejects if the row has any content revisions to
 * prevent accidental data loss.
 *
 * @example
 * const fd = new FormData();
 * fd.set('infoboxSectionId', '7');
 * await deleteInfoboxSection(fd);
 */
export async function deleteInfoboxSection(
  formData: FormData,
): Promise<{ error?: string }> {
  const infoboxSectionId = parseInt(
    formData.get("infoboxSectionId") as string,
    10,
  );
  if (!infoboxSectionId) return { error: "infoboxSectionId is required" };

  const [infoboxRow] = await db
    .select({ pageId: pageInfoboxSections.pageId })
    .from(pageInfoboxSections)
    .where(eq(pageInfoboxSections.id, infoboxSectionId))
    .limit(1);
  if (infoboxRow) await requireSerialAdminByPageId(infoboxRow.pageId);

  const [{ cnt }] = await db
    .select({ cnt: count() })
    .from(pageInfoboxRevisions)
    .where(eq(pageInfoboxRevisions.infoboxSectionId, infoboxSectionId));

  if (cnt > 0) {
    return {
      error:
        "This infobox row has content revisions and cannot be deleted. Clear all content first.",
    };
  }

  await db
    .update(pageInfoboxSections)
    .set({ deletedAt: new Date() })
    .where(eq(pageInfoboxSections.id, infoboxSectionId));

  return {};
}

/**
 * Renames an infobox row label.
 *
 * @example
 * const fd = new FormData();
 * fd.set('infoboxSectionId', '7');
 * fd.set('label', 'Birthdate');
 * await renameInfoboxSection(fd);
 */
export async function renameInfoboxSection(formData: FormData): Promise<void> {
  const infoboxSectionId = parseInt(
    formData.get("infoboxSectionId") as string,
    10,
  );
  const label = (formData.get("label") as string)?.trim();
  if (!infoboxSectionId || !label)
    throw new Error("infoboxSectionId and label are required");

  const [infoboxRow] = await db
    .select({ pageId: pageInfoboxSections.pageId })
    .from(pageInfoboxSections)
    .where(eq(pageInfoboxSections.id, infoboxSectionId))
    .limit(1);
  if (infoboxRow) await requireSerialAdminByPageId(infoboxRow.pageId);

  await db
    .update(pageInfoboxSections)
    .set({ label })
    .where(eq(pageInfoboxSections.id, infoboxSectionId));
}

/**
 * Reorders infobox rows by assigning new `displayOrder` values matching the
 * provided ordered array of infobox section IDs.
 *
 * @example
 * const fd = new FormData();
 * fd.set('orderedIds', JSON.stringify([3, 1, 2]));
 * await reorderInfoboxSections(fd);
 */
export async function reorderInfoboxSections(
  formData: FormData,
): Promise<void> {
  const raw = formData.get("orderedIds") as string;
  const orderedIds: number[] = JSON.parse(raw);

  if (orderedIds.length > 0) {
    const [infoboxRow] = await db
      .select({ pageId: pageInfoboxSections.pageId })
      .from(pageInfoboxSections)
      .where(eq(pageInfoboxSections.id, orderedIds[0]))
      .limit(1);
    if (infoboxRow) await requireSerialAdminByPageId(infoboxRow.pageId);
  }

  await db.transaction(async (tx) => {
    for (let i = 0; i < orderedIds.length; i++) {
      await tx
        .update(pageInfoboxSections)
        .set({ displayOrder: i })
        .where(eq(pageInfoboxSections.id, orderedIds[i]));
    }
  });
}

// ── Page relationship management ──────────────────────────────────────────────
// Relationships are temporal: each add/remove inserts a new row instead of
// mutating existing rows (same SCD Type 2 pattern as section content).

/**
 * Performs a DFS from `startId` following currently-active parent edges in
 * `page_relationships` (using all rows in the DB - not chapter-filtered - so
 * the cycle check is conservative). Returns true if `targetId` is reachable.
 *
 * This is called before inserting an `is_active = true` edge to ensure the
 * resulting graph remains a DAG.
 */
async function isReachable(
  startId: number,
  targetId: number,
): Promise<boolean> {
  // Build the full parent map for the serial in a single query.
  // We only care about the *most recent* row per (parent, child) pair and
  // whether that row is active. To keep the query simple we fetch all rows
  // and compute the latest-per-pair in JS.
  const allRows = await db
    .select({
      parentPageId: pageRelationships.parentPageId,
      childPageId: pageRelationships.childPageId,
      chapterId: pageRelationships.chapterId,
      isActive: pageRelationships.isActive,
    })
    .from(pageRelationships);

  // Latest row per (parent, child) keyed by `${parent}:${child}`.
  const latestByEdge = new Map<
    string,
    { chapterId: number; isActive: boolean }
  >();
  for (const row of allRows) {
    const key = `${row.parentPageId}:${row.childPageId}`;
    const existing = latestByEdge.get(key);
    if (!existing || row.chapterId > existing.chapterId) {
      latestByEdge.set(key, {
        chapterId: row.chapterId,
        isActive: row.isActive,
      });
    }
  }

  // Build adjacency: childId → set of parentIds that are currently active.
  const parentOf = new Map<number, Set<number>>();
  for (const [key, val] of latestByEdge.entries()) {
    if (!val.isActive) continue;
    const [parentStr, childStr] = key.split(":");
    const parent = parseInt(parentStr, 10);
    const child = parseInt(childStr, 10);
    const parents = parentOf.get(child) ?? new Set();
    parents.add(parent);
    parentOf.set(child, parents);
  }

  // DFS upward from startId to see if targetId is an ancestor.
  const visited = new Set<number>();
  const stack = [startId];
  while (stack.length > 0) {
    const current = stack.pop()!;
    if (current === targetId) return true;
    if (visited.has(current)) continue;
    visited.add(current);
    const parents = parentOf.get(current);
    if (parents) {
      for (const p of parents) stack.push(p);
    }
  }
  return false;
}

/**
 * Returns the active parent pages for a given page at a specific chapter,
 * including temporal titles resolved at that chapter's cutoff. Used by the
 * edit-mode Relationships panel to keep the parent list in sync with the
 * "Writing as of:" chapter selector.
 *
 * @example
 * const parents = await getParentPagesAtChapter('one-piece', 'luffy', 7);
 */
export async function getParentPagesAtChapter(
  serialSlug: string,
  pageSlug: string,
  chapterId: number,
): Promise<{ id: number; name: string; slug: string; title: string }[]> {
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

  const parentRelMaxIdxSq = db
    .select({
      parentPageId: pageRelationships.parentPageId,
      maxIdx: max(chapters.idx).as("max_idx"),
    })
    .from(pageRelationships)
    .innerJoin(chapters, eq(pageRelationships.chapterId, chapters.id))
    .where(
      and(
        eq(pageRelationships.childPageId, pageId),
        lte(chapters.idx, cutoffIdx),
      ),
    )
    .groupBy(pageRelationships.parentPageId)
    .as("parent_rel_max_idx_sq");

  const parentPagesRaw = await db
    .select({
      id: pages.id,
      name: pages.name,
      slug: pages.slug,
      isActive: pageRelationships.isActive,
    })
    .from(pageRelationships)
    .innerJoin(pages, eq(pageRelationships.parentPageId, pages.id))
    .innerJoin(chapters, eq(pageRelationships.chapterId, chapters.id))
    .innerJoin(
      parentRelMaxIdxSq,
      and(
        eq(pageRelationships.parentPageId, parentRelMaxIdxSq.parentPageId),
        eq(chapters.idx, parentRelMaxIdxSq.maxIdx),
      ),
    )
    .where(eq(pageRelationships.childPageId, pageId));

  const activeParents = parentPagesRaw.filter((r) => r.isActive);
  if (activeParents.length === 0) return [];

  const parentPageIds = activeParents.map((r) => r.id);

  const titleMaxIdxSq = db
    .select({
      pageId: pageTitles.pageId,
      maxIdx: max(chapters.idx).as("max_idx"),
    })
    .from(pageTitles)
    .innerJoin(chapters, eq(pageTitles.chapterId, chapters.id))
    .where(
      and(
        inArray(pageTitles.pageId, parentPageIds),
        lte(chapters.idx, cutoffIdx),
      ),
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

  const titleMap = new Map(titleRows.map((r) => [r.pageId, r.title]));

  return activeParents.map((r) => ({
    id: r.id,
    name: r.name,
    slug: r.slug,
    title: titleMap.get(r.id) ?? r.name,
  }));
}

/**
 * Inserts an `is_active = true` row for (childPageId, parentPageId) at the
 * given chapter. Rejects if the edge would create a cycle in the page DAG.
 *
 * @example
 * await addPageRelationship(childPageId, parentPageId, chapterId);
 */
export async function addPageRelationship(
  childPageId: number,
  parentPageId: number,
  chapterId: number,
): Promise<{ error?: string }> {
  await requireSerialAdminByPageId(childPageId);

  if (childPageId === parentPageId) {
    return { error: "A page cannot be its own parent." };
  }

  // Cycle check: if parentPageId can already reach childPageId through active
  // edges, adding childPageId → parentPageId would create a cycle.
  const wouldCycle = await isReachable(parentPageId, childPageId);
  if (wouldCycle) {
    return {
      error: "Adding this parent would create a cycle in the page graph.",
    };
  }

  await db
    .insert(pageRelationships)
    .values({ parentPageId, childPageId, chapterId, isActive: true })
    .onConflictDoUpdate({
      target: [
        pageRelationships.parentPageId,
        pageRelationships.childPageId,
        pageRelationships.chapterId,
      ],
      set: { isActive: true },
    });

  return {};
}

/**
 * Inserts an `is_active = false` tombstone for (childPageId, parentPageId) at
 * the given chapter. Guards against leaving a non-home-page with zero parents
 * at any chapter snapshot by checking whether the page has other active parents.
 *
 * The "other active parent" check is intentionally conservative: it uses the
 * latest-per-pair rows across all chapters, not a chapter-filtered view, so
 * we never accidentally leave a page orphaned.
 *
 * @example
 * await removePageRelationship(childPageId, parentPageId, chapterId);
 */
export async function removePageRelationship(
  childPageId: number,
  parentPageId: number,
  chapterId: number,
): Promise<{ error?: string }> {
  await requireSerialAdminByPageId(childPageId);

  // Count OTHER active parents for this child (conservative - unfiltered).
  const allRows = await db
    .select({
      parentPageId: pageRelationships.parentPageId,
      chapterId: pageRelationships.chapterId,
      isActive: pageRelationships.isActive,
    })
    .from(pageRelationships)
    .where(
      and(
        eq(pageRelationships.childPageId, childPageId),
        ne(pageRelationships.parentPageId, parentPageId),
      ),
    );

  // Compute latest row per other parent.
  const latestByParent = new Map<
    number,
    { chapterId: number; isActive: boolean }
  >();
  for (const row of allRows) {
    const existing = latestByParent.get(row.parentPageId);
    if (!existing || row.chapterId > existing.chapterId) {
      latestByParent.set(row.parentPageId, {
        chapterId: row.chapterId,
        isActive: row.isActive,
      });
    }
  }

  const activeOtherParents = [...latestByParent.values()].filter(
    (v) => v.isActive,
  );

  if (activeOtherParents.length === 0) {
    // Check if the page is a home page (home pages are root nodes - no parent needed).
    const [pageRow] = await db
      .select({ isHomePage: pages.isHomePage })
      .from(pages)
      .where(eq(pages.id, childPageId))
      .limit(1);

    if (!pageRow?.isHomePage) {
      return {
        error:
          "Cannot remove this parent: the page must have at least one parent. Add another parent first.",
      };
    }
  }

  await db
    .insert(pageRelationships)
    .values({ parentPageId, childPageId, chapterId, isActive: false })
    .onConflictDoUpdate({
      target: [
        pageRelationships.parentPageId,
        pageRelationships.childPageId,
        pageRelationships.chapterId,
      ],
      set: { isActive: false },
    });

  return {};
}
