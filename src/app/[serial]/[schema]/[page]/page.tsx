import { notFound } from 'next/navigation';
import { cookies } from 'next/headers';
import Link from 'next/link';
import ReactMarkdown from 'react-markdown';
import { db } from '@/db/index';
import {
  serials,
  pageSchemas,
  pages,
  chapters,
  schemaSections,
  pageSectionVersions,
  schemaFloaterRows,
  pageFloaterVersions,
  pageFloaterRowVersions,
} from '@/db/schema';
import { and, asc, eq, isNull, lte, max } from 'drizzle-orm';
import { Text } from '@/components/ui/text';
import { Box } from '@/components/ui/box';

interface Props {
  params: Promise<{ serial: string; schema: string; page: string }>;
}

/**
 * Reads the user's chapter cutoff idx for a given serial from the
 * progress cookie set by <ChapterSelector>. Returns the chapter idx
 * (a global, serial-level integer) used as the upper bound when finding
 * the latest revision per section.
 *
 * Falls back to 0 when no cookie is present — the subquery finds no
 * revision with idx ≤ 0, so all sections render empty.
 *
 * @example
 * const cutoffIdx = await getChapterCutoffIdx(serial.id);
 */
async function getChapterCutoffIdx(serialId: number): Promise<number> {
  const cookieStore = await cookies();
  const raw = cookieStore.get(`plotarmor_chapter_${serialId}`)?.value;
  if (!raw) return 0;

  const chapterId = parseInt(raw, 10);
  if (isNaN(chapterId)) return 0;

  const [row] = await db
    .select({ idx: chapters.idx })
    .from(chapters)
    .where(eq(chapters.id, chapterId))
    .limit(1);

  return row?.idx ?? 0;
}

export default async function PageView({ params }: Props) {
  const { serial: serialSlug, schema: schemaSlug, page: pageSlug } = await params;

  const schemaName = decodeURIComponent(schemaSlug);
  const pageName = decodeURIComponent(pageSlug);

  const [serial] = await db
    .select()
    .from(serials)
    .where(eq(serials.slug, serialSlug))
    .limit(1);

  if (!serial) {
    notFound();
  }

  const [[schema], cutoffIdx] = await Promise.all([
    db
      .select()
      .from(pageSchemas)
      .where(and(eq(pageSchemas.serialId, serial.id), eq(pageSchemas.name, schemaName)))
      .limit(1),
    getChapterCutoffIdx(serial.id),
  ]);

  if (!schema) {
    notFound();
  }

  const [page] = await db
    .select()
    .from(pages)
    .where(and(eq(pages.schemaId, schema.id), eq(pages.name, pageName)))
    .limit(1);

  if (!page) {
    notFound();
  }

  const sectionMaxIdxSq = db
    .select({
      sectionId: pageSectionVersions.sectionId,
      maxIdx: max(chapters.idx).as('max_idx'),
    })
    .from(pageSectionVersions)
    .innerJoin(chapters, eq(pageSectionVersions.chapterId, chapters.id))
    .where(and(eq(pageSectionVersions.pageId, page.id), lte(chapters.idx, cutoffIdx)))
    .groupBy(pageSectionVersions.sectionId)
    .as('section_max_idx_sq');

  const [[introChapter], activeSections, sectionVersions] = await Promise.all([
    db
      .select({ displayName: chapters.displayName })
      .from(chapters)
      .where(eq(chapters.id, page.introChapterId))
      .limit(1),
    db
      .select({ id: schemaSections.id, name: schemaSections.name })
      .from(schemaSections)
      .where(and(eq(schemaSections.schemaId, schema.id), isNull(schemaSections.deletedAt)))
      .orderBy(asc(schemaSections.displayOrder)),
    db
      .select({
        sectionId: pageSectionVersions.sectionId,
        content: pageSectionVersions.content,
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

  const contentBySectionId = new Map(
    sectionVersions.map((v) => [v.sectionId, v.content]),
  );

  let floaterImageUrl: string | null = null;
  let activeFloaterRows: { id: number; label: string }[] = [];
  let floaterRowContent: Map<number, string> = new Map();

  if (schema.hasFloater) {
    const floaterMaxIdxSq = db
      .select({ maxIdx: max(chapters.idx).as('max_idx') })
      .from(pageFloaterVersions)
      .innerJoin(chapters, eq(pageFloaterVersions.chapterId, chapters.id))
      .where(and(eq(pageFloaterVersions.pageId, page.id), lte(chapters.idx, cutoffIdx)))
      .as('floater_max_idx_sq');

    const floaterRowMaxIdxSq = db
      .select({
        floaterRowId: pageFloaterRowVersions.floaterRowId,
        maxIdx: max(chapters.idx).as('max_idx'),
      })
      .from(pageFloaterRowVersions)
      .innerJoin(chapters, eq(pageFloaterRowVersions.chapterId, chapters.id))
      .where(and(eq(pageFloaterRowVersions.pageId, page.id), lte(chapters.idx, cutoffIdx)))
      .groupBy(pageFloaterRowVersions.floaterRowId)
      .as('floater_row_max_idx_sq');

    const [[floaterVersion], fetchedRows, floaterRowVersions] = await Promise.all([
      db
        .select({ imageUrl: pageFloaterVersions.imageUrl })
        .from(pageFloaterVersions)
        .innerJoin(chapters, eq(pageFloaterVersions.chapterId, chapters.id))
        .innerJoin(floaterMaxIdxSq, eq(chapters.idx, floaterMaxIdxSq.maxIdx))
        .where(eq(pageFloaterVersions.pageId, page.id))
        .limit(1),
      db
        .select({ id: schemaFloaterRows.id, label: schemaFloaterRows.label })
        .from(schemaFloaterRows)
        .where(
          and(
            eq(schemaFloaterRows.schemaId, schema.id),
            isNull(schemaFloaterRows.deletedAt),
          ),
        )
        .orderBy(asc(schemaFloaterRows.displayOrder)),
      db
        .select({
          floaterRowId: pageFloaterRowVersions.floaterRowId,
          content: pageFloaterRowVersions.content,
        })
        .from(pageFloaterRowVersions)
        .innerJoin(chapters, eq(pageFloaterRowVersions.chapterId, chapters.id))
        .innerJoin(
          floaterRowMaxIdxSq,
          and(
            eq(pageFloaterRowVersions.floaterRowId, floaterRowMaxIdxSq.floaterRowId),
            eq(chapters.idx, floaterRowMaxIdxSq.maxIdx),
          ),
        )
        .where(eq(pageFloaterRowVersions.pageId, page.id)),
    ]);

    floaterImageUrl = floaterVersion?.imageUrl ?? null;
    activeFloaterRows = fetchedRows;
    floaterRowContent = new Map(
      floaterRowVersions.map((v) => [v.floaterRowId, v.content]),
    );
  }

  const hasFloaterContent = floaterImageUrl !== null || activeFloaterRows.length > 0;

  return (
    <main className="px-6 py-16">
      <div
        className={
          hasFloaterContent
            ? 'mx-auto max-w-5xl grid grid-cols-[1fr_280px] gap-8 items-start'
            : 'mx-auto max-w-2xl'
        }
      >
        <Box col className="gap-6">
          {/* Breadcrumb */}
          <Text muted className="text-sm">
            <Link href={`/${serialSlug}`} className="hover:underline">
              {serial.title}
            </Link>
            {' / '}
            <Link
              href={`/${serialSlug}/${encodeURIComponent(schemaName)}`}
              className="hover:underline"
            >
              {schemaName}
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

          {/* Sections */}
          {activeSections.map((section) => {
            const content = contentBySectionId.get(section.id) ?? '';
            return (
              <Box key={section.id} col className="gap-2">
                <Text variant="h2">{section.name}</Text>
                {content ? (
                  <div className="prose prose-gray max-w-none text-gray-700">
                    <ReactMarkdown>{content}</ReactMarkdown>
                  </div>
                ) : (
                  <Text muted>No content yet.</Text>
                )}
              </Box>
            );
          })}
        </Box>

        {hasFloaterContent && (
          <aside className="sticky top-6 rounded-lg border border-gray-200 bg-gray-50 p-4 flex flex-col gap-3">
            <Text variant="h3">{page.name}</Text>

            {floaterImageUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={floaterImageUrl}
                alt={page.name}
                className="w-full rounded object-cover"
              />
            )}

            {activeFloaterRows.length > 0 && (
              <dl className="flex flex-col gap-2 text-sm">
                {activeFloaterRows.map((row) => {
                  const content = floaterRowContent.get(row.id) ?? '';
                  return (
                    <div key={row.id}>
                      <dt className="font-medium text-gray-600">{row.label}</dt>
                      <dd className="text-gray-800 whitespace-pre-wrap">
                        {content || <span className="text-gray-400">—</span>}
                      </dd>
                    </div>
                  );
                })}
              </dl>
            )}
          </aside>
        )}
      </div>
    </main>
  );
}
