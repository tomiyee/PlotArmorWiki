"use client";

import { createContext } from "react";

/**
 * Context that feeds ref-related callbacks into RefChip decorators and the
 * InsertRefButton toolbar component.
 *
 * Mirrors WikiLinkContext but for the {{ref|token}} / {{refbox}} system.
 * Wrapped around MDXEditorClient alongside WikiLinkContext.Provider.
 *
 * @example
 * <RefContext.Provider value={{ openRefEditMenu, openRefInsertMenu }}>
 *   <MDXEditorClient ... />
 * </RefContext.Provider>
 */
export const RefContext = createContext<{
  /**
   * Opens the ref edit popover anchored to `el` for the RefNode identified by
   * `nodeKey`. Called from RefChip onClick.
   */
  openRefEditMenu: (nodeKey: string, el: HTMLElement) => void;
  /**
   * Opens the insert-ref popover anchored to `el`.
   * Called from InsertRefButton.
   */
  openRefInsertMenu: (el: HTMLElement) => void;
  /**
   * Inserts a `{{refbox}}` block node at the current cursor position and moves
   * focus to a new paragraph below it.
   */
  insertRefbox: () => void;
}>({
  openRefEditMenu: () => {},
  openRefInsertMenu: () => {},
  insertRefbox: () => {},
});
