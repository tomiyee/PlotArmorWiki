import { db } from "@/db/index";
import { pages } from "@/db/schema";
import { asc, eq } from "drizzle-orm";
import { getSerialVolumesAndChapters } from "@/data/chapters/queries";
import { fetchSerialTemplates } from "@/data/templates/queries";

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
  const [{ volumeList, chapterList }, existingPages, serialTemplates] = await Promise.all([
    getSerialVolumesAndChapters(serialId),
    db
      .select({
        id: pages.id,
        name: pages.name,
        slug: pages.slug,
        introChapterId: pages.introChapterId,
      })
      .from(pages)
      .where(eq(pages.serialId, serialId))
      .orderBy(asc(pages.name)),
    fetchSerialTemplates(serialId),
  ]);

  return { volumeList, chapterList, existingPages, serialTemplates };
}
