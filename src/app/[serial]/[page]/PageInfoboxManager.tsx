"use client";

import { useState } from "react";
import { PlusIcon } from "lucide-react";
import { DndContext, closestCenter } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
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
import { useServerAction } from "@/hooks/useServerAction";
import { useOptimisticOrder } from "@/hooks/useOptimisticOrder";
import { useSortableSensors, makeDragEndHandler } from "@/lib/dndUtils";
import { SortableRenameRow } from "./SortableRenameRow";
import {
  addInfoboxSection,
  deleteInfoboxSection,
  renameInfoboxSection,
  reorderInfoboxSections,
} from "./actions";

export interface InfoboxSection {
  id: number;
  label: string;
  displayOrder: number;
}

interface PageInfoboxManagerProps {
  pageId: number;
  sections: InfoboxSection[];
}

/**
 * Manages the wall-clock-versioned infobox row structure for a single wiki page.
 * Lets editors add, rename, reorder (drag-and-drop), and delete infobox rows.
 * Delete is guarded: rows with existing content revisions cannot be removed.
 *
 * Shown inside the Infobox panel in edit mode in PageEditor.
 *
 * @example
 * <PageInfoboxManager
 *   pageId={42}
 *   sections={[{ id: 1, label: 'Age', displayOrder: 0 }]}
 * />
 */
export function PageInfoboxManager({
  pageId,
  sections,
}: PageInfoboxManagerProps) {
  const { run, isPending } = useServerAction();
  const [renamingId, setRenamingId] = useState<number | null>(null);
  const [adding, setAdding] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<InfoboxSection | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  // localSections is the optimistic view; it updates instantly on drag and
  // syncs back to `sections` once router.refresh() delivers the server result.
  const { items: localSections, applyOptimistic, revert } = useOptimisticOrder(sections);

  const sensors = useSortableSensors();
  const handleDragEnd = makeDragEndHandler(localSections, (reorderedIds) => {
    applyOptimistic(reorderedIds); // update UI immediately, before the round-trip
    const fd = new FormData();
    fd.set("orderedIds", JSON.stringify(reorderedIds));
    run(reorderInfoboxSections, fd, undefined, revert); // revert on server error
  });

  async function confirmDelete() {
    if (!deleteTarget) return;
    const fd = new FormData();
    fd.set("infoboxSectionId", String(deleteTarget.id));
    const result = await deleteInfoboxSection(fd);
    if (result?.error) {
      setDeleteError(result.error);
    } else {
      setDeleteTarget(null);
      setDeleteError(null);
    }
  }

  return (
    <Box col className="gap-3">
      <Text variant="h4">Infobox rows</Text>

      {localSections.length > 0 ? (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={localSections.map((s) => s.id)} strategy={verticalListSortingStrategy}>
            <ol className="flex flex-col gap-1">
              {localSections.map((section) => (
                <SortableRenameRow
                  key={section.id}
                  id={section.id}
                  displayValue={section.label}
                  isPending={isPending}
                  isRenaming={renamingId === section.id}
                  hiddenName="infoboxSectionId"
                  fieldName="label"
                  onStartRename={() => setRenamingId(section.id)}
                  onCancelRename={() => setRenamingId(null)}
                  onDelete={() => {
                    setDeleteTarget(section);
                    setDeleteError(null);
                  }}
                  onRename={(fd) => {
                    run(renameInfoboxSection, fd);
                    setRenamingId(null);
                  }}
                />
              ))}
            </ol>
          </SortableContext>
        </DndContext>
      ) : (
        <Text muted className="text-sm">
          No infobox rows yet. Add one below.
        </Text>
      )}

      {adding ? (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const form = e.currentTarget;
            const fd = new FormData(form);
            fd.set("pageId", String(pageId));
            run(addInfoboxSection, fd, () => {
              form.reset();
              setAdding(false);
            });
          }}
          className="flex gap-2 items-center"
        >
          <Input
            name="label"
            required
            placeholder="Row label…"
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
          Add row
        </Button>
      )}

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
            Delete infobox row &quot;{deleteTarget?.label}&quot;?
          </DialogTitle>
        </DialogHeader>
        <DialogBody>
          {deleteError ? (
            <Text variant="body" className="text-red-600">
              {deleteError}
            </Text>
          ) : (
            <DialogDescription>
              This row will be removed from the infobox. This action cannot be
              undone. Rows with existing content revisions cannot be deleted.
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
    </Box>
  );
}
