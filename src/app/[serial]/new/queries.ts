import { db } from "@/db/index";
import {
  volumes,
  chapters,
  pages,
  templates,
  templateSections,
  templateInfoboxSections,
} from "@/db/schema";
import { asc, eq, inArray } from "drizzle-orm";
import { getChapterCutoff as dalGetChapterCutoff } from "@/db/queries";

/**
 * Reads the user's chapter cutoff for a given serial from the progress cookie
 * set by `<ChapterSelector>`. Returns the chapter id so it can be passed to
 * `<NewPageForm>` as the default intro chapter selection.
 *
 * Delegates to the shared DAL implementation in `@/db/queries` which is the
 * single source of truth for cookie-based cutoff resolution.
 *
 * @example
 * const readingChapterId = await getChapterCutoff(serial.id);
 */
export async function getChapterCutoff(serialId: number): Promise<number | null> {
  const { readingChapterId } = await dalGetChapterCutoff(serialId);
  return readingChapterId;
}

/**
 * Fetches all data needed to render the new-page creation form for a given serial.
 * Runs volume/chapter/page/template queries in parallel.
 *
 * Templates include their sections and infobox sections so the form can seed
 * page content without a separate round-trip after the user picks a template.
 * `existingPages` includes `introChapterId` so the parent dropdown can filter
 * out pages the reader hasn't reached yet.
 *
 * @example
 * const { volumeList, chapterList, existingPages, serialTemplates } =
 *   await getNewPageFormData(serial.id);
 */
export async function getNewPageFormData(serialId: number) {
  const [volumeList, chapterList, existingPages, serialTemplates] = await Promise.all([
    db
      .select()
      .from(volumes)
      .where(eq(volumes.serialId, serialId))
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
      .where(eq(volumes.serialId, serialId))
      .orderBy(chapters.idx),
    db
      .select({
        id: pages.id,
        name: pages.name,
        introChapterId: pages.introChapterId,
      })
      .from(pages)
      .where(eq(pages.serialId, serialId))
      .orderBy(asc(pages.name)),
    db
      .select({
        id: templates.id,
        name: templates.name,
        hasInfobox: templates.hasInfobox,
      })
      .from(templates)
      .where(eq(templates.serialId, serialId))
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

  return { volumeList, chapterList, existingPages, serialTemplates };
}
