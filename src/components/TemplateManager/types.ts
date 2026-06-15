export interface TemplateSection {
  /** Database PK. */
  id: number;
  /** Display name shown in the section list. */
  name: string;
  /** 0-based ordering index among sibling sections. */
  displayOrder: number;
}

export interface TemplateInfoboxSection {
  /** Database PK. */
  id: number;
  /** Row label shown in the infobox sidebar. */
  label: string;
  /** 0-based ordering index among sibling infobox rows. */
  displayOrder: number;
  /** When true, page infobox content for this row is included in full-text search. */
  includeInSearch: boolean;
}

export interface Template {
  /** Database PK. */
  id: number;
  /** Human-readable template name (e.g. "Character"). */
  name: string;
  /** Whether pages using this template include an infobox sidebar. */
  hasInfobox: boolean;
  /** Content sections seeded onto new pages. */
  sections: TemplateSection[];
  /** Infobox rows seeded onto new pages; only relevant when hasInfobox is true. */
  infoboxSections: TemplateInfoboxSection[];
}

/** Shorthand for the server action signature used throughout TemplateManager. */
export type ServerAction = (formData: FormData) => Promise<void>;

/**
 * Shorthand for the reorder server action. Receives the template id and the
 * full ordered id array so a single bound action can serve all templates.
 */
export type ReorderAction = (
  templateId: number,
  orderedIds: number[],
) => Promise<void>;

export interface TemplateManagerProps {
  /** All templates belonging to the current serial. */
  templates: Template[];
  /** Creates a new template with the given name. */
  createTemplateAction: ServerAction;
  /** Deletes a template by templateId. */
  deleteTemplateAction: ServerAction;
  /** Renames a template by templateId. */
  renameTemplateAction: ServerAction;
  /** Toggles the hasInfobox flag on a template. */
  toggleTemplateInfoboxAction: ServerAction;
  /** Appends a section to a template's section list. */
  addTemplateSectionAction: ServerAction;
  /** Removes a section from a template. */
  deleteTemplateSectionAction: ServerAction;
  /** Persists the new display order for template sections after drag-and-drop. */
  reorderTemplateSectionAction: ReorderAction;
  /** Appends an infobox row to a template. */
  addTemplateInfoboxSectionAction: ServerAction;
  /** Removes an infobox row from a template. */
  deleteTemplateInfoboxSectionAction: ServerAction;
  /** Persists the new display order for infobox rows after drag-and-drop. */
  reorderTemplateInfoboxSectionAction: ReorderAction;
  /** Toggles whether a template infobox row's content is included in search. */
  toggleTemplateInfoboxSectionSearchAction: ServerAction;
}
