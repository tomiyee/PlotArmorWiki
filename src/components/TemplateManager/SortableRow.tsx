"use client";

import { GripVerticalIcon, Trash2Icon } from "lucide-react";
import { Text } from "@/components/ui/Text";
import { Box } from "@/components/ui/Box";
import { Button } from "@/components/ui/Button";
import { useSortableItem } from "@/lib/dndUtils";

type SortableRowProps = {
  /** Unique numeric id tracked by @dnd-kit. */
  id: number;
  /** Text displayed in the row. */
  label: string;
  /** Disables drag handle and delete button while a server action is in-flight. */
  isPending: boolean;
  /** Accessible label for the delete button (e.g. "Remove section"). */
  deleteTitle: string;
  /** Called with this row's id when the delete button is clicked. */
  onDelete: (id: number) => void;
};

/**
 * Shared drag-and-drop row for TemplateSectionList and TemplateInfoboxSectionList.
 * Must be rendered inside a SortableContext / DndContext tree.
 *
 * @example
 * <SortableRow id={s.id} label={s.name} isPending={isPending} deleteTitle="Remove section" onDelete={handleDelete} />
 */
export function SortableRow(props: SortableRowProps) {
  const { id, label, isPending, deleteTitle, onDelete } = props;
  const { ref, style, dragHandleProps } = useSortableItem(id, isPending);

  return (
    <Box
      ref={ref}
      style={style}
      className="items-center gap-2 rounded border border-border px-2 py-1"
    >
      <span
        {...dragHandleProps}
        className="text-muted-foreground cursor-grab active:cursor-grabbing touch-none shrink-0"
        title="Drag to reorder"
      >
        <GripVerticalIcon className="h-3 w-3" />
      </span>
      <Text className="flex-1 text-sm">{label}</Text>
      <Button
        type="button"
        variant="ghost"
        size="icon-xs"
        title={deleteTitle}
        onClick={() => onDelete(id)}
        disabled={isPending}
      >
        <Trash2Icon className="h-2.5 w-2.5 text-red-400" />
      </Button>
    </Box>
  );
}
