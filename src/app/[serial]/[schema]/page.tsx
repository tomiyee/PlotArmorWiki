import { notFound } from "next/navigation";
import Link from "next/link";
import { cookies } from "next/headers";
import { db } from "@/db/index";
import { serials, pageSchemas, schemaSections, schemaFloaterRows, pages, chapters } from "@/db/schema";
import { and, eq, isNull, lte } from "drizzle-orm";
import { Text } from "@/components/ui/text";
import { Box } from "@/components/ui/box";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardAction, CardContent } from "@/components/ui/card";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faPlus } from "@fortawesome/free-solid-svg-icons";
import { PageContainer } from "@/components/ui/page-container";
import {
  updateSchema,
  deleteSchema,
  addSection,
  deleteSection,
  renameSection,
  reorderSections,
  addFloaterRow,
  deleteFloaterRow,
  renameFloaterRow,
  reorderFloaterRows,
} from "../actions";
import { SchemaIndexEditor } from "./SchemaIndexEditor";
import { SchemaSectionEditor } from "./SchemaSectionEditor";

interface Props {
  params: Promise<{ serial: string; schema: string }>;
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

export default async function SchemaIndexPage({ params }: Props) {
  const { serial: serialSlug, schema: schemaSlug } = await params;

  const schemaName = decodeURIComponent(schemaSlug);

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
    .where(
      and(
        eq(pageSchemas.serialId, serial.id),
        eq(pageSchemas.name, schemaName),
      ),
    )
    .limit(1);

  if (!schema) {
    notFound();
  }

  const cutoffIdx = await getChapterCutoffIdx(serial.id);

  const [pageList, sectionList, floaterRowList] = await Promise.all([
    db
      .select({ id: pages.id, name: pages.name })
      .from(pages)
      .innerJoin(chapters, eq(pages.introChapterId, chapters.id))
      .where(and(eq(pages.schemaId, schema.id), lte(chapters.idx, cutoffIdx)))
      .orderBy(pages.name),
    db
      .select({
        id: schemaSections.id,
        name: schemaSections.name,
        displayOrder: schemaSections.displayOrder,
      })
      .from(schemaSections)
      .where(
        and(
          eq(schemaSections.schemaId, schema.id),
          isNull(schemaSections.deletedAt),
        ),
      )
      .orderBy(schemaSections.displayOrder),
    db
      .select({
        id: schemaFloaterRows.id,
        label: schemaFloaterRows.label,
        displayOrder: schemaFloaterRows.displayOrder,
      })
      .from(schemaFloaterRows)
      .where(
        and(
          eq(schemaFloaterRows.schemaId, schema.id),
          isNull(schemaFloaterRows.deletedAt),
        ),
      )
      .orderBy(schemaFloaterRows.displayOrder),
  ]);

  const updateSchemaForSerial = updateSchema.bind(null, serial.id);
  const deleteSchemaForSerial = deleteSchema.bind(null, serial.id);
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

          <SchemaIndexEditor
            schemaId={schema.id}
            initialName={schema.name}
            initialBody={schema.body}
            serialSlug={serialSlug}
            updateSchemaAction={updateSchemaForSerial}
            deleteSchemaAction={deleteSchemaForSerial}
          />

          <SchemaSectionEditor
            schemaId={schema.id}
            hasFloater={schema.hasFloater}
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
                  href={`/${serialSlug}/${encodeURIComponent(schema.name)}/new`}
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
                        href={`/${serialSlug}/${encodeURIComponent(schema.name)}/${encodeURIComponent(page.name)}`}
                        className="text-blue-600 hover:underline"
                      >
                        {page.name}
                      </Link>
                    </li>
                  ))}
                </ul>
              ) : (
                <Text muted>No pages yet.</Text>
              )}
            </CardContent>
          </Card>
        </Box>
      </PageContainer>
    </main>
  );
}
