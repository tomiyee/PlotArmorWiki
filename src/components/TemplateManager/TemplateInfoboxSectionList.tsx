"use client";

import { PlusIcon } from "lucide-react";
import { DndContext, closestCenter } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { Text } from "@/components/ui/Text";
import { Box } from "@/components/ui/Box";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import type { TemplateInfoboxSection } from "./types";
import { SortableRow } from "./SortableRow";
import { useSortableSensors, makeDragEndHandler } from "./dndUtils";

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
  /** Whether any server action is in-flight. */
  isPending: boolean;
  /** Reference to the input element. */
  inputRef: React.RefObject<HTMLInputElement | null>;
}

export function TemplateInfoboxSectionList(
  props: TemplateInfoboxSectionListProps,
) {
  const { rows, value, onChange, onAdd, onDelete, onReorder, isPending, inputRef } =
    props;

  const sensors = useSortableSensors();
  const handleDragEnd = makeDragEndHandler(rows, onReorder);

  return (
    <div>
      <Text variant="label" className="mb-1.5">
        Infobox rows
      </Text>
      {rows.length > 0 ? (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={rows.map((r) => r.id)} strategy={verticalListSortingStrategy}>
            <Box col className="gap-1 mb-2">
              {rows.map((row) => (
                <SortableRow
                  key={row.id}
                  id={row.id}
                  label={row.label}
                  isPending={isPending}
                  deleteTitle="Remove infobox row"
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
