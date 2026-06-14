"use server";

import { db } from "@/db/index";
import {
  chapters,
  pageSuggestions,
  pageSuggestionSectionChanges,
  pageSuggestionInfoboxChanges,
} from "@/db/schema";
import { eq } from "drizzle-orm";
import {
  requireAuthenticated,
  requireSerialAdminByPageId,
  isSerialAdmin,
} from "@/lib/auth-guard";
import { applyPageContentRevisions } from "./revisionHelpers";
import {
  fetchSerialIdByPageId,
  fetchMyPageSuggestions,
  fetchPendingSuggestionCount,
  fetchPendingSuggestions,
  fetchTotalPendingSuggestions,
  fetchPendingSuggestionsByPage,
} from "@/data/suggestions/queries";
import type { SuggestionStatus } from "@/types";

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
  const serialId = await fetchSerialIdByPageId(pageId);
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
  return fetchMyPageSuggestions(pageId, userId);
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
  const serialId = await fetchSerialIdByPageId(pageId);
  const isAdmin = await isSerialAdmin(serialId);
  if (!isAdmin) return 0;
  return fetchPendingSuggestionCount(pageId);
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
  const serialId = await fetchSerialIdByPageId(pageId);
  const isAdmin = await isSerialAdmin(serialId);
  if (!isAdmin) return [];
  return fetchPendingSuggestions(pageId);
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
  return fetchTotalPendingSuggestions(serialId);
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
  return fetchPendingSuggestionsByPage(serialId);
}

