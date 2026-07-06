"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import { Box } from "@/components/ui/Box";
import { Text } from "@/components/ui/Text";
import { Button } from "@/components/ui/Button";
import { MarkdownRenderer } from "@/components/ui/MarkdownRenderer";
import { SuggestionCard } from "@/components/SuggestionCard";
import { approveSuggestion, rejectSuggestion } from "./suggestionActions";
import type {
  PendingSuggestionDetail,
  FutureRevision,
  FutureRevisionUpdate,
} from "@/types";

const WikiLinkMDEditor = dynamic(
  () => import("@/components/MDEditor").then((m) => m.WikiLinkMDEditor),
  { ssr: false },
);

type DiffRowProps = {
  /** Heading shown above the two-column diff (section name or infobox label). */
  label: string;
  /** Current stored markdown at the target chapter. */
  currentContent: string;
  /** Proposed replacement markdown. */
  proposedContent: string;
  /** Tailwind min-height class for the content boxes. */
  minH: string;
  /** Serial slug forwarded to MarkdownRenderer for wiki-link resolution. */
  serialSlug: string;
};

function DiffRow(props: DiffRowProps) {
  const { label, currentContent, proposedContent, minH, serialSlug } = props;
  return (
    <Box col className="gap-2">
      <Text variant="h4">{label}</Text>
      <Box className="gap-3 items-stretch flex-col sm:flex-row">
        <Box col className="flex-1 gap-1 min-w-0">
          <Text muted className="text-xs font-medium uppercase tracking-wide">
            Current
          </Text>
          <Box
            className={`flex-1 rounded-md border border-border bg-muted/30 p-3 text-sm ${minH} overflow-auto`}
          >
            {currentContent ? (
              <MarkdownRenderer serialSlug={serialSlug} sm>
                {currentContent}
              </MarkdownRenderer>
            ) : (
              <Text muted className="text-sm">
                (empty)
              </Text>
            )}
          </Box>
        </Box>
        <Box col className="flex-1 gap-1 min-w-0">
          <Text
            className="text-xs font-medium uppercase tracking-wide"
            style={{ color: "var(--color-primary)" }}
          >
            Proposed
          </Text>
          <Box
            className={`flex-1 rounded-md border border-primary/40 bg-primary/5 p-3 text-sm ${minH} overflow-auto`}
          >
            <MarkdownRenderer serialSlug={serialSlug} sm>
              {proposedContent}
            </MarkdownRenderer>
          </Box>
        </Box>
      </Box>
    </Box>
  );
}

/** Client-side state for one later revision the admin may carry the change into. */
type CarryForwardDraft = {
  /** Whether the admin opted in to updating this later revision. */
  enabled: boolean;
  /** The (possibly edited) replacement content for the later revision. */
  content: string;
};

/** Stable key for one later revision of one section/infobox row. */
function carryKey(kind: "section" | "infobox", ownerId: number, chapterId: number) {
  return `${kind}-${ownerId}-${chapterId}`;
}

type CarryForwardPanelProps = {
  /** "section" for body sections, "infobox" for infobox rows. */
  kind: "section" | "infobox";
  /** id of the section / infobox row the change targets. */
  ownerId: number;
  /** Display label of the changed unit ("History", "Age", …). */
  label: string;
  /** Later revisions of the same unit, ascending by chapter idx. */
  futureRevisions: FutureRevision[];
  /** Display name of the suggestion's target chapter. */
  targetChapterName: string;
  /** The serial's chapter type label (e.g. "Chapter", "Episode"). */
  chapterType: string;
  /** The admin's reading cutoff idx; later revisions beyond it get a spoiler badge. */
  readerCutoffIdx: number | null;
  /** Serial slug for wiki-link resolution. */
  serialSlug: string;
  /** Wiki pages for `[[Page]]` autocomplete in carry-forward editors. */
  wikiPages?: { name: string; slug: string }[];
  /** Chapters for `[[Chapter:Name]]` autocomplete in carry-forward editors. */
  wikiChapters?: { name: string; idx: number }[];
  /** Current carry-forward drafts keyed by `carryKey`. */
  drafts: Record<string, CarryForwardDraft>;
  /** Updates a single carry-forward draft. */
  onDraftChange: (key: string, draft: CarryForwardDraft) => void;
};

/**
 * Explains, in plain language, where an approved change will be visible and
 * lets the admin optionally "carry it forward" into each later revision of the
 * same section/row by editing that revision's content in place.
 */
function CarryForwardPanel(props: CarryForwardPanelProps) {
  const {
    kind,
    ownerId,
    label,
    futureRevisions,
    targetChapterName,
    chapterType,
    readerCutoffIdx,
    serialSlug,
    wikiPages,
    wikiChapters,
    drafts,
    onDraftChange,
  } = props;

  const [revealedSpoilers, setRevealedSpoilers] = useState<
    Record<number, boolean>
  >({});

  if (futureRevisions.length === 0) return null;

  const firstFuture = futureRevisions[0];
  const visibleUntil = `readers from ${chapterType} ${targetChapterName} up to (but not including) ${chapterType} ${firstFuture.chapterName} will see the proposed text`;

  return (
    <Box
      col
      className="gap-3 rounded-md border border-amber-400/40 bg-amber-50/40 dark:bg-amber-950/10 p-3"
    >
      <Text className="text-sm font-medium text-amber-700 dark:text-amber-400">
        “{label}” was written again later — carry this change forward?
      </Text>
      <Text className="text-sm text-muted-foreground">
        If you approve, {visibleUntil}. At{" "}
        {futureRevisions
          .map((r) => `${chapterType} ${r.chapterName}`)
          .join(", ")}{" "}
        this {kind === "section" ? "section" : "infobox row"} was written
        again, and those versions do <strong>not</strong> include this change.
        If the change still applies there, edit each version below to include
        it. If a later version already covers it (or replaces it), leave that
        version alone.
      </Text>

      {futureRevisions.map((rev) => {
        const key = carryKey(kind, ownerId, rev.chapterId);
        const draft = drafts[key] ?? { enabled: false, content: rev.content };
        const isSpoiler =
          readerCutoffIdx !== null && rev.chapterIdx > readerCutoffIdx;
        const isRevealed = !isSpoiler || revealedSpoilers[rev.chapterId];

        return (
          <Box
            col
            key={rev.chapterId}
            className="gap-2 rounded-md border border-border bg-background p-3"
          >
            <Box className="items-center gap-2 flex-wrap">
              <Text className="text-sm font-medium">
                Version at {chapterType} {rev.chapterName}
              </Text>
              {isSpoiler && (
                <Text
                  as="span"
                  className="rounded bg-amber-100 dark:bg-amber-900/40 px-1.5 py-0.5 text-xs text-amber-700 dark:text-amber-400"
                >
                  beyond your reading progress
                </Text>
              )}
              <Box className="ml-auto">
                {isRevealed && (
                  <Button
                    variant={draft.enabled ? "outline" : "default"}
                    size="sm"
                    onClick={() =>
                      onDraftChange(key, {
                        enabled: !draft.enabled,
                        content: rev.content,
                      })
                    }
                  >
                    {draft.enabled ? "Don't update" : "Edit to include change"}
                  </Button>
                )}
              </Box>
            </Box>

            {!isRevealed ? (
              <Button
                variant="outline"
                size="sm"
                className="self-start"
                onClick={() =>
                  setRevealedSpoilers((prev) => ({
                    ...prev,
                    [rev.chapterId]: true,
                  }))
                }
              >
                Reveal content (may spoil {chapterType.toLowerCase()}s you
                haven&apos;t read)
              </Button>
            ) : draft.enabled ? (
              <Box col className="gap-1.5">
                <Text muted className="text-xs">
                  Edit this version so it includes the suggested change. It
                  starts from the existing {chapterType} {rev.chapterName}{" "}
                  content.
                </Text>
                <WikiLinkMDEditor
                  value={draft.content}
                  onChange={(val) =>
                    onDraftChange(key, { enabled: true, content: val ?? "" })
                  }
                  height={kind === "section" ? 220 : 120}
                  preview="edit"
                  wikiPages={wikiPages ?? []}
                  serialSlug={serialSlug}
                  wikiChapters={wikiChapters}
                  chapterType={chapterType}
                />
              </Box>
            ) : (
              <Box className="rounded-md border border-border bg-muted/30 p-3 text-sm overflow-auto max-h-48">
                <MarkdownRenderer serialSlug={serialSlug} sm>
                  {rev.content}
                </MarkdownRenderer>
              </Box>
            )}
          </Box>
        );
      })}
    </Box>
  );
}

type PendingSuggestionReviewCardProps = {
  /** The fully-hydrated suggestion under review. */
  suggestion: PendingSuggestionDetail;
  /** Slug of the serial, used for MarkdownRenderer wiki links. */
  serialSlug: string;
  /** The serial's chapter type label (e.g. "Chapter", "Episode"). */
  chapterType?: string;
  /** The admin's reading cutoff idx, for spoiler badges on later revisions. */
  readerCutoffIdx?: number | null;
  /** Wiki pages for `[[Page]]` autocomplete in carry-forward editors. */
  wikiPages?: { name: string; slug: string }[];
  /** Chapters for `[[Chapter:Name]]` autocomplete in carry-forward editors. */
  wikiChapters?: { name: string; idx: number }[];
};

/**
 * One reviewable suggestion: citation, Current/Proposed diff per change, an
 * optional carry-forward panel for later revisions of the same section/row,
 * and approve/reject controls. Approving sends any enabled, actually-modified
 * carry-forward drafts along so they are applied in the same transaction.
 *
 * @example
 * <PendingSuggestionReviewCard suggestion={s} serialSlug="one-piece" chapterType="Chapter" />
 */
export function PendingSuggestionReviewCard(
  props: PendingSuggestionReviewCardProps,
) {
  const {
    suggestion,
    serialSlug,
    chapterType = "Chapter",
    readerCutoffIdx = null,
    wikiPages,
    wikiChapters,
  } = props;

  const [carryDrafts, setCarryDrafts] = useState<
    Record<string, CarryForwardDraft>
  >({});

  const handleDraftChange = (key: string, draft: CarryForwardDraft) =>
    setCarryDrafts((prev) => ({ ...prev, [key]: draft }));

  /** Collects enabled carry-forward drafts that differ from the stored revision. */
  function buildFutureUpdates(): FutureRevisionUpdate[] {
    const updates: FutureRevisionUpdate[] = [];
    for (const change of suggestion.sectionChanges) {
      for (const rev of change.futureRevisions) {
        const draft =
          carryDrafts[carryKey("section", change.sectionId, rev.chapterId)];
        if (draft?.enabled && draft.content !== rev.content) {
          updates.push({
            sectionId: change.sectionId,
            chapterId: rev.chapterId,
            content: draft.content,
          });
        }
      }
    }
    for (const change of suggestion.infoboxChanges) {
      for (const rev of change.futureRevisions) {
        const draft =
          carryDrafts[
            carryKey("infobox", change.infoboxSectionId, rev.chapterId)
          ];
        if (draft?.enabled && draft.content !== rev.content) {
          updates.push({
            infoboxSectionId: change.infoboxSectionId,
            chapterId: rev.chapterId,
            content: draft.content,
          });
        }
      }
    }
    return updates;
  }

  return (
    <SuggestionCard
      proposerUsername={suggestion.proposerUsername}
      createdAt={suggestion.createdAt}
      targetChapterName={suggestion.targetChapterName}
      onApprove={(note) =>
        approveSuggestion(suggestion.id, note, buildFutureUpdates())
      }
      onReject={(note) => rejectSuggestion(suggestion.id, note)}
    >
      {/* Citation */}
      <Box col className="gap-1">
        <Text className="text-sm font-medium text-muted-foreground">
          Citation
        </Text>
        <Text className="text-sm italic">{suggestion.citation}</Text>
      </Box>

      {/* Section diffs + carry-forward */}
      {suggestion.sectionChanges.map((change) => (
        <Box col key={change.sectionId} className="gap-3">
          <DiffRow
            label={change.sectionName}
            currentContent={change.currentContent}
            proposedContent={change.proposedContent}
            minH="min-h-60px"
            serialSlug={serialSlug}
          />
          <CarryForwardPanel
            kind="section"
            ownerId={change.sectionId}
            label={change.sectionName}
            futureRevisions={change.futureRevisions}
            targetChapterName={suggestion.targetChapterName}
            chapterType={chapterType}
            readerCutoffIdx={readerCutoffIdx}
            serialSlug={serialSlug}
            wikiPages={wikiPages}
            wikiChapters={wikiChapters}
            drafts={carryDrafts}
            onDraftChange={handleDraftChange}
          />
        </Box>
      ))}

      {/* Infobox diffs + carry-forward */}
      {suggestion.infoboxChanges.map((change) => (
        <Box col key={change.infoboxSectionId} className="gap-3">
          <DiffRow
            label={`Infobox: ${change.infoboxSectionLabel}`}
            currentContent={change.currentContent}
            proposedContent={change.proposedContent}
            minH="min-h-40px"
            serialSlug={serialSlug}
          />
          <CarryForwardPanel
            kind="infobox"
            ownerId={change.infoboxSectionId}
            label={change.infoboxSectionLabel}
            futureRevisions={change.futureRevisions}
            targetChapterName={suggestion.targetChapterName}
            chapterType={chapterType}
            readerCutoffIdx={readerCutoffIdx}
            serialSlug={serialSlug}
            wikiPages={wikiPages}
            wikiChapters={wikiChapters}
            drafts={carryDrafts}
            onDraftChange={handleDraftChange}
          />
        </Box>
      ))}
    </SuggestionCard>
  );
}
