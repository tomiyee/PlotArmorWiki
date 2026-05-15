'use server';

import { redirect } from 'next/navigation';
import { db } from '@/db/index';
import { serials, serialAuthors, pages, pageSections } from '@/db/schema';
import { titleToSlug } from '@/lib/slug';
import { parseChapterType, parseVolumeType } from '@/lib/serial-types';

/**
 * Creates a new serial and its home page. The home page is seeded with a
 * "Description" section so the user's description text has a natural home on
 * the wiki — they can paste it into that section once chapters are available.
 *
 * Section *content* (page_section_revisions) cannot be written here because
 * revisions require a chapter_id, and a brand-new serial has no chapters yet.
 *
 * @example
 * <form action={createSerial}>…</form>
 */
export async function createSerial(formData: FormData) {
  const title = formData.get('title');
  if (!title || typeof title !== 'string' || title.trim() === '') {
    throw new Error('Title is required');
  }

  const splashArtUrl = formData.get('splashArtUrl');
  const chapterType = parseChapterType(formData.get('chapterType'));
  const volumeType = parseVolumeType(formData.get('volumeType'));

  // authors is a multi-value field — filter out blank entries
  const authorValues = formData.getAll('authors') as string[];
  const filteredAuthors = authorValues
    .map((a) => a.trim())
    .filter((a) => a.length > 0);

  const slug = titleToSlug(title.trim());

  const [inserted] = await db
    .insert(serials)
    .values({
      title: title.trim(),
      slug,
      splashArtUrl:
        splashArtUrl &&
        typeof splashArtUrl === 'string' &&
        splashArtUrl.trim()
          ? splashArtUrl.trim()
          : null,
      chapterType,
      volumeType,
    })
    .returning({ id: serials.id });

  if (filteredAuthors.length > 0) {
    await db.insert(serialAuthors).values(
      filteredAuthors.map((name, i) => ({
        serialId: inserted.id,
        name,
        displayOrder: i + 1,
      }))
    );
  }

  // Automatically create the serial's home page. introChapterId is null because
  // no chapters exist yet; the home page is always visible regardless of cutoff.
  const [homePage] = await db
    .insert(pages)
    .values({
      serialId: inserted.id,
      name: 'Home',
      slug: 'home',
      introChapterId: null,
      isHomePage: true,
    })
    .returning({ id: pages.id });

  // Seed the home page with a "Description" section. Content revisions cannot
  // be written here (they require a chapter_id), so the section starts empty
  // and the editor can fill it in once the first chapter is added.
  await db.insert(pageSections).values({
    pageId: homePage.id,
    name: 'Description',
    displayOrder: 0,
  });

  redirect(`/${slug}`);
}
