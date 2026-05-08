"use client";

import { useEditMode } from "@/contexts/EditModeContext";
import { Text } from "@/components/ui/text";
import { Box } from "@/components/ui/box";
import {
  SectionEditorPanel,
  type Section,
  type FloaterRow,
} from "@/components/SectionEditorPanel";

interface CategorySectionEditorProps {
  categoryId: number;
  hasFloater: boolean;
  sections: Section[];
  floaterRows: FloaterRow[];
  addSectionAction: (formData: FormData) => Promise<void>;
  deleteSectionAction: (formData: FormData) => Promise<void>;
  renameSectionAction: (formData: FormData) => Promise<void>;
  reorderSectionsAction: (formData: FormData) => Promise<void>;
  addFloaterRowAction: (formData: FormData) => Promise<void>;
  deleteFloaterRowAction: (formData: FormData) => Promise<void>;
  renameFloaterRowAction: (formData: FormData) => Promise<void>;
  reorderFloaterRowsAction: (formData: FormData) => Promise<void>;
}

/**
 * Category structure editor embedded in the category index page. Visibility is
 * gated on the global edit mode so the editor only appears when the user has
 * explicitly activated editing.
 *
 * @example
 * <CategorySectionEditor
 *   categoryId={category.id}
 *   hasFloater={category.hasFloater}
 *   sections={sections}
 *   floaterRows={floaterRows}
 *   addSectionAction={addSectionAction}
 *   {...otherActions}
 * />
 */
export function CategorySectionEditor({
  categoryId,
  hasFloater,
  sections,
  floaterRows,
  addSectionAction,
  deleteSectionAction,
  renameSectionAction,
  reorderSectionsAction,
  addFloaterRowAction,
  deleteFloaterRowAction,
  renameFloaterRowAction,
  reorderFloaterRowsAction,
}: CategorySectionEditorProps) {
  const { isEditing } = useEditMode();

  if (!isEditing) {
    return (
      <Text muted className="text-sm py-1">
        {sections.length} section{sections.length !== 1 ? "s" : ""}
        {hasFloater
          ? `, ${floaterRows.length} floater row${floaterRows.length !== 1 ? "s" : ""}`
          : ""}
      </Text>
    );
  }

  return (
    <Box col className="gap-4 rounded-lg border border-gray-200 p-4">
      <Text variant="h3">Category Structure</Text>
      <SectionEditorPanel
        categoryId={categoryId}
        hasFloater={hasFloater}
        sections={sections}
        floaterRows={floaterRows}
        addSectionAction={addSectionAction}
        deleteSectionAction={deleteSectionAction}
        renameSectionAction={renameSectionAction}
        reorderSectionsAction={reorderSectionsAction}
        addFloaterRowAction={addFloaterRowAction}
        deleteFloaterRowAction={deleteFloaterRowAction}
        renameFloaterRowAction={renameFloaterRowAction}
        reorderFloaterRowsAction={reorderFloaterRowsAction}
      />
    </Box>
  );
}
