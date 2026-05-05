import { notFound } from "next/navigation";
import Link from "next/link";
import { db } from "@/db/index";
import {
  serials,
  volumes,
  chapters,
  chapterSynopses,
  pages,
  pageSchemas,
} from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { Text } from "@/components/ui/text";
import { Box } from "@/components/ui/box";
import { PageContainer } from "@/components/ui/page-container";
import { ChapterSynopsisEditor } from "./ChapterSynopsisEditor";
import { saveChapterSynopsis } from "./actions";

interface Props {
  params: Promise<{ serial: string; chapterIdx: string }>;
}

export default async function ChapterPage({ params }: Props) {
  const { serial: serialSlug, chapterIdx: chapterIdxRaw } = await params;

  const chapterIdx = parseInt(chapterIdxRaw, 10);
  if (isNaN(chapterIdx)) {
    notFound();
  }

  const [serial] = await db
    .select()
    .from(serials)
    .where(eq(serials.slug, serialSlug))
    .limit(1);

  if (!serial) {
    notFound();
  }

  // Resolve the chapter by serial + idx
  const [chapter] = await db
    .select({
      id: chapters.id,
      displayName: chapters.displayName,
      idx: chapters.idx,
      volumeId: chapters.volumeId,
    })
    .from(chapters)
    .innerJoin(volumes, eq(chapters.volumeId, volumes.id))
    .where(and(eq(volumes.serialId, serial.id), eq(chapters.idx, chapterIdx)))
    .limit(1);

  if (!chapter) {
    notFound();
  }

  // Fetch the volume this chapter belongs to
  const [volume] = await db
    .select({ displayName: volumes.displayName })
    .from(volumes)
    .where(eq(volumes.id, chapter.volumeId))
    .limit(1);

  // Fetch synopsis
  const [synopsisRow] = await db
    .select({ content: chapterSynopses.content })
    .from(chapterSynopses)
    .where(eq(chapterSynopses.chapterId, chapter.id))
    .limit(1);

  const synopsisContent = synopsisRow?.content ?? "";

  // Fetch all pages introduced in this chapter, joined to their schema
  const introducedPages = await db
    .select({
      pageId: pages.id,
      pageName: pages.name,
      schemaId: pageSchemas.id,
      schemaName: pageSchemas.name,
    })
    .from(pages)
    .innerJoin(pageSchemas, eq(pages.schemaId, pageSchemas.id))
    .where(
      and(
        eq(pageSchemas.serialId, serial.id),
        eq(pages.introChapterId, chapter.id),
      ),
    )
    .orderBy(pageSchemas.name, pages.name);

  // Group introduced pages by schema
  const bySchema = new Map<
    number,
    { schemaName: string; pages: { id: number; name: string }[] }
  >();
  for (const row of introducedPages) {
    if (!bySchema.has(row.schemaId)) {
      bySchema.set(row.schemaId, { schemaName: row.schemaName, pages: [] });
    }
    bySchema.get(row.schemaId)!.pages.push({ id: row.pageId, name: row.pageName });
  }
  const groupedIntroductions = Array.from(bySchema.values());

  const boundSaveAction = saveChapterSynopsis.bind(null, serialSlug, chapterIdx);

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

          {/* Chapter heading */}
          <Box col className="gap-1">
            {volume && (
              <Text variant="label" muted className="text-xs uppercase tracking-wider">
                {serial.volumeType} {volume.displayName}
              </Text>
            )}
            <Text variant="h1">
              {serial.chapterType} {chapter.displayName}
            </Text>
          </Box>

          {/* Synopsis */}
          <Box col className="gap-2">
            <Text variant="h2">Synopsis</Text>
            <ChapterSynopsisEditor
              serialSlug={serialSlug}
              chapterIdx={chapterIdx}
              initialContent={synopsisContent}
              saveAction={boundSaveAction}
            />
          </Box>

          {/* Introduced content */}
          <Box col className="gap-4">
            <Text variant="h2">Introduced in this {serial.chapterType.toLowerCase()}</Text>
            {groupedIntroductions.length > 0 ? (
              <Box col className="gap-4">
                {groupedIntroductions.map(({ schemaName, pages: schemaPages }) => (
                  <Box col key={schemaName} className="gap-1.5">
                    <Text variant="h4">{schemaName}</Text>
                    <ul className="flex flex-col gap-1">
                      {schemaPages.map((page) => (
                        <li key={page.id}>
                          <Link
                            href={`/${serialSlug}/${encodeURIComponent(schemaName)}/${encodeURIComponent(page.name)}`}
                            className="text-blue-600 hover:underline"
                          >
                            {page.name}
                          </Link>
                        </li>
                      ))}
                    </ul>
                  </Box>
                ))}
              </Box>
            ) : (
              <Text muted>
                No pages were introduced in this {serial.chapterType.toLowerCase()}.
              </Text>
            )}
          </Box>
        </Box>
      </PageContainer>
    </main>
  );
}
