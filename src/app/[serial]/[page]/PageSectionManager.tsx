"use client";

import { useState, useMemo } from "react";
import type { CSSProperties } from "react";
import { GripVerticalIcon, LayoutTemplateIcon, LockIcon, PenIcon, PlusIcon, Trash2Icon } from "lucide-react";
import { DndContext, closestCenter } from "@dnd-kit/core";
import { SortableContext, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Text } from "@/components/ui/Text";
import { Box } from "@/components/ui/Box";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { Select } from "@/components/ui/Select";
import {
  Dialog,
  DialogHeader,
  DialogTitle,
  DialogBody,
  DialogDescription,
  DialogFooter,
  DialogClose,
} from "@/components/ui/Dialog";
import { RenameForm } from "@/components/RenameForm";
import { useServerAction } from "@/hooks/useServerAction";
import { useOptimisticOrder } from "@/hooks/useOptimisticOrder";
import { Tooltip } from "@/components/ui/Tooltip";
import { InfoIcon } from "@/components/ui/InfoIcon";
import { useSortableSensors, makeDragEndHandler } from "@/lib/dndUtils";
import {
  addPageSection,
  deletePageSection,
  renamePageSection,
  reorderPageSections,
  applyTemplateSections,
} from "./actions";

export interface PageSection {
  id: number;
  name: string;
  displayOrder: number;
}

/** A template with its full section and infobox structure. */
export interface SerialTemplate {
  /** DB primary key. */
  id: number;
  /** Display name shown in the dropdown. */
  name: string;
  /** Whether the template includes infobox rows. */
  hasInfobox: boolean;
  /** Ordered section slots defined by this template. */
  sections: { id: number; name: string; displayOrder: number }[];
  /** Ordered infobox row slots defined by this template. */
  infoboxSections: { id: number; label: string; displayOrder: number }[];
}

type PageSectionManagerProps = {
  /** DB id of the page these sections belong to. */
  pageId: number;
  /** Current live (non-deleted) sections for this page. */
  sections: PageSection[];
  /**
   * Templates defined for this serial. When non-empty, an "Apply template"
   * button is rendered so editors can bulk-insert template sections.
   */
  serialTemplates?: SerialTemplate[];
};

function LockedSection({ section }: { section: PageSection }) {
  return (
    <li className="flex items-center gap-2 rounded-md px-3 py-2 text-sm bg-muted/50">
      <Box className="w-4 mr-1 flex-shrink-0" />
      <Box className="flex-1 items-center gap-1.5">
        <Text as="span" variant="label">
          {section.name}
        </Text>
        <InfoIcon contents="This section appears at the top of the page without a heading. Its content will be shown in preview tooltips when this page is mentioned elsewhere." />
      </Box>
      <LockIcon className="h-3 w-3 text-muted-foreground" />
    </li>
  );
}

function SortableSection({
  section,
  isPending,
  isRenaming,
  onStartRename,
  onCancelRename,
  onDelete,
  onRename,
}: {
  section: PageSection;
  isPending: boolean;
  isRenaming: boolean;
  onStartRename: () => void;
  onCancelRename: () => void;
  onDelete: () => void;
  onRename: (fd: FormData) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: section.id, disabled: isPending });

  const style: CSSProperties = {
    transform: CSS.Translate.toString(transform),
    transition,
    opacity: isDragging ? 0 : 1,
  };

  return (
    <li
      ref={setNodeRef}
      style={style}
      className="flex items-center gap-2 rounded-md px-3 py-2 text-sm bg-muted/50"
    >
      {isRenaming ? (
        <RenameForm
          hiddenName="sectionId"
          hiddenValue={section.id}
          fieldName="name"
          defaultValue={section.name}
          onSave={onRename}
          onCancel={onCancelRename}
          inputClassName="flex-1 h-7 text-sm"
        />
      ) : (
        <>
          <span
            {...attributes}
            {...listeners}
            className="text-muted-foreground cursor-grab active:cursor-grabbing touch-none shrink-0"
            title="Drag to reorder"
          >
            <GripVerticalIcon className="h-3 w-3" />
          </span>
          <Text
            as="span"
            variant="label"
            className="flex-1 cursor-pointer hover:text-primary transition-colors"
            title="Click to rename"
            onClick={onStartRename}
          >
            {section.name}
          </Text>
          <Box className="items-center gap-1">
            <Tooltip content={`Rename ${section.name}`}>
              <Button
                type="button"
                variant="ghost"
                size="icon-xs"
                aria-label={`Rename ${section.name}`}
                onClick={onStartRename}
              >
                <PenIcon className="h-2.5 w-2.5" />
              </Button>
            </Tooltip>
            <Tooltip content={`Delete ${section.name}`}>
              <Button
                type="button"
                variant="destructive"
                size="icon-xs"
                aria-label={`Delete ${section.name}`}
                onClick={onDelete}
              >
                <Trash2Icon className="h-2.5 w-2.5" />
              </Button>
            </Tooltip>
          </Box>
        </>
      )}
    </li>
  );
}

/**
 * Manages the wall-clock-versioned section structure for a single wiki page.
 * Lets editors add, rename, reorder (drag-and-drop), and delete sections.
 * Delete is guarded: sections with existing content revisions cannot be removed.
 * The first section is always locked in place (it holds the lead/preview content).
 *
 * When `serialTemplates` is non-empty, also renders an "Apply template" button
 * that opens a confirmation dialog. The dialog previews which sections will be
 * added vs. skipped (already present on the page) before committing.
 *
 * Shown only in edit mode, above the content editors in PageEditor.
 *
 * @example
 * <PageSectionManager
 *   pageId={42}
 *   sections={[{ id: 1, name: 'Summary', displayOrder: 0 }]}
 *   serialTemplates={[{ id: 1, name: 'Character', hasInfobox: true, sections: [], infoboxSections: [] }]}
 * />
 */
export function PageSectionManager(props: PageSectionManagerProps) {
  const { pageId, sections, serialTemplates = [] } = props;
  const { run, isPending } = useServerAction();
  const [renamingId, setRenamingId] = useState<number | null>(null);
  const [adding, setAdding] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<PageSection | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  // The first section is always locked; only sections[1+] are sortable.
  const lockedSection = sections[0] as PageSection | undefined;
  // Memoized so the reference only changes when server data changes, not on every
  // render triggered by isPending flipping — which would reset optimistic state mid-flight.
  const sortableSections = useMemo(() => sections.slice(1), [sections]);

  const { items: localSections, applyOptimistic, revert } = useOptimisticOrder(sortableSections);

  const sensors = useSortableSensors();
  const handleDragEnd = makeDragEndHandler(localSections, (reorderedIds) => {
    applyOptimistic(reorderedIds); // instant visual update before server round-trip
    const fd = new FormData();
    fd.set(
      "orderedIds",
      JSON.stringify(lockedSection ? [lockedSection.id, ...reorderedIds] : reorderedIds),
    );
    run(reorderPageSections, fd, undefined, revert); // revert on server error
  });

  // ── Apply template state ──────────────────────────────────────────────────
  const [applyTemplateOpen, setApplyTemplateOpen] = useState(false);
  const [selectedTemplateId, setSelectedTemplateId] = useState<number>(
    serialTemplates[0]?.id ?? 0,
  );
  const [applyResult, setApplyResult] = useState<{
    addedSections: number;
    skippedSections: number;
    addedInfoboxRows: number;
    skippedInfoboxRows: number;
  } | null>(null);

  const selectedTemplate = serialTemplates.find((t) => t.id === selectedTemplateId) ?? null;

  // Compute live section names for the preview (case-insensitive).
  const liveSectionNames = new Set(sections.map((s) => s.name.toLowerCase()));

  const templateOptions = serialTemplates.map((t) => ({
    label: t.name,
    value: t.id,
  }));

  function openApplyTemplateDialog() {
    setApplyResult(null);
    setApplyTemplateOpen(true);
  }

  async function confirmApplyTemplate() {
    if (!selectedTemplate) return;
    const result = await applyTemplateSections(pageId, selectedTemplate.id);
    setApplyResult(result);
  }

  function closeApplyTemplateDialog() {
    setApplyTemplateOpen(false);
    setApplyResult(null);
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    const fd = new FormData();
    fd.set("sectionId", String(deleteTarget.id));
    const result = await deletePageSection(fd);
    if (result?.error) {
      setDeleteError(result.error);
    } else {
      setDeleteTarget(null);
      setDeleteError(null);
    }
  }

  return (
    <Box col className="gap-3 rounded-lg border border-border bg-card p-4">
      <Box className="items-center justify-between">
        <Text variant="h4">Sections</Text>
        {serialTemplates.length > 0 && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={openApplyTemplateDialog}
            disabled={isPending}
          >
            <LayoutTemplateIcon className="h-3.5 w-3.5" />
            Apply template
          </Button>
        )}
      </Box>

      {sections.length > 0 ? (
        <ol className="flex flex-col gap-1">
          {lockedSection && <LockedSection section={lockedSection} />}
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <SortableContext
              items={localSections.map((s) => s.id)}
              strategy={verticalListSortingStrategy}
            >
              {localSections.map((section) => (
                <SortableSection
                  key={section.id}
                  section={section}
                  isPending={isPending}
                  isRenaming={renamingId === section.id}
                  onStartRename={() => setRenamingId(section.id)}
                  onCancelRename={() => setRenamingId(null)}
                  onDelete={() => {
                    setDeleteTarget(section);
                    setDeleteError(null);
                  }}
                  onRename={(fd) => {
                    run(renamePageSection, fd);
                    setRenamingId(null);
                  }}
                />
              ))}
            </SortableContext>
          </DndContext>
        </ol>
      ) : (
        <Text muted className="text-sm">
          No sections yet. Add one below.
        </Text>
      )}

      {adding ? (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const form = e.currentTarget;
            const fd = new FormData(form);
            fd.set("pageId", String(pageId));
            run(addPageSection, fd, () => {
              form.reset();
              setAdding(false);
            });
          }}
          className="flex gap-2 items-center"
        >
          <Input
            name="name"
            required
            placeholder="Section name…"
            autoFocus
            className="flex-1"
            onKeyDown={(e) => e.key === "Escape" && setAdding(false)}
          />
          <Button type="submit" size="sm" disabled={isPending}>
            Add
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setAdding(false)}
          >
            Cancel
          </Button>
        </form>
      ) : (
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="self-start"
          onClick={() => setAdding(true)}
        >
          <PlusIcon className="h-3 w-3" />
          Add section
        </Button>
      )}

      {/* Delete section confirmation dialog */}
      <Dialog
        isOpen={deleteTarget !== null}
        onClose={() => {
          setDeleteTarget(null);
          setDeleteError(null);
        }}
        showCloseButton={false}
      >
        <DialogHeader>
          <DialogTitle>
            Delete section &quot;{deleteTarget?.name}&quot;?
          </DialogTitle>
        </DialogHeader>
        <DialogBody>
          {deleteError ? (
            <Text variant="body" className="text-red-600">
              {deleteError}
            </Text>
          ) : (
            <DialogDescription>
              This section will be removed from this page. This action cannot be
              undone. Sections with existing content revisions cannot be
              deleted.
            </DialogDescription>
          )}
        </DialogBody>
        <DialogFooter>
          <DialogClose
            render={
              <Button
                variant="outline"
                onClick={() => {
                  setDeleteTarget(null);
                  setDeleteError(null);
                }}
              />
            }
          >
            {deleteError ? "Close" : "Cancel"}
          </DialogClose>
          {!deleteError && (
            <Button
              variant="destructive"
              disabled={isPending}
              onClick={confirmDelete}
            >
              {isPending ? "Deleting…" : "Delete"}
            </Button>
          )}
        </DialogFooter>
      </Dialog>

      {/* Apply template confirmation dialog */}
      <Dialog
        isOpen={applyTemplateOpen}
        onClose={closeApplyTemplateDialog}
        showCloseButton={false}
      >
        <DialogHeader>
          <DialogTitle>Apply template</DialogTitle>
        </DialogHeader>
        <DialogBody>
          {applyResult ? (
            <Box col className="gap-3">
              <Text variant="body">
                Template applied successfully.
              </Text>
              <Box col className="gap-1 text-sm">
                <Text>
                  Sections added:{" "}
                  <Text as="span" variant="label">
                    {applyResult.addedSections}
                  </Text>
                </Text>
                {applyResult.skippedSections > 0 && (
                  <Text muted>
                    Sections skipped (already exist):{" "}
                    {applyResult.skippedSections}
                  </Text>
                )}
                {applyResult.addedInfoboxRows > 0 && (
                  <Text>
                    Infobox rows added:{" "}
                    <Text as="span" variant="label">
                      {applyResult.addedInfoboxRows}
                    </Text>
                  </Text>
                )}
                {applyResult.skippedInfoboxRows > 0 && (
                  <Text muted>
                    Infobox rows skipped (already exist):{" "}
                    {applyResult.skippedInfoboxRows}
                  </Text>
                )}
              </Box>
            </Box>
          ) : (
            <Box col className="gap-4">
              <DialogDescription>
                Choose a template to apply. Sections that already exist on this
                page (matched by name) will be skipped.
              </DialogDescription>

              <Box col className="gap-1.5">
                <Text variant="label">Template</Text>
                <Select<number>
                  options={templateOptions}
                  value={selectedTemplateId}
                  onChange={setSelectedTemplateId}
                  searchable={false}
                />
              </Box>

              {selectedTemplate && (
                <Box col className="gap-3 rounded-lg border border-border bg-muted/40 p-3 text-sm">
                  <Text variant="label">Preview</Text>

                  {selectedTemplate.sections.length > 0 ? (
                    <Box col className="gap-1">
                      <Text muted className="text-xs">
                        Sections
                      </Text>
                      <Box col className="gap-0.5">
                        {selectedTemplate.sections.map((s) => {
                          const isDuplicate = liveSectionNames.has(
                            s.name.toLowerCase(),
                          );
                          return (
                            <Box
                              key={s.id}
                              className="items-center gap-2 pl-2 border-l-2 border-border"
                            >
                              <Text
                                className={
                                  isDuplicate
                                    ? "text-sm text-muted-foreground line-through"
                                    : "text-sm"
                                }
                              >
                                {s.name}
                              </Text>
                              {isDuplicate && (
                                <Text
                                  as="span"
                                  className="text-xs text-muted-foreground"
                                >
                                  (duplicate — will skip)
                                </Text>
                              )}
                            </Box>
                          );
                        })}
                      </Box>
                    </Box>
                  ) : (
                    <Text muted className="text-xs">
                      No sections defined in this template.
                    </Text>
                  )}

                  {selectedTemplate.hasInfobox &&
                    selectedTemplate.infoboxSections.length > 0 && (
                      <Box col className="gap-1">
                        <Text muted className="text-xs">
                          Infobox rows
                        </Text>
                        <Box col className="gap-0.5">
                          {selectedTemplate.infoboxSections.map((s) => (
                            <Text
                              key={s.id}
                              className="text-sm pl-2 border-l-2 border-border"
                            >
                              {s.label}
                            </Text>
                          ))}
                        </Box>
                      </Box>
                    )}
                </Box>
              )}
            </Box>
          )}
        </DialogBody>
        <DialogFooter>
          <DialogClose
            render={
              <Button variant="outline" onClick={closeApplyTemplateDialog} />
            }
          >
            {applyResult ? "Close" : "Cancel"}
          </DialogClose>
          {!applyResult && (
            <Button
              disabled={isPending || !selectedTemplate}
              onClick={confirmApplyTemplate}
            >
              {isPending ? "Applying…" : "Apply"}
            </Button>
          )}
        </DialogFooter>
      </Dialog>
    </Box>
  );
}
