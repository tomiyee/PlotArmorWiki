import { notFound } from 'next/navigation';
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
import { and, asc, eq, isNull } from 'drizzle-orm';
import { Text } from '@/components/ui/text';
import { Box } from '@/components/ui/box';

interface Props {
  params: Promise<{ serial: string; schema: string; page: string }>;
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

  const [schema] = await db
    .select()
    .from(pageSchemas)
    .where(and(eq(pageSchemas.serialId, serial.id), eq(pageSchemas.name, schemaName)))
    .limit(1);

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

  const [introChapter] = await db
    .select({ displayName: chapters.displayName })
    .from(chapters)
    .where(eq(chapters.id, page.introChapterId))
    .limit(1);

  // Fetch active sections for this schema, ordered for display.
  const activeSections = await db
    .select({ id: schemaSections.id, name: schemaSections.name })
    .from(schemaSections)
    .where(and(eq(schemaSections.schemaId, schema.id), isNull(schemaSections.deletedAt)))
    .orderBy(asc(schemaSections.displayOrder));

  // Fetch the latest content version for each section (to_chapter_id IS NULL = current).
  const sectionVersions = await db
    .select({
      sectionId: pageSectionVersions.sectionId,
      content: pageSectionVersions.content,
    })
    .from(pageSectionVersions)
    .where(
      and(
        eq(pageSectionVersions.pageId, page.id),
        isNull(pageSectionVersions.toChapterId),
      ),
    );

  const contentBySectionId = new Map(
    sectionVersions.map((v) => [v.sectionId, v.content]),
  );

  // Floater data — only fetched when the schema has a floater.
  let floaterImageUrl: string | null = null;
  let activeFloaterRows: { id: number; label: string }[] = [];
  let floaterRowContent: Map<number, string> = new Map();

  if (schema.hasFloater) {
    // Latest page_floater_versions row.
    const [floaterVersion] = await db
      .select({ imageUrl: pageFloaterVersions.imageUrl })
      .from(pageFloaterVersions)
      .where(
        and(
          eq(pageFloaterVersions.pageId, page.id),
          isNull(pageFloaterVersions.toChapterId),
        ),
      )
      .limit(1);

    floaterImageUrl = floaterVersion?.imageUrl ?? null;

    // Active floater rows for this schema (soft-delete aware).
    activeFloaterRows = await db
      .select({ id: schemaFloaterRows.id, label: schemaFloaterRows.label })
      .from(schemaFloaterRows)
      .where(
        and(
          eq(schemaFloaterRows.schemaId, schema.id),
          isNull(schemaFloaterRows.deletedAt),
        ),
      )
      .orderBy(asc(schemaFloaterRows.displayOrder));

    // Latest content for each floater row.
    const floaterRowVersions = await db
      .select({
        floaterRowId: pageFloaterRowVersions.floaterRowId,
        content: pageFloaterRowVersions.content,
      })
      .from(pageFloaterRowVersions)
      .where(
        and(
          eq(pageFloaterRowVersions.pageId, page.id),
          isNull(pageFloaterRowVersions.toChapterId),
        ),
      );

    floaterRowContent = new Map(
      floaterRowVersions.map((v) => [v.floaterRowId, v.content]),
    );
  }

  const hasFloaterContent =
    schema.hasFloater &&
    (floaterImageUrl !== null || activeFloaterRows.length > 0);

  return (
    <main className="px-6 py-16">
      <div
        className={
          hasFloaterContent
            ? 'mx-auto max-w-5xl grid grid-cols-[1fr_280px] gap-8 items-start'
            : 'mx-auto max-w-2xl'
        }
      >
        {/* Body column */}
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

        {/* Floater sidebar — only rendered when the schema has a floater */}
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
