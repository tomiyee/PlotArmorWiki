"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Trash2Icon,
  PencilIcon,
  ChevronDownIcon,
  ChevronRightIcon,
} from "lucide-react";
import { Text } from "@/components/ui/Text";
import { Box } from "@/components/ui/Box";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { Label } from "@/components/ui/Label";
import { useServerAction } from "@/hooks/useServerAction";
import { useOptimisticOrder } from "@/hooks/useOptimisticOrder";
import { TemplateSectionList } from "./TemplateSectionList";
import { TemplateInfoboxSectionList } from "./TemplateInfoboxSectionList";
import type { Template, ServerAction, ReorderAction } from "./types";

interface TemplateItemProps {
  /** The template to display and edit. */
  template: Template;
  /** Server action to delete this template. */
  deleteTemplateAction: ServerAction;
  /** Server action to rename this template. */
  renameTemplateAction: ServerAction;
  /** Server action to toggle the infobox flag on this template. */
  toggleTemplateInfoboxAction: ServerAction;
  /** Server action to append a section to this template. */
  addTemplateSectionAction: ServerAction;
  /** Server action to delete a section from this template. */
  deleteTemplateSectionAction: ServerAction;
  /** Server action to persist the new section order after drag-and-drop. */
  reorderTemplateSectionAction: ReorderAction;
  /** Server action to append an infobox row to this template. */
  addTemplateInfoboxSectionAction: ServerAction;
  /** Server action to delete an infobox row from this template. */
  deleteTemplateInfoboxSectionAction: ServerAction;
  /** Server action to persist the new infobox row order after drag-and-drop. */
  reorderTemplateInfoboxSectionAction: ReorderAction;
}

export function TemplateItem(props: TemplateItemProps) {
  const {
    template,
    deleteTemplateAction,
    renameTemplateAction,
    toggleTemplateInfoboxAction,
    addTemplateSectionAction,
    deleteTemplateSectionAction,
    reorderTemplateSectionAction,
    addTemplateInfoboxSectionAction,
    deleteTemplateInfoboxSectionAction,
    reorderTemplateInfoboxSectionAction,
  } = props;

  const router = useRouter();
  const { run, isPending } = useServerAction();
  const [reorderPending, startReorderTransition] = useTransition();
  const [expanded, setExpanded] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [renameDraft, setRenameDraft] = useState(template.name);
  const [addingSectionName, setAddingSectionName] = useState("");
  const [addingInfoboxLabel, setAddingInfoboxLabel] = useState("");
  const sectionInputRef = useRef<HTMLInputElement>(null);
  const infoboxInputRef = useRef<HTMLInputElement>(null);
  const focusSectionInputRef = useRef(false);
  const focusInfoboxInputRef = useRef(false);

  useEffect(() => {
    if (!isPending && focusSectionInputRef.current) {
      sectionInputRef.current?.focus();
      focusSectionInputRef.current = false;
    }
  }, [isPending]);

  useEffect(() => {
    if (!isPending && focusInfoboxInputRef.current) {
      infoboxInputRef.current?.focus();
      focusInfoboxInputRef.current = false;
    }
  }, [isPending]);

  function handleRename() {
    if (!renameDraft.trim() || renameDraft.trim() === template.name) {
      setRenaming(false);
      return;
    }
    const fd = new FormData();
    fd.set("templateId", String(template.id));
    fd.set("name", renameDraft.trim());
    run(renameTemplateAction, fd, () => setRenaming(false));
  }

  function handleDelete() {
    const fd = new FormData();
    fd.set("templateId", String(template.id));
    run(deleteTemplateAction, fd);
  }

  function handleToggleInfobox(checked: boolean) {
    const fd = new FormData();
    fd.set("templateId", String(template.id));
    fd.set("hasInfobox", String(checked));
    run(toggleTemplateInfoboxAction, fd);
  }

  function handleAddSection() {
    if (!addingSectionName.trim()) return;
    const fd = new FormData();
    fd.set("templateId", String(template.id));
    fd.set("name", addingSectionName.trim());
    run(addTemplateSectionAction, fd, () => {
      setAddingSectionName("");
      focusSectionInputRef.current = true;
    });
  }

  function handleAddInfoboxSection() {
    if (!addingInfoboxLabel.trim()) return;
    const fd = new FormData();
    fd.set("templateId", String(template.id));
    fd.set("label", addingInfoboxLabel.trim());
    run(addTemplateInfoboxSectionAction, fd, () => {
      setAddingInfoboxLabel("");
      focusInfoboxInputRef.current = true;
    });
  }

  function handleDeleteSection(sectionId: number) {
    const fd = new FormData();
    fd.set("sectionId", String(sectionId));
    run(deleteTemplateSectionAction, fd);
  }

  function handleDeleteInfoboxSection(infoboxSectionId: number) {
    const fd = new FormData();
    fd.set("infoboxSectionId", String(infoboxSectionId));
    run(deleteTemplateInfoboxSectionAction, fd);
  }

  // Memoize so the reference only changes when server data changes — not on every
  // render triggered by reorderPending flipping. A new reference would cause
  // useOptimisticOrder's useEffect to fire and reset the optimistic state mid-flight.
  const sortedSections = useMemo(
    () => [...template.sections].sort((a, b) => a.displayOrder - b.displayOrder),
    [template.sections],
  );
  const sortedInfoboxSections = useMemo(
    () => [...template.infoboxSections].sort((a, b) => a.displayOrder - b.displayOrder),
    [template.infoboxSections],
  );

  const {
    items: localSections,
    applyOptimistic: applyOptimisticSections,
    revert: revertSections,
  } = useOptimisticOrder(sortedSections);
  const {
    items: localInfoboxSections,
    applyOptimistic: applyOptimisticInfobox,
    revert: revertInfobox,
  } = useOptimisticOrder(sortedInfoboxSections);

  function handleReorderSections(orderedIds: number[]) {
    applyOptimisticSections(orderedIds); // instant visual update before server round-trip
    startReorderTransition(async () => {
      try {
        await reorderTemplateSectionAction(template.id, orderedIds);
        router.refresh();
      } catch {
        revertSections(); // restore server order on failure
      }
    });
  }

  function handleReorderInfoboxSections(orderedIds: number[]) {
    applyOptimisticInfobox(orderedIds); // instant visual update before server round-trip
    startReorderTransition(async () => {
      try {
        await reorderTemplateInfoboxSectionAction(template.id, orderedIds);
        router.refresh();
      } catch {
        revertInfobox(); // restore server order on failure
      }
    });
  }

  const anyPending = isPending || reorderPending;

  return (
    <div className="rounded-lg border border-border overflow-hidden">
      <Box className="items-center gap-2 px-3 py-2 bg-muted/40">
        <button
          type="button"
          onClick={() => setExpanded((p) => !p)}
          className="flex items-center gap-1.5 flex-1 min-w-0 text-left"
          aria-expanded={expanded}
        >
          {expanded ? (
            <ChevronDownIcon className="h-3 w-3 text-muted-foreground shrink-0" />
          ) : (
            <ChevronRightIcon className="h-3 w-3 text-muted-foreground shrink-0" />
          )}
          {renaming ? (
            <Input
              value={renameDraft}
              onChange={(e) => setRenameDraft(e.target.value)}
              onBlur={handleRename}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleRename();
                if (e.key === "Escape") {
                  setRenameDraft(template.name);
                  setRenaming(false);
                }
              }}
              autoFocus
              className="h-7 text-sm"
              onClick={(e) => e.stopPropagation()}
            />
          ) : (
            <Text variant="h4" as="span" className="truncate">
              {template.name}
            </Text>
          )}
        </button>
        <Box className="items-center gap-1 shrink-0">
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            title="Rename template"
            onClick={() => {
              setRenaming((p) => !p);
              setRenameDraft(template.name);
            }}
            disabled={anyPending}
          >
            <PencilIcon className="h-3 w-3" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            title="Delete template"
            onClick={handleDelete}
            disabled={anyPending}
          >
            <Trash2Icon className="h-3 w-3 text-red-500" />
          </Button>
        </Box>
      </Box>

      {expanded && (
        <div className="px-3 py-3 flex flex-col gap-4">
          <Box className="items-center gap-2">
            <input
              type="checkbox"
              id={`has-infobox-${template.id}`}
              checked={template.hasInfobox}
              onChange={(e) => handleToggleInfobox(e.target.checked)}
              disabled={anyPending}
              className="h-4 w-4 rounded border-border"
            />
            <Label htmlFor={`has-infobox-${template.id}`}>
              Has infobox sidebar
            </Label>
          </Box>
          <TemplateSectionList
            sections={localSections}
            value={addingSectionName}
            onChange={setAddingSectionName}
            onAdd={handleAddSection}
            onDelete={handleDeleteSection}
            onReorder={handleReorderSections}
            isPending={anyPending}
            inputRef={sectionInputRef}
          />
          {template.hasInfobox && (
            <TemplateInfoboxSectionList
              rows={localInfoboxSections}
              value={addingInfoboxLabel}
              onChange={setAddingInfoboxLabel}
              onAdd={handleAddInfoboxSection}
              onDelete={handleDeleteInfoboxSection}
              onReorder={handleReorderInfoboxSections}
              isPending={anyPending}
              inputRef={infoboxInputRef}
            />
          )}
        </div>
      )}
    </div>
  );
}
