"use server";

import { db } from "@/db/index";
import { chapters, chapterSynopses, serials, volumes } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { requireSerialAdminBySlug } from "@/lib/auth-guard";

/**
 * Upserts the synopsis content for a chapter identified by serial slug + chapter idx.
 *
 * @example
 * await saveChapterSynopsis("one-piece", 42, "A brief recap…");
 */
export async function saveChapterSynopsis(
  serialSlug: string,
  chapterIdx: number,
  content: string,
): Promise<void> {
  await requireSerialAdminBySlug(serialSlug);

  const [serial] = await db
    .select({ id: serials.id })
    .from(serials)
    .where(eq(serials.slug, serialSlug))
    .limit(1);
  if (!serial) throw new Error("Serial not found");

  const [chapter] = await db
    .select({ id: chapters.id })
    .from(chapters)
    .innerJoin(volumes, eq(chapters.volumeId, volumes.id))
    .where(and(eq(volumes.serialId, serial.id), eq(chapters.idx, chapterIdx)))
    .limit(1);
  if (!chapter) throw new Error("Chapter not found");

  await db
    .insert(chapterSynopses)
    .values({ chapterId: chapter.id, content })
    .onConflictDoUpdate({
      target: chapterSynopses.chapterId,
      set: { content, updatedAt: new Date() },
    });

  revalidatePath(`/${serialSlug}/chapter/${chapterIdx}`);
}
