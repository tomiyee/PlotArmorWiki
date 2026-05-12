'use server';

import { redirect } from 'next/navigation';
import { db } from '@/db/index';
import { serials, pages } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { titleToSlug } from '@/lib/slug';

/**
 * Creates a new wiki page under the given serial, then redirects to the
 * page's URL. Validates that the serial exists before inserting.
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

  const trimmedName = name.trim();
  const slug = titleToSlug(trimmedName);

  await db.insert(pages).values({
    serialId: serial.id,
    name: trimmedName,
    slug,
    introChapterId,
  });

  redirect(
    `/${serialSlug}/${encodeURIComponent(categoryName)}/${encodeURIComponent(slug)}`,
  );
}
