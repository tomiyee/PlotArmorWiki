import { notFound, redirect } from "next/navigation";
import { cookies } from "next/headers";
import Link from "next/link";
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
import { and, asc, eq, inArray, isNull, lte, max, or } from "drizzle-orm";
import { Text } from "@/components/ui/text";
import { Box } from "@/components/ui/box";
import { PageContainer } from "@/components/ui/page-container";
import { PageEditor } from "./PageEditor";

interface Props {
  params: Promise<{ serial: string; page: string }>;
}

/**
 * Reads the user's chapter cutoff for a given serial from the progress
 * cookie set by <ChapterSelector>. Returns both the chapter id (DB PK)
 * and idx (global ordering integer) so callers can pass the id to
 * PageEditor as the default "Writing as of" selection.
 *
 * Falls back to idx=0 / id=null when no cookie is present — the subquery
 * finds no revision with idx ≤ 0, so all sections render empty.
 *
 * @example
 * const { cutoffIdx, readingChapterId } = await getChapterCutoff(serial.id);
 */
async function getChapterCutoff(
  serialId: number,
): Promise<{ cutoffIdx: number; readingChapterId: number | null }> {
  const cookieStore = await cookies();
  const raw = cookieStore.get(`plotarmor_chapter_${serialId}`)?.value;
  if (!raw) return { cutoffIdx: 0, readingChapterId: null };

  const chapterId = parseInt(raw, 10);
  if (isNaN(chapterId)) return { cutoffIdx: 0, readingChapterId: null };

  const [row] = await db
    .select({ idx: chapters.idx })
    .from(chapters)
    .where(eq(chapters.id, chapterId))
    .limit(1);

  if (!row) return { cutoffIdx: 0, readingChapterId: null };
  return { cutoffIdx: row.idx, readingChapterId: chapterId };
}

export default async function PageView({ params }: Props) {
  const {
    serial: serialSlug,
    page: pageParam,
  } = await params;

  const decodedPageSlug = decodeURIComponent(pageParam);

  const [serial] = await db
    .select()
    .from(serials)
    .where(eq(serials.slug, serialSlug))
    .limit(1);

  if (!serial) {
    notFound();
  }

  const [chapterCutoff, volumeList, chapterList] = await Promise.all([
    getChapterCutoff(serial.id),
    db
      .select({ id: volumes.id, displayName: volumes.displayName })
      .from(volumes)
      .where(eq(volumes.serialId, serial.id))
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
      .where(eq(volumes.serialId, serial.id))
      .orderBy(asc(chapters.idx)),
  ]);
  const { cutoffIdx, readingChapterId } = chapterCutoff;

  // Build a structured chapter list for the chapter selector in edit mode.
  const volumeNameById = new Map(volumeList.map((v) => [v.id, v.displayName]));
  const allChapters = chapterList.map((c) => ({
    id: c.id,
    displayName: c.displayName,
    idx: c.idx,
    volumeName: volumeNameById.get(c.volumeId) ?? "",
  }));

  // Head chapter is the one with the highest idx (last in the ordered list).
  const headChapterId = chapterList.at(-1)?.id ?? null;

  // Wiki pages visible at the reader's cutoff. Pages with null introChapterId
  // (the home page) are always included since they predate any chapters.
  const rawWikiPages = await db
    .select({ name: pages.name })
    .from(pages)
    .leftJoin(chapters, eq(pages.introChapterId, chapters.id))
    .where(
      and(
        eq(pages.serialId, serial.id),
        or(isNull(pages.introChapterId), lte(chapters.idx, cutoffIdx)),
      ),
    )
    .orderBy(asc(pages.name));
  const wikiPages = rawWikiPages.map((p) => ({ name: p.name }));

  const [page] = await db
    .select()
    .from(pages)
    .where(and(eq(pages.serialId, serial.id), eq(pages.slug, decodedPageSlug)))
    .limit(1);

  if (!page) {
    notFound();
  }

  // The home page is canonical at /{serial}; visiting /{serial}/home redirects there.
  if (page.isHomePage) {
    redirect(`/${serialSlug}`);
  }

  const introChapter = page.introChapterId
    ? await db
        .select({ displayName: chapters.displayName, idx: chapters.idx })
        .from(chapters)
        .where(eq(chapters.id, page.introChapterId))
        .limit(1)
        .then((rows) => rows[0] ?? null)
    : null;

  if (introChapter && introChapter.idx > cutoffIdx) {
    return (
      <main>
        <PageContainer>
          <Box col className="gap-6">
            <Text muted className="text-sm">
              <Link href={`/${serialSlug}`} className="hover:underline">
                {serial.title}
              </Link>
            </Text>
            <Text variant="body">
              This page is introduced in {serial.chapterType}{" "}
              {introChapter.displayName}. This page is hidden to prevent
              spoilers.
            </Text>
          </Box>
        </PageContainer>
      </main>
    );
  }

  // ── Section content (chapter-versioned) ───────────────────────────────────
  const sectionMaxIdxSq = db
    .select({
      sectionId: pageSectionRevisions.sectionId,
      maxIdx: max(chapters.idx).as("max_idx"),
    })
    .from(pageSectionRevisions)
    .innerJoin(chapters, eq(pageSectionRevisions.chapterId, chapters.id))
    .where(
      and(
        eq(pageSectionRevisions.pageId, page.id),
        lte(chapters.idx, cutoffIdx),
      ),
    )
    .groupBy(pageSectionRevisions.sectionId)
    .as("section_max_idx_sq");

  const [activeSections, sectionVersions] = await Promise.all([
    db
      .select({ id: pageSections.id, name: pageSections.name })
      .from(pageSections)
      .where(
        and(
          eq(pageSections.pageId, page.id),
          isNull(pageSections.deletedAt),
        ),
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
      .where(eq(pageSectionRevisions.pageId, page.id)),
  ]);

  const versionBySectionId = new Map(
    sectionVersions.map((v) => [v.sectionId, { content: v.content, chapterIdx: v.chapterIdx }]),
  );

  const sections = activeSections.map((s) => {
    const v = versionBySectionId.get(s.id);
    return {
      id: s.id,
      name: s.name,
      content: v?.content ?? "",
      lastUpdatedChapterIdx: v?.chapterIdx ?? null,
    };
  });

  // ── Infobox data ───────────────────────────────────────────────────────────
  const activeInfoboxRows = await db
    .select({ id: pageInfoboxSections.id, label: pageInfoboxSections.label })
    .from(pageInfoboxSections)
    .where(
      and(
        eq(pageInfoboxSections.pageId, page.id),
        isNull(pageInfoboxSections.deletedAt),
      ),
    )
    .orderBy(asc(pageInfoboxSections.displayOrder));

  let floaterImageUrl: string | null | undefined = undefined;
  let floaterRows: { id: number; label: string; content: string }[] = [];

  if (activeInfoboxRows.length > 0) {
    const floaterMaxIdxSq = db
      .select({ maxIdx: max(chapters.idx).as("max_idx") })
      .from(pageInfoboxImageRevisions)
      .innerJoin(chapters, eq(pageInfoboxImageRevisions.chapterId, chapters.id))
      .where(
        and(
          eq(pageInfoboxImageRevisions.pageId, page.id),
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
          eq(pageInfoboxRevisions.pageId, page.id),
          lte(chapters.idx, cutoffIdx),
        ),
      )
      .groupBy(pageInfoboxRevisions.infoboxSectionId)
      .as("infobox_row_max_idx_sq");

    const [[floaterVersion], infoboxRowVersions] = await Promise.all([
      db
        .select({ imageUrl: pageInfoboxImageRevisions.imageUrl })
        .from(pageInfoboxImageRevisions)
        .innerJoin(chapters, eq(pageInfoboxImageRevisions.chapterId, chapters.id))
        .innerJoin(floaterMaxIdxSq, eq(chapters.idx, floaterMaxIdxSq.maxIdx))
        .where(eq(pageInfoboxImageRevisions.pageId, page.id))
        .limit(1),
      db
        .select({
          infoboxSectionId: pageInfoboxRevisions.infoboxSectionId,
          content: pageInfoboxRevisions.content,
        })
        .from(pageInfoboxRevisions)
        .innerJoin(
          chapters,
          eq(pageInfoboxRevisions.chapterId, chapters.id),
        )
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
        .where(eq(pageInfoboxRevisions.pageId, page.id)),
    ]);

    const rowContentMap = new Map(
      infoboxRowVersions.map((v) => [v.infoboxSectionId, v.content]),
    );

    floaterImageUrl = floaterVersion?.imageUrl ?? null;
    floaterRows = activeInfoboxRows.map((r) => ({
      id: r.id,
      label: r.label,
      content: rowContentMap.get(r.id) ?? "",
    }));
  }

  // ── Child pages (active at the user's cutoff) ──────────────────────────────
  // Find the latest page_relationships row per (parent, child) pair where
  // chapter_idx ≤ cutoff, and keep only those where is_active = true.
  // Using a subquery-join (same max-idx pattern as section content).
  const relMaxIdxSq = db
    .select({
      childPageId: pageRelationships.childPageId,
      maxIdx: max(chapters.idx).as("max_idx"),
    })
    .from(pageRelationships)
    .innerJoin(chapters, eq(pageRelationships.chapterId, chapters.id))
    .where(
      and(
        eq(pageRelationships.parentPageId, page.id),
        lte(chapters.idx, cutoffIdx),
      ),
    )
    .groupBy(pageRelationships.childPageId)
    .as("rel_max_idx_sq");

  const childPagesRaw = await db
    .select({ id: pages.id, name: pages.name, slug: pages.slug, isActive: pageRelationships.isActive })
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
    .where(eq(pageRelationships.parentPageId, page.id));

  const activeChildPages = childPagesRaw.filter((r) => r.isActive);

  // Resolve temporal titles for each active child page at the reader's cutoff.
  const childPageIds = activeChildPages.map((r) => r.id);
  let childTitleMap = new Map<number, string>();
  if (childPageIds.length > 0) {
    const childTitleMaxIdxSq = db
      .select({
        pageId: pageTitles.pageId,
        maxIdx: max(chapters.idx).as("max_idx"),
      })
      .from(pageTitles)
      .innerJoin(chapters, eq(pageTitles.chapterId, chapters.id))
      .where(and(inArray(pageTitles.pageId, childPageIds), lte(chapters.idx, cutoffIdx)))
      .groupBy(pageTitles.pageId)
      .as("child_title_max_idx_sq");

    const childTitleRows = await db
      .select({ pageId: pageTitles.pageId, title: pageTitles.title })
      .from(pageTitles)
      .innerJoin(chapters, eq(pageTitles.chapterId, chapters.id))
      .innerJoin(
        childTitleMaxIdxSq,
        and(
          eq(pageTitles.pageId, childTitleMaxIdxSq.pageId),
          eq(chapters.idx, childTitleMaxIdxSq.maxIdx),
        ),
      );

    childTitleMap = new Map(childTitleRows.map((r) => [r.pageId, r.title]));
  }

  const childPages = activeChildPages.map((r) => ({
    id: r.id,
    name: r.name,
    slug: r.slug,
    title: childTitleMap.get(r.id) ?? r.name,
  }));

  // ── Temporal title resolution ──────────────────────────────────────────────
  // Resolve the title the reader should see: the page_titles row with the
  // highest chapters.idx ≤ cutoffIdx (same max-idx read pattern as sections).
  // Falls back to pages.name when no page_titles rows exist yet.
  const titleMaxIdxSq = db
    .select({ maxIdx: max(chapters.idx).as("max_idx") })
    .from(pageTitles)
    .innerJoin(chapters, eq(pageTitles.chapterId, chapters.id))
    .where(
      and(eq(pageTitles.pageId, page.id), lte(chapters.idx, cutoffIdx)),
    )
    .as("title_max_idx_sq");

  const [allPageTitleRows, [resolvedTitleRow]] = await Promise.all([
    // All title rows for the edit-mode panel (with chapter labels for display).
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
      .where(and(eq(pageTitles.pageId, page.id), lte(chapters.idx, cutoffIdx)))
      .orderBy(asc(chapters.idx)),
    // Resolved title at the reader's cutoff.
    db
      .select({ title: pageTitles.title })
      .from(pageTitles)
      .innerJoin(chapters, eq(pageTitles.chapterId, chapters.id))
      .innerJoin(titleMaxIdxSq, eq(chapters.idx, titleMaxIdxSq.maxIdx))
      .where(eq(pageTitles.pageId, page.id))
      .limit(1),
  ]);

  const resolvedTitle = resolvedTitleRow?.title ?? page.name;

  const pageTitleEntries = allPageTitleRows.map((r) => ({
    chapterId: r.chapterId,
    chapterLabel: `${r.volumeName} — ${r.chapterDisplayName}`,
    title: r.title,
  }));

  return (
    <main>
      <PageContainer>
        <Box col className="gap-6">
          {/* Breadcrumb */}
          <Text muted className="text-sm">
            <Link href={`/${serialSlug}`} className="hover:underline">
              {serial.title}
            </Link>
          </Text>

          <Box col className="gap-2">
            <Text variant="h1">{resolvedTitle}</Text>
            {introChapter && (
              <Text muted className="text-sm">
                Introduced in {serial.chapterType} {introChapter.displayName}
              </Text>
            )}
          </Box>

          <PageEditor
            serialSlug={serialSlug}
            pageName={page.name}
            pageSlug={decodedPageSlug}
            pageId={page.id}
            pageTitleEntries={pageTitleEntries}
            summaryContent=""
            summaryLastUpdatedChapterIdx={null}
            sections={sections}
            floaterImageUrl={floaterImageUrl}
            floaterRows={floaterRows}
            allChapters={allChapters}
            headChapterId={headChapterId}
            readingChapterId={readingChapterId}
            wikiPages={wikiPages}
            introChapterIdx={introChapter?.idx ?? null}
            childPages={childPages}
          />
        </Box>
      </PageContainer>
    </main>
  );
}
