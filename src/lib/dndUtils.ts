"use client";

import {
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import { sortableKeyboardCoordinates, arrayMove, useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { CSSProperties } from "react";

/**
 * Standard PointerSensor + KeyboardSensor setup for sortable lists.
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
 * Wraps `useSortable` with the standard style object used by all sortable rows.
 * Returns `ref`, `style`, `attributes`, `listeners`, and `isDragging`.
 *
 * @example
 * const { ref, style, attributes, listeners } = useSortableItem(id, isPending);
 */
export function useSortableItem(id: number, isPending: boolean) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id, disabled: isPending });
  const style: CSSProperties = {
    transform: CSS.Translate.toString(transform),
    transition,
    opacity: isDragging ? 0 : 1,
  };
  return { ref: setNodeRef, style, attributes, listeners, isDragging };
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
