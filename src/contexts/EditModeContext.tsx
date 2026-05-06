"use client";

import {
  createContext,
  useContext,
  useState,
  useCallback,
  useRef,
  type ReactNode,
} from "react";

interface EditHandlers {
  onSave: () => void;
  onDiscard: () => void;
}

interface EditModeContextValue {
  isEditing: boolean;
  toggle: () => void;
  /**
   * Register save/discard callbacks for the currently mounted editable component.
   * Returns a deregister function — call it in a useEffect cleanup.
   */
  registerHandlers: (handlers: EditHandlers) => () => void;
  /** Calls all registered onSave handlers then exits edit mode. */
  save: () => void;
  /** Calls all registered onDiscard handlers then exits edit mode. */
  discard: () => void;
}

const EditModeContext = createContext<EditModeContextValue | null>(null);

/**
 * Provides a global edit-mode toggle so any page or component can check
 * whether the user has activated editing without prop-drilling. Editable
 * components register save/discard callbacks via `registerHandlers`; the
 * `<EditModeFAB>` calls `save()` or `discard()` to invoke them.
 *
 * Wrap the root layout with this provider.
 *
 * @example
 * <EditModeProvider>
 *   <Navbar />
 *   {children}
 * </EditModeProvider>
 */
export function EditModeProvider({ children }: { children: ReactNode }) {
  const [isEditing, setIsEditing] = useState(false);
  // Keep a map of registered handlers; key is an incrementing id.
  const handlersRef = useRef<Map<number, EditHandlers>>(new Map());
  const nextIdRef = useRef(0);

  const toggle = useCallback(() => {
    setIsEditing((prev) => !prev);
  }, []);

  const registerHandlers = useCallback((handlers: EditHandlers) => {
    const id = nextIdRef.current++;
    handlersRef.current.set(id, handlers);
    return () => {
      handlersRef.current.delete(id);
    };
  }, []);

  const save = useCallback(() => {
    for (const h of handlersRef.current.values()) {
      h.onSave();
    }
    setIsEditing(false);
  }, []);

  const discard = useCallback(() => {
    for (const h of handlersRef.current.values()) {
      h.onDiscard();
    }
    setIsEditing(false);
  }, []);

  return (
    <EditModeContext.Provider
      value={{ isEditing, toggle, registerHandlers, save, discard }}
    >
      {children}
    </EditModeContext.Provider>
  );
}

/**
 * Returns the edit-mode state, toggle, handler registration, and save/discard
 * methods. Throws if used outside `<EditModeProvider>`.
 *
 * @example
 * const { isEditing, toggle, registerHandlers, save, discard } = useEditMode();
 */
export function useEditMode(): EditModeContextValue {
  const ctx = useContext(EditModeContext);
  if (!ctx) {
    throw new Error("useEditMode must be used within EditModeProvider");
  }
  return ctx;
}
