"use server";

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
import {
  and,
  asc,
  count,
  desc,
  eq,
  inArray,
} from "drizzle-orm";
import {
  requireAuthenticated,
  requireSerialAdminByPageId,
  isSerialAdmin,
} from "@/lib/auth-guard";
import { applyPageContentRevisions } from "./revisionHelpers";
import {
  sectionMaxIdxSq as buildSectionMaxIdxSq,
  infoboxRowMaxIdxSq as buildInfoboxRowMaxIdxSq,
} from "@/data/pages/queries";
import type { SuggestionStatus } from "@/types";

// ── Internal helpers ──────────────────────────────────────────────────────────

/**
 * Returns the serial id for a given page, or throws if not found.
 */
async function getSerialIdByPageId(pageId: number): Promise<number> {
  const [page] = await db
    .select({ serialId: pages.serialId })
    .from(pages)
    .where(eq(pages.id, pageId))
    .limit(1);
  if (!page) throw new Error("Page not found.");
  return page.serialId;
}

// ── User-facing actions ───────────────────────────────────────────────────────

/**
 * Submits a suggestion to change one or more sections or infobox rows on a wiki page.
 * Requires the caller to be authenticated but NOT an admin - admins use
 * `savePageContent` directly.
 *
 * @example
 * await submitPageSuggestion(42, 7, "Quote from ch. 5",
 *   [{ sectionId: 1, proposedContent: "..." }],
 *   [{ infoboxSectionId: 3, proposedContent: "19" }],
 * );
 */
export async function submitPageSuggestion(
  pageId: number,
  targetChapterId: number,
  citation: string,
  sectionChanges: { sectionId: number; proposedContent: string }[],
  infoboxChanges: { infoboxSectionId: number; proposedContent: string }[] = [],
): Promise<{ error?: string }> {
  const userId = await requireAuthenticated();

  if (!citation.trim()) return { error: "Citation is required." };
  if (sectionChanges.length === 0 && infoboxChanges.length === 0) {
    return { error: "At least one section change is required." };
  }

  // Admins should use savePageContent directly.
  const serialId = await getSerialIdByPageId(pageId);
  const isAdmin = await isSerialAdmin(serialId);
  if (isAdmin)
    return {
      error: "Admins should use the edit mode to save content directly.",
    };

  await db.transaction(async (tx) => {
    const [suggestion] = await tx
      .insert(pageSuggestions)
      .values({
        pageId,
        proposedByUserId: userId,
        targetChapterId,
        citation: citation.trim(),
        status: "pending",
      })
      .returning({ id: pageSuggestions.id });

    for (const change of sectionChanges) {
      await tx.insert(pageSuggestionSectionChanges).values({
        suggestionId: suggestion.id,
        sectionId: change.sectionId,
        proposedContent: change.proposedContent,
      });
    }

    for (const change of infoboxChanges) {
      await tx.insert(pageSuggestionInfoboxChanges).values({
        suggestionId: suggestion.id,
        infoboxSectionId: change.infoboxSectionId,
        proposedContent: change.proposedContent,
      });
    }
  });

  return {};
}

/**
 * Returns all suggestions submitted by the current user for a given page,
 * ordered most-recent first. Used to show per-page status feedback.
 *
 * @example
 * const suggestions = await getMyPageSuggestions(42);
 * // → [{ status: 'pending', reviewNote: null }, ...]
 */
export async function getMyPageSuggestions(pageId: number): Promise<
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
  const userId = await requireAuthenticated().catch(() => null);
  if (!userId) return [];

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

// ── Admin-facing actions ──────────────────────────────────────────────────────

/**
 * Returns a count of pending suggestions for a given page.
 * Returns 0 when the caller is not an admin, so callers can pass it safely.
 *
 * @example
 * const count = await getPendingSuggestionCount(42);
 */
export async function getPendingSuggestionCount(
  pageId: number,
): Promise<number> {
  const serialId = await getSerialIdByPageId(pageId);
  const isAdmin = await isSerialAdmin(serialId);
  if (!isAdmin) return 0;

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
 * Returns all pending suggestions for a page, with proposer username,
 * per-section proposed changes, and per-infobox-row proposed changes.
 * Admin-only - returns empty array otherwise.
 *
 * @example
 * const suggestions = await getPendingSuggestions(42);
 */
export async function getPendingSuggestions(pageId: number): Promise<
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
  const serialId = await getSerialIdByPageId(pageId);
  const isAdmin = await isSerialAdmin(serialId);
  if (!isAdmin) return [];

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

  // Fetch all section changes and infobox changes for these suggestions in parallel.
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

  // For current content: batch the read-at-cutoff lookups across all suggestions
  // grouped by their target chapter idx. Each distinct cutoffIdx issues exactly
  // one section query + one infobox query (2 queries per unique cutoff vs. the
  // previous 2 queries per suggestion).
  const distinctCutoffs = [...new Set(suggestionRows.map((s) => s.targetChapterIdx))];

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

      const sectionContent = new Map(
        sectionRevisions.map((r) => [r.sectionId, r.content ?? ""]),
      );
      const ibContent = new Map(
        ibRevisions.map((r) => [r.infoboxSectionId, r.content ?? ""]),
      );

      return { cutoffIdx, sectionContent, ibContent };
    }),
  );

  // Index by cutoffIdx for O(1) lookup below.
  const contentMapByCutoff = new Map(
    contentByCutoff.map((entry) => [entry.cutoffIdx, entry]),
  );

  const suggestionWithChanges = suggestionRows.map((suggestion) => {
    const cutoffIdx = suggestion.targetChapterIdx;
    const cutoffContent = contentMapByCutoff.get(cutoffIdx);
    const sectionContent = cutoffContent?.sectionContent ?? new Map<number, string>();
    const ibContent = cutoffContent?.ibContent ?? new Map<number, string>();

    const changes = changeRows.filter((c) => c.suggestionId === suggestion.id);
    const ibChanges = infoboxChangeRows.filter(
      (c) => c.suggestionId === suggestion.id,
    );

    return {
      id: suggestion.id,
      proposerUsername: suggestion.proposerUsername,
      targetChapterId: suggestion.targetChapterId,
      targetChapterName: suggestion.targetChapterName,
      citation: suggestion.citation,
      createdAt: suggestion.createdAt,
      sectionChanges: changes.map((c) => ({
        sectionId: c.sectionId,
        sectionName: c.sectionName,
        currentContent: sectionContent.get(c.sectionId) ?? "",
        proposedContent: c.proposedContent,
      })),
      infoboxChanges: ibChanges.map((c) => ({
        infoboxSectionId: c.infoboxSectionId,
        infoboxSectionLabel: c.infoboxSectionLabel,
        currentContent: ibContent.get(c.infoboxSectionId) ?? "",
        proposedContent: c.proposedContent,
      })),
    };
  });

  return suggestionWithChanges;
}

/**
 * Approves a pending suggestion: writes each proposed section change into
 * page_section_revisions at the suggestion's target chapter (same upsert
 * path as savePageContent), then marks the suggestion as approved.
 * Requires admin access to the page's serial.
 *
 * @example
 * await approveSuggestion(5, "Looks accurate - verified against ch. 5 text.");
 */
export async function approveSuggestion(
  suggestionId: number,
  reviewNote?: string,
): Promise<{ error?: string }> {
  const [suggestion] = await db
    .select({
      id: pageSuggestions.id,
      pageId: pageSuggestions.pageId,
      targetChapterId: pageSuggestions.targetChapterId,
      status: pageSuggestions.status,
    })
    .from(pageSuggestions)
    .where(eq(pageSuggestions.id, suggestionId))
    .limit(1);

  if (!suggestion) return { error: "Suggestion not found." };
  if (suggestion.status !== "pending")
    return { error: "Suggestion is not pending." };

  const adminUserId = await requireSerialAdminByPageId(suggestion.pageId);

  const [changes, ibChanges] = await Promise.all([
    db
      .select({
        sectionId: pageSuggestionSectionChanges.sectionId,
        proposedContent: pageSuggestionSectionChanges.proposedContent,
      })
      .from(pageSuggestionSectionChanges)
      .where(eq(pageSuggestionSectionChanges.suggestionId, suggestionId)),
    db
      .select({
        infoboxSectionId: pageSuggestionInfoboxChanges.infoboxSectionId,
        proposedContent: pageSuggestionInfoboxChanges.proposedContent,
      })
      .from(pageSuggestionInfoboxChanges)
      .where(eq(pageSuggestionInfoboxChanges.suggestionId, suggestionId)),
  ]);

  await db.transaction(async (tx) => {
    // Resolve the idx of the target chapter for the previous-revision invariant check.
    const [targetChapterRow] = await tx
      .select({ idx: chapters.idx })
      .from(chapters)
      .where(eq(chapters.id, suggestion.targetChapterId))
      .limit(1);
    const targetIdx = targetChapterRow?.idx ?? 0;

    const sectionChanges = Object.fromEntries(
      changes.map((c) => [c.sectionId, c.proposedContent]),
    );
    const infoboxChanges = Object.fromEntries(
      ibChanges.map((c) => [c.infoboxSectionId, c.proposedContent]),
    );
    await applyPageContentRevisions(
      tx,
      suggestion.pageId,
      suggestion.targetChapterId,
      targetIdx,
      sectionChanges,
      infoboxChanges,
    );

    // Mark the suggestion as approved.
    await tx
      .update(pageSuggestions)
      .set({
        status: "approved",
        reviewedAt: new Date(),
        reviewedByUserId: adminUserId,
        reviewNote: reviewNote?.trim() ?? null,
      })
      .where(eq(pageSuggestions.id, suggestionId));
  });

  return {};
}

/**
 * Rejects a pending suggestion, optionally with a review note explaining why.
 * Requires admin access to the page's serial.
 *
 * @example
 * await rejectSuggestion(5, "Content doesn't appear in the source material.");
 */
export async function rejectSuggestion(
  suggestionId: number,
  reviewNote?: string,
): Promise<{ error?: string }> {
  const [suggestion] = await db
    .select({
      id: pageSuggestions.id,
      pageId: pageSuggestions.pageId,
      status: pageSuggestions.status,
    })
    .from(pageSuggestions)
    .where(eq(pageSuggestions.id, suggestionId))
    .limit(1);

  if (!suggestion) return { error: "Suggestion not found." };
  if (suggestion.status !== "pending")
    return { error: "Suggestion is not pending." };

  const adminUserId = await requireSerialAdminByPageId(suggestion.pageId);

  await db
    .update(pageSuggestions)
    .set({
      status: "rejected",
      reviewedAt: new Date(),
      reviewedByUserId: adminUserId,
      reviewNote: reviewNote?.trim() ?? null,
    })
    .where(eq(pageSuggestions.id, suggestionId));

  return {};
}

/**
 * Returns the total count of pending suggestions across all pages of a serial.
 * Returns 0 when the caller is not an admin for that serial. Used for the
 * serial home badge summarising outstanding review work.
 *
 * @example
 * const total = await getTotalPendingSuggestions(serial.id);
 */
export async function getTotalPendingSuggestions(
  serialId: number,
): Promise<number> {
  const isAdmin = await isSerialAdmin(serialId);
  if (!isAdmin) return 0;

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
 * Returns pending suggestion counts grouped by page for a serial.
 * Returns empty array when the caller is not an admin.
 *
 * @example
 * const pages = await getPendingSuggestionsByPage(serial.id);
 */
export async function getPendingSuggestionsByPage(
  serialId: number,
): Promise<
  { pageId: number; pageSlug: string; pageName: string; count: number }[]
> {
  const isAdmin = await isSerialAdmin(serialId);
  if (!isAdmin) return [];

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

