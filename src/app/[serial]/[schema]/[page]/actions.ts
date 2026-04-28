'use server';

import { db } from '@/db/index';
import {
  serials,
  pageSchemas,
  pages,
  chapters,
  volumes,
  pageSectionVersions,
  pageFloaterVersions,
  pageFloaterRowVersions,
} from '@/db/schema';
import { and, desc, eq } from 'drizzle-orm';

/**
 * Resolves the latest chapter (highest idx) for a given serial.
 * Edits always write at head so the new version is immediately visible
 * to readers who are fully caught up.
 */
async function getHeadChapterId(serialId: number): Promise<number> {
  const [row] = await db
    .select({ id: chapters.id })
    .from(chapters)
    .innerJoin(volumes, eq(chapters.volumeId, volumes.id))
    .where(eq(volumes.serialId, serialId))
    .orderBy(desc(chapters.idx))
    .limit(1);

  if (!row) throw new Error('Serial has no chapters — cannot save content.');
  return row.id;
}

/**
 * Saves all page content at the serial's current head chapter.
 *
 * Each section/floater field is an upsert keyed by (pageId, …, chapterId).
 * Readers at an earlier chapter cutoff see the previous version via the
 * max-idx subquery read path.
 *
 * @example
 * await savePageContent(serialSlug, schemaName, pageName, sectionContent, floaterImageUrl, floaterRowContent);
 */
export async function savePageContent(
  serialSlug: string,
  schemaName: string,
  pageName: string,
  sectionContent: Record<number, string>,
  floaterImageUrl: string | null,
  floaterRowContent: Record<number, string>,
): Promise<void> {
  const [serial] = await db
    .select({ id: serials.id })
    .from(serials)
    .where(eq(serials.slug, serialSlug))
    .limit(1);
  if (!serial) throw new Error('Serial not found');

  const [schema] = await db
    .select({ id: pageSchemas.id, hasFloater: pageSchemas.hasFloater })
    .from(pageSchemas)
    .where(and(eq(pageSchemas.serialId, serial.id), eq(pageSchemas.name, schemaName)))
    .limit(1);
  if (!schema) throw new Error('Schema not found');

  const [page] = await db
    .select({ id: pages.id })
    .from(pages)
    .where(and(eq(pages.schemaId, schema.id), eq(pages.name, pageName)))
    .limit(1);
  if (!page) throw new Error('Page not found');

  const headChapterId = await getHeadChapterId(serial.id);

  await db.transaction(async (tx) => {
    // ── Section content ────────────────────────────────────────────────────────
    for (const [sectionIdStr, content] of Object.entries(sectionContent)) {
      const sectionId = parseInt(sectionIdStr, 10);
      await tx
        .insert(pageSectionVersions)
        .values({ pageId: page.id, sectionId, chapterId: headChapterId, content })
        .onConflictDoUpdate({
          target: [
            pageSectionVersions.pageId,
            pageSectionVersions.sectionId,
            pageSectionVersions.chapterId,
          ],
          set: { content },
        });
    }

    if (schema.hasFloater) {
      // ── Floater image URL ────────────────────────────────────────────────────
      await tx
        .insert(pageFloaterVersions)
        .values({ pageId: page.id, chapterId: headChapterId, imageUrl: floaterImageUrl })
        .onConflictDoUpdate({
          target: [pageFloaterVersions.pageId, pageFloaterVersions.chapterId],
          set: { imageUrl: floaterImageUrl },
        });

      // ── Floater row content ──────────────────────────────────────────────────
      for (const [floaterRowIdStr, content] of Object.entries(floaterRowContent)) {
        const floaterRowId = parseInt(floaterRowIdStr, 10);
        await tx
          .insert(pageFloaterRowVersions)
          .values({ pageId: page.id, floaterRowId, chapterId: headChapterId, content })
          .onConflictDoUpdate({
            target: [
              pageFloaterRowVersions.pageId,
              pageFloaterRowVersions.floaterRowId,
              pageFloaterRowVersions.chapterId,
            ],
            set: { content },
          });
      }
    }
  });
}
