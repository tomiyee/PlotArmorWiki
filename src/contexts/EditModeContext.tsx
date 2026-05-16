"use client";

import {
  createContext,
  useContext,
  useEffect,
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
  /**
   * Whether the current user is an admin of the serial currently being viewed.
   * Set by `<EditModeAdminSetter>` rendered inside each serial page/layout
   * Server Component. Defaults to `false` so non-admin visitors never see edit UI.
   */
  isAdmin: boolean;
  /** Called by `<EditModeAdminSetter>` to propagate server-resolved admin status. */
  setIsAdmin: (value: boolean) => void;
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
 * Also tracks `isAdmin` — set by `<EditModeAdminSetter>` from each page —
 * so the FAB and edit controls are hidden for non-admin visitors.
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
  const [isAdmin, setIsAdmin] = useState(false);
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
      value={{ isEditing, isAdmin, setIsAdmin, toggle, registerHandlers, save, discard }}
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
 * const { isEditing, isAdmin, toggle, registerHandlers, save, discard } = useEditMode();
 */
export function useEditMode(): EditModeContextValue {
  const ctx = useContext(EditModeContext);
  if (!ctx) {
    throw new Error("useEditMode must be used within EditModeProvider");
  }
  return ctx;
}

/**
 * Thin Client Component that propagates server-resolved `isAdmin` status into
 * `EditModeContext`. Render it inside any Server Component that knows the
 * admin status; it syncs on mount and whenever the value changes.
 *
 * Renders nothing — it exists purely for the side-effect of calling `setIsAdmin`.
 *
 * @example
 * // In a Server Component:
 * const isAdmin = await checkIsAdmin(serial.id);
 * return <><EditModeAdminSetter isAdmin={isAdmin} />{children}</>;
 */
export function EditModeAdminSetter({ isAdmin }: { isAdmin: boolean }) {
  const { setIsAdmin } = useEditMode();
  // Sync server-resolved admin status into context. The effect cleanup resets to
  // false so the FAB disappears when navigating away from admin-accessible pages.
  useEffect(() => {
    setIsAdmin(isAdmin);
    return () => {
      setIsAdmin(false);
    };
  }, [isAdmin, setIsAdmin]);

  return null;
}
