"use client";

import { useEditMode } from "@/contexts/EditModeContext";
import { Text } from "@/components/ui/text";
import { Box } from "@/components/ui/box";
import { Button } from "@/components/ui/button";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faPen } from "@fortawesome/free-solid-svg-icons";
import {
  SectionEditorPanel,
  type Section,
  type FloaterRow,
} from "@/components/SectionEditorPanel";

interface SchemaSectionEditorProps {
  schemaId: number;
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
 * Schema structure editor embedded in the schema index page. Visibility is
 * gated on the global edit mode so the editor only appears when the user has
 * explicitly activated editing.
 *
 * @example
 * <SchemaSectionEditor
 *   schemaId={schema.id}
 *   hasFloater={schema.hasFloater}
 *   sections={sections}
 *   floaterRows={floaterRows}
 *   addSectionAction={addSectionAction}
 *   {...otherActions}
 * />
 */
export function SchemaSectionEditor({
  schemaId,
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
}: SchemaSectionEditorProps) {
  const { isEditing, toggle } = useEditMode();

  if (!isEditing) {
    return (
      <Box className="items-center gap-2 py-1">
        <Text muted className="text-sm">
          {sections.length} section{sections.length !== 1 ? "s" : ""}
          {hasFloater
            ? `, ${floaterRows.length} floater row${floaterRows.length !== 1 ? "s" : ""}`
            : ""}
        </Text>
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          onClick={toggle}
          title="Edit schema structure"
        >
          <FontAwesomeIcon icon={faPen} className="h-3 w-3" />
        </Button>
      </Box>
    );
  }

  return (
    <Box col className="gap-4 rounded-lg border border-gray-200 p-4">
      <Box className="items-center justify-between">
        <Text variant="h3">Schema Structure</Text>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={toggle}
        >
          Done
        </Button>
      </Box>
      <SectionEditorPanel
        schemaId={schemaId}
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
