"use client";

import { useState, useEffect, useCallback } from "react";
import { useServerAction } from "@/hooks/useServerAction";
import Link from "next/link";
import dynamic from "next/dynamic";
import { Box } from "@/components/ui/Box";
import { Button } from "@/components/ui/Button";
import { Label } from "@/components/ui/Label";
import { Textarea } from "@/components/ui/Textarea";
import { Text } from "@/components/ui/Text";
import {
  Dialog,
  DialogBody,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/Dialog";
import { submitPageSuggestion } from "./suggestionActions";
import { InfoIcon } from "@/components/ui/InfoIcon";
import { SectionRevisionTimeline } from "./SectionRevisionTimeline";
import type { ChapterData } from "./types";
import type { PageRevisionChapters, RevisionChapterStub } from "@/types";

const WikiLinkMDEditor = dynamic(
  () => import("@/components/MDEditor").then((m) => m.WikiLinkMDEditor),
  { ssr: false },
);

/**
 * The single unit a suggestion targets: one body section, or the infobox
 * (whose small related rows are edited together as one reviewable unit).
 */
export type SuggestionTarget =
  | {
      kind: "section";
      section: { id: number; name: string; content: string; isFirst: boolean };
    }
  | { kind: "infobox"; rows: { id: number; label: string; content: string }[] };

type SuggestionFormProps = {
  /** DB id of the page being suggested. */
  pageId: number;
  /** The single section or infobox unit this suggestion edits. */
  target: SuggestionTarget;
  /** All chapters for this serial, used to resolve the reader's cutoff name/idx. */
  allChapters: ChapterData[];
  /**
   * The chapter the user is currently reading up to. Suggestions are always
   * written as of this chapter — there is no separate target selector.
   */
  readingChapterId: number | null;
  /** Revision chapters per section/infobox row, powering the revision timeline. */
  revisionChapters?: PageRevisionChapters;
  /** Wiki pages for `[[Page]]` autocomplete in the editor. */
  wikiPages: { name: string; slug: string }[];
  /** Chapter name → idx map for `[[Chapter:Name]]` autocomplete. */
  wikiChapters?: { name: string; idx: number }[];
  /** The serial's chapter type label (e.g. "Chapter", "Episode"). */
  chapterType?: string;
  /** Slug of the parent serial, used to resolve wiki links. */
  serialSlug: string;
  /** Called when the user cancels or dismisses the post-submit confirmation dialog. */
  onClose: () => void;
};

/**
 * Inline suggestion form shown to authenticated non-admin users inside
 * PageReadView, focused on a single section (or the infobox) at a time.
 *
 * The suggestion is always written "as of" the user's current reading cutoff —
 * to suggest for an earlier chapter, the user changes their reading progress.
 * A revision timeline shows which stored version the edit starts from and
 * whether the section changes again later (existence only, no content).
 *
 * @example
 * <SuggestionForm
 *   pageId={42}
 *   target={{ kind: "section", section: { id: 1, name: "History", content: "...", isFirst: false } }}
 *   allChapters={allChapters}
 *   readingChapterId={7}
 *   wikiPages={[{ name: "Luffy", slug: "luffy" }]}
 *   serialSlug="one-piece"
 *   onClose={() => setTarget(null)}
 * />
 */
export function SuggestionForm(props: SuggestionFormProps) {
  const {
    pageId,
    target,
    allChapters,
    readingChapterId,
    revisionChapters,
    wikiPages,
    wikiChapters,
    chapterType,
    serialSlug,
    onClose,
  } = props;

  const { runAsync, isPending } = useServerAction();

  const readingChapter =
    readingChapterId !== null
      ? (allChapters.find((c) => c.id === readingChapterId) ?? null)
      : null;

  const initialDrafts: Record<number, string> =
    target.kind === "section"
      ? { [target.section.id]: target.section.content }
      : Object.fromEntries(target.rows.map((r) => [r.id, r.content]));

  const [draftContent, setDraftContent] =
    useState<Record<number, string>>(initialDrafts);
  const [citation, setCitation] = useState("");
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [showSuccessDialog, setShowSuccessDialog] = useState(false);

  // Dirty state: true when any draft differs from the stored content or citation is non-empty.
  const isDirty =
    citation.trim().length > 0 ||
    (target.kind === "section"
      ? draftContent[target.section.id] !== target.section.content
      : target.rows.some((r) => draftContent[r.id] !== r.content));

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

  const handleSubmit = useCallback(() => {
    if (!citation.trim()) {
      setSubmitError("Citation is required.");
      return;
    }
    const sectionChanges =
      target.kind === "section" &&
      draftContent[target.section.id] !== target.section.content &&
      draftContent[target.section.id]?.trim()
        ? [
            {
              sectionId: target.section.id,
              proposedContent: draftContent[target.section.id],
            },
          ]
        : [];
    const infoboxChanges =
      target.kind === "infobox"
        ? target.rows
            .filter(
              (r) =>
                draftContent[r.id] !== r.content && draftContent[r.id]?.trim(),
            )
            .map((r) => ({
              infoboxSectionId: r.id,
              proposedContent: draftContent[r.id],
            }))
        : [];
    if (sectionChanges.length === 0 && infoboxChanges.length === 0) {
      setSubmitError("Make a change before submitting.");
      return;
    }
    setSubmitError(null);
    runAsync(
      () =>
        submitPageSuggestion(pageId, citation, sectionChanges, infoboxChanges),
      () => setShowSuccessDialog(true),
      (err) => setSubmitError(err),
    );
  }, [runAsync, citation, target, draftContent, pageId]);

  const chapterLabel = chapterType ?? "Chapter";

  // Revision chapters for the timeline. For the infobox unit, merge the rows'
  // revision chapters (deduped by chapter) so one strip covers the whole unit.
  const timelineRevisions: RevisionChapterStub[] = (() => {
    if (!revisionChapters) return [];
    if (target.kind === "section") {
      return revisionChapters.sections[target.section.id] ?? [];
    }
    const byChapterId = new Map<number, RevisionChapterStub>();
    for (const row of target.rows) {
      for (const rev of revisionChapters.infoboxRows[row.id] ?? []) {
        byChapterId.set(rev.chapterId, rev);
      }
    }
    return [...byChapterId.values()].sort((a, b) => a.idx - b.idx);
  })();

  const targetTitle =
    target.kind === "section"
      ? target.section.isFirst
        ? "Suggest an edit · Summary"
        : `Suggest an edit · ${target.section.name}`
      : "Suggest an edit · Infobox";

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

      <Box
        col
        className="gap-6 rounded-lg border border-border bg-muted/30 p-6"
      >
        <Box className="items-center justify-between">
          <Text variant="h3">{targetTitle}</Text>
          <Button variant="ghost" onClick={onClose} disabled={isPending}>
            Cancel
          </Button>
        </Box>

        <Text className="text-sm text-muted-foreground">
          Suggestions are reviewed by a wiki admin before going live.{" "}
          <Link
            href="/help#suggesting-edits"
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary hover:underline"
          >
            How does this work?
          </Link>
        </Text>

        {/* Fixed "as of" context — always the reader's current cutoff. */}
        {readingChapter ? (
          <Text className="text-sm text-amber-600 dark:text-amber-400">
            You are suggesting as of {chapterLabel}{" "}
            {readingChapter.displayName} — your current reading progress. Write
            for readers up to that point and avoid referencing later events. To
            suggest for an earlier {chapterLabel.toLowerCase()}, set your
            reading progress there first.
          </Text>
        ) : (
          <Text className="text-sm text-destructive">
            Set your reading progress for this serial before suggesting an
            edit — suggestions always apply as of the {chapterLabel.toLowerCase()}{" "}
            you are reading.
          </Text>
        )}

        <SectionRevisionTimeline
          revisions={timelineRevisions}
          cutoffIdx={readingChapter?.idx ?? null}
          chapterType={chapterLabel}
        />

        {/* Focused editor(s) */}
        {target.kind === "section" ? (
          <Box col className="gap-2">
            <Box className="items-center gap-2">
              {!target.section.isFirst && (
                <Text variant="h3">{target.section.name}</Text>
              )}
              {target.section.isFirst && (
                <>
                  <Text variant="h3">Summary</Text>
                  <InfoIcon contents="This section will appear in preview tooltips when this page is mentioned elsewhere." />
                </>
              )}
            </Box>
            <WikiLinkMDEditor
              value={draftContent[target.section.id] ?? ""}
              onChange={(val) =>
                setDraftContent((prev) => ({
                  ...prev,
                  [target.section.id]: val ?? "",
                }))
              }
              height={260}
              preview="edit"
              wikiPages={wikiPages}
              serialSlug={serialSlug}
              wikiChapters={wikiChapters}
              chapterType={chapterType}
            />
          </Box>
        ) : (
          <Box col className="gap-4">
            {target.rows.map((row) => (
              <Box col key={row.id} className="gap-1.5">
                <Label>{row.label}</Label>
                <WikiLinkMDEditor
                  value={draftContent[row.id] ?? ""}
                  onChange={(val) =>
                    setDraftContent((prev) => ({
                      ...prev,
                      [row.id]: val ?? "",
                    }))
                  }
                  height={120}
                  preview="edit"
                  wikiPages={wikiPages}
                  serialSlug={serialSlug}
                  wikiChapters={wikiChapters}
                  chapterType={chapterType}
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
            placeholder="e.g. Chapter 12, page 4 - 'Luffy said…'"
            value={citation}
            onChange={(e) => setCitation(e.target.value)}
            disabled={isPending}
            rows={3}
          />
        </Box>

        {submitError && (
          <Text className="text-sm text-destructive">{submitError}</Text>
        )}

        <Button
          onClick={handleSubmit}
          disabled={isPending || !isDirty || !readingChapter}
        >
          {isPending ? "Submitting…" : "Submit suggestion"}
        </Button>
      </Box>
    </>
  );
}
