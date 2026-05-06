'use server';

import { redirect } from 'next/navigation';
import { db } from '@/db/index';
import { serials, pageCategories, pages } from '@/db/schema';
import { and, eq } from 'drizzle-orm';

/**
 * Creates a new wiki page within the given page category, then redirects to the
 * page's URL. Validates that the serial and category exist before inserting.
 *
 * @example
 * // In a Server Component:
 * const createPageForCategory = createPage.bind(null, serialSlug, categoryName);
 * <form action={createPageForCategory}>…</form>
 */
export async function createPage(
  serialSlug: string,
  categoryName: string,
  formData: FormData,
) {
  const name = formData.get('name');
  const introChapterIdRaw = formData.get('introChapterId');

  if (!name || typeof name !== 'string' || name.trim() === '') {
    throw new Error('Page name is required');
  }
  if (!introChapterIdRaw || typeof introChapterIdRaw !== 'string') {
    throw new Error('Intro chapter is required');
  }

  const introChapterId = parseInt(introChapterIdRaw, 10);
  if (isNaN(introChapterId)) throw new Error('Invalid chapter ID');

  const [serial] = await db
    .select({ id: serials.id })
    .from(serials)
    .where(eq(serials.slug, serialSlug))
    .limit(1);
  if (!serial) throw new Error('Serial not found');

  const [category] = await db
    .select({ id: pageCategories.id })
    .from(pageCategories)
    .where(and(eq(pageCategories.serialId, serial.id), eq(pageCategories.name, categoryName)))
    .limit(1);
  if (!category) throw new Error('Category not found');

  await db.insert(pages).values({
    categoryId: category.id,
    name: name.trim(),
    introChapterId,
  });

  redirect(
    `/${serialSlug}/${encodeURIComponent(categoryName)}/${encodeURIComponent(name.trim())}`,
  );
}
