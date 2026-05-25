"use server";

import { db } from "@/db/index";
import {
  pages,
  chapters,
  volumes,
  pageSections,
  pageSectionRevisions,
  pageSuggestions,
  pageSuggestionSectionChanges,
  users,
} from "@/db/schema";
import {
  and,
  asc,
  count,
  eq,
  isNull,
  lte,
  max,
} from "drizzle-orm";
import {
  requireAuthenticated,
  requireSerialAdminByPageId,
  isSerialAdmin,
} from "@/lib/auth-guard";

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
 * Submits a suggestion to change one or more sections on a wiki page.
 * Requires the caller to be authenticated but NOT an admin — admins use
 * `savePageContent` directly.
 *
 * @example
 * await submitPageSuggestion(42, 7, "Quote from ch. 5", [{ sectionId: 1, proposedContent: "..." }]);
 */
export async function submitPageSuggestion(
  pageId: number,
  targetChapterId: number,
  citation: string,
  sectionChanges: { sectionId: number; proposedContent: string }[],
): Promise<{ error?: string }> {
  const userId = await requireAuthenticated();

  if (!citation.trim()) return { error: "Citation is required." };
  if (sectionChanges.length === 0) return { error: "At least one section change is required." };
  if (sectionChanges.some((c) => !c.proposedContent.trim())) {
    return { error: "Proposed content cannot be empty for any section." };
  }

  // Admins should use savePageContent directly.
  const serialId = await getSerialIdByPageId(pageId);
  const isAdmin = await isSerialAdmin(serialId);
  if (isAdmin) return { error: "Admins should use the edit mode to save content directly." };

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
      await tx
        .insert(pageSuggestionSectionChanges)
        .values({
          suggestionId: suggestion.id,
          sectionId: change.sectionId,
          proposedContent: change.proposedContent,
        });
    }
  });

  return {};
}

/**
 * Returns the most recent suggestion submitted by the current user for a given
 * page, or null if none exists. Used to show per-page status feedback.
 *
 * @example
 * const suggestion = await getMyPageSuggestion(42);
 * // → { status: 'pending', reviewNote: null } | null
 */
export async function getMyPageSuggestion(pageId: number): Promise<{
  id: number;
  status: "pending" | "approved" | "rejected";
  reviewNote: string | null;
  createdAt: Date;
} | null> {
  const userId = await requireAuthenticated().catch(() => null);
  if (!userId) return null;

  const [row] = await db
    .select({
      id: pageSuggestions.id,
      status: pageSuggestions.status,
      reviewNote: pageSuggestions.reviewNote,
      createdAt: pageSuggestions.createdAt,
    })
    .from(pageSuggestions)
    .where(
      and(
        eq(pageSuggestions.pageId, pageId),
        eq(pageSuggestions.proposedByUserId, userId),
      ),
    )
    .orderBy(pageSuggestions.createdAt)
    .limit(1);

  if (!row) return null;
  return {
    id: row.id,
    status: row.status as "pending" | "approved" | "rejected",
    reviewNote: row.reviewNote,
    createdAt: row.createdAt,
  };
}

// ── Admin-facing actions ──────────────────────────────────────────────────────

/**
 * Returns a count of pending suggestions for a given page.
 * Returns 0 when the caller is not an admin, so callers can pass it safely.
 *
 * @example
 * const count = await getPendingSuggestionCount(42);
 */
export async function getPendingSuggestionCount(pageId: number): Promise<number> {
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
 * Returns all pending suggestions for a page, with proposer username and
 * per-section proposed changes. Admin-only — returns empty array otherwise.
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

  // Fetch all section changes for these suggestions.
  const changeRows = await db
    .select({
      suggestionId: pageSuggestionSectionChanges.suggestionId,
      sectionId: pageSuggestionSectionChanges.sectionId,
      sectionName: pageSections.name,
      proposedContent: pageSuggestionSectionChanges.proposedContent,
    })
    .from(pageSuggestionSectionChanges)
    .innerJoin(pageSections, eq(pageSuggestionSectionChanges.sectionId, pageSections.id))
    .where(
      and(
        ...suggestionIds.map((id) => eq(pageSuggestionSectionChanges.suggestionId, id)),
      ),
    );

  // For current content: fetch the latest revision at each suggestion's target chapter idx.
  // We resolve this per-suggestion using the max-idx pattern.
  const suggestionWithChanges = await Promise.all(
    suggestionRows.map(async (suggestion) => {
      const cutoffIdx = suggestion.targetChapterIdx;

      const changes = changeRows.filter((c) => c.suggestionId === suggestion.id);
      const sectionIds = changes.map((c) => c.sectionId);

      let currentContentBySectionId = new Map<number, string>();
      if (sectionIds.length > 0) {
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

        const currentRevisions = await db
          .select({
            sectionId: pageSectionRevisions.sectionId,
            content: pageSectionRevisions.content,
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
          .where(eq(pageSectionRevisions.pageId, pageId));

        currentContentBySectionId = new Map(
          currentRevisions.map((r) => [r.sectionId, r.content ?? ""]),
        );
      }

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
          currentContent: currentContentBySectionId.get(c.sectionId) ?? "",
          proposedContent: c.proposedContent,
        })),
      };
    }),
  );

  return suggestionWithChanges;
}

/**
 * Approves a pending suggestion: writes each proposed section change into
 * page_section_revisions at the suggestion's target chapter (same upsert
 * path as savePageContent), then marks the suggestion as approved.
 * Requires admin access to the page's serial.
 *
 * @example
 * await approveSuggestion(5, "Looks accurate — verified against ch. 5 text.");
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
  if (suggestion.status !== "pending") return { error: "Suggestion is not pending." };

  const adminUserId = await requireSerialAdminByPageId(suggestion.pageId);

  const changes = await db
    .select({
      sectionId: pageSuggestionSectionChanges.sectionId,
      proposedContent: pageSuggestionSectionChanges.proposedContent,
    })
    .from(pageSuggestionSectionChanges)
    .where(eq(pageSuggestionSectionChanges.suggestionId, suggestionId));

  await db.transaction(async (tx) => {
    // Write each section change as a new revision at the target chapter.
    for (const change of changes) {
      if (!change.proposedContent.trim()) continue;
      await tx
        .insert(pageSectionRevisions)
        .values({
          pageId: suggestion.pageId,
          sectionId: change.sectionId,
          chapterId: suggestion.targetChapterId,
          content: change.proposedContent,
        })
        .onConflictDoUpdate({
          target: [
            pageSectionRevisions.pageId,
            pageSectionRevisions.sectionId,
            pageSectionRevisions.chapterId,
          ],
          set: { content: change.proposedContent },
        });
    }

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
  if (suggestion.status !== "pending") return { error: "Suggestion is not pending." };

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
export async function getTotalPendingSuggestions(serialId: number): Promise<number> {
  const isAdmin = await isSerialAdmin(serialId);
  if (!isAdmin) return 0;

  const [{ cnt }] = await db
    .select({ cnt: count() })
    .from(pageSuggestions)
    .innerJoin(pages, eq(pageSuggestions.pageId, pages.id))
    .where(
      and(
        eq(pages.serialId, serialId),
        eq(pageSuggestions.status, "pending"),
      ),
    );

  return Number(cnt);
}

// ── Section content helper (for suggestion form pre-fill) ─────────────────────

/**
 * Resolves the active sections and their current content at a given chapter
 * cutoff, for pre-filling the suggestion form. Does not require auth — any
 * authenticated user can read existing section content.
 *
 * @example
 * const { sections } = await getSectionsAtChapter(42, chapterId);
 */
export async function getSectionsAtChapter(
  pageId: number,
  chapterId: number,
): Promise<{ sections: { id: number; name: string; content: string }[] }> {
  const [targetChapter] = await db
    .select({ idx: chapters.idx })
    .from(chapters)
    .where(eq(chapters.id, chapterId))
    .limit(1);

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

  const [activeSections, sectionVersions] = await Promise.all([
    db
      .select({ id: pageSections.id, name: pageSections.name })
      .from(pageSections)
      .where(and(eq(pageSections.pageId, pageId), isNull(pageSections.deletedAt)))
      .orderBy(asc(pageSections.displayOrder)),
    db
      .select({
        sectionId: pageSectionRevisions.sectionId,
        content: pageSectionRevisions.content,
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

  const contentBySectionId = new Map(
    sectionVersions.map((v) => [v.sectionId, v.content ?? ""]),
  );

  return {
    sections: activeSections.map((s) => ({
      id: s.id,
      name: s.name,
      content: contentBySectionId.get(s.id) ?? "",
    })),
  };
}
