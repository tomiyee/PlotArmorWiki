'use server';

import { redirect } from 'next/navigation';
import { db } from '@/db/index';
import { serials, chapters } from '@/db/schema';
import { titleToSlug } from '@/lib/slug';
import { eq } from 'drizzle-orm';

export async function addChapter(serialId: number, formData: FormData) {
  const displayName = formData.get('displayName');
  const idxRaw = formData.get('idx');

  if (
    !displayName ||
    typeof displayName !== 'string' ||
    displayName.trim() === ''
  ) {
    throw new Error('Chapter display name is required');
  }

  if (!idxRaw || typeof idxRaw !== 'string' || idxRaw.trim() === '') {
    throw new Error('Chapter index is required');
  }

  const idx = parseInt(idxRaw.trim(), 10);
  if (isNaN(idx)) {
    throw new Error('Chapter index must be a number');
  }

  await db.insert(chapters).values({
    serialId,
    displayName: displayName.trim(),
    idx,
  });

  const [serial] = await db
    .select({ title: serials.title })
    .from(serials)
    .where(eq(serials.id, serialId));

  redirect(`/${titleToSlug(serial.title)}`);
}
