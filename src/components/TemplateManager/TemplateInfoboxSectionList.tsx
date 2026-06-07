"use client";

import { PlusIcon, Trash2Icon, GripVerticalIcon } from "lucide-react";
import {
  DndContext,
  closestCenter,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
  arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Text } from "@/components/ui/Text";
import { Box } from "@/components/ui/Box";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import type { TemplateInfoboxSection } from "./types";

type SortableInfoboxRowProps = {
  /** The infobox section data for this row. */
  row: TemplateInfoboxSection;
  /** Whether any server action is in-flight. */
  isPending: boolean;
  /** Callback to remove this infobox row. */
  onDelete: (infoboxSectionId: number) => void;
};

function SortableInfoboxRow(props: SortableInfoboxRowProps) {
  const { row, isPending, onDelete } = props;

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: row.id, disabled: isPending });

  const style: React.CSSProperties = {
    transform: CSS.Translate.toString(transform),
    transition,
    opacity: isDragging ? 0 : 1,
  };

  return (
    <Box
      ref={setNodeRef}
      style={style}
      className="items-center gap-2 rounded border border-border px-2 py-1"
    >
      <span
        {...attributes}
        {...listeners}
        className="text-muted-foreground cursor-grab active:cursor-grabbing touch-none shrink-0"
        title="Drag to reorder"
      >
        <GripVerticalIcon className="h-3 w-3" />
      </span>
      <Text className="flex-1 text-sm">{row.label}</Text>
      <Button
        type="button"
        variant="ghost"
        size="icon-xs"
        title="Remove infobox row"
        onClick={() => onDelete(row.id)}
        disabled={isPending}
      >
        <Trash2Icon className="h-2.5 w-2.5 text-red-400" />
      </Button>
    </Box>
  );
}

interface TemplateInfoboxSectionListProps {
  /** The list of infobox sections to display. */
  rows: TemplateInfoboxSection[];
  /** The current value in the input field. */
  value: string;
  /** Callback function to update the input value. */
  onChange: (v: string) => void;
  /** Callback function to add a new infobox row. */
  onAdd: () => void;
  /** Callback function to delete an infobox row. */
  onDelete: (infoboxSectionId: number) => void;
  /** Callback fired when drag-and-drop reorder ends; receives the new ordered id array. */
  onReorder: (orderedIds: number[]) => void;
  /** Whether the component is in a pending state (e.g., loading). */
  isPending: boolean;
  /** Reference to the input element. */
  inputRef: React.RefObject<HTMLInputElement | null>;
}

export function TemplateInfoboxSectionList(
  props: TemplateInfoboxSectionListProps,
) {
  const { rows, value, onChange, onAdd, onDelete, onReorder, isPending, inputRef } =
    props;

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = rows.findIndex((r) => r.id === active.id);
    const newIndex = rows.findIndex((r) => r.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;
    const reordered = arrayMove(rows, oldIndex, newIndex);
    onReorder(reordered.map((r) => r.id));
  }

  return (
    <div>
      <Text variant="label" className="mb-1.5">
        Infobox rows
      </Text>
      {rows.length > 0 ? (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
        >
          <SortableContext
            items={rows.map((r) => r.id)}
            strategy={verticalListSortingStrategy}
          >
            <Box col className="gap-1 mb-2">
              {rows.map((row) => (
                <SortableInfoboxRow
                  key={row.id}
                  row={row}
                  isPending={isPending}
                  onDelete={onDelete}
                />
              ))}
            </Box>
          </SortableContext>
        </DndContext>
      ) : (
        <Text muted className="text-xs mb-2">
          No infobox rows yet.
        </Text>
      )}
      <Box className="gap-2 items-center">
        <Input
          ref={inputRef}
          placeholder="Row label…"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              onAdd();
            }
          }}
          className="h-7 text-sm flex-1"
          disabled={isPending}
        />
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={onAdd}
          disabled={isPending || !value.trim()}
        >
          <PlusIcon className="h-3 w-3" />
          Add
        </Button>
      </Box>
    </div>
  );
}
