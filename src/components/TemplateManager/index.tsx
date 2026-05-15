"use client";

import { useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faPlus } from "@fortawesome/free-solid-svg-icons";
import { Text } from "@/components/ui/Text";
import { Box } from "@/components/ui/Box";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { useServerAction } from "@/hooks/useServerAction";
import { useEditMode } from "@/contexts/EditModeContext";
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
} from "@/components/ui/Card";
import { TemplateItem } from "./TemplateItem";
import type { TemplateManagerProps } from "./types";

export type {
  Template,
  TemplateSection,
  TemplateInfoboxSection,
} from "./types";

/**
 * Manages the set of reusable page templates for a serial. Only renders the
 * editing controls when the global edit mode is active (i.e., an admin is
 * editing). Supports create, rename, delete, section management, and infobox
 * toggle per template.
 *
 * @example
 * <TemplateManager
 *   templates={templates}
 *   createTemplateAction={createTemplateAction}
 *   deleteTemplateAction={deleteTemplateAction}
 *   renameTemplateAction={renameTemplateAction}
 *   toggleTemplateInfoboxAction={toggleTemplateInfoboxAction}
 *   addTemplateSectionAction={addTemplateSectionAction}
 *   deleteTemplateSectionAction={deleteTemplateSectionAction}
 *   addTemplateInfoboxSectionAction={addTemplateInfoboxSectionAction}
 *   deleteTemplateInfoboxSectionAction={deleteTemplateInfoboxSectionAction}
 * />
 */
export function TemplateManager({
  templates,
  createTemplateAction,
  deleteTemplateAction,
  renameTemplateAction,
  toggleTemplateInfoboxAction,
  addTemplateSectionAction,
  deleteTemplateSectionAction,
  addTemplateInfoboxSectionAction,
  deleteTemplateInfoboxSectionAction,
}: TemplateManagerProps) {
  const { isEditing } = useEditMode();
  const { run, isPending } = useServerAction();
  const [creating, setCreating] = useState(false);
  const [newTemplateName, setNewTemplateName] = useState("");

  if (!isEditing) return null;

  function handleCreate() {
    if (!newTemplateName.trim()) return;
    const fd = new FormData();
    fd.set("name", newTemplateName.trim());
    run(createTemplateAction, fd, () => {
      setNewTemplateName("");
      setCreating(false);
    });
  }

  return (
    <section className="flex flex-col gap-4 mt-4">
      <Card>
        <CardHeader>
          <Text variant="h2">Page Templates</Text>
        </CardHeader>
        <CardContent>
          {templates.length > 0 ? (
            <Box col className="gap-2">
              {templates.map((template) => (
                <TemplateItem
                  key={template.id}
                  template={template}
                  deleteTemplateAction={deleteTemplateAction}
                  renameTemplateAction={renameTemplateAction}
                  toggleTemplateInfoboxAction={toggleTemplateInfoboxAction}
                  addTemplateSectionAction={addTemplateSectionAction}
                  deleteTemplateSectionAction={deleteTemplateSectionAction}
                  addTemplateInfoboxSectionAction={
                    addTemplateInfoboxSectionAction
                  }
                  deleteTemplateInfoboxSectionAction={
                    deleteTemplateInfoboxSectionAction
                  }
                />
              ))}
            </Box>
          ) : (
            <Text muted>
              No templates yet. Create one to pre-populate sections when making
              new pages.
            </Text>
          )}
        </CardContent>
        <CardFooter>
          {creating ? (
            <Box className="gap-2 items-center">
              <Input
                placeholder="Template name…"
                value={newTemplateName}
                onChange={(e) => setNewTemplateName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    handleCreate();
                  }
                  if (e.key === "Escape") {
                    setCreating(false);
                    setNewTemplateName("");
                  }
                }}
                autoFocus
                className="flex-1"
                disabled={isPending}
              />
              <Button
                type="button"
                onClick={handleCreate}
                disabled={isPending || !newTemplateName.trim()}
              >
                Create
              </Button>
              <Button
                type="button"
                variant="ghost"
                onClick={() => {
                  setCreating(false);
                  setNewTemplateName("");
                }}
                disabled={isPending}
              >
                Cancel
              </Button>
            </Box>
          ) : (
            <Button
              type="button"
              variant="outline"
              onClick={() => setCreating(true)}
            >
              <FontAwesomeIcon icon={faPlus} className="h-3 w-3" />
              New template
            </Button>
          )}
        </CardFooter>
      </Card>
    </section>
  );
}
