import { notFound } from "next/navigation";
import Link from "next/link";
import { db } from "@/db/index";
import {
  serials,
  volumes,
  chapters,
  pages,
  templates,
  templateSections,
  templateInfoboxSections,
} from "@/db/schema";
import { asc, eq, inArray } from "drizzle-orm";
import { Text } from "@/components/ui/Text";
import { Box } from "@/components/ui/Box";
import { PageContainer } from "@/components/ui/PageContainer";
import { NewPageForm } from "./NewPageForm";

interface Props {
  params: Promise<{ serial: string }>;
  searchParams: Promise<{ parentPageId?: string }>;
}

export default async function NewPagePage({ params, searchParams }: Props) {
  const { serial: serialSlug } = await params;
  const { parentPageId: parentPageIdParam } = await searchParams;
  const defaultParentPageId = parentPageIdParam
    ? parseInt(parentPageIdParam, 10)
    : undefined;

  const [serial] = await db
    .select()
    .from(serials)
    .where(eq(serials.slug, serialSlug))
    .limit(1);

  if (!serial) {
    notFound();
  }

  const [volumeList, chapterList, existingPages, serialTemplates] =
    await Promise.all([
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
      // All pages in this serial for the parent dropdown (with introChapterId for filtering).
      db
        .select({
          id: pages.id,
          name: pages.name,
          introChapterId: pages.introChapterId,
        })
        .from(pages)
        .where(eq(pages.serialId, serial.id))
        .orderBy(asc(pages.name)),
      // Templates for this serial so the new-page form can seed sections.
      db
        .select({
          id: templates.id,
          name: templates.name,
          hasInfobox: templates.hasInfobox,
        })
        .from(templates)
        .where(eq(templates.serialId, serial.id))
        .orderBy(asc(templates.name))
        .then(async (rows) => {
          if (rows.length === 0) return [];
          const templateIds = rows.map((r) => r.id);
          const [sectionRows, infoboxRows] = await Promise.all([
            db
              .select()
              .from(templateSections)
              .where(inArray(templateSections.templateId, templateIds))
              .orderBy(asc(templateSections.displayOrder)),
            db
              .select()
              .from(templateInfoboxSections)
              .where(inArray(templateInfoboxSections.templateId, templateIds))
              .orderBy(asc(templateInfoboxSections.displayOrder)),
          ]);
          return rows.map((t) => ({
            id: t.id,
            name: t.name,
            hasInfobox: t.hasInfobox,
            sections: sectionRows.filter((s) => s.templateId === t.id),
            infoboxSections: infoboxRows.filter((s) => s.templateId === t.id),
          }));
        }),
    ]);

  return (
    <main>
      <PageContainer className="max-w-lg">
        <Box col className="gap-8">
          {/* Breadcrumb */}
          <Text muted className="text-sm">
            <Link href={`/${serialSlug}`} className="hover:underline">
              {serial.title}
            </Link>
          </Text>

          <Text variant="h1" className="text-2xl">
            New page
          </Text>

          <NewPageForm
            serialSlug={serialSlug}
            chapterType={serial.chapterType}
            volumeList={volumeList}
            chapterList={chapterList}
            existingPages={existingPages}
            defaultParentPageId={defaultParentPageId}
            templates={serialTemplates}
          />
        </Box>
      </PageContainer>
    </main>
  );
}
