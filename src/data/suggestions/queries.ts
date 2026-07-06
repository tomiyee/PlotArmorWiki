import { db } from "@/db/index";
import {
  pages,
  chapters,
  pageSections,
  pageSectionRevisions,
  pageSuggestions,
  pageSuggestionSectionChanges,
  pageSuggestionInfoboxChanges,
  pageInfoboxSections,
  pageInfoboxRevisions,
  users,
  volumes,
} from "@/db/schema";
import { and, asc, count, desc, eq, inArray } from "drizzle-orm";
import type {
  SuggestionStatus,
  PendingSuggestionDetail,
  FutureRevision,
} from "@/types";

/**
 * Returns the serial id for a given page id. Used by suggestion auth guards
 * that need to check serial admin membership before a page-level read.
 *
 * @example
 * const serialId = await fetchSerialIdByPageId(42);
 */
export async function fetchSerialIdByPageId(pageId: number): Promise<number> {
  const [page] = await db
    .select({ serialId: pages.serialId })
    .from(pages)
    .where(eq(pages.id, pageId))
    .limit(1);
  if (!page) throw new Error("Page not found.");
  return page.serialId;
}

/**
 * Returns all suggestions submitted by a given user for a page, ordered
 * most-recent first. Used to render per-page suggestion status feedback.
 *
 * @example
 * const suggestions = await fetchMyPageSuggestions(pageId, userId);
 * // → [{ status: 'pending', reviewNote: null, sectionChanges: [...] }, ...]
 */
export async function fetchMyPageSuggestions(
  pageId: number,
  userId: string,
): Promise<
  {
    id: number;
    status: SuggestionStatus;
    reviewNote: string | null;
    createdAt: Date;
    targetChapterName: string;
    sectionChanges: { sectionName: string; proposedContent: string }[];
    infoboxChanges: { label: string; proposedContent: string }[];
  }[]
> {
  const rows = await db
    .select({
      id: pageSuggestions.id,
      status: pageSuggestions.status,
      reviewNote: pageSuggestions.reviewNote,
      createdAt: pageSuggestions.createdAt,
      targetChapterName: chapters.displayName,
    })
    .from(pageSuggestions)
    .innerJoin(chapters, eq(pageSuggestions.targetChapterId, chapters.id))
    .where(
      and(
        eq(pageSuggestions.pageId, pageId),
        eq(pageSuggestions.proposedByUserId, userId),
      ),
    )
    .orderBy(desc(pageSuggestions.createdAt));

  if (rows.length === 0) return [];

  const suggestionIds = rows.map((r) => r.id);

  const [sectionChangeRows, infoboxChangeRows] = await Promise.all([
    db
      .select({
        suggestionId: pageSuggestionSectionChanges.suggestionId,
        sectionName: pageSections.name,
        proposedContent: pageSuggestionSectionChanges.proposedContent,
      })
      .from(pageSuggestionSectionChanges)
      .innerJoin(
        pageSections,
        eq(pageSuggestionSectionChanges.sectionId, pageSections.id),
      )
      .where(inArray(pageSuggestionSectionChanges.suggestionId, suggestionIds)),
    db
      .select({
        suggestionId: pageSuggestionInfoboxChanges.suggestionId,
        label: pageInfoboxSections.label,
        proposedContent: pageSuggestionInfoboxChanges.proposedContent,
      })
      .from(pageSuggestionInfoboxChanges)
      .innerJoin(
        pageInfoboxSections,
        eq(
          pageSuggestionInfoboxChanges.infoboxSectionId,
          pageInfoboxSections.id,
        ),
      )
      .where(inArray(pageSuggestionInfoboxChanges.suggestionId, suggestionIds)),
  ]);

  return rows.map((row) => ({
    id: row.id,
    status: row.status,
    reviewNote: row.reviewNote,
    createdAt: row.createdAt,
    targetChapterName: row.targetChapterName,
    sectionChanges: sectionChangeRows
      .filter((c) => c.suggestionId === row.id)
      .map((c) => ({
        sectionName: c.sectionName,
        proposedContent: c.proposedContent,
      })),
    infoboxChanges: infoboxChangeRows
      .filter((c) => c.suggestionId === row.id)
      .map((c) => ({ label: c.label, proposedContent: c.proposedContent })),
  }));
}

/**
 * Returns the count of pending suggestions for a page. Used for the admin
 * badge shown on the page view. Returns 0 when there are no pending suggestions.
 *
 * @example
 * const count = await fetchPendingSuggestionCount(42);
 */
export async function fetchPendingSuggestionCount(
  pageId: number,
): Promise<number> {
  const [{ cnt }] = await db
    .select({ cnt: count() })
    .from(pageSuggestions)
    .where(
      and(
        eq(pageSuggestions.pageId, pageId),
        eq(pageSuggestions.status, "pending"),
      ),
    );
  return Number(cnt);
}

/** A stored revision of one section/infobox row, with chapter position, used to derive current + future content. */
type OwnedRevision = {
  ownerId: number;
  chapterId: number;
  chapterIdx: number;
  chapterName: string;
  volumeName: string;
  content: string;
};

/**
 * Splits an owner's revision list around a target chapter idx: `current` is
 * the content readers at the target see (highest idx ≤ target), `future` are
 * revisions strictly after the target (ascending) that a carry-forward merge
 * may need to update.
 */
function splitRevisionsAroundTarget(
  revisions: OwnedRevision[],
  targetIdx: number,
): { current: string; future: FutureRevision[] } {
  let current = "";
  const future: FutureRevision[] = [];
  for (const rev of revisions) {
    if (rev.chapterIdx <= targetIdx) {
      // Revisions arrive ascending, so the last one ≤ target wins.
      current = rev.content;
    } else {
      future.push({
        chapterId: rev.chapterId,
        chapterIdx: rev.chapterIdx,
        chapterName: rev.chapterName,
        volumeName: rev.volumeName,
        content: rev.content,
      });
    }
  }
  return { current, future };
}

/**
 * Hydrates base pending-suggestion rows with per-change detail: proposed
 * content, the current content at each suggestion's target chapter, and all
 * later revisions of the same section/row (for the carry-forward merge UI).
 *
 * Fetches every revision of the involved sections/rows in two queries and
 * splits them around each suggestion's target idx in JS — revision counts per
 * section are small, and this stays correct across suggestions from different
 * pages with different target chapters.
 */
async function hydratePendingSuggestions(
  suggestionRows: {
    id: number;
    pageId: number;
    pageSlug: string;
    pageName: string;
    proposerUsername: string | null;
    targetChapterId: number;
    targetChapterIdx: number;
    targetChapterName: string;
    citation: string;
    createdAt: Date;
  }[],
): Promise<PendingSuggestionDetail[]> {
  if (suggestionRows.length === 0) return [];

  const suggestionIds = suggestionRows.map((s) => s.id);

  const [changeRows, infoboxChangeRows] = await Promise.all([
    db
      .select({
        suggestionId: pageSuggestionSectionChanges.suggestionId,
        sectionId: pageSuggestionSectionChanges.sectionId,
        sectionName: pageSections.name,
        proposedContent: pageSuggestionSectionChanges.proposedContent,
      })
      .from(pageSuggestionSectionChanges)
      .innerJoin(
        pageSections,
        eq(pageSuggestionSectionChanges.sectionId, pageSections.id),
      )
      .where(inArray(pageSuggestionSectionChanges.suggestionId, suggestionIds)),
    db
      .select({
        suggestionId: pageSuggestionInfoboxChanges.suggestionId,
        infoboxSectionId: pageSuggestionInfoboxChanges.infoboxSectionId,
        infoboxSectionLabel: pageInfoboxSections.label,
        proposedContent: pageSuggestionInfoboxChanges.proposedContent,
      })
      .from(pageSuggestionInfoboxChanges)
      .innerJoin(
        pageInfoboxSections,
        eq(
          pageSuggestionInfoboxChanges.infoboxSectionId,
          pageInfoboxSections.id,
        ),
      )
      .where(inArray(pageSuggestionInfoboxChanges.suggestionId, suggestionIds)),
  ]);

  const sectionIds = [...new Set(changeRows.map((c) => c.sectionId))];
  const infoboxIds = [
    ...new Set(infoboxChangeRows.map((c) => c.infoboxSectionId)),
  ];

  const [sectionRevisionRows, infoboxRevisionRows] = await Promise.all([
    sectionIds.length === 0
      ? Promise.resolve([])
      : db
          .select({
            ownerId: pageSectionRevisions.sectionId,
            chapterId: chapters.id,
            chapterIdx: chapters.idx,
            chapterName: chapters.displayName,
            volumeName: volumes.displayName,
            content: pageSectionRevisions.content,
          })
          .from(pageSectionRevisions)
          .innerJoin(chapters, eq(pageSectionRevisions.chapterId, chapters.id))
          .innerJoin(volumes, eq(chapters.volumeId, volumes.id))
          .where(inArray(pageSectionRevisions.sectionId, sectionIds))
          .orderBy(asc(chapters.idx)),
    infoboxIds.length === 0
      ? Promise.resolve([])
      : db
          .select({
            ownerId: pageInfoboxRevisions.infoboxSectionId,
            chapterId: chapters.id,
            chapterIdx: chapters.idx,
            chapterName: chapters.displayName,
            volumeName: volumes.displayName,
            content: pageInfoboxRevisions.content,
          })
          .from(pageInfoboxRevisions)
          .innerJoin(chapters, eq(pageInfoboxRevisions.chapterId, chapters.id))
          .innerJoin(volumes, eq(chapters.volumeId, volumes.id))
          .where(inArray(pageInfoboxRevisions.infoboxSectionId, infoboxIds))
          .orderBy(asc(chapters.idx)),
  ]);

  const groupByOwner = (rows: (Omit<OwnedRevision, "content"> & { content: string | null })[]) => {
    const byOwner = new Map<number, OwnedRevision[]>();
    for (const row of rows) {
      const list = byOwner.get(row.ownerId) ?? [];
      list.push({ ...row, content: row.content ?? "" });
      byOwner.set(row.ownerId, list);
    }
    return byOwner;
  };

  const sectionRevisionsById = groupByOwner(sectionRevisionRows);
  const infoboxRevisionsById = groupByOwner(infoboxRevisionRows);

  return suggestionRows.map((suggestion) => ({
    id: suggestion.id,
    pageId: suggestion.pageId,
    pageSlug: suggestion.pageSlug,
    pageName: suggestion.pageName,
    proposerUsername: suggestion.proposerUsername,
    targetChapterId: suggestion.targetChapterId,
    targetChapterIdx: suggestion.targetChapterIdx,
    targetChapterName: suggestion.targetChapterName,
    citation: suggestion.citation,
    createdAt: suggestion.createdAt,
    sectionChanges: changeRows
      .filter((c) => c.suggestionId === suggestion.id)
      .map((c) => {
        const { current, future } = splitRevisionsAroundTarget(
          sectionRevisionsById.get(c.sectionId) ?? [],
          suggestion.targetChapterIdx,
        );
        return {
          sectionId: c.sectionId,
          sectionName: c.sectionName,
          currentContent: current,
          proposedContent: c.proposedContent,
          futureRevisions: future,
        };
      }),
    infoboxChanges: infoboxChangeRows
      .filter((c) => c.suggestionId === suggestion.id)
      .map((c) => {
        const { current, future } = splitRevisionsAroundTarget(
          infoboxRevisionsById.get(c.infoboxSectionId) ?? [],
          suggestion.targetChapterIdx,
        );
        return {
          infoboxSectionId: c.infoboxSectionId,
          infoboxSectionLabel: c.infoboxSectionLabel,
          currentContent: current,
          proposedContent: c.proposedContent,
          futureRevisions: future,
        };
      }),
  }));
}

/**
 * Returns all pending suggestions for a page with proposer username, per-change
 * diffs against the target chapter, and later revisions for carry-forward.
 *
 * @example
 * const suggestions = await fetchPendingSuggestions(42);
 */
export async function fetchPendingSuggestions(
  pageId: number,
): Promise<PendingSuggestionDetail[]> {
  const suggestionRows = await db
    .select({
      id: pageSuggestions.id,
      pageId: pageSuggestions.pageId,
      pageSlug: pages.slug,
      pageName: pages.name,
      proposerUsername: users.username,
      targetChapterId: pageSuggestions.targetChapterId,
      targetChapterName: chapters.displayName,
      targetChapterIdx: chapters.idx,
      citation: pageSuggestions.citation,
      createdAt: pageSuggestions.createdAt,
    })
    .from(pageSuggestions)
    .innerJoin(pages, eq(pageSuggestions.pageId, pages.id))
    .innerJoin(users, eq(pageSuggestions.proposedByUserId, users.id))
    .innerJoin(chapters, eq(pageSuggestions.targetChapterId, chapters.id))
    .where(
      and(
        eq(pageSuggestions.pageId, pageId),
        eq(pageSuggestions.status, "pending"),
      ),
    )
    .orderBy(asc(pageSuggestions.createdAt));

  return hydratePendingSuggestions(suggestionRows);
}

/**
 * Returns all pending suggestions across every page of a serial, hydrated the
 * same way as `fetchPendingSuggestions` and ordered oldest-first. Powers the
 * admin review queue on the serial home page.
 *
 * @example
 * const queue = await fetchPendingSuggestionsForSerial(serial.id);
 */
export async function fetchPendingSuggestionsForSerial(
  serialId: number,
): Promise<PendingSuggestionDetail[]> {
  const suggestionRows = await db
    .select({
      id: pageSuggestions.id,
      pageId: pageSuggestions.pageId,
      pageSlug: pages.slug,
      pageName: pages.name,
      proposerUsername: users.username,
      targetChapterId: pageSuggestions.targetChapterId,
      targetChapterName: chapters.displayName,
      targetChapterIdx: chapters.idx,
      citation: pageSuggestions.citation,
      createdAt: pageSuggestions.createdAt,
    })
    .from(pageSuggestions)
    .innerJoin(pages, eq(pageSuggestions.pageId, pages.id))
    .innerJoin(users, eq(pageSuggestions.proposedByUserId, users.id))
    .innerJoin(chapters, eq(pageSuggestions.targetChapterId, chapters.id))
    .where(
      and(eq(pages.serialId, serialId), eq(pageSuggestions.status, "pending")),
    )
    .orderBy(asc(pageSuggestions.createdAt));

  return hydratePendingSuggestions(suggestionRows);
}

