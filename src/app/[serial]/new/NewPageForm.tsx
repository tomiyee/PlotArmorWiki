"use client";

import { useState } from "react";
import { useFormStatus } from "react-dom";
import Link from "next/link";
import { createPage } from "./actions";
import { Text } from "@/components/ui/Text";
import { Box } from "@/components/ui/Box";
import { Input } from "@/components/ui/Input";
import { Label } from "@/components/ui/Label";
import { Button } from "@/components/ui/Button";
import { Select } from "@/components/ui/Select";

import type {
  ChapterRow as Chapter,
  VolumeRow as Volume,
  TemplateSummary as Template,
} from "@/types";

interface PageOption {
  id: number;
  name: string;
  slug: string;
  introChapterId: number | null;
}

type SubmitButtonProps = {
  /** When true, disables the button regardless of form-pending state. */
  disabled: boolean;
};

/**
 * Submit button that disables itself while its parent `<form>` is pending.
 * Must be rendered inside a `<form>` to receive `useFormStatus` context.
 * Prevents double-click races by locking out further clicks as soon as the
 * first submission is in-flight.
 */
function SubmitButton(props: SubmitButtonProps) {
  const { disabled } = props;
  const { pending } = useFormStatus();
  return (
    <Button type="submit" className="mt-2" disabled={disabled || pending}>
      {pending ? "Creating…" : "Create page"}
    </Button>
  );
}

interface NewPageFormProps {
  /** URL slug of the serial — used to scope the `createPage` action. */
  serialSlug: string;
  /** Label for the chapter unit (e.g. `"Chapter"`, `"Episode"`). */
  chapterType: string;
  /** All volumes for the intro chapter grouped selector. */
  volumeList: Volume[];
  /** All chapters for the intro chapter selector. */
  chapterList: Chapter[];
  /** All existing pages in the serial; filtered to those visible at the selected intro chapter. */
  existingPages: PageOption[];
  /** Pre-selected parent page id, e.g. when navigating here from a page's edit mode. */
  defaultParentPageId?: number;
  /** The user's current reading chapter cutoff; pre-selects the intro chapter and disables future chapters. */
  defaultIntroChapterId?: number;
  /** Pre-filled page name, e.g. when navigating here from the search palette's "+ Page" option. */
  defaultName?: string;
  /** Serial templates for pre-populating sections and infobox rows on the new page. */
  templates: Template[];
}

/**
 * Page creation form. Tracks the selected intro chapter and narrows the parent
 * page dropdown to pages that are visible at (i.e. introduced at or before) that
 * chapter, so a child page cannot reference a parent that doesn't exist yet.
 * When templates are defined for the serial, a "Use template" dropdown lets the
 * user pre-populate sections and infobox rows; a preview shows the resulting
 * structure before submitting.
 */
export function NewPageForm(props: NewPageFormProps) {
  const {
    serialSlug,
    chapterType,
    volumeList,
    chapterList,
    existingPages,
    defaultParentPageId,
    defaultIntroChapterId,
    defaultName,
    templates,
  } = props;
  const chapterTypeLabel = chapterType.toLowerCase();

  const chapterIdxById = Object.fromEntries(
    chapterList.map((c) => [c.id, c.idx]),
  );

  const chaptersByVolume = chapterList.reduce<Record<number, Chapter[]>>(
    (acc, c) => {
      (acc[c.volumeId] ??= []).push(c);
      return acc;
    },
    {},
  );

  const firstChapterId = chapterList[0]?.id ?? 0;
  // Default to the user's reading cutoff so the intro chapter matches where they are.
  // Falls back to chapter 1 when no cutoff is available (e.g. no progress cookie).
  const [selectedIntroChapterId, setSelectedIntroChapterId] = useState<number>(
    defaultIntroChapterId ?? firstChapterId,
  );
  const [selectedTemplateId, setSelectedTemplateId] = useState<number>(0);
  const [selectedParentPageId, setSelectedParentPageId] = useState<
    number | undefined
  >(undefined);
  // Generated once per form mount. Sent as a hidden field so the server can
  // detect retried submissions and redirect to the already-created page.
  const [idempotencyKey] = useState<string>(() => crypto.randomUUID());
  // Controlled name value so we can react to the user's input for similarity checks.
  const [name, setName] = useState<string>(defaultName ?? "");

  // The idx of the user's reading cutoff chapter, used to gate the chapter options.
  const cutoffIdx =
    defaultIntroChapterId !== undefined
      ? (chapterIdxById[defaultIntroChapterId] ?? Infinity)
      : Infinity;

  const chapterOptions = volumeList
    .filter((v) => (chaptersByVolume[v.id]?.length ?? 0) > 0)
    .map((v) => ({
      label: v.displayName,
      value: -v.id,
      children: (chaptersByVolume[v.id] ?? []).map((c) => ({
        label: c.displayName,
        value: c.id,
        // Disable chapters beyond the user's cutoff to prevent accidental spoilers.
        disabled: c.idx > cutoffIdx,
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

  // Template options - 0 means "no template".
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

  // Build a lookup map for chapter display names — used for the "introduced in …" note.
  const chapterById = new Map(chapterList.map((c) => [c.id, c]));

  // Pages whose names overlap with what the user is typing, to warn against duplicates.
  // Requires 4+ chars typed and the existing page name must also be 4+ chars, to
  // suppress noise from very short shared substrings.
  const SIMILARITY_MIN_CHARS = 4;
  const trimmedName = name.trim();
  const similarPages =
    trimmedName.length >= SIMILARITY_MIN_CHARS
      ? existingPages.filter((p) => {
          const lower = p.name.toLowerCase();
          const query = trimmedName.toLowerCase();
          if (lower.length < SIMILARITY_MIN_CHARS) return false;
          return lower.includes(query) || query.includes(lower);
        })
      : [];

  // Split similar pages into those the user can already see vs. those introduced
  // past their current chapter cutoff.
  const visibleSimilarPages = similarPages.filter(
    (p) =>
      p.introChapterId === null ||
      (chapterIdxById[p.introChapterId] ?? 0) <= cutoffIdx,
  );
  const futureSimilarPages = similarPages.filter(
    (p) =>
      p.introChapterId !== null &&
      (chapterIdxById[p.introChapterId] ?? 0) > cutoffIdx,
  );

  const createPageAction = createPage.bind(null, serialSlug);
  const hasChapters = chapterList.length > 0;

  return (
    <form action={createPageAction} className="flex flex-col gap-5">
      {/* Idempotency key — generated once per form mount to deduplicate retries. */}
      <input type="hidden" name="idempotencyKey" value={idempotencyKey} />
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
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        {/* Warn the admin when existing pages have similar names to prevent accidental duplicates. */}
        {similarPages.length > 0 && (
          <div className="mt-1 rounded-md border border-yellow-400 bg-yellow-50 dark:bg-yellow-950/30 dark:border-yellow-600 p-3">
            <Text variant="label" className="text-yellow-800 dark:text-yellow-300 text-xs mb-1">
              Similar pages already exist:
            </Text>
            <Box col className="gap-0.5">
              {visibleSimilarPages.map((p) => (
                <Link
                  key={p.id}
                  href={`/${serialSlug}/${p.slug}`}
                  className="text-sm text-yellow-700 dark:text-yellow-400 hover:underline"
                >
                  {p.name}
                </Link>
              ))}
              {futureSimilarPages.map((p) => (
                <Text
                  key={p.id}
                  className="text-sm text-yellow-700 dark:text-yellow-400"
                >
                  {p.name}{" "}
                  <span className="opacity-70">
                    (introduced in {chapterById.get(p.introChapterId!)?.displayName ?? "a future chapter"})
                  </span>
                </Text>
              ))}
            </Box>
          </div>
        )}
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
      )}

      <SubmitButton disabled={!hasChapters} />
    </form>
  );
}
