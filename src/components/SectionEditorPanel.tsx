"use client";

import { useState } from "react";
import { PenIcon, PlusIcon, Trash2Icon } from "lucide-react";
import { Text } from "@/components/ui/Text";
import { Box } from "@/components/ui/Box";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
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
import { Tooltip } from "@/components/ui/Tooltip";

// ─── Types ─────────────────────────────────────────────────────────────────────

export interface Section {
  id: number;
  name: string;
  displayOrder: number;
}

export interface FloaterRow {
  id: number;
  label: string;
  displayOrder: number;
}

interface PendingDelete {
  type: "section" | "floaterRow";
  id: number;
  name: string;
}

interface SectionEditorPanelProps {
  categoryId: number;
  hasFloater: boolean;
  sections: Section[];
  floaterRows: FloaterRow[];
  addSectionAction: (formData: FormData) => Promise<void>;
  deleteSectionAction: (formData: FormData) => Promise<void>;
  renameSectionAction: (formData: FormData) => Promise<void>;
  reorderSectionsAction: (formData: FormData) => Promise<void>;
  addFloaterRowAction: (formData: FormData) => Promise<void>;
  deleteFloaterRowAction: (formData: FormData) => Promise<void>;
  renameFloaterRowAction: (formData: FormData) => Promise<void>;
  reorderFloaterRowsAction: (formData: FormData) => Promise<void>;
}

// ─── ReorderableItem ───────────────────────────────────────────────────────────

function ReorderableItem({
  label,
  isFirst,
  isLast,
  isPending,
  isRenaming,
  onMoveUp,
  onMoveDown,
  onStartRename,
  renameForm,
  onDelete,
}: {
  label: string;
  isFirst: boolean;
  isLast: boolean;
  isPending: boolean;
  isRenaming: boolean;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onStartRename: () => void;
  renameForm: React.ReactNode;
  onDelete: () => void;
}) {
  return (
    <li className="flex items-center gap-2 rounded-md px-3 py-2 text-sm bg-muted/50">
      {isRenaming ? (
        renameForm
      ) : (
        <>
          <Box className="flex-1 items-center gap-2">
            <Box col className="gap-0.5 mr-1">
              <Button
                type="button"
                variant="ghost"
                title="Move up"
                disabled={isFirst || isPending}
                onClick={onMoveUp}
                className="h-3 w-4 p-0 rounded-sm text-muted-foreground hover:text-foreground hover:bg-transparent disabled:opacity-30 leading-none"
                aria-label={`Move ${label} up`}
              >
                ▲
              </Button>
              <Button
                type="button"
                variant="ghost"
                title="Move down"
                disabled={isLast || isPending}
                onClick={onMoveDown}
                className="h-3 w-4 p-0 rounded-sm text-muted-foreground hover:text-foreground hover:bg-transparent disabled:opacity-30 leading-none"
                aria-label={`Move ${label} down`}
              >
                ▼
              </Button>
            </Box>
            <Text
              as="span"
              variant="label"
              className="cursor-pointer hover:text-primary transition-colors"
              title="Click to rename"
              onClick={onStartRename}
            >
              {label}
            </Text>
          </Box>
          <Box className="items-center gap-1">
            <Tooltip content={`Rename ${label}`}>
              <Button
                type="button"
                variant="ghost"
                size="icon-xs"
                aria-label={`Rename ${label}`}
                onClick={onStartRename}
              >
                <PenIcon className="h-2.5 w-2.5" />
              </Button>
            </Tooltip>
            <Tooltip content={`Delete ${label}`}>
              <Button
                type="button"
                variant="destructive"
                size="icon-xs"
                aria-label={`Delete ${label}`}
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

// ─── SectionEditorPanel ────────────────────────────────────────────────────────

/**
 * Reusable panel for managing a page category's sections and (optionally) floater rows.
 * Shared between `CategoryManager` (serial page) and `CategorySectionEditor`
 * (category index page).
 *
 * @example
 * <SectionEditorPanel
 *   categoryId={category.id}
 *   hasFloater={category.hasFloater}
 *   sections={sections}
 *   floaterRows={floaterRows}
 *   addSectionAction={addSectionAction}
 *   {...otherActions}
 * />
 */
export function SectionEditorPanel({
  categoryId,
  hasFloater,
  sections,
  floaterRows,
  addSectionAction,
  deleteSectionAction,
  renameSectionAction,
  reorderSectionsAction,
  addFloaterRowAction,
  deleteFloaterRowAction,
  renameFloaterRowAction,
  reorderFloaterRowsAction,
}: SectionEditorPanelProps) {
  const { run, isPending } = useServerAction();
  const [renamingSectionId, setRenamingSectionId] = useState<number | null>(
    null,
  );
  const [renamingRowId, setRenamingRowId] = useState<number | null>(null);
  const [addingSection, setAddingSection] = useState(false);
  const [addingFloaterRow, setAddingFloaterRow] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<PendingDelete | null>(
    null,
  );

  function moveSection(id: number, direction: "up" | "down") {
    const idx = sections.findIndex((s) => s.id === id);
    if (idx === -1) return;
    const swapIdx = direction === "up" ? idx - 1 : idx + 1;
    if (swapIdx < 0 || swapIdx >= sections.length) return;
    const newOrder = sections.map((s) => s.id);
    [newOrder[idx], newOrder[swapIdx]] = [newOrder[swapIdx], newOrder[idx]];
    const fd = new FormData();
    fd.set("orderedIds", JSON.stringify(newOrder));
    run(reorderSectionsAction, fd);
  }

  function moveFloaterRow(id: number, direction: "up" | "down") {
    const idx = floaterRows.findIndex((r) => r.id === id);
    if (idx === -1) return;
    const swapIdx = direction === "up" ? idx - 1 : idx + 1;
    if (swapIdx < 0 || swapIdx >= floaterRows.length) return;
    const newOrder = floaterRows.map((r) => r.id);
    [newOrder[idx], newOrder[swapIdx]] = [newOrder[swapIdx], newOrder[idx]];
    const fd = new FormData();
    fd.set("orderedIds", JSON.stringify(newOrder));
    run(reorderFloaterRowsAction, fd);
  }

  function confirmDelete() {
    if (!pendingDelete) return;
    const fd = new FormData();
    if (pendingDelete.type === "section") {
      fd.set("sectionId", String(pendingDelete.id));
      run(deleteSectionAction, fd, () => setPendingDelete(null));
    } else {
      fd.set("rowId", String(pendingDelete.id));
      run(deleteFloaterRowAction, fd, () => setPendingDelete(null));
    }
  }

  const deleteDialogTitle =
    pendingDelete?.type === "section"
      ? `Delete section "${pendingDelete.name}"?`
      : `Delete floater row "${pendingDelete?.name}"?`;

  const deleteDialogBody =
    pendingDelete?.type === "section"
      ? "This will remove this section from all wiki pages in this page type. This action cannot be undone."
      : "This will remove this floater row from all wiki pages in this page type. This action cannot be undone.";

  return (
    <Box col className="gap-4">
      {/* Sections */}
      <Box col className="gap-2">
        <Text variant="h4">Sections</Text>
        {sections.length > 0 ? (
          <ol className="flex flex-col gap-1">
            {sections.map((section, i) => (
              <ReorderableItem
                key={section.id}
                label={section.name}
                isFirst={i === 0}
                isLast={i === sections.length - 1}
                isPending={isPending}
                isRenaming={renamingSectionId === section.id}
                onMoveUp={() => moveSection(section.id, "up")}
                onMoveDown={() => moveSection(section.id, "down")}
                onStartRename={() => setRenamingSectionId(section.id)}
                onDelete={() =>
                  setPendingDelete({
                    type: "section",
                    id: section.id,
                    name: section.name,
                  })
                }
                renameForm={
                  <RenameForm
                    hiddenName="sectionId"
                    hiddenValue={section.id}
                    fieldName="name"
                    defaultValue={section.name}
                    onSave={(fd) => run(renameSectionAction, fd)}
                    onCancel={() => setRenamingSectionId(null)}
                    inputClassName="flex-1 h-7 text-sm"
                  />
                }
              />
            ))}
          </ol>
        ) : (
          <Text muted>No sections yet.</Text>
        )}

        {addingSection ? (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const form = e.currentTarget;
              run(addSectionAction, new FormData(form), () => {
                form.reset();
                setAddingSection(false);
              });
            }}
            className="flex gap-2 items-center"
          >
            <input type="hidden" name="categoryId" value={categoryId} />
            <Input
              name="name"
              required
              placeholder="Section name…"
              autoFocus
              className="flex-1"
              onKeyDown={(e) => e.key === "Escape" && setAddingSection(false)}
            />
            <Button type="submit" size="sm" disabled={isPending}>
              Add
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setAddingSection(false)}
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
            onClick={() => setAddingSection(true)}
          >
            <PlusIcon className="h-3 w-3" />
            Add section
          </Button>
        )}
      </Box>

      {hasFloater && (
        <Box col className="gap-2">
          <Text variant="h4">Floater rows</Text>
          {floaterRows.length > 0 ? (
            <ol className="flex flex-col gap-1">
              {floaterRows.map((row, i) => (
                <ReorderableItem
                  key={row.id}
                  label={row.label}
                  isFirst={i === 0}
                  isLast={i === floaterRows.length - 1}
                  isPending={isPending}
                  isRenaming={renamingRowId === row.id}
                  onMoveUp={() => moveFloaterRow(row.id, "up")}
                  onMoveDown={() => moveFloaterRow(row.id, "down")}
                  onStartRename={() => setRenamingRowId(row.id)}
                  onDelete={() =>
                    setPendingDelete({
                      type: "floaterRow",
                      id: row.id,
                      name: row.label,
                    })
                  }
                  renameForm={
                    <RenameForm
                      hiddenName="rowId"
                      hiddenValue={row.id}
                      fieldName="label"
                      defaultValue={row.label}
                      onSave={(fd) => run(renameFloaterRowAction, fd)}
                      onCancel={() => setRenamingRowId(null)}
                      inputClassName="flex-1 h-7 text-sm"
                    />
                  }
                />
              ))}
            </ol>
          ) : (
            <Text muted>No floater rows yet.</Text>
          )}

          {addingFloaterRow ? (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const form = e.currentTarget;
                run(addFloaterRowAction, new FormData(form), () => {
                  form.reset();
                  setAddingFloaterRow(false);
                });
              }}
              className="flex gap-2 items-center"
            >
              <input type="hidden" name="categoryId" value={categoryId} />
              <Input
                name="label"
                required
                placeholder="Row label…"
                autoFocus
                className="flex-1"
                onKeyDown={(e) =>
                  e.key === "Escape" && setAddingFloaterRow(false)
                }
              />
              <Button type="submit" size="sm" disabled={isPending}>
                Add
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setAddingFloaterRow(false)}
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
              onClick={() => setAddingFloaterRow(true)}
            >
              <PlusIcon className="h-3 w-3" />
              Add floater row
            </Button>
          )}
        </Box>
      )}

      <Dialog
        isOpen={pendingDelete !== null}
        onClose={() => setPendingDelete(null)}
        showCloseButton={false}
      >
        <DialogHeader>
          <DialogTitle>{deleteDialogTitle}</DialogTitle>
        </DialogHeader>
        <DialogBody>
          <DialogDescription>{deleteDialogBody}</DialogDescription>
        </DialogBody>
        <DialogFooter>
          <DialogClose render={<Button variant="outline" />}>
            Cancel
          </DialogClose>
          <Button
            variant="destructive"
            disabled={isPending}
            onClick={confirmDelete}
          >
            {isPending ? "Deleting…" : "Delete"}
          </Button>
        </DialogFooter>
      </Dialog>
    </Box>
  );
}
