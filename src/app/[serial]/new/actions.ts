'use server';

import { redirect } from 'next/navigation';
import { db } from '@/db/index';
import { serials, pages, pageTitles, pageRelationships, chapters, volumes } from '@/db/schema';
import { and, desc, eq, like } from 'drizzle-orm';
import { titleToSlug } from '@/lib/slug';

/**
 * Resolves the head chapter id (highest idx) for a serial.
 * Returns null when the serial has no chapters yet.
 */
async function getHeadChapterId(serialId: number): Promise<number | null> {
  const [row] = await db
    .select({ id: chapters.id })
    .from(chapters)
    .innerJoin(volumes, eq(chapters.volumeId, volumes.id))
    .where(eq(volumes.serialId, serialId))
    .orderBy(desc(chapters.idx))
    .limit(1);
  return row?.id ?? null;
}

/**
 * Generates a slug unique within the serial. If `titleToSlug(name)` already
 * exists, appends `-2`, `-3`, … until a free slot is found.
 *
 * @example
 * const slug = await generateUniqueSlug(42, 'Monkey D. Luffy');
 * // → 'monkey-d-luffy' (or 'monkey-d-luffy-2' on collision)
 */
async function generateUniqueSlug(serialId: number, name: string): Promise<string> {
  const base = titleToSlug(name);

  // Fetch all existing slugs that start with base to check for collisions.
  const pattern = `${base}%`;
  const existing = await db
    .select({ slug: pages.slug })
    .from(pages)
    .where(and(eq(pages.serialId, serialId), like(pages.slug, pattern)));

  const existingSet = new Set(existing.map((r) => r.slug));
  if (!existingSet.has(base)) return base;

  let suffix = 2;
  while (existingSet.has(`${base}-${suffix}`)) suffix++;
  return `${base}-${suffix}`;
}

/**
 * Creates a new wiki page under the given serial, then redirects to the
 * page's URL. Also inserts an initial `page_titles` entry and, when a parent
 * page is provided, a `page_relationships` row linking parent → new page.
 *
 * @example
 * // In a Server Component:
 * const createPageForSerial = createPage.bind(null, serialSlug);
 * <form action={createPageForSerial}>…</form>
 */
export async function createPage(serialSlug: string, formData: FormData) {
  const name = formData.get('name');
  const introChapterIdRaw = formData.get('introChapterId');
  const parentPageIdRaw = formData.get('parentPageId');

  if (!name || typeof name !== 'string' || name.trim() === '') {
    throw new Error('Page name is required');
  }
  if (!introChapterIdRaw || typeof introChapterIdRaw !== 'string') {
    throw new Error('Intro chapter is required');
  }

  const introChapterId = parseInt(introChapterIdRaw, 10);
  if (isNaN(introChapterId)) throw new Error('Invalid chapter ID');

  const parentPageIdParsed =
    parentPageIdRaw && typeof parentPageIdRaw === 'string' && parentPageIdRaw !== ''
      ? parseInt(parentPageIdRaw, 10)
      : null;
  if (parentPageIdParsed !== null && isNaN(parentPageIdParsed)) throw new Error('Invalid parent page ID');
  // 0 is the "None (root page)" sentinel from the form — treat it as no parent.
  const parentPageId = parentPageIdParsed !== null && parentPageIdParsed !== 0 ? parentPageIdParsed : null;

  const [serial] = await db
    .select({ id: serials.id })
    .from(serials)
    .where(eq(serials.slug, serialSlug))
    .limit(1);
  if (!serial) throw new Error('Serial not found');

  const trimmedName = name.trim();
  const slug = await generateUniqueSlug(serial.id, trimmedName);

  await db.transaction(async (tx) => {
    // 1. Insert the page.
    const [newPage] = await tx
      .insert(pages)
      .values({
        serialId: serial.id,
        name: trimmedName,
        slug,
        introChapterId,
      })
      .returning({ id: pages.id });

    if (!newPage) throw new Error('Failed to insert page');

    // 2. Insert the initial title into page_titles.
    await tx.insert(pageTitles).values({
      pageId: newPage.id,
      chapterId: introChapterId,
      title: trimmedName,
    });

    // 3. If a parent page was chosen, insert a page_relationships row.
    if (parentPageId !== null) {
      // Relationship is stamped at the head chapter (or intro chapter as fallback).
      const headChapterId = await getHeadChapterId(serial.id);
      const relationChapterId = headChapterId ?? introChapterId;

      await tx.insert(pageRelationships).values({
        parentPageId,
        childPageId: newPage.id,
        chapterId: relationChapterId,
        isActive: true,
      });
    }
  });

  redirect(`/${serialSlug}/${encodeURIComponent(slug)}`);
}
