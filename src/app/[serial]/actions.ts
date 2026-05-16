'use server';

import { redirect } from 'next/navigation';
import { db } from '@/db/index';
import {
  serials, serialAuthors, volumes, chapters, pages, pageTitles,
  templates, templateSections, templateInfoboxSections,
} from '@/db/schema';
import { and, asc, count, eq, gte, gt, inArray, lte, max, sql } from 'drizzle-orm';
import { parseChapterType, parseVolumeType } from '@/lib/serialTypes';
import { titleToSlug } from '@/lib/slug';
import { requireSerialAdmin } from '@/lib/auth-guard';

export async function deleteChapter(serialId: number, formData: FormData) {
  await requireSerialAdmin(serialId);
  const chapterIdRaw = formData.get('chapterId');
  if (!chapterIdRaw || typeof chapterIdRaw !== 'string') throw new Error('Chapter ID is required');

  const chapterId = parseInt(chapterIdRaw, 10);
  if (isNaN(chapterId)) throw new Error('Invalid chapter ID');

  const [target] = await db.select({ idx: chapters.idx }).from(chapters).where(eq(chapters.id, chapterId));

  await db.delete(chapters).where(eq(chapters.id, chapterId));

  const toShift = await db
    .select({ id: chapters.id })
    .from(chapters)
    .innerJoin(volumes, eq(chapters.volumeId, volumes.id))
    .where(and(eq(volumes.serialId, serialId), gt(chapters.idx, target.idx)));

  if (toShift.length > 0) {
    await db
      .update(chapters)
      .set({ idx: sql`${chapters.idx} - 1` })
      .where(inArray(chapters.id, toShift.map((c) => c.id)));
  }
}

export async function deleteVolume(serialId: number, formData: FormData) {
  await requireSerialAdmin(serialId);
  const volumeIdRaw = formData.get('volumeId');
  if (!volumeIdRaw || typeof volumeIdRaw !== 'string') throw new Error('Volume ID is required');

  const volumeId = parseInt(volumeIdRaw, 10);
  if (isNaN(volumeId)) throw new Error('Invalid volume ID');

  const volumeChapters = await db
    .select({ id: chapters.id, idx: chapters.idx })
    .from(chapters)
    .where(eq(chapters.volumeId, volumeId));

  const count = volumeChapters.length;
  const minIdx = count > 0 ? Math.min(...volumeChapters.map((c) => c.idx)) : null;

  await db.delete(chapters).where(eq(chapters.volumeId, volumeId));
  await db.delete(volumes).where(eq(volumes.id, volumeId));

  if (count > 0 && minIdx !== null) {
    const toShift = await db
      .select({ id: chapters.id })
      .from(chapters)
      .innerJoin(volumes, eq(chapters.volumeId, volumes.id))
      .where(and(eq(volumes.serialId, serialId), gte(chapters.idx, minIdx)));

    if (toShift.length > 0) {
      await db
        .update(chapters)
        .set({ idx: sql`${chapters.idx} - ${count}` })
        .where(inArray(chapters.id, toShift.map((c) => c.id)));
    }
  }
}

export async function addVolume(serialId: number, formData: FormData) {
  await requireSerialAdmin(serialId);
  const displayName = formData.get('displayName');
  if (!displayName || typeof displayName !== 'string' || displayName.trim() === '') {
    throw new Error('Volume display name is required');
  }

  const [{ maxIdx }] = await db
    .select({ maxIdx: max(volumes.idx) })
    .from(volumes)
    .where(eq(volumes.serialId, serialId));

  await db.insert(volumes).values({
    serialId,
    displayName: displayName.trim(),
    idx: (maxIdx ?? 0) + 1,
  });
}

export async function renameVolume(serialId: number, formData: FormData) {
  await requireSerialAdmin(serialId);
  const volumeIdRaw = formData.get('volumeId');
  const displayName = formData.get('displayName');

  if (!volumeIdRaw || typeof volumeIdRaw !== 'string') throw new Error('Volume ID is required');
  if (!displayName || typeof displayName !== 'string' || displayName.trim() === '') throw new Error('Display name is required');

  const volumeId = parseInt(volumeIdRaw, 10);
  if (isNaN(volumeId)) throw new Error('Invalid volume ID');

  await db.update(volumes).set({ displayName: displayName.trim() }).where(eq(volumes.id, volumeId));
}

export async function renameChapter(serialId: number, formData: FormData) {
  await requireSerialAdmin(serialId);
  const chapterIdRaw = formData.get('chapterId');
  const displayName = formData.get('displayName');

  if (!chapterIdRaw || typeof chapterIdRaw !== 'string') throw new Error('Chapter ID is required');
  if (!displayName || typeof displayName !== 'string' || displayName.trim() === '') throw new Error('Display name is required');

  const chapterId = parseInt(chapterIdRaw, 10);
  if (isNaN(chapterId)) throw new Error('Invalid chapter ID');

  await db.update(chapters).set({ displayName: displayName.trim() }).where(eq(chapters.id, chapterId));
}

export async function updateSerialTypes(serialId: number, formData: FormData) {
  await requireSerialAdmin(serialId);
  const chapterType = parseChapterType(formData.get('chapterType'));
  const volumeType = parseVolumeType(formData.get('volumeType'));
  await db.update(serials).set({ chapterType, volumeType }).where(eq(serials.id, serialId));
}

/**
 * Reorders volumes for a serial by reassigning `idx` values in a single transaction.
 * `orderedVolumeIds` must contain every volume ID for the serial — no partial reorders.
 *
 * @example
 * await reorderVolumes(serialId, [3, 1, 2]);
 */
export async function reorderVolumes(serialId: number, orderedVolumeIds: number[]) {
  await requireSerialAdmin(serialId);
  if (orderedVolumeIds.length === 0) return;

  await db.transaction(async (tx) => {
    for (let i = 0; i < orderedVolumeIds.length; i++) {
      await tx
        .update(volumes)
        .set({ idx: i + 1 })
        .where(and(eq(volumes.id, orderedVolumeIds[i]), eq(volumes.serialId, serialId)));
    }

    // Re-sequence chapter idx to match the new volume order, preserving within-volume order.
    let chapterIdx = 0;
    for (const volumeId of orderedVolumeIds) {
      const volumeChapters = await tx
        .select({ id: chapters.id })
        .from(chapters)
        .where(eq(chapters.volumeId, volumeId))
        .orderBy(asc(chapters.idx));

      for (const chapter of volumeChapters) {
        chapterIdx++;
        await tx.update(chapters).set({ idx: chapterIdx }).where(eq(chapters.id, chapter.id));
      }
    }

  });
}

/**
 * Reorders chapters within a volume, reassigning global `chapters.idx` values so the
 * serial-level linear order stays strictly increasing (chapters in earlier volumes always
 * precede those in later volumes). All affected rows are updated in a single transaction.
 *
 * `orderedChapterIds` must contain every chapter ID for the target volume — no partial reorders.
 *
 * @example
 * await reorderChapters(serialId, volumeId, [5, 3, 4]);
 */
export async function reorderChapters(
  serialId: number,
  volumeId: number,
  orderedChapterIds: number[],
) {
  await requireSerialAdmin(serialId);
  if (orderedChapterIds.length === 0) return;

  await db.transaction(async (tx) => {
    const [targetVolume] = await tx
      .select({ idx: volumes.idx })
      .from(volumes)
      .where(and(eq(volumes.id, volumeId), eq(volumes.serialId, serialId)));

    if (!targetVolume) throw new Error('Volume not found');

    // baseIdx is the highest global idx among all chapters that precede this volume,
    // so we can start numbering this volume's chapters immediately after.
    const precedingResult = await tx
      .select({ maxIdx: max(chapters.idx) })
      .from(chapters)
      .innerJoin(volumes, eq(chapters.volumeId, volumes.id))
      .where(and(eq(volumes.serialId, serialId), sql`${volumes.idx} < ${targetVolume.idx}`));

    const baseIdx = precedingResult[0]?.maxIdx ?? 0;

    for (let i = 0; i < orderedChapterIds.length; i++) {
      await tx
        .update(chapters)
        .set({ idx: baseIdx + i + 1 })
        .where(eq(chapters.id, orderedChapterIds[i]));
    }

    // Re-sequence later volumes so the global idx remains strictly increasing.
    // Fetch ordered by idx to preserve their relative order.
    const followingChapters = await tx
      .select({ id: chapters.id })
      .from(chapters)
      .innerJoin(volumes, eq(chapters.volumeId, volumes.id))
      .where(and(eq(volumes.serialId, serialId), sql`${volumes.idx} > ${targetVolume.idx}`))
      .orderBy(asc(chapters.idx));

    for (let i = 0; i < followingChapters.length; i++) {
      await tx
        .update(chapters)
        .set({ idx: baseIdx + orderedChapterIds.length + i + 1 })
        .where(eq(chapters.id, followingChapters[i].id));
    }

  });
}

/**
 * Reassigns every chapter's `idx` and `volumeId` for a serial in one transaction.
 * Covers both within-volume reordering and cross-volume chapter moves.
 *
 * `volumeOrder` defines the global chapter sequence (earlier volumes → lower idx).
 * `chaptersByVolumeId` must include every chapter in the serial — no partial updates.
 *
 * @example
 * await reorderAllChapters(serialId, [1, 2], { 1: [10, 11], 2: [12] });
 */
export async function reorderAllChapters(
  serialId: number,
  volumeOrder: number[],
  chaptersByVolumeId: Record<number, number[]>,
) {
  await requireSerialAdmin(serialId);
  if (volumeOrder.length === 0) return;

  const serialVolumes = await db
    .select({ id: volumes.id })
    .from(volumes)
    .where(eq(volumes.serialId, serialId));
  const validVolumeIds = new Set(serialVolumes.map((v) => v.id));

  await db.transaction(async (tx) => {
    let idx = 0;
    for (const volumeId of volumeOrder) {
      if (!validVolumeIds.has(volumeId)) continue;
      for (const chapterId of chaptersByVolumeId[volumeId] ?? []) {
        idx++;
        await tx.update(chapters).set({ idx, volumeId }).where(eq(chapters.id, chapterId));
      }
    }

  });
}

export async function updateSerialMetadata(serialId: number, formData: FormData) {
  await requireSerialAdmin(serialId);
  const title = formData.get('title');
  if (!title || typeof title !== 'string' || title.trim() === '') {
    throw new Error('Title is required');
  }

  const splashArtUrl = formData.get('splashArtUrl');

  const authorValues = formData.getAll('authors') as string[];
  const filteredAuthors = authorValues.map((a) => a.trim()).filter((a) => a.length > 0);

  const newSlug = titleToSlug(title.trim());

  await db.update(serials).set({
    title: title.trim(),
    slug: newSlug,
    splashArtUrl:
      splashArtUrl && typeof splashArtUrl === 'string' && splashArtUrl.trim()
        ? splashArtUrl.trim()
        : null,
  }).where(eq(serials.id, serialId));

  // Replace all authors: delete existing rows and insert fresh ones.
  await db.delete(serialAuthors).where(eq(serialAuthors.serialId, serialId));
  if (filteredAuthors.length > 0) {
    await db.insert(serialAuthors).values(
      filteredAuthors.map((name, i) => ({
        serialId,
        name,
        displayOrder: i + 1,
      }))
    );
  }

  redirect(`/${newSlug}`);
}

export async function addChapter(serialId: number, formData: FormData) {
  await requireSerialAdmin(serialId);
  const displayName = formData.get('displayName');
  const volumeIdRaw = formData.get('volumeId');

  if (!displayName || typeof displayName !== 'string' || displayName.trim() === '') {
    throw new Error('Chapter display name is required');
  }
  if (!volumeIdRaw || typeof volumeIdRaw !== 'string') throw new Error('Volume is required');

  const volumeId = parseInt(volumeIdRaw, 10);
  if (isNaN(volumeId)) throw new Error('Invalid volume');

  const [targetVolume] = await db
    .select({ idx: volumes.idx })
    .from(volumes)
    .where(eq(volumes.id, volumeId));

  const [{ insertAfterIdx }] = await db
    .select({ insertAfterIdx: max(chapters.idx) })
    .from(chapters)
    .innerJoin(volumes, eq(chapters.volumeId, volumes.id))
    .where(and(eq(volumes.serialId, serialId), lte(volumes.idx, targetVolume.idx)));

  const newIdx = (insertAfterIdx ?? 0) + 1;

  const toShift = await db
    .select({ id: chapters.id })
    .from(chapters)
    .innerJoin(volumes, eq(chapters.volumeId, volumes.id))
    .where(and(eq(volumes.serialId, serialId), gte(chapters.idx, newIdx)));

  if (toShift.length > 0) {
    await db
      .update(chapters)
      .set({ idx: sql`${chapters.idx} + 1` })
      .where(inArray(chapters.id, toShift.map((c) => c.id)));
  }

  // Check whether this is the first chapter for the serial before inserting.
  const [{ existingCount }] = await db
    .select({ existingCount: count(chapters.id) })
    .from(chapters)
    .innerJoin(volumes, eq(chapters.volumeId, volumes.id))
    .where(eq(volumes.serialId, serialId));

  const isFirstChapter = existingCount === 0;

  const [newChapter] = await db
    .insert(chapters)
    .values({
      volumeId,
      displayName: displayName.trim(),
      idx: newIdx,
    })
    .returning({ id: chapters.id });

  // When the first chapter is added, create a pageTitles entry for the home
  // page so it participates in temporal name tracking from this chapter onward.
  if (isFirstChapter) {
    const [homePage] = await db
      .select({ id: pages.id })
      .from(pages)
      .where(and(eq(pages.serialId, serialId), eq(pages.isHomePage, true)));

    if (homePage) {
      await db.insert(pageTitles).values({
        pageId: homePage.id,
        chapterId: newChapter.id,
        title: 'Home',
      }).onConflictDoNothing();
    }
  }
}

// ── Template management ───────────────────────────────────────────────────────

/**
 * Creates a new page template for the serial with the given name.
 *
 * @example
 * await createTemplate(42, new FormData()); // formData has "name" field
 */
export async function createTemplate(serialId: number, formData: FormData) {
  await requireSerialAdmin(serialId);
  const name = formData.get('name');
  if (!name || typeof name !== 'string' || name.trim() === '') {
    throw new Error('Template name is required');
  }

  await db.insert(templates).values({
    serialId,
    name: name.trim(),
    hasInfobox: false,
  });
}

/**
 * Deletes a template along with its section and infobox section definitions.
 *
 * @example
 * await deleteTemplate(42, new FormData()); // formData has "templateId" field
 */
export async function deleteTemplate(serialId: number, formData: FormData) {
  await requireSerialAdmin(serialId);
  const templateIdRaw = formData.get('templateId');
  if (!templateIdRaw || typeof templateIdRaw !== 'string') throw new Error('Template ID is required');
  const templateId = parseInt(templateIdRaw, 10);
  if (isNaN(templateId)) throw new Error('Invalid template ID');

  // Verify the template belongs to this serial before deleting.
  const [target] = await db
    .select({ id: templates.id })
    .from(templates)
    .where(and(eq(templates.id, templateId), eq(templates.serialId, serialId)));
  if (!target) throw new Error('Template not found');

  await db.transaction(async (tx) => {
    await tx.delete(templateInfoboxSections).where(eq(templateInfoboxSections.templateId, templateId));
    await tx.delete(templateSections).where(eq(templateSections.templateId, templateId));
    await tx.delete(templates).where(eq(templates.id, templateId));
  });
}

/**
 * Renames an existing template.
 *
 * @example
 * await renameTemplate(42, new FormData()); // formData has "templateId" and "name" fields
 */
export async function renameTemplate(serialId: number, formData: FormData) {
  await requireSerialAdmin(serialId);
  const templateIdRaw = formData.get('templateId');
  const name = formData.get('name');
  if (!templateIdRaw || typeof templateIdRaw !== 'string') throw new Error('Template ID is required');
  if (!name || typeof name !== 'string' || name.trim() === '') throw new Error('Template name is required');

  const templateId = parseInt(templateIdRaw, 10);
  if (isNaN(templateId)) throw new Error('Invalid template ID');

  await db
    .update(templates)
    .set({ name: name.trim() })
    .where(and(eq(templates.id, templateId), eq(templates.serialId, serialId)));
}

/**
 * Toggles the `hasInfobox` flag on a template.
 *
 * @example
 * await toggleTemplateInfobox(42, new FormData()); // formData has "templateId" and "hasInfobox" fields
 */
export async function toggleTemplateInfobox(serialId: number, formData: FormData) {
  await requireSerialAdmin(serialId);
  const templateIdRaw = formData.get('templateId');
  const hasInfoboxRaw = formData.get('hasInfobox');
  if (!templateIdRaw || typeof templateIdRaw !== 'string') throw new Error('Template ID is required');

  const templateId = parseInt(templateIdRaw, 10);
  if (isNaN(templateId)) throw new Error('Invalid template ID');

  const hasInfobox = hasInfoboxRaw === 'true';

  await db
    .update(templates)
    .set({ hasInfobox })
    .where(and(eq(templates.id, templateId), eq(templates.serialId, serialId)));
}

/**
 * Appends a new section name to a template.
 *
 * @example
 * await addTemplateSection(42, new FormData()); // formData has "templateId" and "name" fields
 */
export async function addTemplateSection(serialId: number, formData: FormData) {
  await requireSerialAdmin(serialId);
  const templateIdRaw = formData.get('templateId');
  const name = formData.get('name');
  if (!templateIdRaw || typeof templateIdRaw !== 'string') throw new Error('Template ID is required');
  if (!name || typeof name !== 'string' || name.trim() === '') throw new Error('Section name is required');

  const templateId = parseInt(templateIdRaw, 10);
  if (isNaN(templateId)) throw new Error('Invalid template ID');

  // Verify ownership.
  const [target] = await db
    .select({ id: templates.id })
    .from(templates)
    .where(and(eq(templates.id, templateId), eq(templates.serialId, serialId)));
  if (!target) throw new Error('Template not found');

  const [{ maxOrder }] = await db
    .select({ maxOrder: max(templateSections.displayOrder) })
    .from(templateSections)
    .where(eq(templateSections.templateId, templateId));

  await db.insert(templateSections).values({
    templateId,
    name: name.trim(),
    displayOrder: (maxOrder ?? -1) + 1,
  });
}

/**
 * Removes a section from a template.
 *
 * @example
 * await deleteTemplateSection(42, new FormData()); // formData has "sectionId" field
 */
export async function deleteTemplateSection(serialId: number, formData: FormData) {
  await requireSerialAdmin(serialId);
  const sectionIdRaw = formData.get('sectionId');
  if (!sectionIdRaw || typeof sectionIdRaw !== 'string') throw new Error('Section ID is required');
  const sectionId = parseInt(sectionIdRaw, 10);
  if (isNaN(sectionId)) throw new Error('Invalid section ID');

  // Verify the section's template belongs to this serial.
  const [target] = await db
    .select({ id: templateSections.id })
    .from(templateSections)
    .innerJoin(templates, eq(templateSections.templateId, templates.id))
    .where(and(eq(templateSections.id, sectionId), eq(templates.serialId, serialId)));
  if (!target) throw new Error('Section not found');

  await db.delete(templateSections).where(eq(templateSections.id, sectionId));
}

/**
 * Reorders sections within a template. `orderedSectionIds` must include every
 * section for the template — no partial reorders.
 *
 * @example
 * await reorderTemplateSections(42, [3, 1, 2]);
 */
export async function reorderTemplateSections(
  serialId: number,
  templateId: number,
  orderedSectionIds: number[],
) {
  await requireSerialAdmin(serialId);
  if (orderedSectionIds.length === 0) return;

  // Verify ownership.
  const [target] = await db
    .select({ id: templates.id })
    .from(templates)
    .where(and(eq(templates.id, templateId), eq(templates.serialId, serialId)));
  if (!target) throw new Error('Template not found');

  await db.transaction(async (tx) => {
    for (let i = 0; i < orderedSectionIds.length; i++) {
      await tx
        .update(templateSections)
        .set({ displayOrder: i })
        .where(and(eq(templateSections.id, orderedSectionIds[i]), eq(templateSections.templateId, templateId)));
    }
  });
}

/**
 * Appends a new infobox section label to a template.
 *
 * @example
 * await addTemplateInfoboxSection(42, new FormData()); // formData has "templateId" and "label" fields
 */
export async function addTemplateInfoboxSection(serialId: number, formData: FormData) {
  await requireSerialAdmin(serialId);
  const templateIdRaw = formData.get('templateId');
  const label = formData.get('label');
  if (!templateIdRaw || typeof templateIdRaw !== 'string') throw new Error('Template ID is required');
  if (!label || typeof label !== 'string' || label.trim() === '') throw new Error('Label is required');

  const templateId = parseInt(templateIdRaw, 10);
  if (isNaN(templateId)) throw new Error('Invalid template ID');

  // Verify ownership.
  const [target] = await db
    .select({ id: templates.id })
    .from(templates)
    .where(and(eq(templates.id, templateId), eq(templates.serialId, serialId)));
  if (!target) throw new Error('Template not found');

  const [{ maxOrder }] = await db
    .select({ maxOrder: max(templateInfoboxSections.displayOrder) })
    .from(templateInfoboxSections)
    .where(eq(templateInfoboxSections.templateId, templateId));

  await db.insert(templateInfoboxSections).values({
    templateId,
    label: label.trim(),
    displayOrder: (maxOrder ?? -1) + 1,
  });
}

/**
 * Removes an infobox section from a template.
 *
 * @example
 * await deleteTemplateInfoboxSection(42, new FormData()); // formData has "infoboxSectionId" field
 */
export async function deleteTemplateInfoboxSection(serialId: number, formData: FormData) {
  await requireSerialAdmin(serialId);
  const infoboxSectionIdRaw = formData.get('infoboxSectionId');
  if (!infoboxSectionIdRaw || typeof infoboxSectionIdRaw !== 'string') throw new Error('Infobox section ID is required');
  const infoboxSectionId = parseInt(infoboxSectionIdRaw, 10);
  if (isNaN(infoboxSectionId)) throw new Error('Invalid infobox section ID');

  // Verify the infobox section's template belongs to this serial.
  const [target] = await db
    .select({ id: templateInfoboxSections.id })
    .from(templateInfoboxSections)
    .innerJoin(templates, eq(templateInfoboxSections.templateId, templates.id))
    .where(and(eq(templateInfoboxSections.id, infoboxSectionId), eq(templates.serialId, serialId)));
  if (!target) throw new Error('Infobox section not found');

  await db.delete(templateInfoboxSections).where(eq(templateInfoboxSections.id, infoboxSectionId));
}

