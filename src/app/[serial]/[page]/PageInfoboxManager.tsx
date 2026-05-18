"use client";

import { useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faPen, faPlus, faTrash } from "@fortawesome/free-solid-svg-icons";
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

function ReorderableInfoboxRow({
  section,
  isFirst,
  isLast,
  isPending,
  isRenaming,
  onMoveUp,
  onMoveDown,
  onStartRename,
  onCancelRename,
  onDelete,
  onRename,
}: {
  section: InfoboxSection;
  isFirst: boolean;
  isLast: boolean;
  isPending: boolean;
  isRenaming: boolean;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onStartRename: () => void;
  onCancelRename: () => void;
  onDelete: () => void;
  onRename: (fd: FormData) => void;
}) {
  return (
    <li className="flex items-center gap-2 rounded-md px-3 py-2 text-sm bg-muted/50">
      {isRenaming ? (
        <RenameForm
          hiddenName="infoboxSectionId"
          hiddenValue={section.id}
          fieldName="label"
          defaultValue={section.label}
          onSave={onRename}
          onCancel={onCancelRename}
          inputClassName="flex-1 h-7 text-sm"
        />
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
                aria-label={`Move ${section.label} up`}
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
                aria-label={`Move ${section.label} down`}
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
              {section.label}
            </Text>
          </Box>
          <Box className="items-center gap-1">
            <Tooltip content={`Rename ${section.label}`}>
              <Button
                type="button"
                variant="ghost"
                size="icon-xs"
                aria-label={`Rename ${section.label}`}
                onClick={onStartRename}
              >
                <FontAwesomeIcon icon={faPen} className="h-2.5 w-2.5" />
              </Button>
            </Tooltip>
            <Tooltip content={`Delete ${section.label}`}>
              <Button
                type="button"
                variant="destructive"
                size="icon-xs"
                aria-label={`Delete ${section.label}`}
                onClick={onDelete}
              >
                <FontAwesomeIcon icon={faTrash} className="h-2.5 w-2.5" />
              </Button>
            </Tooltip>
          </Box>
        </>
      )}
    </li>
  );
}

/**
 * Manages the wall-clock-versioned infobox row structure for a single wiki page.
 * Lets editors add, rename, reorder (up/down), and delete infobox rows.
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

  function moveRow(id: number, direction: "up" | "down") {
    const idx = sections.findIndex((s) => s.id === id);
    if (idx === -1) return;
    const swapIdx = direction === "up" ? idx - 1 : idx + 1;
    if (swapIdx < 0 || swapIdx >= sections.length) return;
    const newOrder = sections.map((s) => s.id);
    [newOrder[idx], newOrder[swapIdx]] = [newOrder[swapIdx], newOrder[idx]];
    const fd = new FormData();
    fd.set("orderedIds", JSON.stringify(newOrder));
    run(reorderInfoboxSections, fd);
  }

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

      {sections.length > 0 ? (
        <ol className="flex flex-col gap-1">
          {sections.map((section, i) => (
            <ReorderableInfoboxRow
              key={section.id}
              section={section}
              isFirst={i === 0}
              isLast={i === sections.length - 1}
              isPending={isPending}
              isRenaming={renamingId === section.id}
              onMoveUp={() => moveRow(section.id, "up")}
              onMoveDown={() => moveRow(section.id, "down")}
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
          <FontAwesomeIcon icon={faPlus} className="h-3 w-3" />
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
