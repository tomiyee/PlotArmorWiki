"use client";

import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faPen, faCheck, faXmark } from "@fortawesome/free-solid-svg-icons";
import { Button } from "@/components/ui/Button";
import { useEditMode } from "@/contexts/EditModeContext";
import { Tooltip } from "@/components/ui/Tooltip";

/**
 * Fixed bottom-right floating action button that drives the global edit mode.
 *
 * In read mode: a single pencil button that calls `toggle()` to enter edit mode.
 * In edit mode: a "Save" button (calls registered onSave handlers) and a
 * "Discard" button (calls registered onDiscard handlers). Both exit edit mode.
 *
 * Rendered once in the root layout so it appears on every page.
 *
 * @example
 * // In layout.tsx:
 * <EditModeProvider>
 *   <Navbar />
 *   {children}
 *   <EditModeFAB />
 * </EditModeProvider>
 */
export function EditModeFAB() {
  const { isEditing, toggle, save, discard } = useEditMode();

  if (!isEditing) {
    return (
      <div className="fixed bottom-6 right-6 z-50">
        <Tooltip content="Edit page" side="left">
          <Button
            variant="default"
            size="icon"
            onClick={toggle}
            aria-label="Edit page"
            className="shadow-lg rounded-full size-12"
          >
            <FontAwesomeIcon icon={faPen} className="h-4 w-4" />
          </Button>
        </Tooltip>
      </div>
    );
  }

  return (
    <div className="fixed bottom-6 right-6 z-50 flex gap-2">
      <Button variant="outline" onClick={discard} className="shadow-lg">
        <FontAwesomeIcon icon={faXmark} className="h-4 w-4" />
        Discard
      </Button>
      <Button variant="default" onClick={save} className="shadow-lg">
        <FontAwesomeIcon icon={faCheck} className="h-4 w-4" />
        Save
      </Button>
    </div>
  );
}
