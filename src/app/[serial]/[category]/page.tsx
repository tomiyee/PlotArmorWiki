import { notFound } from "next/navigation";
import Link from "next/link";
import { cookies } from "next/headers";
import { db } from "@/db/index";
import {
  serials,
  pageCategories,
  categorySections,
  categoryFloaterRows,
  pages,
  chapters,
} from "@/db/schema";
import { and, eq, isNull, lte } from "drizzle-orm";
import { Text } from "@/components/ui/text";
import { Box } from "@/components/ui/box";
import { buttonVariants } from "@/components/ui/button";
import {
  Card,
  CardHeader,
  CardTitle,
  CardAction,
  CardContent,
} from "@/components/ui/card";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faPlus } from "@fortawesome/free-solid-svg-icons";
import { PageContainer } from "@/components/ui/page-container";
import {
  updateCategory,
  deleteCategory,
  addSection,
  deleteSection,
  renameSection,
  reorderSections,
  addFloaterRow,
  deleteFloaterRow,
  renameFloaterRow,
  reorderFloaterRows,
} from "../actions";
import { CategoryIndexEditor } from "./CategoryIndexEditor";
import { CategorySectionEditor } from "./CategorySectionEditor";

interface Props {
  params: Promise<{ serial: string; category: string }>;
}

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

export default async function CategoryIndexPage({ params }: Props) {
  const { serial: serialSlug, category: categorySlug } = await params;

  const categoryName = decodeURIComponent(categorySlug);

  const [serial] = await db
    .select()
    .from(serials)
    .where(eq(serials.slug, serialSlug))
    .limit(1);

  if (!serial) {
    notFound();
  }

  const [category] = await db
    .select()
    .from(pageCategories)
    .where(
      and(
        eq(pageCategories.serialId, serial.id),
        eq(pageCategories.name, categoryName),
      ),
    )
    .limit(1);

  if (!category) {
    notFound();
  }

  const cutoffIdx = await getChapterCutoffIdx(serial.id);

  const [pageList, sectionList, floaterRowList] = await Promise.all([
    db
      .select({ id: pages.id, name: pages.name })
      .from(pages)
      .innerJoin(chapters, eq(pages.introChapterId, chapters.id))
      .where(and(eq(pages.categoryId, category.id), lte(chapters.idx, cutoffIdx)))
      .orderBy(pages.name),
    db
      .select({
        id: categorySections.id,
        name: categorySections.name,
        displayOrder: categorySections.displayOrder,
      })
      .from(categorySections)
      .where(
        and(
          eq(categorySections.categoryId, category.id),
          isNull(categorySections.deletedAt),
        ),
      )
      .orderBy(categorySections.displayOrder),
    db
      .select({
        id: categoryFloaterRows.id,
        label: categoryFloaterRows.label,
        displayOrder: categoryFloaterRows.displayOrder,
      })
      .from(categoryFloaterRows)
      .where(
        and(
          eq(categoryFloaterRows.categoryId, category.id),
          isNull(categoryFloaterRows.deletedAt),
        ),
      )
      .orderBy(categoryFloaterRows.displayOrder),
  ]);

  const updateCategoryForSerial = updateCategory.bind(null, serial.id);
  const deleteCategoryForSerial = deleteCategory.bind(null, serial.id);
  const addSectionForSerial = addSection.bind(null, serial.id);
  const deleteSectionForSerial = deleteSection.bind(null, serial.id);
  const renameSectionForSerial = renameSection.bind(null, serial.id);
  const reorderSectionsForSerial = reorderSections.bind(null, serial.id);
  const addFloaterRowForSerial = addFloaterRow.bind(null, serial.id);
  const deleteFloaterRowForSerial = deleteFloaterRow.bind(null, serial.id);
  const renameFloaterRowForSerial = renameFloaterRow.bind(null, serial.id);
  const reorderFloaterRowsForSerial = reorderFloaterRows.bind(null, serial.id);

  return (
    <main>
      <PageContainer>
        <Box col className="gap-6">
          <Text muted className="text-sm">
            <Link href={`/${serialSlug}`} className="hover:underline">
              {serial.title}
            </Link>
          </Text>

          <CategoryIndexEditor
            categoryId={category.id}
            initialName={category.name}
            initialBody={category.body}
            serialSlug={serialSlug}
            updateCategoryAction={updateCategoryForSerial}
            deleteCategoryAction={deleteCategoryForSerial}
          />

          <CategorySectionEditor
            categoryId={category.id}
            hasFloater={category.hasFloater}
            sections={sectionList}
            floaterRows={floaterRowList}
            addSectionAction={addSectionForSerial}
            deleteSectionAction={deleteSectionForSerial}
            renameSectionAction={renameSectionForSerial}
            reorderSectionsAction={reorderSectionsForSerial}
            addFloaterRowAction={addFloaterRowForSerial}
            deleteFloaterRowAction={deleteFloaterRowForSerial}
            renameFloaterRowAction={renameFloaterRowForSerial}
            reorderFloaterRowsAction={reorderFloaterRowsForSerial}
          />

          <Card>
            <CardHeader>
              <CardTitle>
                <Text variant="h2">Pages</Text>
              </CardTitle>
              <CardAction>
                <Link
                  href={`/${serialSlug}/${encodeURIComponent(category.name)}/new`}
                  className={buttonVariants({ size: "sm" })}
                >
                  <FontAwesomeIcon icon={faPlus} className="h-3 w-3" />
                  New page
                </Link>
              </CardAction>
            </CardHeader>
            <CardContent>
              {pageList.length > 0 ? (
                <ul className="flex flex-col gap-1">
                  {pageList.map((page) => (
                    <li key={page.id}>
                      <Link
                        href={`/${serialSlug}/${encodeURIComponent(category.name)}/${encodeURIComponent(page.name)}`}
                        className="text-blue-600 hover:underline"
                      >
                        {page.name}
                      </Link>
                    </li>
                  ))}
                </ul>
              ) : (
                <Text muted>
                  No pages yet —{" "}
                  <Link
                    href={`/${serialSlug}/${encodeURIComponent(category.name)}/new`}
                    className="text-blue-500 hover:underline"
                  >
                    create the first one
                  </Link>
                  .
                </Text>
              )}
            </CardContent>
          </Card>
        </Box>
      </PageContainer>
    </main>
  );
}
