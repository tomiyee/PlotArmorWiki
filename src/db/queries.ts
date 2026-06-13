import { cache } from "react";
import { cookies } from "next/headers";
import { db } from "@/db/index";
import {
  chapters,
  pages,
  pageTitles,
  pageRelationships,
  pageSectionRevisions,
  pageInfoboxRevisions,
  serials,
  volumes,
  templates,
  templateSections,
  templateInfoboxSections,
} from "@/db/schema";
import { and, asc, eq, inArray, isNull, lte, max, or } from "drizzle-orm";

/** PostgreSQL INT4 max — use as cutoffIdx to mean "no chapter cutoff". */
export const PG_INT_MAX = 2_147_483_647;

/**
 * Resolves chapter-versioned display titles for a set of pages at a given reading position.
 *
 * Returns the pageTitles entry whose chapter has the highest idx ≤ cutoffIdx —
 * the name the reader should see at their current position. Pages with no
 * pageTitles row at or before the cutoff are omitted; callers fall back to
 * pages.name.
 *
 * @example
 * const titleMap = await resolvePageTitlesAtIdx(pageIds, cutoffIdx);
 * const displayName = titleMap.get(page.id) ?? page.name;
 */
export async function resolvePageTitlesAtIdx(
  pageIds: number[],
  cutoffIdx: number,
): Promise<Map<number, string>> {
  if (pageIds.length === 0) return new Map();

  const maxIdxSq = db
    .select({
      pageId: pageTitles.pageId,
      maxIdx: max(chapters.idx).as("max_idx"),
    })
    .from(pageTitles)
    .innerJoin(chapters, eq(pageTitles.chapterId, chapters.id))
    .where(
      and(
        inArray(pageTitles.pageId, pageIds),
        lte(chapters.idx, cutoffIdx),
      ),
    )
    .groupBy(pageTitles.pageId)
    .as("page_title_max_idx_sq");

  const rows = await db
    .select({ pageId: pageTitles.pageId, title: pageTitles.title })
    .from(pageTitles)
    .innerJoin(chapters, eq(pageTitles.chapterId, chapters.id))
    .innerJoin(
      maxIdxSq,
      and(
        eq(pageTitles.pageId, maxIdxSq.pageId),
        eq(chapters.idx, maxIdxSq.maxIdx),
      ),
    );

  return new Map(rows.map((r) => [r.pageId, r.title]));
}

/**
 * Returns the set of page IDs (from `pageIds`) that have at least one active
 * child relationship at `cutoffIdx` — i.e. pages that should render a folder
 * icon rather than a document icon in the sub-pages list.
 *
 * Uses the max-idx pattern: the latest `pageRelationships` revision per
 * (parent, child) pair at or before `cutoffIdx` must have `isActive = true`.
 *
 * @example
 * const hasChildrenSet = await resolveHasChildrenSet(childPageIds, cutoffIdx);
 * const hasChildren = hasChildrenSet.has(page.id);
 */
export async function resolveHasChildrenSet(
  pageIds: number[],
  cutoffIdx: number,
): Promise<Set<number>> {
  if (pageIds.length === 0) return new Set();

  const grandchildRelMaxIdxSq = db
    .select({
      parentPageId: pageRelationships.parentPageId,
      childPageId: pageRelationships.childPageId,
      maxIdx: max(chapters.idx).as("max_idx"),
    })
    .from(pageRelationships)
    .innerJoin(chapters, eq(pageRelationships.chapterId, chapters.id))
    .where(
      and(
        inArray(pageRelationships.parentPageId, pageIds),
        lte(chapters.idx, cutoffIdx),
      ),
    )
    .groupBy(pageRelationships.parentPageId, pageRelationships.childPageId)
    .as("grandchild_rel_max_idx_sq");

  const rows = await db
    .select({ parentPageId: pageRelationships.parentPageId })
    .from(pageRelationships)
    .innerJoin(chapters, eq(pageRelationships.chapterId, chapters.id))
    .innerJoin(
      grandchildRelMaxIdxSq,
      and(
        eq(pageRelationships.parentPageId, grandchildRelMaxIdxSq.parentPageId),
        eq(pageRelationships.childPageId, grandchildRelMaxIdxSq.childPageId),
        eq(chapters.idx, grandchildRelMaxIdxSq.maxIdx),
      ),
    )
    .where(
      and(
        inArray(pageRelationships.parentPageId, pageIds),
        eq(pageRelationships.isActive, true),
      ),
    );

  return new Set(rows.map((r) => r.parentPageId));
}

/**
 * Returns the Drizzle subquery that, for each section of `pageId`, finds the
 * highest `chapters.idx` ≤ `cutoffIdx` at which a revision exists. Callers
 * join this subquery to `pageSectionRevisions` + `chapters` to obtain the
 * chapter-versioned content at the reader's cutoff.
 *
 * Returns a subquery object — callers must await their own `db.select(…).from(…)
 * .innerJoin(sq, …)` call. This keeps the helper composable with different
 * outer SELECT projections.
 *
 * @example
 * const sq = sectionMaxIdxSq(pageId, cutoffIdx);
 * const rows = await db
 *   .select({ sectionId: pageSectionRevisions.sectionId, content: pageSectionRevisions.content })
 *   .from(pageSectionRevisions)
 *   .innerJoin(chapters, eq(pageSectionRevisions.chapterId, chapters.id))
 *   .innerJoin(sq, and(eq(pageSectionRevisions.sectionId, sq.sectionId), eq(chapters.idx, sq.maxIdx)))
 *   .where(eq(pageSectionRevisions.pageId, pageId));
 */
export function sectionMaxIdxSq(pageId: number, cutoffIdx: number) {
  return db
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
}

/**
 * Returns the Drizzle subquery that, for each infobox row of `pageId`, finds
 * the highest `chapters.idx` ≤ `cutoffIdx` at which a revision exists. Callers
 * join this to `pageInfoboxRevisions` + `chapters` to get chapter-versioned
 * infobox content.
 *
 * Returns a subquery object — callers must await their own query.
 *
 * @example
 * const sq = infoboxRowMaxIdxSq(pageId, cutoffIdx);
 * const rows = await db
 *   .select({ infoboxSectionId: pageInfoboxRevisions.infoboxSectionId, content: pageInfoboxRevisions.content })
 *   .from(pageInfoboxRevisions)
 *   .innerJoin(chapters, eq(pageInfoboxRevisions.chapterId, chapters.id))
 *   .innerJoin(sq, and(eq(pageInfoboxRevisions.infoboxSectionId, sq.infoboxSectionId), eq(chapters.idx, sq.maxIdx)))
 *   .where(eq(pageInfoboxRevisions.pageId, pageId));
 */
export function infoboxRowMaxIdxSq(pageId: number, cutoffIdx: number) {
  return db
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
}

/**
 * Returns the Drizzle subquery that, for each child of `parentPageId`, finds
 * the highest `chapters.idx` ≤ `cutoffIdx` at which a relationship revision
 * exists. Callers join this to `pageRelationships` + `chapters` to obtain the
 * latest active/inactive state per child at the reader's cutoff.
 *
 * Pass `PG_INT_MAX` as `cutoffIdx` to get the latest state across all chapters
 * (no cutoff), as used in the navbar where spoiler filtering is not applied.
 *
 * @example
 * const sq = childRelMaxIdxSq(homePage.id, cutoffIdx);
 * const rows = await db
 *   .select({ id: pages.id, isActive: pageRelationships.isActive })
 *   .from(pageRelationships)
 *   .innerJoin(pages, eq(pageRelationships.childPageId, pages.id))
 *   .innerJoin(chapters, eq(pageRelationships.chapterId, chapters.id))
 *   .innerJoin(sq, and(eq(pageRelationships.childPageId, sq.childPageId), eq(chapters.idx, sq.maxIdx)))
 *   .where(eq(pageRelationships.parentPageId, homePage.id));
 */
export function childRelMaxIdxSq(parentPageId: number, cutoffIdx: number) {
  return db
    .select({
      childPageId: pageRelationships.childPageId,
      maxIdx: max(chapters.idx).as("max_idx"),
    })
    .from(pageRelationships)
    .innerJoin(chapters, eq(pageRelationships.chapterId, chapters.id))
    .where(
      and(
        eq(pageRelationships.parentPageId, parentPageId),
        lte(chapters.idx, cutoffIdx),
      ),
    )
    .groupBy(pageRelationships.childPageId)
    .as("rel_max_idx_sq");
}

/**
 * Fetches the full serial row by its URL slug. Returns `undefined` when no
 * serial matches, so callers can call `notFound()` immediately.
 *
 * Wrapped in `React.cache()` so that when the layout and its nested page both
 * call this function in the same request they share a single DB round-trip.
 *
 * @example
 * const serial = await getSerialBySlug("one-piece");
 * if (!serial) return notFound();
 */
export const getSerialBySlug = cache(async function getSerialBySlug(
  serialSlug: string,
): Promise<
  | {
      id: number;
      title: string;
      slug: string;
      splashArtUrl: string | null;
      chapterType: "Chapter" | "Episode" | "Issue" | "Part";
      volumeType: "Volume" | "Season" | "Arc" | "Book";
    }
  | undefined
> {
  const [row] = await db.select().from(serials).where(eq(serials.slug, serialSlug)).limit(1);
  return row;
});

/**
 * Fetches the `idx` for a chapter by its primary key. Returns `null` when the
 * chapter does not exist, so callers can fall back to a default cutoff of 0.
 *
 * Wrapped in `React.cache()` so repeated calls within a single request (e.g.
 * from `getChapterCutoff` and from an action) share one DB hit.
 *
 * @example
 * const idx = await getChapterIdxById(chapterId);
 * const cutoffIdx = idx ?? 0;
 */
export const getChapterIdxById = cache(async function getChapterIdxById(
  chapterId: number,
): Promise<number | null> {
  const [row] = await db
    .select({ idx: chapters.idx })
    .from(chapters)
    .where(eq(chapters.id, chapterId))
    .limit(1);
  return row?.idx ?? null;
});

/**
 * Fetches the chapter id for a given serial + chapter idx combination.
 * Returns `undefined` when no matching chapter exists.
 *
 * Uses an inner join through `volumes` to scope the lookup to the correct serial
 * (chapter idx values are unique within a serial but not globally).
 *
 * @example
 * const chapter = await getChapterBySerialAndIdx(serial.id, 5);
 * if (!chapter) throw new Error("Chapter not found");
 */
export async function getChapterBySerialAndIdx(
  serialId: number,
  chapterIdx: number,
): Promise<{ id: number } | undefined> {
  const [row] = await db
    .select({ id: chapters.id })
    .from(chapters)
    .innerJoin(volumes, eq(chapters.volumeId, volumes.id))
    .where(and(eq(volumes.serialId, serialId), eq(chapters.idx, chapterIdx)))
    .limit(1);
  return row;
}

/**
 * Returns all pages in the serial that are visible at `cutoffIdx`: pages with
 * no intro chapter (home page) are always included; others must have been
 * introduced at or before `cutoffIdx`.
 *
 * Does NOT resolve chapter-versioned titles — call `resolvePageTitlesAtIdx`
 * on the returned IDs and fall back to `name` when no title row exists.
 *
 * @example
 * const rows = await fetchSerialPagesAtIdx(serialId, cutoffIdx);
 * const titleMap = await resolvePageTitlesAtIdx(rows.map(r => r.id), cutoffIdx);
 * const options = rows.map(r => ({ id: r.id, title: titleMap.get(r.id) ?? r.name }));
 */
export async function fetchSerialPagesAtIdx(
  serialId: number,
  cutoffIdx: number,
): Promise<{ id: number; name: string }[]> {
  return db
    .select({ id: pages.id, name: pages.name })
    .from(pages)
    .leftJoin(chapters, eq(pages.introChapterId, chapters.id))
    .where(
      and(
        eq(pages.serialId, serialId),
        or(isNull(pages.introChapterId), lte(chapters.idx, cutoffIdx)),
      ),
    )
    .orderBy(asc(pages.name));
}

/**
 * Returns the active parent pages for `pageId` at `cutoffIdx`: finds the
 * latest `pageRelationships` revision per parent at or before `cutoffIdx`
 * and keeps only those with `isActive = true`.
 *
 * Does NOT resolve chapter-versioned titles — call `resolvePageTitlesAtIdx`
 * on the returned IDs and fall back to `name` when no title row exists.
 *
 * @example
 * const rows = await fetchActiveParentPagesAtIdx(pageId, cutoffIdx);
 * const titleMap = await resolvePageTitlesAtIdx(rows.map(r => r.id), cutoffIdx);
 * const parents = rows.map(r => ({ ...r, title: titleMap.get(r.id) ?? r.name }));
 */
export async function fetchActiveParentPagesAtIdx(
  pageId: number,
  cutoffIdx: number,
): Promise<{ id: number; name: string; slug: string }[]> {
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

  return db
    .select({ id: pages.id, name: pages.name, slug: pages.slug })
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
    .where(
      and(
        eq(pageRelationships.childPageId, pageId),
        eq(pageRelationships.isActive, true),
      ),
    );
}

// ── Shared infrastructure queries ────────────────────────────────────────────
// These functions replace duplicated inline queries scattered across Server
// Components. Each is wrapped in React.cache() so that the layout and its
// nested page component share one DB hit per request when they call the same
// function (e.g. both need the volumes + chapters list to render the sidebar
// and the editor chapter selector).

/**
 * Reads the user's chapter cutoff for a given serial from the progress cookie
 * set by `<ChapterSelector>`. Returns both the chapter id (DB PK) and idx
 * (global ordering integer).
 *
 * Falls back to `{ cutoffIdx: 0, readingChapterId: null }` when no cookie is
 * present — the subquery finds no revision with idx ≤ 0, so all sections
 * render empty (pre-chapter-1 state).
 *
 * This is the single source of truth for cookie-based cutoff resolution;
 * previously duplicated between `[page]/page.tsx` and
 * `chapter/[chapterIdx]/page.tsx`.
 *
 * @example
 * const { cutoffIdx, readingChapterId } = await getChapterCutoff(serial.id);
 */
export async function getChapterCutoff(
  serialId: number,
): Promise<{ cutoffIdx: number; readingChapterId: number | null }> {
  const cookieStore = await cookies();
  const raw = cookieStore.get(`plotarmor_chapter_${serialId}`)?.value;
  if (!raw) return { cutoffIdx: 0, readingChapterId: null };

  const chapterId = parseInt(raw, 10);
  if (isNaN(chapterId)) return { cutoffIdx: 0, readingChapterId: null };

  const idx = await getChapterIdxById(chapterId);
  if (idx === null) return { cutoffIdx: 0, readingChapterId: null };

  return { cutoffIdx: idx, readingChapterId: chapterId };
}

/**
 * Fetches all volumes and chapters for a serial in a single parallel query pair,
 * ordered for display in the chapter selector and TOC sidebar.
 *
 * Wrapped in `React.cache()` so the serial layout (which renders the chapter
 * selector) and the nested wiki page (which renders the edit-mode chapter
 * selector) share one DB round-trip per request.
 *
 * @example
 * const { volumeList, chapterList } = await getSerialVolumesAndChapters(serial.id);
 */
export const getSerialVolumesAndChapters = cache(
  async function getSerialVolumesAndChapters(serialId: number) {
    const [volumeList, chapterList] = await Promise.all([
      db
        .select({
          id: volumes.id,
          displayName: volumes.displayName,
          idx: volumes.idx,
          serialId: volumes.serialId,
        })
        .from(volumes)
        .where(eq(volumes.serialId, serialId))
        .orderBy(asc(volumes.idx)),
      db
        .select({
          id: chapters.id,
          displayName: chapters.displayName,
          idx: chapters.idx,
          volumeId: chapters.volumeId,
        })
        .from(chapters)
        .innerJoin(volumes, eq(chapters.volumeId, volumes.id))
        .where(eq(volumes.serialId, serialId))
        .orderBy(asc(chapters.idx)),
    ]);
    return { volumeList, chapterList };
  },
);

/**
 * Fetches a wiki page by serial id + slug. Returns `undefined` when no page
 * matches, so callers can call `notFound()` immediately.
 *
 * @example
 * const page = await fetchPageAtSlug(serial.id, decodedSlug);
 * if (!page) notFound();
 */
export async function fetchPageAtSlug(
  serialId: number,
  slug: string,
): Promise<
  | {
      id: number;
      name: string;
      slug: string;
      serialId: number;
      introChapterId: number | null;
      isHomePage: boolean;
      deletedAt: Date | null;
      deletionReason: string | null;
      idempotencyKey: string | null;
    }
  | undefined
> {
  const [row] = await db
    .select()
    .from(pages)
    .where(and(eq(pages.serialId, serialId), eq(pages.slug, slug)))
    .limit(1);
  return row;
}

function groupByTemplateId<T extends { templateId: number }>(items: T[]): Map<number, T[]> {
  const map = new Map<number, T[]>();
  for (const item of items) {
    const arr = map.get(item.templateId) ?? [];
    arr.push(item);
    map.set(item.templateId, arr);
  }
  return map;
}

/**
 * Fetches all templates for a serial with their sections and infobox rows,
 * ordered alphabetically. Returns `[]` when the serial has no templates.
 *
 * Runs three queries (templates → sections + infobox rows in parallel) and
 * groups in JS; templates per serial are a small set so this is always fast.
 *
 * This is the single source of truth for template data; previously duplicated
 * as a local `fetchSerialTemplates` function inside `[page]/page.tsx` and
 * `[serial]/new/queries.ts`.
 *
 * @example
 * const serialTemplates = await fetchSerialTemplates(serial.id);
 */
export async function fetchSerialTemplates(serialId: number) {
  const tmplRows = await db
    .select({ id: templates.id, name: templates.name, hasInfobox: templates.hasInfobox })
    .from(templates)
    .where(eq(templates.serialId, serialId))
    .orderBy(asc(templates.name));

  if (tmplRows.length === 0) return [];

  const tmplIds = tmplRows.map((t) => t.id);

  const [allTmplSections, allTmplInfoboxSections] = await Promise.all([
    db
      .select({
        templateId: templateSections.templateId,
        id: templateSections.id,
        name: templateSections.name,
        displayOrder: templateSections.displayOrder,
      })
      .from(templateSections)
      .where(inArray(templateSections.templateId, tmplIds))
      .orderBy(asc(templateSections.displayOrder)),
    db
      .select({
        templateId: templateInfoboxSections.templateId,
        id: templateInfoboxSections.id,
        label: templateInfoboxSections.label,
        displayOrder: templateInfoboxSections.displayOrder,
      })
      .from(templateInfoboxSections)
      .where(inArray(templateInfoboxSections.templateId, tmplIds))
      .orderBy(asc(templateInfoboxSections.displayOrder)),
  ]);

  const sectionsByTemplate = groupByTemplateId(allTmplSections);
  const infoboxByTemplate = groupByTemplateId(allTmplInfoboxSections);

  return tmplRows.map((t) => ({
    id: t.id,
    name: t.name,
    hasInfobox: t.hasInfobox,
    sections: sectionsByTemplate.get(t.id) ?? [],
    infoboxSections: infoboxByTemplate.get(t.id) ?? [],
  }));
}
