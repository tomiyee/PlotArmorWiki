"use client";

import { useState, useTransition, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import { Box } from "@/components/ui/Box";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Label } from "@/components/ui/Label";
import { Select } from "@/components/ui/Select";
import { Text } from "@/components/ui/Text";
import { submitPageSuggestion, getSectionsAtChapter } from "./suggestionActions";
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
   * for the "Writing as of:" selector and for the spoiler warning message.
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
  initialSections: { id: number; name: string; content: string }[];
  /** Called when the user cancels or successfully submits the suggestion. */
  onClose: () => void;
};

/**
 * Inline suggestion form shown to authenticated non-admin users inside PageReadView.
 * Allows proposing section content changes with a single citation field.
 * Fetches section content at the chosen target chapter when the chapter selector changes.
 *
 * @example
 * <SuggestionForm
 *   pageId={42}
 *   allChapters={allChapters}
 *   readingChapterId={7}
 *   wikiPages={[{ name: "Luffy", slug: "luffy" }]}
 *   serialSlug="one-piece"
 *   initialSections={[{ id: 1, name: "Summary", content: "..." }]}
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
    onClose,
  } = props;

  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const headChapterId = allChapters.at(-1)?.id ?? null;
  const [selectedChapterId, setSelectedChapterId] = useState<number | null>(
    readingChapterId ?? headChapterId,
  );
  const [sections, setSections] = useState(initialSections);
  const [draftContent, setDraftContent] = useState<Record<number, string>>(
    Object.fromEntries(initialSections.map((s) => [s.id, s.content])),
  );
  const [citation, setCitation] = useState("");
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);

  // Dirty state: true when any draft differs from the section content or citation is non-empty.
  const isDirty =
    citation.trim().length > 0 ||
    sections.some((s) => draftContent[s.id] !== s.content);

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
        const { sections: newSections } = await getSectionsAtChapter(pageId, chapterId);
        setSections(newSections);
        setDraftContent(Object.fromEntries(newSections.map((s) => [s.id, s.content])));
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
      .filter((s) => draftContent[s.id] !== s.content && draftContent[s.id]?.trim())
      .map((s) => ({ sectionId: s.id, proposedContent: draftContent[s.id] }));
    if (changes.length === 0) {
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
      );
      if (result.error) {
        setSubmitError(result.error);
      } else {
        setSubmitted(true);
        router.refresh();
      }
    });
  }, [pageId, selectedChapterId, citation, sections, draftContent, router]);

  // Build chapter selector options (all chapters enabled — admin review is the spoiler gate).
  const chapterSelectOptions: ChapterGroupOption[] = (() => {
    const volumeMap = new Map<string, { label: string; value: number }[]>();
    for (const ch of allChapters) {
      const arr = volumeMap.get(ch.volumeName) ?? [];
      arr.push({ label: ch.displayName, value: ch.id });
      volumeMap.set(ch.volumeName, arr);
    }
    return Array.from(volumeMap.entries()).map(([volumeName, chaps]) => ({
      label: volumeName,
      value: -1 as number,
      children: chaps.map((c) => ({ label: c.label, value: c.value, disabled: false })),
    }));
  })();

  const selectedChapterName = allChapters.find((c) => c.id === selectedChapterId)?.displayName;
  const chapterLabel = chapterType ?? "Chapter";

  if (submitted) {
    return (
      <Box col className="gap-4 rounded-lg border border-border bg-muted/30 p-6">
        <Text variant="h3">Suggestion submitted</Text>
        <Text variant="body">
          Your suggestion has been submitted for admin review. You can check the status on
          this page after it is reviewed.
        </Text>
        <Button variant="outline" onClick={onClose}>
          Back to page
        </Button>
      </Box>
    );
  }

  return (
    <Box col className="gap-6 rounded-lg border border-border bg-muted/30 p-6">
      <Box className="items-center justify-between">
        <Text variant="h3">Suggest an edit</Text>
        <Button variant="ghost" onClick={onClose} disabled={isPending}>
          Cancel
        </Button>
      </Box>

      {/* Chapter selector */}
      {allChapters.length > 0 && (
        <Box col className="gap-2">
          <Label htmlFor="suggestion-target-chapter">Writing as of {chapterLabel}:</Label>
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
              Avoid referencing later events — admin review is the spoiler gate.
            </Text>
          )}
        </Box>
      )}

      {/* Section editors */}
      {sections.map((section, i) => (
        <Box col key={section.id} className="gap-2">
          {i > 0 && <Text variant="h3">{section.name}</Text>}
          {i === 0 && <Label>Summary</Label>}
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

      {/* Citation */}
      <Box col className="gap-2">
        <Label htmlFor="suggestion-citation">Citation (required)</Label>
        <Input
          id="suggestion-citation"
          placeholder="e.g. Chapter 12, page 4 — 'Luffy said…'"
          value={citation}
          onChange={(e) => setCitation(e.target.value)}
          disabled={isPending}
        />
        <Text className="text-sm text-muted-foreground">
          Provide a quote, page number, or episode timestamp supporting your changes.
        </Text>
      </Box>

      {submitError && (
        <Text className="text-sm text-destructive">{submitError}</Text>
      )}

      <Button onClick={handleSubmit} disabled={isPending || !isDirty}>
        {isPending ? "Submitting…" : "Submit suggestion"}
      </Button>
    </Box>
  );
}
