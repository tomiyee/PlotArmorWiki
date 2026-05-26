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
import { useRouter } from "next/navigation";
import {
  Dialog,
  DialogBody,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/Dialog";
import { Button } from "@/components/ui/Button";

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
  /**
   * Whether the editor has unsaved changes. Set by editable components (e.g.
   * `PageEditor`) via `setIsDirty`. Used to gate the navigation-guard dialog.
   */
  isDirty: boolean;
  /** Called by editable components to signal whether they have unsaved changes. */
  setIsDirty: (value: boolean) => void;
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
 * Intercepts in-app `<a>` clicks when `isEditing && isDirty` and shows a
 * confirmation dialog before allowing navigation. Also registers a
 * `window.beforeunload` handler as a fallback for browser-level navigations.
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
  const [isDirty, setIsDirty] = useState(false);
  // The href the user clicked while isEditing && isDirty; shown in the confirm dialog.
  const [pendingHref, setPendingHref] = useState<string | null>(null);
  // Keep a map of registered handlers; key is an incrementing id.
  const handlersRef = useRef<Map<number, EditHandlers>>(new Map());
  const nextIdRef = useRef(0);
  const router = useRouter();

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
    setIsDirty(false);
  }, []);

  const discard = useCallback(() => {
    for (const h of handlersRef.current.values()) {
      h.onDiscard();
    }
    setIsEditing(false);
    setIsDirty(false);
  }, []);

  // Intercept in-app <a> clicks when there are unsaved changes.
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (!isEditing || !isDirty) return;
      const target = (e.target as Element).closest("a");
      if (!target) return;
      const href = target.getAttribute("href");
      // Only intercept internal navigation links (relative or same-origin).
      if (!href || href.startsWith("http") || href.startsWith("//")) return;
      e.preventDefault();
      setPendingHref(href);
    }
    document.addEventListener("click", handleClick, true);
    return () => {
      document.removeEventListener("click", handleClick, true);
    };
  }, [isEditing, isDirty]);

  // Guard browser-level navigations (refresh, tab close, external link) when dirty.
  useEffect(() => {
    function handleBeforeUnload(e: BeforeUnloadEvent) {
      if (!isEditing || !isDirty) return;
      e.preventDefault();
    }
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
    };
  }, [isEditing, isDirty]);

  function handleLeave() {
    const href = pendingHref;
    setPendingHref(null);
    setIsEditing(false);
    setIsDirty(false);
    if (href) router.push(href);
  }

  function handleStay() {
    setPendingHref(null);
  }

  return (
    <EditModeContext.Provider
      value={{
        isEditing,
        isAdmin,
        setIsAdmin,
        toggle,
        registerHandlers,
        save,
        discard,
        isDirty,
        setIsDirty,
      }}
    >
      {children}
      <Dialog
        isOpen={pendingHref !== null}
        onClose={handleStay}
        showCloseButton={false}
      >
        <DialogHeader>
          <DialogTitle>Leave without saving?</DialogTitle>
        </DialogHeader>
        <DialogBody>
          You have unsaved changes that will be lost if you continue.
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" onClick={handleStay}>
            Stay on page
          </Button>
          <Button variant="destructive" onClick={handleLeave}>
            Leave without saving
          </Button>
        </DialogFooter>
      </Dialog>
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
 * The cleanup also resets `isEditing` so edit mode does not leak across page
 * navigations when an admin clicks a wiki link or the TOC.
 *
 * @example
 * // In a Server Component:
 * const isAdmin = await checkIsAdmin(serial.id);
 * return <><EditModeAdminSetter isAdmin={isAdmin} />{children}</>;
 */
export function EditModeAdminSetter({ isAdmin }: { isAdmin: boolean }) {
  const { setIsAdmin, discard } = useEditMode();
  // Sync server-resolved admin status into context. The effect cleanup resets to
  // false so the FAB disappears when navigating away from admin-accessible pages.
  // `discard()` is also called to exit edit mode and reset dirty state, preventing
  // the editor state from leaking onto the next page (gap 1 fix).
  useEffect(() => {
    setIsAdmin(isAdmin);
    return () => {
      setIsAdmin(false);
      discard();
    };
  }, [isAdmin, setIsAdmin, discard]);

  return null;
}
