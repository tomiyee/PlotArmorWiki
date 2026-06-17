import { db } from "@/db/index";
import {
  chapters,
  pages,
  pageTitles,
  pageRelationships,
  pageSections,
  pageSectionRevisions,
  pageInfoboxSections,
  pageInfoboxRevisions,
  pageInfoboxImageRevisions,
  templateInfoboxSections,
  templates,
  volumes,
} from "@/db/schema";
import { and, asc, desc, eq, exists, ilike, inArray, isNotNull, isNull, lte, max, or, sql } from "drizzle-orm";
import type {
  PageStub,
  ParentPageStub,
  WikiPageRow,
  DeletedPageStub,
  PageSectionAtIdx,
  PageInfoboxAtIdx,
  InfoboxSectionStructure,
  InfoboxRowAtIdx,
  ChildPageStub,
  PageTitleEntry,
  PageTitlesAtIdx,
} from "@/types";

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
 * Returns all live (non-deleted) pages in the serial visible at `cutoffIdx`: pages
 * with no intro chapter (home page) are always included; others must have been
 * introduced at or before `cutoffIdx`.
 *
 * Does NOT resolve chapter-versioned titles — call `resolvePageTitlesAtIdx`
 * on the returned IDs and fall back to `name` when no title row exists.
 *
 * @example
 * const rows = await fetchSerialPagesAtIdx(serialId, cutoffIdx);
 * const titleMap = await resolvePageTitlesAtIdx(rows.map(r => r.id), cutoffIdx);
 * const options = rows.map(r => ({ slug: r.slug, title: titleMap.get(r.id) ?? r.name }));
 */
export async function fetchSerialPagesAtIdx(
  serialId: number,
  cutoffIdx: number,
): Promise<PageStub[]> {
  return db
    .select({ id: pages.id, name: pages.name, slug: pages.slug })
    .from(pages)
    .leftJoin(chapters, eq(pages.introChapterId, chapters.id))
    .where(
      and(
        eq(pages.serialId, serialId),
        isNull(pages.deletedAt),
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
): Promise<ParentPageStub[]> {
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
): Promise<WikiPageRow | undefined> {
  const [row] = await db
    .select()
    .from(pages)
    .where(and(eq(pages.serialId, serialId), eq(pages.slug, slug)))
    .limit(1);
  return row;
}

/**
 * Fetches the home page row for a serial. Returns `null` when the serial has no
 * home page yet (edge case during serial initialisation).
 *
 * @example
 * const homePage = await fetchSerialHomePage(serial.id);
 * if (homePage) { /* render home page content *\/ }
 */
export async function fetchSerialHomePage(serialId: number): Promise<WikiPageRow | null> {
  const [row] = await db
    .select()
    .from(pages)
    .where(and(eq(pages.serialId, serialId), eq(pages.isHomePage, true)))
    .limit(1);
  return row ?? null;
}

/**
 * Returns all soft-deleted pages for a serial, ordered newest deletion first.
 * Only call this after confirming the caller is an admin — this function has no
 * auth check itself.
 *
 * @example
 * const deleted = isAdmin ? await fetchDeletedPages(serial.id) : [];
 */
export async function fetchDeletedPages(serialId: number): Promise<DeletedPageStub[]> {
  const rows = await db
    .select({
      id: pages.id,
      name: pages.name,
      slug: pages.slug,
      deletedAt: pages.deletedAt,
      deletionReason: pages.deletionReason,
    })
    .from(pages)
    .where(and(eq(pages.serialId, serialId), isNotNull(pages.deletedAt)))
    .orderBy(desc(pages.deletedAt));
  return rows.map((r) => ({ ...r, deletedAt: r.deletedAt! }));
}

/**
 * Fetches all active sections for a page and their chapter-versioned content at `cutoffIdx`.
 * Runs two queries in parallel: section structure (wall-clock) + section revisions (chapter-versioned).
 *
 * The returned array is ordered by `displayOrder` and combines both structure and content
 * so callers can derive both the edit-mode panel rows and the reader-facing section list
 * from one call.
 *
 * @example
 * const sections = await fetchPageSectionsAtIdx(page.id, cutoffIdx);
 * const pageSectionStructure = sections; // compatible with {id, name, displayOrder}[]
 * // section.content is "" when no revision exists at or before cutoffIdx
 */
export async function fetchPageSectionsAtIdx(
  pageId: number,
  cutoffIdx: number,
): Promise<PageSectionAtIdx[]> {
  const maxIdxSq = sectionMaxIdxSq(pageId, cutoffIdx);

  const [activeSections, sectionVersions] = await Promise.all([
    db
      .select({
        id: pageSections.id,
        name: pageSections.name,
        displayOrder: pageSections.displayOrder,
      })
      .from(pageSections)
      .where(and(eq(pageSections.pageId, pageId), isNull(pageSections.deletedAt)))
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
        maxIdxSq,
        and(
          eq(pageSectionRevisions.sectionId, maxIdxSq.sectionId),
          eq(chapters.idx, maxIdxSq.maxIdx),
        ),
      )
      .where(eq(pageSectionRevisions.pageId, pageId)),
  ]);

  const versionBySectionId = new Map(
    sectionVersions.map((v) => [v.sectionId, { content: v.content, chapterIdx: v.chapterIdx }]),
  );

  return activeSections.map((s) => {
    const v = versionBySectionId.get(s.id);
    return {
      id: s.id,
      name: s.name,
      displayOrder: s.displayOrder,
      content: v?.content ?? "",
      lastUpdatedChapterIdx: v?.chapterIdx ?? null,
    };
  });
}

/**
 * Fetches the complete infobox data for a page at `cutoffIdx`: the wall-clock-versioned
 * row structure, the chapter-versioned floater image URL, and the chapter-versioned row content.
 *
 * When the page has no active infobox rows, returns an empty result with
 * `floaterImageUrl: undefined` so callers can skip infobox rendering entirely.
 *
 * @example
 * const { structure, floaterImageUrl, rows } = await fetchPageInfoboxAtIdx(page.id, cutoffIdx);
 * // floaterImageUrl === undefined  → no infobox
 * // floaterImageUrl === null       → infobox exists but no image uploaded
 * // floaterImageUrl === "https://…" → has image
 */
export async function fetchPageInfoboxAtIdx(
  pageId: number,
  cutoffIdx: number,
): Promise<PageInfoboxAtIdx> {
  const activeInfoboxRows = await db
    .select({
      id: pageInfoboxSections.id,
      label: pageInfoboxSections.label,
      displayOrder: pageInfoboxSections.displayOrder,
    })
    .from(pageInfoboxSections)
    .where(and(eq(pageInfoboxSections.pageId, pageId), isNull(pageInfoboxSections.deletedAt)))
    .orderBy(asc(pageInfoboxSections.displayOrder));

  if (activeInfoboxRows.length === 0) {
    return { structure: activeInfoboxRows as InfoboxSectionStructure[], floaterImageUrl: undefined, rows: [] };
  }

  const floaterMaxIdxSq = db
    .select({ maxIdx: max(chapters.idx).as("max_idx") })
    .from(pageInfoboxImageRevisions)
    .innerJoin(chapters, eq(pageInfoboxImageRevisions.chapterId, chapters.id))
    .where(
      and(eq(pageInfoboxImageRevisions.pageId, pageId), lte(chapters.idx, cutoffIdx)),
    )
    .as("floater_max_idx_sq");

  const ibRowMaxIdxSq = infoboxRowMaxIdxSq(pageId, cutoffIdx);

  const [[floaterVersion], infoboxRowVersions] = await Promise.all([
    db
      .select({ imageUrl: pageInfoboxImageRevisions.imageUrl })
      .from(pageInfoboxImageRevisions)
      .innerJoin(chapters, eq(pageInfoboxImageRevisions.chapterId, chapters.id))
      .innerJoin(floaterMaxIdxSq, eq(chapters.idx, floaterMaxIdxSq.maxIdx))
      .where(eq(pageInfoboxImageRevisions.pageId, pageId))
      .limit(1),
    db
      .select({
        infoboxSectionId: pageInfoboxRevisions.infoboxSectionId,
        content: pageInfoboxRevisions.content,
      })
      .from(pageInfoboxRevisions)
      .innerJoin(chapters, eq(pageInfoboxRevisions.chapterId, chapters.id))
      .innerJoin(
        ibRowMaxIdxSq,
        and(
          eq(pageInfoboxRevisions.infoboxSectionId, ibRowMaxIdxSq.infoboxSectionId),
          eq(chapters.idx, ibRowMaxIdxSq.maxIdx),
        ),
      )
      .where(eq(pageInfoboxRevisions.pageId, pageId)),
  ]);

  const rowContentMap = new Map(
    infoboxRowVersions.map((v) => [v.infoboxSectionId, v.content]),
  );

  const rows: InfoboxRowAtIdx[] = activeInfoboxRows.map((r) => ({
    id: r.id,
    label: r.label,
    content: rowContentMap.get(r.id) ?? "",
  }));

  return {
    structure: activeInfoboxRows,
    floaterImageUrl: floaterVersion?.imageUrl ?? null,
    rows,
  };
}

/**
 * Fetches the active child pages for `parentPageId` at `cutoffIdx`, including
 * chapter-versioned titles and the `hasChildren` flag for folder-icon rendering.
 *
 * Uses the max-idx pattern: the latest relationship revision per child at or
 * before `cutoffIdx` must be `isActive = true` to appear in the result.
 * Soft-deleted child pages are always excluded.
 *
 * @example
 * const children = await fetchPageChildPagesAtIdx(page.id, cutoffIdx);
 * // [{ id: 1, name: "Nami", slug: "nami", title: "Nami (Post-Timeskip)", hasChildren: true }]
 */
export async function fetchPageChildPagesAtIdx(
  parentPageId: number,
  cutoffIdx: number,
): Promise<ChildPageStub[]> {
  const relMaxIdxSq = childRelMaxIdxSq(parentPageId, cutoffIdx);

  const childPagesRaw = await db
    .select({
      id: pages.id,
      name: pages.name,
      slug: pages.slug,
      isActive: pageRelationships.isActive,
    })
    .from(pageRelationships)
    .innerJoin(pages, eq(pageRelationships.childPageId, pages.id))
    .innerJoin(chapters, eq(pageRelationships.chapterId, chapters.id))
    .innerJoin(
      relMaxIdxSq,
      and(
        eq(pageRelationships.childPageId, relMaxIdxSq.childPageId),
        eq(chapters.idx, relMaxIdxSq.maxIdx),
      ),
    )
    .where(and(eq(pageRelationships.parentPageId, parentPageId), isNull(pages.deletedAt)));

  const activeChildPages = childPagesRaw.filter((r) => r.isActive);
  if (activeChildPages.length === 0) return [];

  const childPageIds = activeChildPages.map((r) => r.id);
  const [childTitleMap, hasChildrenSet] = await Promise.all([
    resolvePageTitlesAtIdx(childPageIds, cutoffIdx),
    resolveHasChildrenSet(childPageIds, cutoffIdx),
  ]);

  return activeChildPages.map((r) => ({
    id: r.id,
    name: r.name,
    slug: r.slug,
    title: childTitleMap.get(r.id) ?? r.name,
    hasChildren: hasChildrenSet.has(r.id),
  }));
}

/**
 * Returns all temporal title entries for a page (no cutoff), ordered by chapter idx.
 * Used by the edit-mode titles panel where admins can see and manage every title revision.
 *
 * @example
 * const entries = await fetchPageTitleEntries(homePage.id);
 * // [{ chapterId: 1, chapterLabel: "Volume 1 - Chapter 1", title: "Monkey D. Luffy" }]
 */
export async function fetchPageTitleEntries(pageId: number): Promise<PageTitleEntry[]> {
  const rows = await db
    .select({
      chapterId: pageTitles.chapterId,
      title: pageTitles.title,
      chapterDisplayName: chapters.displayName,
      volumeName: volumes.displayName,
    })
    .from(pageTitles)
    .innerJoin(chapters, eq(pageTitles.chapterId, chapters.id))
    .innerJoin(volumes, eq(chapters.volumeId, volumes.id))
    .where(eq(pageTitles.pageId, pageId))
    .orderBy(asc(chapters.idx));

  return rows.map((r) => ({
    chapterId: r.chapterId,
    chapterLabel: `${r.volumeName} - ${r.chapterDisplayName}`,
    title: r.title,
  }));
}

/**
 * Returns the temporal title entries for a page up to `cutoffIdx` AND the resolved
 * display title (the entry with the highest chapter idx ≤ cutoffIdx).
 *
 * `resolvedTitle` is `null` when no title entry exists at or before `cutoffIdx`;
 * callers fall back to `page.name` in that case.
 *
 * @example
 * const { entries, resolvedTitle } = await fetchPageTitleEntriesAtIdx(page.id, cutoffIdx);
 * const displayTitle = resolvedTitle ?? page.name;
 */
export async function fetchPageTitleEntriesAtIdx(
  pageId: number,
  cutoffIdx: number,
): Promise<PageTitlesAtIdx> {
  const titleMaxIdxSq = db
    .select({ maxIdx: max(chapters.idx).as("max_idx") })
    .from(pageTitles)
    .innerJoin(chapters, eq(pageTitles.chapterId, chapters.id))
    .where(and(eq(pageTitles.pageId, pageId), lte(chapters.idx, cutoffIdx)))
    .as("title_max_idx_sq");

  const [allPageTitleRows, [resolvedTitleRow]] = await Promise.all([
    db
      .select({
        chapterId: pageTitles.chapterId,
        title: pageTitles.title,
        chapterDisplayName: chapters.displayName,
        volumeName: volumes.displayName,
      })
      .from(pageTitles)
      .innerJoin(chapters, eq(pageTitles.chapterId, chapters.id))
      .innerJoin(volumes, eq(chapters.volumeId, volumes.id))
      .where(and(eq(pageTitles.pageId, pageId), lte(chapters.idx, cutoffIdx)))
      .orderBy(asc(chapters.idx)),
    db
      .select({ title: pageTitles.title })
      .from(pageTitles)
      .innerJoin(chapters, eq(pageTitles.chapterId, chapters.id))
      .innerJoin(titleMaxIdxSq, eq(chapters.idx, titleMaxIdxSq.maxIdx))
      .where(eq(pageTitles.pageId, pageId))
      .limit(1),
  ]);

  return {
    entries: allPageTitleRows.map((r) => ({
      chapterId: r.chapterId,
      chapterLabel: `${r.volumeName} - ${r.chapterDisplayName}`,
      title: r.title,
    })),
    resolvedTitle: resolvedTitleRow?.title ?? null,
  };
}

/** Maximum number of rows returned by `searchPagesByNameAtIdx`. */
export const SEARCH_RESULT_LIMIT = 20;

/**
 * Returns up to 20 visible, non-home pages whose canonical name — or any
 * infobox row marked `include_in_search` on the serial's templates — matches
 * `query` (case-insensitive substring) at `cutoffIdx`. Returns an empty array
 * when `query` is blank so callers can skip the network round-trip entirely.
 *
 * Spoiler rule: pages with an intro chapter index beyond `cutoffIdx` are excluded
 * (same filter as `fetchSearchablePagesAtIdx`).
 *
 * Infobox match: an EXISTS subquery checks whether the page has a non-deleted
 * infobox row whose label matches a template infobox section with
 * `include_in_search = true` (scoped to this serial), and whose latest revision
 * at or before `cutoffIdx` contains the query string.
 *
 * Does NOT resolve chapter-versioned titles — call `resolvePageTitlesAtIdx` on the
 * returned IDs and fall back to `name` when no title row exists.
 *
 * @example
 * const rawPages = await searchPagesByNameAtIdx(serial.id, cutoffIdx, "luffy");
 * const titleMap = await resolvePageTitlesAtIdx(rawPages.map(p => p.id), cutoffIdx);
 */
export async function searchPagesByNameAtIdx(
  serialId: number,
  cutoffIdx: number,
  query: string,
): Promise<PageStub[]> {
  const trimmed = query.trim();
  if (!trimmed) return [];

  // Subquery: does this page have a searchable infobox row matching the query?
  //
  // Matches when a non-deleted page infobox row's label equals the label of a
  // template infobox section with `include_in_search = true` (scoped to this
  // serial via the templates join), and the latest revision of that row at or
  // before cutoffIdx contains the query string.
  //
  // The correlated reference `pages.id` ties the subquery to the outer page row.
  // Using raw sql for the max-idx scalar subquery avoids a Drizzle table-alias
  // collision between the outer `chapters` join and the inner revision join.
  const escaped = trimmed.replace(/[\\%_]/g, '\\$&');
  const pattern = `%${escaped}%`;
  const infoboxSearchExists = exists(
    db
      .select({ one: pageInfoboxSections.id })
      .from(pageInfoboxSections)
      .innerJoin(
        templateInfoboxSections,
        and(
          eq(templateInfoboxSections.label, pageInfoboxSections.label),
          eq(templateInfoboxSections.includeInSearch, true),
        ),
      )
      .innerJoin(templates, and(
        eq(templates.id, templateInfoboxSections.templateId),
        eq(templates.serialId, serialId),
      ))
      .innerJoin(
        pageInfoboxRevisions,
        and(
          eq(pageInfoboxRevisions.pageId, pageInfoboxSections.pageId),
          eq(pageInfoboxRevisions.infoboxSectionId, pageInfoboxSections.id),
        ),
      )
      .innerJoin(
        chapters,
        and(
          eq(chapters.id, pageInfoboxRevisions.chapterId),
          lte(chapters.idx, cutoffIdx),
        ),
      )
      .where(
        and(
          eq(pageInfoboxSections.pageId, pages.id),
          isNull(pageInfoboxSections.deletedAt),
          ilike(pageInfoboxRevisions.content, pattern),
          // Only the latest revision at or before cutoffIdx for this infobox row.
          eq(
            chapters.idx,
            sql<number>`(
              SELECT MAX(c2.idx)
              FROM page_infobox_revisions pir2
              JOIN chapters c2 ON c2.id = pir2.chapter_id AND c2.idx <= ${cutoffIdx}
              WHERE pir2.page_id = ${pageInfoboxSections.pageId}
                AND pir2.infobox_section_id = ${pageInfoboxSections.id}
            )`,
          ),
        ),
      ),
  );

  return db
    .select({ id: pages.id, name: pages.name, slug: pages.slug })
    .from(pages)
    .leftJoin(chapters, eq(pages.introChapterId, chapters.id))
    .where(
      and(
        eq(pages.serialId, serialId),
        eq(pages.isHomePage, false),
        isNull(pages.deletedAt),
        or(isNull(pages.introChapterId), lte(chapters.idx, cutoffIdx)),
        or(ilike(pages.name, pattern), infoboxSearchExists),
      ),
    )
    .orderBy(asc(pages.name))
    .limit(SEARCH_RESULT_LIMIT);
}

/**
 * Returns all pages introduced in a specific chapter, ordered by name.
 * Used by the chapter detail page to render the "Introduced in this chapter" list.
 *
 * Title resolution is NOT performed here — call `resolvePageTitlesAtIdx` on the
 * returned IDs to apply chapter-versioned display names.
 *
 * @example
 * const introduced = await fetchPagesIntroducedInChapter(serial.id, chapter.id);
 * const titleMap = await resolvePageTitlesAtIdx(introduced.map(p => p.id), chapter.idx);
 */
export async function fetchPagesIntroducedInChapter(
  serialId: number,
  chapterId: number,
): Promise<{ id: number; name: string; slug: string }[]> {
  return db
    .select({ id: pages.id, name: pages.name, slug: pages.slug })
    .from(pages)
    .where(and(eq(pages.serialId, serialId), eq(pages.introChapterId, chapterId)))
    .orderBy(pages.name);
}

/**
 * Like `fetchPageAtSlug` but excludes soft-deleted pages. Use this where a
 * deleted page should be treated as non-existent (e.g. wiki-link hover previews).
 * For page rendering, use `fetchPageAtSlug` so the caller can show a "deleted"
 * notice instead of a 404.
 *
 * @example
 * const page = await fetchLivePageAtSlug(serial.id, "luffy");
 * if (!page) return null; // no preview for deleted or missing pages
 */
export async function fetchLivePageAtSlug(
  serialId: number,
  slug: string,
): Promise<WikiPageRow | undefined> {
  const [row] = await db
    .select()
    .from(pages)
    .where(and(eq(pages.serialId, serialId), eq(pages.slug, slug), isNull(pages.deletedAt)))
    .limit(1);
  return row;
}

/**
 * Returns all page stubs (id, name, slug) for a serial without any chapter cutoff
 * filter. Used to build the complete slug→title map that `resolvePageTitlesAtIdx`
 * needs when rendering wiki-link hover previews.
 *
 * @example
 * const stubs = await fetchAllSerialPageStubs(serial.id);
 * const titleByPageId = await resolvePageTitlesAtIdx(stubs.map(p => p.id), cutoffIdx);
 * const slugTitleMap = Object.fromEntries(stubs.map(p => [p.slug, titleByPageId.get(p.id) ?? p.name]));
 */
export async function fetchAllSerialPageStubs(serialId: number): Promise<PageStub[]> {
  return db
    .select({ id: pages.id, name: pages.name, slug: pages.slug })
    .from(pages)
    .where(eq(pages.serialId, serialId));
}

/**
 * Returns the content of the first active section for `pageId` at `cutoffIdx`,
 * or an empty string when no section/revision exists. Used by wiki-link hover
 * previews to show a short excerpt without fetching all sections.
 *
 * @example
 * const preview = await fetchFirstSectionAtIdx(page.id, cutoffIdx);
 * // "" when the page has no sections or no revisions at the cutoff
 */
export async function fetchFirstSectionAtIdx(
  pageId: number,
  cutoffIdx: number,
): Promise<string> {
  const secMaxIdxSq = sectionMaxIdxSq(pageId, cutoffIdx);
  const [firstSection] = await db
    .select({ content: pageSectionRevisions.content })
    .from(pageSectionRevisions)
    .innerJoin(chapters, eq(pageSectionRevisions.chapterId, chapters.id))
    .innerJoin(pageSections, eq(pageSectionRevisions.sectionId, pageSections.id))
    .innerJoin(
      secMaxIdxSq,
      and(
        eq(pageSectionRevisions.sectionId, secMaxIdxSq.sectionId),
        eq(chapters.idx, secMaxIdxSq.maxIdx),
      ),
    )
    .where(and(eq(pageSectionRevisions.pageId, pageId), isNull(pageSections.deletedAt)))
    .orderBy(asc(pageSections.displayOrder))
    .limit(1);
  return firstSection?.content ?? "";
}

/**
 * Fetches the `serialId` for a page by its primary key. Returns `null` when the
 * page does not exist. Used by auth guards that receive only a `pageId`.
 *
 * @example
 * const serialId = await fetchPageSerialId(pageId);
 * if (!serialId) throw new Error("Page not found.");
 */
export async function fetchPageSerialId(pageId: number): Promise<number | null> {
  const [row] = await db
    .select({ serialId: pages.serialId })
    .from(pages)
    .where(eq(pages.id, pageId))
    .limit(1);
  return row?.serialId ?? null;
}

/**
 * Returns visible, non-home pages in a serial at `cutoffIdx`, ordered by name.
 * Excludes the home page and soft-deleted pages. Used by the wiki-link search
 * autocomplete, which lists pages a user can navigate to.
 *
 * Does NOT resolve chapter-versioned titles — call `resolvePageTitlesAtIdx` on
 * the returned IDs and fall back to `name` when no title row exists.
 *
 * @example
 * const rawPages = await fetchSearchablePagesAtIdx(serial.id, cutoffIdx);
 * const titleMap = await resolvePageTitlesAtIdx(rawPages.map(p => p.id), cutoffIdx);
 */
export async function fetchSearchablePagesAtIdx(
  serialId: number,
  cutoffIdx: number,
): Promise<PageStub[]> {
  return db
    .select({ id: pages.id, name: pages.name, slug: pages.slug })
    .from(pages)
    .leftJoin(chapters, eq(pages.introChapterId, chapters.id))
    .where(
      and(
        eq(pages.serialId, serialId),
        eq(pages.isHomePage, false),
        isNull(pages.deletedAt),
        or(isNull(pages.introChapterId), lte(chapters.idx, cutoffIdx)),
      ),
    )
    .orderBy(asc(pages.name));
}
