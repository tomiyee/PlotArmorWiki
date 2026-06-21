"use client";

import { useState } from "react";
import { Text } from "@/components/ui/Text";
import { Box } from "@/components/ui/Box";
import { Label } from "@/components/ui/Label";
import { Select } from "@/components/ui/Select";
import type { TemplateSummary as Template } from "@/types";

type TemplateSelectorProps = {
  /** Available templates for this serial. Renders nothing when empty. */
  templates: Template[];
};

/**
 * Controlled template picker that renders its own hidden `templateId` input for
 * form submission. Includes a live preview of the sections and infobox rows the
 * selected template will create. Returns null when no templates are defined.
 */
export function TemplateSelector(props: TemplateSelectorProps) {
  const { templates } = props;

  const [selectedTemplateId, setSelectedTemplateId] = useState<number>(0);

  if (templates.length === 0) return null;

  const templateOptions = [
    { label: "None (default sections)", value: 0 },
    ...templates.map((t) => ({ label: t.name, value: t.id })),
  ];

  const byDisplayOrder = <T extends { displayOrder: number }>(arr: T[]) =>
    [...arr].sort((a, b) => a.displayOrder - b.displayOrder);

  const selectedTemplate =
    templates.find((t) => t.id === selectedTemplateId) ?? null;
  const sortedTemplateSections = selectedTemplate
    ? byDisplayOrder(selectedTemplate.sections)
    : [];
  const sortedTemplateInfoboxSections = selectedTemplate
    ? byDisplayOrder(selectedTemplate.infoboxSections)
    : [];

  return (
    <Box col className="gap-1">
      <Label htmlFor="templateId">Use template</Label>
      {/* Hidden input so the form always submits a templateId value */}
      <input
        type="hidden"
        name="templateId"
        value={selectedTemplateId > 0 ? selectedTemplateId : ""}
      />
      <Select<number>
        id="templateId"
        options={templateOptions}
        value={selectedTemplateId}
        onChange={setSelectedTemplateId}
      />

      {/* Preview of what the template will create */}
      {selectedTemplate && (
        <div className="mt-2 rounded-lg border border-border bg-muted/40 p-3 flex flex-col gap-3 text-sm">
          <Text variant="label">Template preview</Text>

          {sortedTemplateSections.length > 0 ? (
            <div>
              <Text muted className="text-xs mb-1">
                Sections
              </Text>
              <Box col className="gap-0.5">
                {sortedTemplateSections.map((s) => (
                  <Text
                    key={s.id}
                    className="text-sm pl-2 border-l-2 border-border"
                  >
                    {s.name}
                  </Text>
                ))}
              </Box>
            </div>
          ) : (
            <Text muted className="text-xs">
              No sections defined - will use default Summary section.
            </Text>
          )}

          {selectedTemplate.hasInfobox && (
            <div>
              <Text muted className="text-xs mb-1">
                Infobox rows
              </Text>
              {sortedTemplateInfoboxSections.length > 0 ? (
                <Box col className="gap-0.5">
                  {sortedTemplateInfoboxSections.map((s) => (
                    <Text
                      key={s.id}
                      className="text-sm pl-2 border-l-2 border-border"
                    >
                      {s.label}
                    </Text>
                  ))}
                </Box>
              ) : (
                <Text muted className="text-xs">
                  No infobox rows defined.
                </Text>
              )}
            </div>
          )}
        </div>
      )}
    </Box>
  );
}
