/**
 * One-off backfill for the multi-section -> single-content page collapse (#238).
 *
 * Migrates the wall-clock-versioned section/infobox-row structure plus their
 * chapter-versioned content revisions into the new single-content tables
 * added by `drizzle/0005_add_single_content_page_revisions.sql`:
 *
 *   - page_sections + page_section_revisions      -> page_content_revisions
 *   - page_infobox_sections + page_infobox_revisions
 *     + page_infobox_image_revisions               -> page_infobox_content_revisions
 *
 * For each page, every distinct chapter idx at which ANY section/infobox row
 * changed gets one merged snapshot: the first (lead) section's content is
 * used verbatim (no heading - this matches how it renders today with no
 * heading), and every subsequent section is prefixed with `## {name}`. This
 * mirrors the current reader-facing rendering in PageReadView so the merged
 * markdown reads identically to what a reader already sees. A section with
 * no content yet at a given idx is omitted entirely (rather than emitting a
 * placeholder), matching the fact that revisions are never written empty.
 *
 * Consecutive-duplicate revisions are collapsed (a merged snapshot equal to
 * the previously emitted one is skipped) to match the "revisions must
 * differ" invariant enforced elsewhere by `applyPageContentRevisions`.
 *
 * Per the resolved design decisions, pending suggestions are DELETED (not
 * converted) - the app has no users yet, so there is nothing to preserve.
 *
 * Idempotent: clears both destination tables before writing, so it is safe
 * to re-run against the same database during testing.
 *
 * Run once, after migration 0005 is applied, and before the destructive
 * migration that drops the legacy per-section tables:
 *
 *   npx tsx scripts/migrate-single-section.ts
 */
import * as dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { and, asc, eq, inArray, isNull } from "drizzle-orm";
import {
  pages,
  chapters,
  pageSections,
  pageSectionRevisions,
  pageInfoboxSections,
  pageInfoboxRevisions,
  pageInfoboxImageRevisions,
  pageContentRevisions,
  pageInfoboxContentRevisions,
  pageSuggestions,
} from "../src/db/schema";

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL is not set - populate .env.local before running this script.",
  );
}

const client = postgres(process.env.DATABASE_URL);
const db = drizzle(client);

type StructureRow = { id: number; displayOrder: number };

/** Merges the lead section verbatim, then `## {name}` + content for the rest. Omits sections with no content yet. */
function mergeBody(
  sections: (StructureRow & { name: string })[],
  contentBySectionId: Map<number, string>,
): string {
  const parts: string[] = [];
  sections.forEach((s, i) => {
    const content = contentBySectionId.get(s.id);
    if (!content) return;
    parts.push(i === 0 ? content : `## ${s.name}\n\n${content}`);
  });
  return parts.join("\n\n").trim();
}

/** Merges infobox rows as `**{label}:** {content}` blocks, one per non-empty row. */
function mergeInfobox(
  rows: (StructureRow & { label: string })[],
  contentByRowId: Map<number, string>,
): string {
  return rows
    .map((r) => {
      const content = contentByRowId.get(r.id);
      return content ? `**${r.label}:** ${content}` : null;
    })
    .filter((x): x is string => x !== null)
    .join("\n\n");
}

async function migratePageBody(pageId: number): Promise<void> {
  const sections = await db
    .select({
      id: pageSections.id,
      name: pageSections.name,
      displayOrder: pageSections.displayOrder,
    })
    .from(pageSections)
    .where(and(eq(pageSections.pageId, pageId), isNull(pageSections.deletedAt)))
    .orderBy(asc(pageSections.displayOrder));

  if (sections.length === 0) return;
  const sectionIds = sections.map((s) => s.id);

  const revisions = await db
    .select({
      sectionId: pageSectionRevisions.sectionId,
      chapterId: pageSectionRevisions.chapterId,
      idx: chapters.idx,
      content: pageSectionRevisions.content,
    })
    .from(pageSectionRevisions)
    .innerJoin(chapters, eq(pageSectionRevisions.chapterId, chapters.id))
    .where(
      and(
        eq(pageSectionRevisions.pageId, pageId),
        inArray(pageSectionRevisions.sectionId, sectionIds),
      ),
    )
    .orderBy(asc(chapters.idx));

  if (revisions.length === 0) return;

  // Distinct chapters touched by any section revision, in chronological order.
  const chapterIdxById = new Map<number, number>();
  for (const r of revisions) chapterIdxById.set(r.chapterId, r.idx);
  const orderedChapterIds = [...chapterIdxById.entries()]
    .sort((a, b) => a[1] - b[1])
    .map(([chapterId]) => chapterId);

  const contentBySectionId = new Map<number, string>();
  let lastEmitted: string | null = null;

  for (const chapterId of orderedChapterIds) {
    for (const r of revisions) {
      if (r.chapterId === chapterId) {
        contentBySectionId.set(r.sectionId, r.content ?? "");
      }
    }

    const merged = mergeBody(sections, contentBySectionId);
    if (!merged || merged === lastEmitted) continue;

    await db
      .insert(pageContentRevisions)
      .values({ pageId, chapterId, content: merged })
      .onConflictDoUpdate({
        target: [pageContentRevisions.pageId, pageContentRevisions.chapterId],
        set: { content: merged },
      });
    lastEmitted = merged;
  }
}

async function migratePageInfobox(pageId: number): Promise<void> {
  const rows = await db
    .select({
      id: pageInfoboxSections.id,
      label: pageInfoboxSections.label,
      displayOrder: pageInfoboxSections.displayOrder,
    })
    .from(pageInfoboxSections)
    .where(
      and(
        eq(pageInfoboxSections.pageId, pageId),
        isNull(pageInfoboxSections.deletedAt),
      ),
    )
    .orderBy(asc(pageInfoboxSections.displayOrder));
  const rowIds = rows.map((r) => r.id);

  const [contentRevisions, imageRevisions] = await Promise.all([
    rowIds.length > 0
      ? db
          .select({
            infoboxSectionId: pageInfoboxRevisions.infoboxSectionId,
            chapterId: pageInfoboxRevisions.chapterId,
            idx: chapters.idx,
            content: pageInfoboxRevisions.content,
          })
          .from(pageInfoboxRevisions)
          .innerJoin(chapters, eq(pageInfoboxRevisions.chapterId, chapters.id))
          .where(
            and(
              eq(pageInfoboxRevisions.pageId, pageId),
              inArray(pageInfoboxRevisions.infoboxSectionId, rowIds),
            ),
          )
          .orderBy(asc(chapters.idx))
      : Promise.resolve([]),
    db
      .select({
        chapterId: pageInfoboxImageRevisions.chapterId,
        idx: chapters.idx,
        imageUrl: pageInfoboxImageRevisions.imageUrl,
      })
      .from(pageInfoboxImageRevisions)
      .innerJoin(chapters, eq(pageInfoboxImageRevisions.chapterId, chapters.id))
      .where(eq(pageInfoboxImageRevisions.pageId, pageId))
      .orderBy(asc(chapters.idx)),
  ]);

  if (contentRevisions.length === 0 && imageRevisions.length === 0) return;

  const chapterIdxById = new Map<number, number>();
  for (const r of contentRevisions) chapterIdxById.set(r.chapterId, r.idx);
  for (const r of imageRevisions) chapterIdxById.set(r.chapterId, r.idx);
  const orderedChapterIds = [...chapterIdxById.entries()]
    .sort((a, b) => a[1] - b[1])
    .map(([chapterId]) => chapterId);

  const contentByRowId = new Map<number, string>();
  let currentImageUrl: string | null = null;
  let lastEmittedContent: string | null = null;
  let lastEmittedImage: string | null = null;
  let hasEmittedAny = false;

  for (const chapterId of orderedChapterIds) {
    for (const r of contentRevisions) {
      if (r.chapterId === chapterId) {
        contentByRowId.set(r.infoboxSectionId, r.content ?? "");
      }
    }
    const imgRev = imageRevisions.find((r) => r.chapterId === chapterId);
    if (imgRev) currentImageUrl = imgRev.imageUrl;

    const mergedContent = mergeInfobox(rows, contentByRowId) || null;

    const isEmpty = mergedContent === null && currentImageUrl === null;
    const isUnchanged =
      hasEmittedAny &&
      mergedContent === lastEmittedContent &&
      currentImageUrl === lastEmittedImage;
    if (isEmpty || isUnchanged) continue;

    await db
      .insert(pageInfoboxContentRevisions)
      .values({ pageId, chapterId, content: mergedContent, imageUrl: currentImageUrl })
      .onConflictDoUpdate({
        target: [
          pageInfoboxContentRevisions.pageId,
          pageInfoboxContentRevisions.chapterId,
        ],
        set: { content: mergedContent, imageUrl: currentImageUrl },
      });
    lastEmittedContent = mergedContent;
    lastEmittedImage = currentImageUrl;
    hasEmittedAny = true;
  }
}

async function main() {
  console.log("Clearing page_content_revisions / page_infobox_content_revisions for idempotency...");
  await db.delete(pageContentRevisions);
  await db.delete(pageInfoboxContentRevisions);

  const allPages = await db.select({ id: pages.id, name: pages.name }).from(pages);
  console.log(`Backfilling ${allPages.length} page(s)...`);

  for (const page of allPages) {
    await migratePageBody(page.id);
    await migratePageInfobox(page.id);
  }

  console.log(
    "Deleting all pending/reviewed page suggestions (no users yet - see decision #4 in the design doc)...",
  );
  const deleted = await db.delete(pageSuggestions).returning({ id: pageSuggestions.id });
  console.log(
    `Deleted ${deleted.length} suggestion(s) (child change rows cascade automatically).`,
  );

  console.log("Backfill complete.");
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await client.end();
  });
