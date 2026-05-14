'use client';

import { useState } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faPlus, faTrash, faPencil, faChevronDown, faChevronRight } from '@fortawesome/free-solid-svg-icons';
import { Text } from '@/components/ui/text';
import { Box } from '@/components/ui/box';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { useServerAction } from '@/hooks/useServerAction';
import { useEditMode } from '@/contexts/EditModeContext';

// ─── Types ──────────────────────────────────────────────────────────────────

export interface TemplateSection {
  id: number;
  name: string;
  displayOrder: number;
}

export interface TemplateInfoboxSection {
  id: number;
  label: string;
  displayOrder: number;
}

export interface Template {
  id: number;
  name: string;
  hasInfobox: boolean;
  sections: TemplateSection[];
  infoboxSections: TemplateInfoboxSection[];
}

interface TemplateManagerProps {
  templates: Template[];
  createTemplateAction: (formData: FormData) => Promise<void>;
  deleteTemplateAction: (formData: FormData) => Promise<void>;
  renameTemplateAction: (formData: FormData) => Promise<void>;
  toggleTemplateInfoboxAction: (formData: FormData) => Promise<void>;
  addTemplateSectionAction: (formData: FormData) => Promise<void>;
  deleteTemplateSectionAction: (formData: FormData) => Promise<void>;
  addTemplateInfoboxSectionAction: (formData: FormData) => Promise<void>;
  deleteTemplateInfoboxSectionAction: (formData: FormData) => Promise<void>;
}

// ─── Template item ───────────────────────────────────────────────────────────

interface TemplateItemProps {
  template: Template;
  deleteTemplateAction: (formData: FormData) => Promise<void>;
  renameTemplateAction: (formData: FormData) => Promise<void>;
  toggleTemplateInfoboxAction: (formData: FormData) => Promise<void>;
  addTemplateSectionAction: (formData: FormData) => Promise<void>;
  deleteTemplateSectionAction: (formData: FormData) => Promise<void>;
  addTemplateInfoboxSectionAction: (formData: FormData) => Promise<void>;
  deleteTemplateInfoboxSectionAction: (formData: FormData) => Promise<void>;
}

function TemplateItem({
  template,
  deleteTemplateAction,
  renameTemplateAction,
  toggleTemplateInfoboxAction,
  addTemplateSectionAction,
  deleteTemplateSectionAction,
  addTemplateInfoboxSectionAction,
  deleteTemplateInfoboxSectionAction,
}: TemplateItemProps) {
  const { run, isPending } = useServerAction();
  const [expanded, setExpanded] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [renameDraft, setRenameDraft] = useState(template.name);
  const [addingSectionName, setAddingSectionName] = useState('');
  const [addingInfoboxLabel, setAddingInfoboxLabel] = useState('');

  function handleRename() {
    if (!renameDraft.trim() || renameDraft.trim() === template.name) {
      setRenaming(false);
      return;
    }
    const fd = new FormData();
    fd.set('templateId', String(template.id));
    fd.set('name', renameDraft.trim());
    run(renameTemplateAction, fd, () => setRenaming(false));
  }

  function handleDelete() {
    const fd = new FormData();
    fd.set('templateId', String(template.id));
    run(deleteTemplateAction, fd);
  }

  function handleToggleInfobox(checked: boolean) {
    const fd = new FormData();
    fd.set('templateId', String(template.id));
    fd.set('hasInfobox', String(checked));
    run(toggleTemplateInfoboxAction, fd);
  }

  function handleAddSection() {
    if (!addingSectionName.trim()) return;
    const fd = new FormData();
    fd.set('templateId', String(template.id));
    fd.set('name', addingSectionName.trim());
    run(addTemplateSectionAction, fd, () => setAddingSectionName(''));
  }

  function handleDeleteSection(sectionId: number) {
    const fd = new FormData();
    fd.set('sectionId', String(sectionId));
    run(deleteTemplateSectionAction, fd);
  }

  function handleAddInfoboxSection() {
    if (!addingInfoboxLabel.trim()) return;
    const fd = new FormData();
    fd.set('templateId', String(template.id));
    fd.set('label', addingInfoboxLabel.trim());
    run(addTemplateInfoboxSectionAction, fd, () => setAddingInfoboxLabel(''));
  }

  function handleDeleteInfoboxSection(infoboxSectionId: number) {
    const fd = new FormData();
    fd.set('infoboxSectionId', String(infoboxSectionId));
    run(deleteTemplateInfoboxSectionAction, fd);
  }

  const sortedSections = [...template.sections].sort((a, b) => a.displayOrder - b.displayOrder);
  const sortedInfoboxSections = [...template.infoboxSections].sort((a, b) => a.displayOrder - b.displayOrder);

  return (
    <div className="rounded-lg border border-gray-200 overflow-hidden">
      {/* Header row */}
      <Box className="items-center gap-2 px-3 py-2 bg-gray-50">
        <button
          type="button"
          onClick={() => setExpanded((p) => !p)}
          className="flex items-center gap-1.5 flex-1 min-w-0 text-left"
          aria-expanded={expanded}
        >
          <FontAwesomeIcon
            icon={expanded ? faChevronDown : faChevronRight}
            className="h-3 w-3 text-gray-400 shrink-0"
          />
          {renaming ? (
            <Input
              value={renameDraft}
              onChange={(e) => setRenameDraft(e.target.value)}
              onBlur={handleRename}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleRename();
                if (e.key === 'Escape') {
                  setRenameDraft(template.name);
                  setRenaming(false);
                }
              }}
              autoFocus
              className="h-7 text-sm"
              onClick={(e) => e.stopPropagation()}
            />
          ) : (
            <Text variant="h4" as="span" className="truncate">
              {template.name}
            </Text>
          )}
        </button>

        <Box className="items-center gap-1 shrink-0">
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            title="Rename template"
            onClick={() => { setRenaming((p) => !p); setRenameDraft(template.name); }}
            disabled={isPending}
          >
            <FontAwesomeIcon icon={faPencil} className="h-3 w-3" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            title="Delete template"
            onClick={handleDelete}
            disabled={isPending}
          >
            <FontAwesomeIcon icon={faTrash} className="h-3 w-3 text-red-500" />
          </Button>
        </Box>
      </Box>

      {/* Expanded body */}
      {expanded && (
        <div className="px-3 py-3 flex flex-col gap-4">
          {/* has_infobox toggle */}
          <Box className="items-center gap-2">
            <input
              type="checkbox"
              id={`has-infobox-${template.id}`}
              checked={template.hasInfobox}
              onChange={(e) => handleToggleInfobox(e.target.checked)}
              disabled={isPending}
              className="h-4 w-4 rounded border-gray-300"
            />
            <Label htmlFor={`has-infobox-${template.id}`}>Has infobox sidebar</Label>
          </Box>

          {/* Sections */}
          <div>
            <Text variant="label" className="mb-1.5">Sections</Text>
            {sortedSections.length > 0 ? (
              <Box col className="gap-1 mb-2">
                {sortedSections.map((section) => (
                  <Box key={section.id} className="items-center gap-2 rounded border border-gray-100 px-2 py-1">
                    <Text className="flex-1 text-sm">{section.name}</Text>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-xs"
                      title="Remove section"
                      onClick={() => handleDeleteSection(section.id)}
                      disabled={isPending}
                    >
                      <FontAwesomeIcon icon={faTrash} className="h-2.5 w-2.5 text-red-400" />
                    </Button>
                  </Box>
                ))}
              </Box>
            ) : (
              <Text muted className="text-xs mb-2">No sections yet.</Text>
            )}
            <Box className="gap-2 items-center">
              <Input
                placeholder="Section name…"
                value={addingSectionName}
                onChange={(e) => setAddingSectionName(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleAddSection(); } }}
                className="h-7 text-sm flex-1"
                disabled={isPending}
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleAddSection}
                disabled={isPending || !addingSectionName.trim()}
              >
                <FontAwesomeIcon icon={faPlus} className="h-3 w-3" />
                Add
              </Button>
            </Box>
          </div>

          {/* Infobox sections (only shown when hasInfobox is true) */}
          {template.hasInfobox && (
            <div>
              <Text variant="label" className="mb-1.5">Infobox rows</Text>
              {sortedInfoboxSections.length > 0 ? (
                <Box col className="gap-1 mb-2">
                  {sortedInfoboxSections.map((row) => (
                    <Box key={row.id} className="items-center gap-2 rounded border border-gray-100 px-2 py-1">
                      <Text className="flex-1 text-sm">{row.label}</Text>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-xs"
                        title="Remove infobox row"
                        onClick={() => handleDeleteInfoboxSection(row.id)}
                        disabled={isPending}
                      >
                        <FontAwesomeIcon icon={faTrash} className="h-2.5 w-2.5 text-red-400" />
                      </Button>
                    </Box>
                  ))}
                </Box>
              ) : (
                <Text muted className="text-xs mb-2">No infobox rows yet.</Text>
              )}
              <Box className="gap-2 items-center">
                <Input
                  placeholder="Row label…"
                  value={addingInfoboxLabel}
                  onChange={(e) => setAddingInfoboxLabel(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleAddInfoboxSection(); } }}
                  className="h-7 text-sm flex-1"
                  disabled={isPending}
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleAddInfoboxSection}
                  disabled={isPending || !addingInfoboxLabel.trim()}
                >
                  <FontAwesomeIcon icon={faPlus} className="h-3 w-3" />
                  Add
                </Button>
              </Box>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── TemplateManager ─────────────────────────────────────────────────────────

/**
 * Manages the set of reusable page templates for a serial. Only renders the
 * editing controls when the global edit mode is active (i.e., an admin is
 * editing). Supports create, rename, delete, section management, and infobox
 * toggle per template.
 *
 * @example
 * <TemplateManager
 *   templates={templates}
 *   createTemplateAction={createTemplateAction}
 *   deleteTemplateAction={deleteTemplateAction}
 *   renameTemplateAction={renameTemplateAction}
 *   toggleTemplateInfoboxAction={toggleTemplateInfoboxAction}
 *   addTemplateSectionAction={addTemplateSectionAction}
 *   deleteTemplateSectionAction={deleteTemplateSectionAction}
 *   addTemplateInfoboxSectionAction={addTemplateInfoboxSectionAction}
 *   deleteTemplateInfoboxSectionAction={deleteTemplateInfoboxSectionAction}
 * />
 */
export function TemplateManager({
  templates,
  createTemplateAction,
  deleteTemplateAction,
  renameTemplateAction,
  toggleTemplateInfoboxAction,
  addTemplateSectionAction,
  deleteTemplateSectionAction,
  addTemplateInfoboxSectionAction,
  deleteTemplateInfoboxSectionAction,
}: TemplateManagerProps) {
  const { isEditing } = useEditMode();
  const { run, isPending } = useServerAction();
  const [creating, setCreating] = useState(false);
  const [newTemplateName, setNewTemplateName] = useState('');

  if (!isEditing) return null;

  function handleCreate() {
    if (!newTemplateName.trim()) return;
    const fd = new FormData();
    fd.set('name', newTemplateName.trim());
    run(createTemplateAction, fd, () => {
      setNewTemplateName('');
      setCreating(false);
    });
  }

  return (
    <section className="flex flex-col gap-4 mt-4">
      <Text variant="h2">Page Templates</Text>

      {templates.length > 0 ? (
        <Box col className="gap-2">
          {templates.map((template) => (
            <TemplateItem
              key={template.id}
              template={template}
              deleteTemplateAction={deleteTemplateAction}
              renameTemplateAction={renameTemplateAction}
              toggleTemplateInfoboxAction={toggleTemplateInfoboxAction}
              addTemplateSectionAction={addTemplateSectionAction}
              deleteTemplateSectionAction={deleteTemplateSectionAction}
              addTemplateInfoboxSectionAction={addTemplateInfoboxSectionAction}
              deleteTemplateInfoboxSectionAction={deleteTemplateInfoboxSectionAction}
            />
          ))}
        </Box>
      ) : (
        <Text muted>No templates yet. Create one to pre-populate sections when making new pages.</Text>
      )}

      <div className="mt-2 pt-4 border-t border-gray-100">
        {creating ? (
          <Box className="gap-2 items-center">
            <Input
              placeholder="Template name…"
              value={newTemplateName}
              onChange={(e) => setNewTemplateName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') { e.preventDefault(); handleCreate(); }
                if (e.key === 'Escape') { setCreating(false); setNewTemplateName(''); }
              }}
              autoFocus
              className="flex-1"
              disabled={isPending}
            />
            <Button type="button" onClick={handleCreate} disabled={isPending || !newTemplateName.trim()}>
              Create
            </Button>
            <Button
              type="button"
              variant="ghost"
              onClick={() => { setCreating(false); setNewTemplateName(''); }}
              disabled={isPending}
            >
              Cancel
            </Button>
          </Box>
        ) : (
          <Button
            type="button"
            variant="outline"
            onClick={() => setCreating(true)}
          >
            <FontAwesomeIcon icon={faPlus} className="h-3 w-3" />
            New template
          </Button>
        )}
      </div>
    </section>
  );
}
