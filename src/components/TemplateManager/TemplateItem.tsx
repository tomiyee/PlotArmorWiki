"use client";

import { useEffect, useRef, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faTrash,
  faPencil,
  faChevronDown,
  faChevronRight,
} from "@fortawesome/free-solid-svg-icons";
import { Text } from "@/components/ui/Text";
import { Box } from "@/components/ui/Box";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { Label } from "@/components/ui/Label";
import { useServerAction } from "@/hooks/useServerAction";
import { TemplateSectionList } from "./TemplateSectionList";
import { TemplateInfoboxSectionList } from "./TemplateInfoboxSectionList";
import type { Template, ServerAction } from "./types";

interface TemplateItemProps {
  template: Template;
  deleteTemplateAction: ServerAction;
  renameTemplateAction: ServerAction;
  toggleTemplateInfoboxAction: ServerAction;
  addTemplateSectionAction: ServerAction;
  deleteTemplateSectionAction: ServerAction;
  addTemplateInfoboxSectionAction: ServerAction;
  deleteTemplateInfoboxSectionAction: ServerAction;
}

export function TemplateItem({
  template,
  deleteTemplateAction,
  renameTemplateAction,
  toggleTemplateInfoboxAction,
  addTemplateSectionAction,
  deleteTemplateSectionAction,
  addTemplateInfoboxSectionAction,
  deleteTemplateInfoboxSectionAction,
}: TemplateItemProps) {
  const { run, isPending } = useServerAction();
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

  const sortedSections = [...template.sections].sort(
    (a, b) => a.displayOrder - b.displayOrder,
  );
  const sortedInfoboxSections = [...template.infoboxSections].sort(
    (a, b) => a.displayOrder - b.displayOrder,
  );

  return (
    <div className="rounded-lg border border-gray-200 overflow-hidden">
      <Box className="items-center gap-2 px-3 py-2 bg-gray-50">
        <button
          type="button"
          onClick={() => setExpanded((p) => !p)}
          className="flex items-center gap-1.5 flex-1 min-w-0 text-left"
          aria-expanded={expanded}
        >
          <FontAwesomeIcon
            icon={expanded ? faChevronDown : faChevronRight}
            className="h-3 w-3 text-gray-400 shrink-0"
          />
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
            disabled={isPending}
          >
            <FontAwesomeIcon icon={faPencil} className="h-3 w-3" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            title="Delete template"
            onClick={handleDelete}
            disabled={isPending}
          >
            <FontAwesomeIcon icon={faTrash} className="h-3 w-3 text-red-500" />
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
              disabled={isPending}
              className="h-4 w-4 rounded border-gray-300"
            />
            <Label htmlFor={`has-infobox-${template.id}`}>
              Has infobox sidebar
            </Label>
          </Box>
          <TemplateSectionList
            sections={sortedSections}
            value={addingSectionName}
            onChange={setAddingSectionName}
            onAdd={handleAddSection}
            onDelete={handleDeleteSection}
            isPending={isPending}
            inputRef={sectionInputRef}
          />
          {template.hasInfobox && (
            <TemplateInfoboxSectionList
              rows={sortedInfoboxSections}
              value={addingInfoboxLabel}
              onChange={setAddingInfoboxLabel}
              onAdd={handleAddInfoboxSection}
              onDelete={handleDeleteInfoboxSection}
              isPending={isPending}
              inputRef={infoboxInputRef}
            />
          )}
        </div>
      )}
    </div>
  );
}
