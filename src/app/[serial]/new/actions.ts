'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { db } from '@/db/index';
import {
  serials, pages, pageTitles, pageRelationships, pageSections, pageInfoboxSections,
  templates, templateSections, templateInfoboxSections,
} from '@/db/schema';
import { and, asc, eq, like } from 'drizzle-orm';
import { titleToSlug } from '@/lib/slug';

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
  const templateIdRaw = formData.get('templateId');

  if (!name || typeof name !== 'string' || name.trim() === '') {
    throw new Error('Page name is required');
  }
  if (!introChapterIdRaw || typeof introChapterIdRaw !== 'string') {
    throw new Error('Intro chapter is required');
  }

  const introChapterId = parseInt(introChapterIdRaw, 10);
  if (isNaN(introChapterId) || introChapterId <= 0) throw new Error('Intro chapter is required');

  if (!parentPageIdRaw || typeof parentPageIdRaw !== 'string' || parentPageIdRaw === '') {
    throw new Error('Parent page is required');
  }
  const parentPageId = parseInt(parentPageIdRaw, 10);
  if (isNaN(parentPageId) || parentPageId <= 0) throw new Error('Invalid parent page ID');

  // Optional template — empty string or missing means no template.
  const templateId =
    templateIdRaw && typeof templateIdRaw === 'string' && templateIdRaw !== ''
      ? parseInt(templateIdRaw, 10)
      : null;

  const [serial] = await db
    .select({ id: serials.id })
    .from(serials)
    .where(eq(serials.slug, serialSlug))
    .limit(1);
  if (!serial) throw new Error('Serial not found');

  // Pre-fetch the template definition outside the transaction (read-only).
  let templateDef: {
    hasInfobox: boolean;
    sections: { name: string; displayOrder: number }[];
    infoboxSections: { label: string; displayOrder: number }[];
  } | null = null;

  if (templateId !== null && !isNaN(templateId)) {
    const [tmpl] = await db
      .select({ id: templates.id, hasInfobox: templates.hasInfobox })
      .from(templates)
      .where(and(eq(templates.id, templateId), eq(templates.serialId, serial.id)));

    if (tmpl) {
      const [tmplSections, tmplInfoboxSections] = await Promise.all([
        db
          .select({ name: templateSections.name, displayOrder: templateSections.displayOrder })
          .from(templateSections)
          .where(eq(templateSections.templateId, tmpl.id))
          .orderBy(asc(templateSections.displayOrder)),
        tmpl.hasInfobox
          ? db
              .select({ label: templateInfoboxSections.label, displayOrder: templateInfoboxSections.displayOrder })
              .from(templateInfoboxSections)
              .where(eq(templateInfoboxSections.templateId, tmpl.id))
              .orderBy(asc(templateInfoboxSections.displayOrder))
          : Promise.resolve([]),
      ]);
      templateDef = {
        hasInfobox: tmpl.hasInfobox,
        sections: tmplSections,
        infoboxSections: tmplInfoboxSections,
      };
    }
  }

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

    // 3. Insert a page_relationships row linking to the required parent,
    // stamped at the child's intro chapter.
    await tx.insert(pageRelationships).values({
      parentPageId,
      childPageId: newPage.id,
      chapterId: introChapterId,
      isActive: true,
    });

    // 4. Seed sections from the template (or fall back to a default "Summary" section).
    if (templateDef && templateDef.sections.length > 0) {
      await tx.insert(pageSections).values(
        templateDef.sections.map((s) => ({
          pageId: newPage.id,
          name: s.name,
          displayOrder: s.displayOrder,
        })),
      );
    } else {
      await tx.insert(pageSections).values({
        pageId: newPage.id,
        name: 'Summary',
        displayOrder: 0,
      });
    }

    // 5. Seed infobox rows from the template when hasInfobox is true.
    if (templateDef?.hasInfobox && templateDef.infoboxSections.length > 0) {
      await tx.insert(pageInfoboxSections).values(
        templateDef.infoboxSections.map((s) => ({
          pageId: newPage.id,
          label: s.label,
          displayOrder: s.displayOrder,
        })),
      );
    }
  });

  revalidatePath(`/${serialSlug}`, 'layout');
  redirect(`/${serialSlug}/${encodeURIComponent(slug)}`);
}
