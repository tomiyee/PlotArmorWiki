import { db } from "@/db/index";
import {
  templates,
  templateSections,
  templateInfoboxSections,
} from "@/db/schema";
import { asc, eq, inArray } from "drizzle-orm";
import type { TemplateSummary } from "@/types";

/**
 * Fetches all templates for a serial with their sections and infobox rows,
 * ordered alphabetically. Returns `[]` when the serial has no templates.
 *
 * Runs three queries (templates → sections + infobox rows in parallel) and
 * groups in JS; templates per serial are a small set so this is always fast.
 *
 * This is the single source of truth for template data; previously duplicated
 * as a local `fetchSerialTemplates` function inside `[page]/page.tsx` and
 * `[serial]/new/queries.ts`.
 */
export async function fetchSerialTemplates(
  serialId: number,
): Promise<TemplateSummary[]> {
  const tmplRows = await db
    .select({
      id: templates.id,
      name: templates.name,
      hasInfobox: templates.hasInfobox,
    })
    .from(templates)
    .where(eq(templates.serialId, serialId))
    .orderBy(asc(templates.name));

  if (tmplRows.length === 0) return [];

  const tmplIds = tmplRows.map((t) => t.id);

  const [allTmplSections, allTmplInfoboxSections] = await Promise.all([
    db
      .select({
        templateId: templateSections.templateId,
        id: templateSections.id,
        name: templateSections.name,
        displayOrder: templateSections.displayOrder,
      })
      .from(templateSections)
      .where(inArray(templateSections.templateId, tmplIds))
      .orderBy(asc(templateSections.displayOrder)),
    db
      .select({
        templateId: templateInfoboxSections.templateId,
        id: templateInfoboxSections.id,
        label: templateInfoboxSections.label,
        displayOrder: templateInfoboxSections.displayOrder,
      })
      .from(templateInfoboxSections)
      .where(inArray(templateInfoboxSections.templateId, tmplIds))
      .orderBy(asc(templateInfoboxSections.displayOrder)),
  ]);

  const sectionsByTemplate = Map.groupBy(allTmplSections, (s) => s.templateId);
  const infoboxByTemplate = Map.groupBy(
    allTmplInfoboxSections,
    (s) => s.templateId,
  );

  return tmplRows.map((t) => ({
    id: t.id,
    name: t.name,
    hasInfobox: t.hasInfobox,
    sections: sectionsByTemplate.get(t.id) ?? [],
    infoboxSections: infoboxByTemplate.get(t.id) ?? [],
  }));
}
