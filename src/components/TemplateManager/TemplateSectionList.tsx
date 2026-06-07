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
import type { TemplateSection } from "./types";

type SortableSectionRowProps = {
  /** The section data for this row. */
  section: TemplateSection;
  /** Whether any server action is in-flight. */
  isPending: boolean;
  /** Callback to remove this section. */
  onDelete: (sectionId: number) => void;
};

function SortableSectionRow(props: SortableSectionRowProps) {
  const { section, isPending, onDelete } = props;

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: section.id, disabled: isPending });

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
      <Text className="flex-1 text-sm">{section.name}</Text>
      <Button
        type="button"
        variant="ghost"
        size="icon-xs"
        title="Remove section"
        onClick={() => onDelete(section.id)}
        disabled={isPending}
      >
        <Trash2Icon className="h-2.5 w-2.5 text-red-400" />
      </Button>
    </Box>
  );
}

interface TemplateSectionListProps {
  /** The list of sections to display. */
  sections: TemplateSection[];
  /** Current value in the "add section" input field. */
  value: string;
  /** Callback to update the input value. */
  onChange: (v: string) => void;
  /** Callback to add a new section using the current input value. */
  onAdd: () => void;
  /** Callback to delete a section by id. */
  onDelete: (sectionId: number) => void;
  /** Callback fired when drag-and-drop reorder ends; receives the new ordered id array. */
  onReorder: (orderedIds: number[]) => void;
  /** Whether any server action is in-flight. */
  isPending: boolean;
  /** Ref forwarded to the "add section" input for focus management. */
  inputRef: React.RefObject<HTMLInputElement | null>;
}

export function TemplateSectionList(props: TemplateSectionListProps) {
  const {
    sections,
    value,
    onChange,
    onAdd,
    onDelete,
    onReorder,
    isPending,
    inputRef,
  } = props;

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = sections.findIndex((s) => s.id === active.id);
    const newIndex = sections.findIndex((s) => s.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;
    const reordered = arrayMove(sections, oldIndex, newIndex);
    onReorder(reordered.map((s) => s.id));
  }

  return (
    <div>
      <Text variant="label" className="mb-1.5">
        Sections
      </Text>
      {sections.length > 0 ? (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
        >
          <SortableContext
            items={sections.map((s) => s.id)}
            strategy={verticalListSortingStrategy}
          >
            <Box col className="gap-1 mb-2">
              {sections.map((section) => (
                <SortableSectionRow
                  key={section.id}
                  section={section}
                  isPending={isPending}
                  onDelete={onDelete}
                />
              ))}
            </Box>
          </SortableContext>
        </DndContext>
      ) : (
        <Text muted className="text-xs mb-2">
          No sections yet.
        </Text>
      )}
      <Box className="gap-2 items-center">
        <Input
          ref={inputRef}
          placeholder="Section name…"
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
