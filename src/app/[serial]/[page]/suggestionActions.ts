"use server";

import { db } from "@/db/index";
import {
  chapters,
  pageSuggestions,
  pageSuggestionSectionChanges,
  pageSuggestionInfoboxChanges,
  pageSectionRevisions,
  pageInfoboxRevisions,
} from "@/db/schema";
import { and, eq, gt, inArray } from "drizzle-orm";
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
  fetchPendingSuggestionsForSerial,
} from "@/data/suggestions/queries";
import {
  getChapterCutoff,
  getChapterBySerialAndIdx,
} from "@/data/chapters/queries";
import type {
  SuggestionStatus,
  PendingSuggestionDetail,
  FutureRevisionUpdate,
} from "@/types";

// ── User-facing actions ───────────────────────────────────────────────────────

/**
 * Submits a suggestion to change ONE body section or one-or-more infobox rows
 * on a wiki page (never both — a suggestion targets a single reviewable unit).
 *
 * The target chapter is always the caller's current reading cutoff, resolved
 * server-side from the progress cookie / user_progress — there is no separate
 * "as of" chapter, and a client cannot suggest at a chapter it is not reading.
 * Requires the caller to be authenticated but NOT an admin - admins use
 * `savePageContent` directly.
 *
 * @example
 * await submitPageSuggestion(42, "Quote from ch. 5",
 *   [{ sectionId: 1, proposedContent: "..." }],
 * );
 */
export async function submitPageSuggestion(
  pageId: number,
  citation: string,
  sectionChanges: { sectionId: number; proposedContent: string }[],
  infoboxChanges: { infoboxSectionId: number; proposedContent: string }[] = [],
): Promise<{ error?: string }> {
  const userId = await requireAuthenticated();

  if (!citation.trim()) return { error: "Citation is required." };
  if (sectionChanges.length === 0 && infoboxChanges.length === 0) {
    return { error: "At least one change is required." };
  }
  if (sectionChanges.length > 1) {
    return { error: "A suggestion can change only one section at a time." };
  }
  if (sectionChanges.length > 0 && infoboxChanges.length > 0) {
    return {
      error:
        "A suggestion can change either one section or the infobox, not both.",
    };
  }

  // Admins should use savePageContent directly.
  const serialId = await fetchSerialIdByPageId(pageId);
  const isAdmin = await isSerialAdmin(serialId);
  if (isAdmin)
    return {
      error: "Admins should use the edit mode to save content directly.",
    };

  // The suggestion always targets the caller's current reading cutoff.
  const { cutoffIdx, readingChapterId } = await getChapterCutoff(serialId);
  const targetChapterId =
    readingChapterId ??
    (await getChapterBySerialAndIdx(serialId, cutoffIdx))?.id ??
    null;
  if (targetChapterId === null) {
    return {
      error:
        "Set your reading progress for this serial before suggesting an edit.",
    };
  }

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
 * Returns all pending suggestions for a page with per-change diffs and later
 * revisions of the same section/row (for the carry-forward merge UI).
 * Admin-only - returns empty array otherwise.
 *
 * @example
 * const suggestions = await getPendingSuggestions(42);
 */
export async function getPendingSuggestions(
  pageId: number,
): Promise<PendingSuggestionDetail[]> {
  const serialId = await fetchSerialIdByPageId(pageId);
  const isAdmin = await isSerialAdmin(serialId);
  if (!isAdmin) return [];
  return fetchPendingSuggestions(pageId);
}

/**
 * Returns all pending suggestions across every page of a serial, fully
 * hydrated for the review queue on the serial home page.
 * Admin-only - returns empty array otherwise.
 *
 * @example
 * const queue = await getPendingSuggestionsForSerial(serial.id);
 */
export async function getPendingSuggestionsForSerial(
  serialId: number,
): Promise<PendingSuggestionDetail[]> {
  const isAdmin = await isSerialAdmin(serialId);
  if (!isAdmin) return [];
  return fetchPendingSuggestionsForSerial(serialId);
}

/**
 * Approves a pending suggestion: writes each proposed change into the revision
 * tables at the suggestion's target chapter (same upsert path as
 * `savePageContent`), optionally carries the change forward into later
 * revisions of the same section/row, then marks the suggestion approved.
 *
 * Each entry in `futureUpdates` replaces the content of one EXISTING later
 * revision (a chapter after the target where the same section/row was revised
 * again). Updates are validated against the suggestion's change set and the
 * stored revision chapters, then applied in ascending chapter order inside the
 * same transaction so the consecutive-revisions-must-differ invariant holds at
 * every step — a carried-forward revision that ends up identical to the newly
 * approved content collapses (is deleted) automatically.
 *
 * Requires admin access to the page's serial.
 *
 * @example
 * await approveSuggestion(5, "Verified against ch. 5 text.", [
 *   { sectionId: 1, chapterId: 9, content: "Ch. 7 revision + the new fact" },
 * ]);
 */
export async function approveSuggestion(
  suggestionId: number,
  reviewNote?: string,
  futureUpdates: FutureRevisionUpdate[] = [],
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

  const [changes, ibChanges, [targetChapterRow]] = await Promise.all([
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
    db
      .select({ idx: chapters.idx })
      .from(chapters)
      .where(eq(chapters.id, suggestion.targetChapterId))
      .limit(1),
  ]);
  const targetIdx = targetChapterRow?.idx ?? 0;

  // ── Validate carry-forward updates against real later revisions ────────────
  const changedSectionIds = changes.map((c) => c.sectionId);
  const changedInfoboxIds = ibChanges.map((c) => c.infoboxSectionId);

  const [laterSectionRevisions, laterInfoboxRevisions] = await Promise.all([
    changedSectionIds.length === 0
      ? Promise.resolve([])
      : db
          .select({
            sectionId: pageSectionRevisions.sectionId,
            chapterId: pageSectionRevisions.chapterId,
            idx: chapters.idx,
          })
          .from(pageSectionRevisions)
          .innerJoin(chapters, eq(pageSectionRevisions.chapterId, chapters.id))
          .where(
            and(
              inArray(pageSectionRevisions.sectionId, changedSectionIds),
              gt(chapters.idx, targetIdx),
            ),
          ),
    changedInfoboxIds.length === 0
      ? Promise.resolve([])
      : db
          .select({
            infoboxSectionId: pageInfoboxRevisions.infoboxSectionId,
            chapterId: pageInfoboxRevisions.chapterId,
            idx: chapters.idx,
          })
          .from(pageInfoboxRevisions)
          .innerJoin(chapters, eq(pageInfoboxRevisions.chapterId, chapters.id))
          .where(
            and(
              inArray(
                pageInfoboxRevisions.infoboxSectionId,
                changedInfoboxIds,
              ),
              gt(chapters.idx, targetIdx),
            ),
          ),
  ]);

  type ValidatedUpdate = {
    chapterId: number;
    idx: number;
    sectionChanges: Record<number, string>;
    infoboxChanges: Record<number, string>;
  };
  const validatedUpdates: ValidatedUpdate[] = [];
  for (const update of futureUpdates) {
    if (!update.content.trim()) {
      return { error: "Carried-forward content cannot be empty." };
    }
    if (update.sectionId !== undefined) {
      const revision = laterSectionRevisions.find(
        (r) =>
          r.sectionId === update.sectionId &&
          r.chapterId === update.chapterId,
      );
      if (!revision) {
        return {
          error:
            "A carry-forward update does not match a later revision of the suggested section.",
        };
      }
      validatedUpdates.push({
        chapterId: update.chapterId,
        idx: revision.idx,
        sectionChanges: { [update.sectionId]: update.content },
        infoboxChanges: {},
      });
    } else if (update.infoboxSectionId !== undefined) {
      const revision = laterInfoboxRevisions.find(
        (r) =>
          r.infoboxSectionId === update.infoboxSectionId &&
          r.chapterId === update.chapterId,
      );
      if (!revision) {
        return {
          error:
            "A carry-forward update does not match a later revision of the suggested infobox row.",
        };
      }
      validatedUpdates.push({
        chapterId: update.chapterId,
        idx: revision.idx,
        sectionChanges: {},
        infoboxChanges: { [update.infoboxSectionId]: update.content },
      });
    } else {
      return { error: "A carry-forward update must name a section or row." };
    }
  }
  // Ascending order so each apply compares against the just-written prior state.
  validatedUpdates.sort((a, b) => a.idx - b.idx);

  await db.transaction(async (tx) => {
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

    for (const update of validatedUpdates) {
      await applyPageContentRevisions(
        tx,
        suggestion.pageId,
        update.chapterId,
        update.idx,
        update.sectionChanges,
        update.infoboxChanges,
      );
    }

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
