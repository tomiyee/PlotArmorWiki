import { notFound } from 'next/navigation';
import { db } from '@/db/index';
import { serials, serialAuthors, volumes, chapters, pageCategories, categorySections, categoryFloaterRows, pages } from '@/db/schema';
import { and, count, eq, inArray, isNull } from 'drizzle-orm';
import {
  addChapter, addVolume, deleteChapter, deleteVolume, renameChapter, renameVolume, updateSerialTypes,
  reorderVolumes, reorderAllChapters, updateSerialMetadata,
  addCategory,
} from './actions';
import { Box } from '@/components/ui/box';
import { PageContainer } from '@/components/ui/page-container';
import { CategoryManager } from '@/components/CategoryManager';
import { SerialMetadataEditor } from '@/components/SerialMetadataEditor';
import { SerialTOCSidebar } from '@/components/SerialTOCSidebar';

interface Props {
  params: Promise<{ serial: string }>;
}

export default async function SerialPage({ params }: Props) {
  const { serial: serialSlug } = await params;

  const [serial] = await db
    .select()
    .from(serials)
    .where(eq(serials.slug, serialSlug))
    .limit(1);

  if (!serial) {
    notFound();
  }

  const [authors, volumeList, chapterList, categoryList, sectionList, floaterRowList] = await Promise.all([
    db
      .select()
      .from(serialAuthors)
      .where(eq(serialAuthors.serialId, serial.id))
      .orderBy(serialAuthors.displayOrder),
    db
      .select()
      .from(volumes)
      .where(eq(volumes.serialId, serial.id))
      .orderBy(volumes.idx),
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
      .orderBy(chapters.idx),
    db
      .select()
      .from(pageCategories)
      .where(eq(pageCategories.serialId, serial.id))
      .orderBy(pageCategories.id),
    db
      .select({
        id: categorySections.id,
        categoryId: categorySections.categoryId,
        name: categorySections.name,
        displayOrder: categorySections.displayOrder,
      })
      .from(categorySections)
      .innerJoin(pageCategories, eq(categorySections.categoryId, pageCategories.id))
      .where(and(isNull(categorySections.deletedAt), eq(pageCategories.serialId, serial.id)))
      .orderBy(categorySections.displayOrder),
    db
      .select({
        id: categoryFloaterRows.id,
        categoryId: categoryFloaterRows.categoryId,
        label: categoryFloaterRows.label,
        displayOrder: categoryFloaterRows.displayOrder,
      })
      .from(categoryFloaterRows)
      .innerJoin(pageCategories, eq(categoryFloaterRows.categoryId, pageCategories.id))
      .where(and(isNull(categoryFloaterRows.deletedAt), eq(pageCategories.serialId, serial.id)))
      .orderBy(categoryFloaterRows.displayOrder),
  ]);

  const pageCountList = categoryList.length
    ? await db
        .select({ categoryId: pages.categoryId, pageCount: count(pages.id) })
        .from(pages)
        .where(inArray(pages.categoryId, categoryList.map((c) => c.id)))
        .groupBy(pages.categoryId)
    : [];

  const chaptersByVolume: Record<number, { id: number; displayName: string; idx: number; volumeId: number }[]> = {};
  volumeList.forEach((v) => { chaptersByVolume[v.id] = []; });
  chapterList.forEach((c) => { chaptersByVolume[c.volumeId]?.push(c); });

  const categoryIds = new Set(categoryList.map((c) => c.id));
  const sectionsByCategory: Record<number, typeof sectionList> = {};
  const floaterRowsByCategory: Record<number, typeof floaterRowList> = {};
  const pageCountByCategory: Record<number, number> = {};
  categoryIds.forEach((id) => { sectionsByCategory[id] = []; floaterRowsByCategory[id] = []; pageCountByCategory[id] = 0; });
  sectionList.forEach((s) => { if (sectionsByCategory[s.categoryId]) sectionsByCategory[s.categoryId].push(s); });
  floaterRowList.forEach((r) => { if (floaterRowsByCategory[r.categoryId]) floaterRowsByCategory[r.categoryId].push(r); });
  pageCountList.forEach((r) => { pageCountByCategory[r.categoryId] = r.pageCount; });

  const categoriesWithDetails = categoryList.map((category) => ({
    ...category,
    sections: sectionsByCategory[category.id] ?? [],
    floaterRows: floaterRowsByCategory[category.id] ?? [],
    pageCount: pageCountByCategory[category.id] ?? 0,
  }));

  const updateMetadataForSerial = updateSerialMetadata.bind(null, serial.id);
  const addVolumeForSerial = addVolume.bind(null, serial.id);
  const addChapterForSerial = addChapter.bind(null, serial.id);
  const deleteChapterForSerial = deleteChapter.bind(null, serial.id);
  const deleteVolumeForSerial = deleteVolume.bind(null, serial.id);
  const renameChapterForSerial = renameChapter.bind(null, serial.id);
  const renameVolumeForSerial = renameVolume.bind(null, serial.id);
  const reorderVolumesForSerial = reorderVolumes.bind(null, serial.id);
  const reorderAllChaptersForSerial = reorderAllChapters.bind(null, serial.id);
  const updateSerialTypesForSerial = updateSerialTypes.bind(null, serial.id);

  const addCategoryForSerial = addCategory.bind(null, serial.id);

  return (
    <main>
      <div className="max-w-6xl mx-auto w-full px-4 py-6 flex gap-6">
        {/* Left sidebar — sticky, independent scroll, desktop only */}
        <aside className="hidden md:block w-56 shrink-0">
          <div className="sticky top-6 overflow-y-auto max-h-[calc(100vh-5rem)] pr-1">
            <SerialTOCSidebar
              serialId={serial.id}
              serialSlug={serialSlug}
              volumes={volumeList}
              chaptersByVolume={chaptersByVolume}
              chapterType={serial.chapterType}
              volumeType={serial.volumeType}
              addChapterAction={addChapterForSerial}
              addVolumeAction={addVolumeForSerial}
              deleteChapterAction={deleteChapterForSerial}
              deleteVolumeAction={deleteVolumeForSerial}
              renameChapterAction={renameChapterForSerial}
              renameVolumeAction={renameVolumeForSerial}
              reorderVolumesAction={reorderVolumesForSerial}
              reorderAllChaptersAction={reorderAllChaptersForSerial}
              updateSerialTypesAction={updateSerialTypesForSerial}
            />
          </div>
        </aside>

        {/* Main content */}
        <PageContainer className="flex-1 min-w-0 mx-0 px-0 py-0">
          <Box col className="gap-4">
            {/* Serial header with inline edit */}
            <SerialMetadataEditor
              title={serial.title}
              description={serial.description}
              splashArtUrl={serial.splashArtUrl}
              authors={authors.map((a) => a.name)}
              updateMetadataAction={updateMetadataForSerial}
            />

            {/* Category management */}
            <CategoryManager
              categories={categoriesWithDetails}
              serialSlug={serialSlug}
              addCategoryAction={addCategoryForSerial}
            />
          </Box>
        </PageContainer>
      </div>
    </main>
  );
}
