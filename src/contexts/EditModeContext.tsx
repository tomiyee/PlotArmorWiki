"use client";

import {
  createContext,
  useContext,
  useState,
  useCallback,
  type ReactNode,
} from "react";

interface EditModeContextValue {
  isEditing: boolean;
  toggle: () => void;
}

const EditModeContext = createContext<EditModeContextValue | null>(null);

/**
 * Provides a global edit-mode toggle so any page or component can check
 * whether the user has activated editing without prop-drilling.
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

  const toggle = useCallback(() => {
    setIsEditing((prev) => !prev);
  }, []);

  return (
    <EditModeContext.Provider value={{ isEditing, toggle }}>
      {children}
    </EditModeContext.Provider>
  );
}

/**
 * Returns the edit-mode state and toggle. Throws if used outside
 * `<EditModeProvider>`.
 *
 * @example
 * const { isEditing, toggle } = useEditMode();
 */
export function useEditMode(): EditModeContextValue {
  const ctx = useContext(EditModeContext);
  if (!ctx) {
    throw new Error("useEditMode must be used within EditModeProvider");
  }
  return ctx;
}
