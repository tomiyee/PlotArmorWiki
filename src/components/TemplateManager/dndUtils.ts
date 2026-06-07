"use client";

import {
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import { sortableKeyboardCoordinates, arrayMove } from "@dnd-kit/sortable";

/**
 * Standard PointerSensor + KeyboardSensor setup for template sortable lists.
 *
 * @example
 * const sensors = useSortableSensors();
 */
export function useSortableSensors() {
  return useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );
}

/**
 * Returns a DragEndEvent handler for a sortable list of id-bearing items.
 * Calls onReorder only when the item actually moved to a new position.
 *
 * @example
 * const handleDragEnd = makeDragEndHandler(sections, onReorder);
 */
export function makeDragEndHandler<T extends { id: number }>(
  items: T[],
  onReorder: (orderedIds: number[]) => void,
) {
  return (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = items.findIndex((item) => item.id === active.id);
    const newIndex = items.findIndex((item) => item.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;
    onReorder(arrayMove(items, oldIndex, newIndex).map((item) => item.id));
  };
}
