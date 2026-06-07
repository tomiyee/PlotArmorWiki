"use client";

import { PlusIcon } from "lucide-react";
import { DndContext, closestCenter } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { Text } from "@/components/ui/Text";
import { Box } from "@/components/ui/Box";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import type { TemplateSection } from "./types";
import { SortableRow } from "./SortableRow";
import { useSortableSensors, makeDragEndHandler } from "@/lib/dndUtils";

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
  const { sections, value, onChange, onAdd, onDelete, onReorder, isPending, inputRef } =
    props;

  const sensors = useSortableSensors();
  const handleDragEnd = makeDragEndHandler(sections, onReorder);

  return (
    <div>
      <Text variant="label" className="mb-1.5">
        Sections
      </Text>
      {sections.length > 0 ? (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={sections.map((s) => s.id)} strategy={verticalListSortingStrategy}>
            <Box col className="gap-1 mb-2">
              {sections.map((section) => (
                <SortableRow
                  key={section.id}
                  id={section.id}
                  label={section.name}
                  isPending={isPending}
                  deleteTitle="Remove section"
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
