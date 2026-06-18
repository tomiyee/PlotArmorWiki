"use client";

import type { RefObject } from "react";
import { PlusIcon } from "lucide-react";
import { DndContext, closestCenter } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { Text } from "@/components/ui/Text";
import { Box } from "@/components/ui/Box";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { SortableRow } from "./SortableRow";
import { useSortableSensors, makeDragEndHandler } from "@/lib/dndUtils";

type SortableAddListProps = {
  /** Heading rendered above the list. */
  heading: string;
  /** Items to display in sorted order. */
  items: { id: number; label: string }[];
  /** Current value of the add-item input. */
  value: string;
  /** Updates the add-item input value. */
  onChange: (v: string) => void;
  /** Adds a new item using the current input value. */
  onAdd: () => void;
  /** Deletes the item with the given id. */
  onDelete: (id: number) => void;
  /** Called with the new ordered id array after a drag reorder. */
  onReorder: (orderedIds: number[]) => void;
  /** Whether any server action is in-flight. */
  isPending: boolean;
  /** Ref forwarded to the add-item input for focus management. */
  inputRef: RefObject<HTMLInputElement | null>;
  /** Placeholder text for the add-item input. */
  placeholder: string;
  /** Text shown when the list is empty. */
  emptyLabel: string;
  /** Accessible label for each row's delete button. */
  deleteTitle: string;
};

/**
 * Sortable list with drag-and-drop reorder and an add-item form.
 * Used by TemplateItem for both sections and infobox rows.
 *
 * @example
 * <SortableAddList
 *   heading="Sections"
 *   items={sections.map(s => ({ id: s.id, label: s.name }))}
 *   value={addingSectionName}
 *   onChange={setAddingSectionName}
 *   onAdd={handleAddSection}
 *   onDelete={handleDeleteSection}
 *   onReorder={handleReorderSections}
 *   isPending={anyPending}
 *   inputRef={sectionInputRef}
 *   placeholder="Section name…"
 *   emptyLabel="No sections yet."
 *   deleteTitle="Remove section"
 * />
 */
export function SortableAddList(props: SortableAddListProps) {
  const {
    heading,
    items,
    value,
    onChange,
    onAdd,
    onDelete,
    onReorder,
    isPending,
    inputRef,
    placeholder,
    emptyLabel,
    deleteTitle,
  } = props;

  const sensors = useSortableSensors();
  const handleDragEnd = makeDragEndHandler(items, onReorder);

  return (
    <div>
      <Text variant="label" className="mb-1.5">
        {heading}
      </Text>
      {items.length > 0 ? (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={items.map((s) => s.id)} strategy={verticalListSortingStrategy}>
            <Box col className="gap-1 mb-2">
              {items.map((item) => (
                <SortableRow
                  key={item.id}
                  id={item.id}
                  label={item.label}
                  isPending={isPending}
                  deleteTitle={deleteTitle}
                  onDelete={onDelete}
                />
              ))}
            </Box>
          </SortableContext>
        </DndContext>
      ) : (
        <Text muted className="text-xs mb-2">
          {emptyLabel}
        </Text>
      )}
      <Box className="gap-2 items-center">
        <Input
          ref={inputRef}
          placeholder={placeholder}
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
