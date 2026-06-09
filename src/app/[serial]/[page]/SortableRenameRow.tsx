"use client";

import type { CSSProperties } from "react";
import { GripVerticalIcon, PenIcon, Trash2Icon } from "lucide-react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Text } from "@/components/ui/Text";
import { Box } from "@/components/ui/Box";
import { Button } from "@/components/ui/Button";
import { Tooltip } from "@/components/ui/Tooltip";
import { RenameForm } from "@/components/RenameForm";

type SortableRenameRowProps = {
  /** Numeric id used by @dnd-kit for tracking. */
  id: number;
  /** Text displayed in the row label. */
  displayValue: string;
  /** Disables drag handle and action buttons while a server action is in-flight. */
  isPending: boolean;
  /** When true, shows the inline rename form instead of the label + action buttons. */
  isRenaming: boolean;
  /** Hidden field name forwarded to RenameForm (e.g. "sectionId", "infoboxSectionId"). */
  hiddenName: string;
  /** FormData field name for the new display value (e.g. "name", "label"). */
  fieldName: string;
  onStartRename: () => void;
  onCancelRename: () => void;
  onDelete: () => void;
  onRename: (fd: FormData) => void;
};

/**
 * Drag-and-drop sortable list row with inline rename support. Shared between
 * `PageSectionManager` and `PageInfoboxManager` which both have the same
 * rename-in-place interaction pattern.
 *
 * Must be rendered inside a SortableContext / DndContext tree.
 *
 * @example
 * <SortableRenameRow
 *   id={section.id}
 *   displayValue={section.name}
 *   isPending={isPending}
 *   isRenaming={renamingId === section.id}
 *   hiddenName="sectionId"
 *   fieldName="name"
 *   onStartRename={() => setRenamingId(section.id)}
 *   onCancelRename={() => setRenamingId(null)}
 *   onDelete={handleDelete}
 *   onRename={handleRename}
 * />
 */
export function SortableRenameRow(props: SortableRenameRowProps) {
  const {
    id,
    displayValue,
    isPending,
    isRenaming,
    hiddenName,
    fieldName,
    onStartRename,
    onCancelRename,
    onDelete,
    onRename,
  } = props;

  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id, disabled: isPending });

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
          hiddenName={hiddenName}
          hiddenValue={id}
          fieldName={fieldName}
          defaultValue={displayValue}
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
            {displayValue}
          </Text>
          <Box className="items-center gap-1">
            <Tooltip content={`Rename ${displayValue}`}>
              <Button
                type="button"
                variant="ghost"
                size="icon-xs"
                aria-label={`Rename ${displayValue}`}
                onClick={onStartRename}
              >
                <PenIcon className="h-2.5 w-2.5" />
              </Button>
            </Tooltip>
            <Tooltip content={`Delete ${displayValue}`}>
              <Button
                type="button"
                variant="destructive"
                size="icon-xs"
                aria-label={`Delete ${displayValue}`}
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
