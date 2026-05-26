"use client";

import { useState } from "react";
import Link from "next/link";
import { createPage } from "./actions";
import { Text } from "@/components/ui/Text";
import { Box } from "@/components/ui/Box";
import { Input } from "@/components/ui/Input";
import { Label } from "@/components/ui/Label";
import { Button } from "@/components/ui/Button";
import { Select } from "@/components/ui/Select";

interface Chapter {
  id: number;
  displayName: string;
  idx: number;
  volumeId: number;
}

interface Volume {
  id: number;
  displayName: string;
}

interface PageOption {
  id: number;
  name: string;
  introChapterId: number | null;
}

interface TemplateSection {
  id: number;
  name: string;
  displayOrder: number;
}

interface TemplateInfoboxSection {
  id: number;
  label: string;
  displayOrder: number;
}

interface Template {
  id: number;
  name: string;
  hasInfobox: boolean;
  sections: TemplateSection[];
  infoboxSections: TemplateInfoboxSection[];
}

interface Props {
  serialSlug: string;
  chapterType: string;
  volumeList: Volume[];
  chapterList: Chapter[];
  existingPages: PageOption[];
  defaultParentPageId?: number;
  templates: Template[];
}

/**
 * Page creation form. Tracks the selected intro chapter and narrows the parent
 * page dropdown to pages that are visible at (i.e. introduced at or before) that
 * chapter, so a child page cannot reference a parent that doesn't exist yet.
 * When templates are defined for the serial, a "Use template" dropdown lets the
 * user pre-populate sections and infobox rows; a preview shows the resulting
 * structure before submitting.
 *
 * @example
 * <NewPageForm serialSlug="one-piece" chapterType="Chapter" templates={[]} ... />
 */
export function NewPageForm({
  serialSlug,
  chapterType,
  volumeList,
  chapterList,
  existingPages,
  defaultParentPageId,
  templates,
}: Props) {
  const chapterTypeLabel = chapterType.toLowerCase();

  // Build chapter id → idx lookup for filtering.
  const chapterIdxById: Record<number, number> = {};
  chapterList.forEach((c) => {
    chapterIdxById[c.id] = c.idx;
  });

  // Build grouped chapter options.
  const chaptersByVolume: Record<number, Chapter[]> = {};
  volumeList.forEach((v) => {
    chaptersByVolume[v.id] = [];
  });
  chapterList.forEach((c) => {
    chaptersByVolume[c.volumeId]?.push(c);
  });

  const firstChapterId = chapterList[0]?.id ?? 0;
  const [selectedIntroChapterId, setSelectedIntroChapterId] =
    useState<number>(firstChapterId);
  const [selectedTemplateId, setSelectedTemplateId] = useState<number>(0);
  const [selectedParentPageId, setSelectedParentPageId] = useState<
    number | undefined
  >(undefined);

  const chapterOptions = volumeList
    .filter((v) => (chaptersByVolume[v.id]?.length ?? 0) > 0)
    .map((v) => ({
      label: v.displayName,
      value: -v.id,
      children: (chaptersByVolume[v.id] ?? []).map((c) => ({
        label: c.displayName,
        value: c.id,
      })),
    }));

  // Pages visible at the selected intro chapter: home page (null introChapterId)
  // is always included; others must have been introduced at or before it.
  const selectedIdx =
    selectedIntroChapterId > 0
      ? (chapterIdxById[selectedIntroChapterId] ?? Infinity)
      : Infinity;
  const visiblePages = existingPages.filter(
    (p) =>
      p.introChapterId === null ||
      (chapterIdxById[p.introChapterId] ?? 0) <= selectedIdx,
  );
  const parentPageOptions = visiblePages.map((p) => ({
    label: p.name,
    value: p.id,
  }));

  // Only pre-select the defaultParentPageId if it is still visible.
  const visibleParentDefault =
    defaultParentPageId !== undefined &&
    visiblePages.some((p) => p.id === defaultParentPageId)
      ? defaultParentPageId
      : undefined;

  // If the user's selection is still visible at the current intro chapter, keep it;
  // otherwise fall back to the prop default or the first visible page.
  const effectiveParentPageId =
    selectedParentPageId !== undefined &&
    parentPageOptions.some((p) => p.value === selectedParentPageId)
      ? selectedParentPageId
      : (visibleParentDefault ?? parentPageOptions[0]?.value);

  // Template options — 0 means "no template".
  const templateOptions = [
    { label: "None (default sections)", value: 0 },
    ...templates.map((t) => ({ label: t.name, value: t.id })),
  ];

  const selectedTemplate =
    templates.find((t) => t.id === selectedTemplateId) ?? null;
  const sortedTemplateSections = selectedTemplate
    ? [...selectedTemplate.sections].sort(
        (a, b) => a.displayOrder - b.displayOrder,
      )
    : [];
  const sortedTemplateInfoboxSections = selectedTemplate
    ? [...selectedTemplate.infoboxSections].sort(
        (a, b) => a.displayOrder - b.displayOrder,
      )
    : [];

  const createPageAction = createPage.bind(null, serialSlug);
  const hasChapters = chapterList.length > 0;

  return (
    <form action={createPageAction} className="flex flex-col gap-5">
      {/* Page name */}
      <Box col className="gap-1">
        <Label htmlFor="name">
          Page name <span className="text-red-500">*</span>
        </Label>
        <Input
          id="name"
          name="name"
          required
          placeholder="e.g. Monkey D. Luffy"
          autoFocus
        />
      </Box>

      {/* Intro chapter */}
      <Box col className="gap-1">
        <Label htmlFor="introChapterId">
          Intro {chapterTypeLabel} <span className="text-red-500">*</span>
        </Label>
        {hasChapters ? (
          <>
            <input
              type="hidden"
              name="introChapterId"
              value={selectedIntroChapterId}
            />
            <Select<number>
              id="introChapterId"
              options={chapterOptions}
              placeholder={`Select a ${chapterTypeLabel}…`}
              value={selectedIntroChapterId}
              onChange={setSelectedIntroChapterId}
            />
          </>
        ) : (
          <Text muted className="text-sm">
            No {chapterTypeLabel}s yet.{" "}
            <Link
              href={`/${serialSlug}`}
              className="text-primary hover:underline"
            >
              Add a {chapterTypeLabel} first.
            </Link>
          </Text>
        )}
      </Box>

      {/* Parent page (restricted to pages visible at the selected intro chapter) */}
      <Box col className="gap-1">
        <Label htmlFor="parentPageId">
          Parent page <span className="text-red-500">*</span>
        </Label>
        <input
          type="hidden"
          name="parentPageId"
          value={effectiveParentPageId ?? ""}
        />
        <Select<number>
          id="parentPageId"
          options={parentPageOptions}
          value={effectiveParentPageId}
          onChange={setSelectedParentPageId}
          placeholder="Select a parent page…"
        />
      </Box>

      {/* Template selection (only shown when templates exist) */}
      {templates.length > 0 && (
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
                  No sections defined — will use default Summary section.
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
      )}

      <Button type="submit" className="mt-2" disabled={!hasChapters}>
        Create page
      </Button>
    </form>
  );
}
