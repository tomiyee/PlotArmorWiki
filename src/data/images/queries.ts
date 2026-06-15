import { db } from "@/db/index";
import { serialImages, chapters, serialImagePageLinks } from "@/db/schema";
import { and, asc, desc, eq, isNull, lte, or } from "drizzle-orm";
import type { GalleryImage } from "@/types";

/**
 * Returns all gallery images for a serial that are safe to display at the
 * reader's chapter cutoff. Images with a `spoilerChapterId` whose idx exceeds
 * `cutoffIdx` are suppressed, matching the same gate used for page content.
 *
 * Images with `spoilerChapterId = null` are always included (safe for all readers).
 *
 * @example
 * const images = await fetchGalleryImages(serialId, cutoffIdx);
 * // [{ id: 1, imageUrl: "https://...", artist: "Artist Name", spoilerChapterIdx: null }]
 */
export async function fetchGalleryImages(
  serialId: number,
  cutoffIdx: number,
): Promise<GalleryImage[]> {
  const rows = await db
    .select({
      id: serialImages.id,
      imageUrl: serialImages.imageUrl,
      artist: serialImages.artist,
      spoilerChapterId: serialImages.spoilerChapterId,
      spoilerChapterIdx: chapters.idx,
      createdAt: serialImages.createdAt,
    })
    .from(serialImages)
    .leftJoin(chapters, eq(serialImages.spoilerChapterId, chapters.id))
    .where(
      and(
        eq(serialImages.serialId, serialId),
        or(
          isNull(serialImages.spoilerChapterId),
          lte(chapters.idx, cutoffIdx),
        ),
      ),
    )
    .orderBy(desc(serialImages.createdAt));

  return rows.map((r) => ({
    id: r.id,
    imageUrl: r.imageUrl,
    artist: r.artist ?? null,
    spoilerChapterId: r.spoilerChapterId ?? null,
    spoilerChapterIdx: r.spoilerChapterIdx ?? null,
    createdAt: r.createdAt,
  }));
}

/**
 * Inserts a new image into the serial gallery. Optionally links the image to
 * the given wiki pages via `serial_image_page_links`. Returns the new image id.
 *
 * @example
 * const id = await addGalleryImage(serialId, "https://...", "Artist", null, [42]);
 */
export async function addGalleryImage(
  serialId: number,
  imageUrl: string,
  artist: string | null,
  spoilerChapterId: number | null,
  linkedPageIds: number[],
): Promise<number> {
  return await db.transaction(async (tx) => {
    const [inserted] = await tx
      .insert(serialImages)
      .values({ serialId, imageUrl, artist, spoilerChapterId })
      .returning({ id: serialImages.id });

    if (!inserted) throw new Error("Failed to insert gallery image");

    if (linkedPageIds.length > 0) {
      await tx.insert(serialImagePageLinks).values(
        linkedPageIds.map((pageId) => ({ imageId: inserted.id, pageId })),
      );
    }

    return inserted.id;
  });
}

/**
 * Fetches gallery images linked to a specific page, filtered to the cutoff.
 * Used by the gallery picker to pre-highlight images already associated with
 * the page being edited.
 *
 * @example
 * const linked = await fetchLinkedGalleryImages(pageId, cutoffIdx);
 */
export async function fetchLinkedGalleryImages(
  pageId: number,
  cutoffIdx: number,
): Promise<GalleryImage[]> {
  const rows = await db
    .select({
      id: serialImages.id,
      imageUrl: serialImages.imageUrl,
      artist: serialImages.artist,
      spoilerChapterId: serialImages.spoilerChapterId,
      spoilerChapterIdx: chapters.idx,
      createdAt: serialImages.createdAt,
    })
    .from(serialImages)
    .innerJoin(
      serialImagePageLinks,
      eq(serialImages.id, serialImagePageLinks.imageId),
    )
    .leftJoin(chapters, eq(serialImages.spoilerChapterId, chapters.id))
    .where(
      and(
        eq(serialImagePageLinks.pageId, pageId),
        or(
          isNull(serialImages.spoilerChapterId),
          lte(chapters.idx, cutoffIdx),
        ),
      ),
    )
    .orderBy(asc(serialImages.createdAt));

  return rows.map((r) => ({
    id: r.id,
    imageUrl: r.imageUrl,
    artist: r.artist ?? null,
    spoilerChapterId: r.spoilerChapterId ?? null,
    spoilerChapterIdx: r.spoilerChapterIdx ?? null,
    createdAt: r.createdAt,
  }));
}
