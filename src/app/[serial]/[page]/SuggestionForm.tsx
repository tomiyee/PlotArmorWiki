"use client";

import { useState, useTransition, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import { Box } from "@/components/ui/Box";
import { Button } from "@/components/ui/Button";
import { Label } from "@/components/ui/Label";
import { Select } from "@/components/ui/Select";
import { Text } from "@/components/ui/Text";
import { Textarea } from "@/components/ui/Textarea";
import {
  Dialog,
  DialogBody,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/Dialog";
import {
  submitPageSuggestion,
  getSectionsAtChapter,
} from "./suggestionActions";
import { InfoIcon } from "@/components/ui/InfoIcon";
import { LastUpdatedTag } from "./LastUpdatedTag";
import type { ChapterData, ChapterGroupOption } from "./types";

const WikiLinkMDEditor = dynamic(
  () => import("@/components/MDEditor").then((m) => m.WikiLinkMDEditor),
  { ssr: false },
);

type SuggestionFormProps = {
  /** DB id of the page being suggested. */
  pageId: number;
  /** All chapters for this serial, used to build the "Writing as of:" selector. */
  allChapters: ChapterData[];
  /**
   * The chapter the user is currently reading up to — used as the default
   * for the "Writing as of:" selector and caps the available choices to prevent
   * exposing the suggester to content beyond their progress.
   */
  readingChapterId: number | null;
  /** Wiki pages for `[[Page]]` autocomplete in the editor. */
  wikiPages: { name: string; slug: string }[];
  /** Chapter name → idx map for `[[Chapter:Name]]` autocomplete. */
  wikiChapters?: { name: string; idx: number }[];
  /** The serial's chapter type label (e.g. "Chapter", "Episode"). */
  chapterType?: string;
  /** Slug of the parent serial, used to resolve wiki links. */
  serialSlug: string;
  /** Pre-loaded sections at the reader's current cutoff (avoids an extra round-trip). */
  initialSections: {
    id: number;
    name: string;
    content: string;
    lastUpdatedChapterIdx: number | null;
  }[];
  /** Pre-loaded infobox rows at the reader's current cutoff. Empty when page has no infobox. */
  initialInfoboxSections: { id: number; label: string; content: string }[];
  /** Called when the user cancels or dismisses the post-submit confirmation dialog. */
  onClose: () => void;
};

/**
 * Inline suggestion form shown to authenticated non-admin users inside PageReadView.
 * Allows proposing section content changes with a single citation field.
 * Fetches section content at the chosen target chapter when the chapter selector changes.
 * Only chapters up to the user's reading progress are shown to prevent spoilers.
 *
 * @example
 * <SuggestionForm
 *   pageId={42}
 *   allChapters={allChapters}
 *   readingChapterId={7}
 *   wikiPages={[{ name: "Luffy", slug: "luffy" }]}
 *   serialSlug="one-piece"
 *   initialSections={[{ id: 1, name: "Summary", content: "..." }]}
 *   initialInfoboxSections={[{ id: 3, label: "Age", content: "19" }]}
 *   onClose={() => setShowForm(false)}
 * />
 */
export function SuggestionForm(props: SuggestionFormProps) {
  const {
    pageId,
    allChapters,
    readingChapterId,
    wikiPages,
    wikiChapters,
    chapterType,
    serialSlug,
    initialSections,
    initialInfoboxSections,
    onClose,
  } = props;

  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  // Restrict available chapters to those at or before the user's reading cutoff.
  const readingChapterIdx =
    readingChapterId !== null
      ? (allChapters.find((c) => c.id === readingChapterId)?.idx ?? null)
      : null;
  const availableChapters =
    readingChapterIdx !== null
      ? allChapters.filter((c) => c.idx <= readingChapterIdx)
      : allChapters;

  const [selectedChapterId, setSelectedChapterId] = useState<number | null>(
    readingChapterId ?? availableChapters.at(-1)?.id ?? null,
  );
  const selectedChapterIdx =
    availableChapters.find((c) => c.id === selectedChapterId)?.idx ?? null;
  const [sections, setSections] = useState(initialSections);
  const [infoboxSections, setInfoboxSections] = useState(
    initialInfoboxSections,
  );
  const [draftContent, setDraftContent] = useState<Record<number, string>>(
    Object.fromEntries(initialSections.map((s) => [s.id, s.content])),
  );
  const [infoboxDraftContent, setInfoboxDraftContent] = useState<
    Record<number, string>
  >(Object.fromEntries(initialInfoboxSections.map((s) => [s.id, s.content])));
  const [citation, setCitation] = useState("");
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [showSuccessDialog, setShowSuccessDialog] = useState(false);

  // Dirty state: true when any draft differs from the section content or citation is non-empty.
  const isDirty =
    citation.trim().length > 0 ||
    sections.some((s) => draftContent[s.id] !== s.content) ||
    infoboxSections.some((s) => infoboxDraftContent[s.id] !== s.content);

  // Warn before navigating away with a started draft.
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (isDirty) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [isDirty]);

  const handleChapterChange = useCallback(
    (chapterId: number) => {
      setSelectedChapterId(chapterId);
      startTransition(async () => {
        const { sections: newSections, infoboxSections: newIbSections } =
          await getSectionsAtChapter(pageId, chapterId);
        setSections(newSections);
        setDraftContent(
          Object.fromEntries(newSections.map((s) => [s.id, s.content])),
        );
        setInfoboxSections(newIbSections);
        setInfoboxDraftContent(
          Object.fromEntries(newIbSections.map((s) => [s.id, s.content])),
        );
      });
    },
    [pageId],
  );

  const handleSubmit = useCallback(() => {
    if (!selectedChapterId) {
      setSubmitError("Please select a target chapter.");
      return;
    }
    if (!citation.trim()) {
      setSubmitError("Citation is required.");
      return;
    }
    const changes = sections
      .filter(
        (s) => draftContent[s.id] !== s.content && draftContent[s.id]?.trim(),
      )
      .map((s) => ({ sectionId: s.id, proposedContent: draftContent[s.id] }));
    const infoboxChanges = infoboxSections
      .filter(
        (s) =>
          infoboxDraftContent[s.id] !== s.content &&
          infoboxDraftContent[s.id]?.trim(),
      )
      .map((s) => ({
        infoboxSectionId: s.id,
        proposedContent: infoboxDraftContent[s.id],
      }));
    if (changes.length === 0 && infoboxChanges.length === 0) {
      setSubmitError("Make at least one change before submitting.");
      return;
    }
    setSubmitError(null);
    startTransition(async () => {
      const result = await submitPageSuggestion(
        pageId,
        selectedChapterId,
        citation,
        changes,
        infoboxChanges,
      );
      if (result.error) {
        setSubmitError(result.error);
      } else {
        router.refresh();
        setShowSuccessDialog(true);
      }
    });
  }, [
    selectedChapterId,
    citation,
    sections,
    infoboxSections,
    draftContent,
    infoboxDraftContent,
    pageId,
    router,
  ]);

  // Build chapter selector options from filtered available chapters only.
  const chapterSelectOptions: ChapterGroupOption[] = (() => {
    const volumeMap = new Map<string, { label: string; value: number }[]>();
    for (const ch of availableChapters) {
      const arr = volumeMap.get(ch.volumeName) ?? [];
      arr.push({ label: ch.displayName, value: ch.id });
      volumeMap.set(ch.volumeName, arr);
    }
    return Array.from(volumeMap.entries()).map(([volumeName, chaps]) => ({
      label: volumeName,
      value: -1 as number,
      children: chaps.map((c) => ({
        label: c.label,
        value: c.value,
        disabled: false,
      })),
    }));
  })();

  const selectedChapterName = availableChapters.find(
    (c) => c.id === selectedChapterId,
  )?.displayName;
  const chapterLabel = chapterType ?? "Chapter";

  return (
    <>
      <Dialog isOpen={showSuccessDialog} onClose={onClose}>
        <DialogHeader>
          <DialogTitle>Suggestion submitted</DialogTitle>
        </DialogHeader>
        <DialogBody>
          <Text>
            A wiki admin will review your suggestion. In the meantime, you can
            check the status on this page.
          </Text>
        </DialogBody>
        <DialogFooter>
          <Button onClick={onClose}>OK</Button>
        </DialogFooter>
      </Dialog>

      <Box col className="gap-6 rounded-lg border border-border bg-muted/30 p-6">
        <Box className="items-center justify-between">
          <Text variant="h3">Suggest an edit</Text>
          <Button variant="ghost" onClick={onClose} disabled={isPending}>
            Cancel
          </Button>
        </Box>

        {/* Chapter selector */}
        {availableChapters.length > 0 && (
          <Box col className="gap-2">
            <Label htmlFor="suggestion-target-chapter">
              Writing as of {chapterLabel}:
            </Label>
            <Select<number>
              id="suggestion-target-chapter"
              options={chapterSelectOptions}
              value={selectedChapterId ?? undefined}
              onChange={handleChapterChange}
              disabled={isPending}
              className="w-52"
            />
            {selectedChapterName && (
              <Text className="text-sm text-amber-600 dark:text-amber-400">
                Write for readers up to {chapterLabel} {selectedChapterName}.
                Avoid referencing later events — an admin will review your
                suggestion.
              </Text>
            )}
          </Box>
        )}

        {/* Section editors */}
        {sections.map((section, i) => (
          <Box col key={section.id} className="gap-2">
            <Box className="items-center gap-2">
              {i > 0 && <Text variant="h3">{section.name}</Text>}
              {i === 0 && (
                <InfoIcon contents="This section will appear in preview tooltips when this page is mentioned elsewhere." />
              )}
              <LastUpdatedTag
                lastUpdatedIdx={section.lastUpdatedChapterIdx}
                selectedChapterIdx={selectedChapterIdx}
              />
            </Box>
            <WikiLinkMDEditor
              value={draftContent[section.id] ?? ""}
              onChange={(val) =>
                setDraftContent((prev) => ({ ...prev, [section.id]: val ?? "" }))
              }
              height={260}
              preview="edit"
              wikiPages={wikiPages}
              serialSlug={serialSlug}
              wikiChapters={wikiChapters}
              chapterType={chapterType}
            />
          </Box>
        ))}

        {/* Infobox row editors */}
        {infoboxSections.length > 0 && (
          <Box col className="gap-4">
            <Text variant="h3">Infobox</Text>
            {infoboxSections.map((row) => (
              <Box col key={row.id} className="gap-1.5">
                <Label htmlFor={`ib-suggestion-${row.id}`}>{row.label}</Label>
                <Textarea
                  id={`ib-suggestion-${row.id}`}
                  value={infoboxDraftContent[row.id] ?? ""}
                  onChange={(e) =>
                    setInfoboxDraftContent((prev) => ({
                      ...prev,
                      [row.id]: e.target.value,
                    }))
                  }
                  rows={2}
                  disabled={isPending}
                />
              </Box>
            ))}
          </Box>
        )}

        {/* Citation */}
        <Box col className="gap-2">
          <Label htmlFor="suggestion-citation">
            Citation <span className="text-red-500">*</span>
          </Label>
          <Text className="text-sm text-muted-foreground">
            Provide a quote, page number, or episode timestamp supporting your
            changes.
          </Text>
          <Textarea
            id="suggestion-citation"
            placeholder="e.g. Chapter 12, page 4 — 'Luffy said…'"
            value={citation}
            onChange={(e) => setCitation(e.target.value)}
            disabled={isPending}
            rows={3}
          />
        </Box>

        {submitError && (
          <Text className="text-sm text-destructive">{submitError}</Text>
        )}

        <Button onClick={handleSubmit} disabled={isPending || !isDirty}>
          {isPending ? "Submitting…" : "Submit suggestion"}
        </Button>
      </Box>
    </>
  );
}
