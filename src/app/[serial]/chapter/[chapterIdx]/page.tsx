import { notFound } from "next/navigation";
import { cookies } from "next/headers";
import Link from "next/link";
import { db } from "@/db/index";
import {
  serials,
  volumes,
  chapters,
  chapterSynopses,
  pages,
  pageCategories,
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

  // Check the user's reading progress cookie against this chapter's idx
  const cookieStore = await cookies();
  const raw = cookieStore.get(`plotarmor_chapter_${serial.id}`)?.value;
  const chapterId = raw ? parseInt(raw, 10) : NaN;
  let cutoffIdx = 0;
  if (!isNaN(chapterId)) {
    const [row] = await db
      .select({ idx: chapters.idx })
      .from(chapters)
      .where(eq(chapters.id, chapterId))
      .limit(1);
    cutoffIdx = row?.idx ?? 0;
  }

  const spoilered = chapter.idx > cutoffIdx;

  // Fetch the volume this chapter belongs to
  const [volume] = await db
    .select({ displayName: volumes.displayName })
    .from(volumes)
    .where(eq(volumes.id, chapter.volumeId))
    .limit(1);

  let synopsisContent = "";
  let groupedIntroductions: { categoryName: string; pages: { id: number; name: string }[] }[] = [];
  let boundSaveAction: typeof saveChapterSynopsis | null = null;

  if (!spoilered) {
    // Fetch synopsis
    const [synopsisRow] = await db
      .select({ content: chapterSynopses.content })
      .from(chapterSynopses)
      .where(eq(chapterSynopses.chapterId, chapter.id))
      .limit(1);

    synopsisContent = synopsisRow?.content ?? "";

    // Fetch all pages introduced in this chapter, joined to their page category
    const introducedPages = await db
      .select({
        pageId: pages.id,
        pageName: pages.name,
        categoryId: pageCategories.id,
        categoryName: pageCategories.name,
      })
      .from(pages)
      .innerJoin(pageCategories, eq(pages.categoryId, pageCategories.id))
      .where(
        and(
          eq(pageCategories.serialId, serial.id),
          eq(pages.introChapterId, chapter.id),
        ),
      )
      .orderBy(pageCategories.name, pages.name);

    const byCategory = new Map<
      number,
      { categoryName: string; pages: { id: number; name: string }[] }
    >();
    for (const row of introducedPages) {
      if (!byCategory.has(row.categoryId)) {
        byCategory.set(row.categoryId, { categoryName: row.categoryName, pages: [] });
      }
      byCategory.get(row.categoryId)!.pages.push({ id: row.pageId, name: row.pageName });
    }
    groupedIntroductions = Array.from(byCategory.values());

    boundSaveAction = saveChapterSynopsis.bind(null, serialSlug, chapterIdx);
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

          {spoilered ? (
            <Box col className="gap-2 rounded-md border border-dashed border-gray-300 px-6 py-8 items-center text-center">
              <Text variant="h3" muted>Spoilers ahead</Text>
              <Text muted>
                You haven&apos;t reached this {serial.chapterType.toLowerCase()} yet. The synopsis
                and introduced content will be available once you&apos;ve read it.
              </Text>
            </Box>
          ) : (
            <>
              {/* Synopsis */}
              <Box col className="gap-2">
                <Text variant="h2">Synopsis</Text>
                <ChapterSynopsisEditor
                  serialSlug={serialSlug}
                  chapterIdx={chapterIdx}
                  initialContent={synopsisContent}
                  saveAction={boundSaveAction!}
                />
              </Box>

              {/* Introduced content */}
              <Box col className="gap-4">
                <Text variant="h2">Introduced in this {serial.chapterType.toLowerCase()}</Text>
                {groupedIntroductions.length > 0 ? (
                  <Box col className="gap-4">
                    {groupedIntroductions.map(({ categoryName, pages: categoryPages }) => (
                      <Box col key={categoryName} className="gap-1.5">
                        <Text variant="h4">{categoryName}</Text>
                        <ul className="flex flex-col gap-1">
                          {categoryPages.map((page) => (
                            <li key={page.id}>
                              <Link
                                href={`/${serialSlug}/${encodeURIComponent(categoryName)}/${encodeURIComponent(page.name)}`}
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
            </>
          )}
        </Box>
      </PageContainer>
    </main>
  );
}
