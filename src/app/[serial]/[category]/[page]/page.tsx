import { notFound } from "next/navigation";
import { cookies } from "next/headers";
import Link from "next/link";
import { db } from "@/db/index";
import {
  serials,
  pageCategories,
  pages,
  chapters,
  volumes,
  categorySections,
  pageSectionVersions,
  pageSummaries,
  categoryFloaterRows,
  pageFloaterVersions,
  pageFloaterRowVersions,
} from "@/db/schema";
import { and, asc, eq, isNull, lte, max } from "drizzle-orm";
import { Text } from "@/components/ui/text";
import { Box } from "@/components/ui/box";
import { PageContainer } from "@/components/ui/page-container";
import { PageEditor } from "./PageEditor";

interface Props {
  params: Promise<{ serial: string; category: string; page: string }>;
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
    category: categorySlug,
    page: pageSlug,
  } = await params;

  const categoryName = decodeURIComponent(categorySlug);
  const pageName = decodeURIComponent(pageSlug);

  const [serial] = await db
    .select()
    .from(serials)
    .where(eq(serials.slug, serialSlug))
    .limit(1);

  if (!serial) {
    notFound();
  }

  const [[category], chapterCutoff, volumeList, chapterList] = await Promise.all([
    db
      .select()
      .from(pageCategories)
      .where(
        and(
          eq(pageCategories.serialId, serial.id),
          eq(pageCategories.name, categoryName),
        ),
      )
      .limit(1),
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

  if (!category) {
    notFound();
  }

  // Build a structured chapter list for the chapter selector in edit mode.
  // Each volume becomes an optgroup with its chapters as options.
  const volumeNameById = new Map(volumeList.map((v) => [v.id, v.displayName]));
  const allChapters = chapterList.map((c) => ({
    id: c.id,
    displayName: c.displayName,
    idx: c.idx,
    volumeName: volumeNameById.get(c.volumeId) ?? "",
  }));

  // Head chapter is the one with the highest idx (last in the ordered list).
  const headChapterId = chapterList.at(-1)?.id ?? null;

  // Wiki pages visible to the reader at their current chapter cutoff.
  // Chapter-cutoff filter mirrors the category index page so users can only
  // autocomplete to pages they can already see — no accidental spoiler leaks.
  const wikiPages = await db
    .select({ category: pageCategories.name, name: pages.name })
    .from(pages)
    .innerJoin(pageCategories, eq(pages.categoryId, pageCategories.id))
    .innerJoin(chapters, eq(pages.introChapterId, chapters.id))
    .where(and(eq(pageCategories.serialId, serial.id), lte(chapters.idx, cutoffIdx)))
    .orderBy(asc(pageCategories.name), asc(pages.name));

  const [page] = await db
    .select()
    .from(pages)
    .where(and(eq(pages.categoryId, category.id), eq(pages.name, pageName)))
    .limit(1);

  if (!page) {
    notFound();
  }

  const [introChapter] = await db
    .select({ displayName: chapters.displayName, idx: chapters.idx })
    .from(chapters)
    .where(eq(chapters.id, page.introChapterId))
    .limit(1);

  if (introChapter && introChapter.idx > cutoffIdx) {
    return (
      <main>
        <PageContainer>
          <Box col className="gap-6">
            <Text muted className="text-sm">
              <Link href={`/${serialSlug}`} className="hover:underline">
                {serial.title}
              </Link>
              {" / "}
              <Link
                href={`/${serialSlug}/${encodeURIComponent(categoryName)}`}
                className="hover:underline"
              >
                {categoryName}
              </Link>
            </Text>
            <Text variant="body">
              This {category.name} is introduced in {serial.chapterType}{" "}
              {introChapter.displayName}. This page is hidden to prevent
              spoilers.
            </Text>
          </Box>
        </PageContainer>
      </main>
    );
  }

  // ── Summary content (chapter-versioned, always present) ───────────────────
  const summaryMaxIdxSq = db
    .select({ maxIdx: max(chapters.idx).as("max_idx") })
    .from(pageSummaries)
    .innerJoin(chapters, eq(pageSummaries.chapterId, chapters.id))
    .where(
      and(
        eq(pageSummaries.pageId, page.id),
        lte(chapters.idx, cutoffIdx),
      ),
    )
    .as("summary_max_idx_sq");

  const sectionMaxIdxSq = db
    .select({
      sectionId: pageSectionVersions.sectionId,
      maxIdx: max(chapters.idx).as("max_idx"),
    })
    .from(pageSectionVersions)
    .innerJoin(chapters, eq(pageSectionVersions.chapterId, chapters.id))
    .where(
      and(
        eq(pageSectionVersions.pageId, page.id),
        lte(chapters.idx, cutoffIdx),
      ),
    )
    .groupBy(pageSectionVersions.sectionId)
    .as("section_max_idx_sq");

  const [summaryVersions, activeSections, sectionVersions] = await Promise.all([
    db
      .select({ content: pageSummaries.content, chapterIdx: chapters.idx })
      .from(pageSummaries)
      .innerJoin(chapters, eq(pageSummaries.chapterId, chapters.id))
      .innerJoin(summaryMaxIdxSq, eq(chapters.idx, summaryMaxIdxSq.maxIdx))
      .where(eq(pageSummaries.pageId, page.id))
      .limit(1),
    db
      .select({ id: categorySections.id, name: categorySections.name })
      .from(categorySections)
      .where(
        and(
          eq(categorySections.categoryId, category.id),
          isNull(categorySections.deletedAt),
        ),
      )
      .orderBy(asc(categorySections.displayOrder)),
    db
      .select({
        sectionId: pageSectionVersions.sectionId,
        content: pageSectionVersions.content,
        chapterIdx: chapters.idx,
      })
      .from(pageSectionVersions)
      .innerJoin(chapters, eq(pageSectionVersions.chapterId, chapters.id))
      .innerJoin(
        sectionMaxIdxSq,
        and(
          eq(pageSectionVersions.sectionId, sectionMaxIdxSq.sectionId),
          eq(chapters.idx, sectionMaxIdxSq.maxIdx),
        ),
      )
      .where(eq(pageSectionVersions.pageId, page.id)),
  ]);

  const summaryContent = summaryVersions[0]?.content ?? "";
  const summaryLastUpdatedChapterIdx = summaryVersions[0]?.chapterIdx ?? null;
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

  // ── Floater data (only when category.hasFloater) ───────────────────────────
  let floaterImageUrl: string | null | undefined = undefined;
  let floaterRows: { id: number; label: string; content: string }[] = [];

  if (category.hasFloater) {
    const floaterMaxIdxSq = db
      .select({ maxIdx: max(chapters.idx).as("max_idx") })
      .from(pageFloaterVersions)
      .innerJoin(chapters, eq(pageFloaterVersions.chapterId, chapters.id))
      .where(
        and(
          eq(pageFloaterVersions.pageId, page.id),
          lte(chapters.idx, cutoffIdx),
        ),
      )
      .as("floater_max_idx_sq");

    const floaterRowMaxIdxSq = db
      .select({
        floaterRowId: pageFloaterRowVersions.floaterRowId,
        maxIdx: max(chapters.idx).as("max_idx"),
      })
      .from(pageFloaterRowVersions)
      .innerJoin(chapters, eq(pageFloaterRowVersions.chapterId, chapters.id))
      .where(
        and(
          eq(pageFloaterRowVersions.pageId, page.id),
          lte(chapters.idx, cutoffIdx),
        ),
      )
      .groupBy(pageFloaterRowVersions.floaterRowId)
      .as("floater_row_max_idx_sq");

    const [[floaterVersion], fetchedRows, floaterRowVersions] =
      await Promise.all([
        db
          .select({ imageUrl: pageFloaterVersions.imageUrl })
          .from(pageFloaterVersions)
          .innerJoin(chapters, eq(pageFloaterVersions.chapterId, chapters.id))
          .innerJoin(floaterMaxIdxSq, eq(chapters.idx, floaterMaxIdxSq.maxIdx))
          .where(eq(pageFloaterVersions.pageId, page.id))
          .limit(1),
        db
          .select({ id: categoryFloaterRows.id, label: categoryFloaterRows.label })
          .from(categoryFloaterRows)
          .where(
            and(
              eq(categoryFloaterRows.categoryId, category.id),
              isNull(categoryFloaterRows.deletedAt),
            ),
          )
          .orderBy(asc(categoryFloaterRows.displayOrder)),
        db
          .select({
            floaterRowId: pageFloaterRowVersions.floaterRowId,
            content: pageFloaterRowVersions.content,
          })
          .from(pageFloaterRowVersions)
          .innerJoin(
            chapters,
            eq(pageFloaterRowVersions.chapterId, chapters.id),
          )
          .innerJoin(
            floaterRowMaxIdxSq,
            and(
              eq(
                pageFloaterRowVersions.floaterRowId,
                floaterRowMaxIdxSq.floaterRowId,
              ),
              eq(chapters.idx, floaterRowMaxIdxSq.maxIdx),
            ),
          )
          .where(eq(pageFloaterRowVersions.pageId, page.id)),
      ]);

    const rowContentMap = new Map(
      floaterRowVersions.map((v) => [v.floaterRowId, v.content]),
    );

    floaterImageUrl = floaterVersion?.imageUrl ?? null;
    floaterRows = fetchedRows.map((r) => ({
      id: r.id,
      label: r.label,
      content: rowContentMap.get(r.id) ?? "",
    }));
  }

  return (
    <main>
      <PageContainer>
        <Box col className="gap-6">
          {/* Breadcrumb */}
          <Text muted className="text-sm">
            <Link href={`/${serialSlug}`} className="hover:underline">
              {serial.title}
            </Link>
            {" / "}
            <Link
              href={`/${serialSlug}/${encodeURIComponent(categoryName)}`}
              className="hover:underline"
            >
              {categoryName}
            </Link>
          </Text>

          <Box col className="gap-2">
            <Text variant="h1">{page.name}</Text>
            {introChapter && (
              <Text muted className="text-sm">
                Introduced in {serial.chapterType} {introChapter.displayName}
              </Text>
            )}
          </Box>

          <PageEditor
            serialSlug={serialSlug}
            categoryName={categoryName}
            pageName={pageName}
            summaryContent={summaryContent}
            summaryLastUpdatedChapterIdx={summaryLastUpdatedChapterIdx}
            sections={sections}
            floaterImageUrl={floaterImageUrl}
            floaterRows={floaterRows}
            allChapters={allChapters}
            headChapterId={headChapterId}
            readingChapterId={readingChapterId}
            wikiPages={wikiPages}
          />
        </Box>
      </PageContainer>
    </main>
  );
}
