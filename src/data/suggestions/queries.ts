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
} from "@/db/schema";
import { and, asc, count, desc, eq, inArray } from "drizzle-orm";
import {
  sectionMaxIdxSq as buildSectionMaxIdxSq,
  infoboxRowMaxIdxSq as buildInfoboxRowMaxIdxSq,
} from "@/data/pages/queries";
import type { SuggestionStatus } from "@/types";

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

/**
 * Returns all pending suggestions for a page with proposer username,
 * per-section proposed changes, per-infobox-row proposed changes, and the
 * current content at each suggestion's target chapter for diff rendering.
 *
 * @example
 * const suggestions = await fetchPendingSuggestions(42);
 */
export async function fetchPendingSuggestions(pageId: number): Promise<
  {
    id: number;
    proposerUsername: string | null;
    targetChapterId: number;
    targetChapterName: string;
    citation: string;
    createdAt: Date;
    sectionChanges: {
      sectionId: number;
      sectionName: string;
      currentContent: string;
      proposedContent: string;
    }[];
    infoboxChanges: {
      infoboxSectionId: number;
      infoboxSectionLabel: string;
      currentContent: string;
      proposedContent: string;
    }[];
  }[]
> {
  const suggestionRows = await db
    .select({
      id: pageSuggestions.id,
      proposerUsername: users.username,
      targetChapterId: pageSuggestions.targetChapterId,
      targetChapterName: chapters.displayName,
      targetChapterIdx: chapters.idx,
      citation: pageSuggestions.citation,
      createdAt: pageSuggestions.createdAt,
    })
    .from(pageSuggestions)
    .innerJoin(users, eq(pageSuggestions.proposedByUserId, users.id))
    .innerJoin(chapters, eq(pageSuggestions.targetChapterId, chapters.id))
    .where(
      and(
        eq(pageSuggestions.pageId, pageId),
        eq(pageSuggestions.status, "pending"),
      ),
    )
    .orderBy(asc(pageSuggestions.createdAt));

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

  // Batch current-content lookups by target chapter idx - one pair of queries
  // per distinct cutoff instead of one pair per suggestion.
  const distinctCutoffs = [
    ...new Set(suggestionRows.map((s) => s.targetChapterIdx)),
  ];

  const contentByCutoff = await Promise.all(
    distinctCutoffs.map(async (cutoffIdx) => {
      const secMaxIdxSq = buildSectionMaxIdxSq(pageId, cutoffIdx);
      const ibMaxIdxSq = buildInfoboxRowMaxIdxSq(pageId, cutoffIdx);

      const [sectionRevisions, ibRevisions] = await Promise.all([
        db
          .select({
            sectionId: pageSectionRevisions.sectionId,
            content: pageSectionRevisions.content,
          })
          .from(pageSectionRevisions)
          .innerJoin(chapters, eq(pageSectionRevisions.chapterId, chapters.id))
          .innerJoin(
            secMaxIdxSq,
            and(
              eq(pageSectionRevisions.sectionId, secMaxIdxSq.sectionId),
              eq(chapters.idx, secMaxIdxSq.maxIdx),
            ),
          )
          .where(eq(pageSectionRevisions.pageId, pageId)),
        db
          .select({
            infoboxSectionId: pageInfoboxRevisions.infoboxSectionId,
            content: pageInfoboxRevisions.content,
          })
          .from(pageInfoboxRevisions)
          .innerJoin(chapters, eq(pageInfoboxRevisions.chapterId, chapters.id))
          .innerJoin(
            ibMaxIdxSq,
            and(
              eq(
                pageInfoboxRevisions.infoboxSectionId,
                ibMaxIdxSq.infoboxSectionId,
              ),
              eq(chapters.idx, ibMaxIdxSq.maxIdx),
            ),
          )
          .where(eq(pageInfoboxRevisions.pageId, pageId)),
      ]);

      return {
        cutoffIdx,
        sectionContent: new Map(
          sectionRevisions.map((r) => [r.sectionId, r.content ?? ""]),
        ),
        ibContent: new Map(
          ibRevisions.map((r) => [r.infoboxSectionId, r.content ?? ""]),
        ),
      };
    }),
  );

  const contentMapByCutoff = new Map(
    contentByCutoff.map((entry) => [entry.cutoffIdx, entry]),
  );

  return suggestionRows.map((suggestion) => {
    const cutoffContent = contentMapByCutoff.get(suggestion.targetChapterIdx);
    const sectionContent =
      cutoffContent?.sectionContent ?? new Map<number, string>();
    const ibContent = cutoffContent?.ibContent ?? new Map<number, string>();

    return {
      id: suggestion.id,
      proposerUsername: suggestion.proposerUsername,
      targetChapterId: suggestion.targetChapterId,
      targetChapterName: suggestion.targetChapterName,
      citation: suggestion.citation,
      createdAt: suggestion.createdAt,
      sectionChanges: changeRows
        .filter((c) => c.suggestionId === suggestion.id)
        .map((c) => ({
          sectionId: c.sectionId,
          sectionName: c.sectionName,
          currentContent: sectionContent.get(c.sectionId) ?? "",
          proposedContent: c.proposedContent,
        })),
      infoboxChanges: infoboxChangeRows
        .filter((c) => c.suggestionId === suggestion.id)
        .map((c) => ({
          infoboxSectionId: c.infoboxSectionId,
          infoboxSectionLabel: c.infoboxSectionLabel,
          currentContent: ibContent.get(c.infoboxSectionId) ?? "",
          proposedContent: c.proposedContent,
        })),
    };
  });
}

/**
 * Returns the total count of pending suggestions across all pages of a serial.
 * Used for the serial home badge summarising outstanding review work.
 *
 * @example
 * const total = await fetchTotalPendingSuggestions(serial.id);
 */
export async function fetchTotalPendingSuggestions(
  serialId: number,
): Promise<number> {
  const [{ cnt }] = await db
    .select({ cnt: count() })
    .from(pageSuggestions)
    .innerJoin(pages, eq(pageSuggestions.pageId, pages.id))
    .where(
      and(eq(pages.serialId, serialId), eq(pageSuggestions.status, "pending")),
    );
  return Number(cnt);
}

/**
 * Returns pending suggestion counts grouped by page for a serial, ordered by
 * count descending then page name ascending. Used by the admin panel to
 * surface pages with the most outstanding review work first.
 *
 * @example
 * const byPage = await fetchPendingSuggestionsByPage(serial.id);
 */
export async function fetchPendingSuggestionsByPage(
  serialId: number,
): Promise<
  { pageId: number; pageSlug: string; pageName: string; count: number }[]
> {
  const rows = await db
    .select({
      pageId: pages.id,
      pageSlug: pages.slug,
      pageName: pages.name,
      cnt: count(),
    })
    .from(pageSuggestions)
    .innerJoin(pages, eq(pageSuggestions.pageId, pages.id))
    .where(
      and(eq(pages.serialId, serialId), eq(pageSuggestions.status, "pending")),
    )
    .groupBy(pages.id, pages.slug, pages.name)
    .orderBy(desc(count()), asc(pages.name));

  return rows.map((r) => ({ ...r, count: Number(r.cnt) }));
}
