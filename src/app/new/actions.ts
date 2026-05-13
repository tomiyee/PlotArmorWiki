'use server';

import { redirect } from 'next/navigation';
import { db } from '@/db/index';
import { serials, serialAuthors, pages } from '@/db/schema';
import { titleToSlug } from '@/lib/slug';
import { parseChapterType, parseVolumeType } from '@/lib/serial-types';

export async function createSerial(formData: FormData) {
  const title = formData.get('title');
  if (!title || typeof title !== 'string' || title.trim() === '') {
    throw new Error('Title is required');
  }

  const description = formData.get('description');
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
      description:
        description && typeof description === 'string' && description.trim()
          ? description.trim()
          : null,
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
  await db.insert(pages).values({
    serialId: inserted.id,
    name: 'Home',
    slug: 'home',
    introChapterId: null,
    isHomePage: true,
  });

  redirect(`/${slug}`);
}
