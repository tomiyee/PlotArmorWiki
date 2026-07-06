"use client";

import { Fragment } from "react";
import { Box } from "@/components/ui/Box";
import { Text } from "@/components/ui/Text";
import { Tooltip } from "@/components/ui/Tooltip";
import { cn } from "@/lib/utils";
import type { RevisionChapterStub } from "@/types";

type SectionRevisionTimelineProps = {
  /** Chapters at which the focused section has stored revisions, ascending by idx. */
  revisions: RevisionChapterStub[];
  /** The reader's current cutoff idx; revisions after it render as spoiler-safe "later" markers. */
  cutoffIdx: number | null;
  /** The serial's chapter type label (e.g. "Chapter", "Episode"). */
  chapterType?: string;
};

/**
 * Horizontal revision-history strip shown in the suggestion form. Tells the
 * suggester which stored revision their edit is based on (the highest revision
 * at or before their cutoff) and that later revisions exist — without showing
 * later content, so only the *existence* of a future change is revealed.
 */
export function SectionRevisionTimeline(props: SectionRevisionTimelineProps) {
  const { revisions, cutoffIdx, chapterType = "Chapter" } = props;

  if (revisions.length === 0 || cutoffIdx === null) return null;

  const pastRevisions = revisions.filter((r) => r.idx <= cutoffIdx);
  const futureRevisions = revisions.filter((r) => r.idx > cutoffIdx);
  const editingRevision = pastRevisions.at(-1) ?? null;

  const summary = (() => {
    const parts: string[] = [];
    if (editingRevision) {
      parts.push(
        `Your edit is based on the version written at ${chapterType} ${editingRevision.displayName}.`,
      );
    } else {
      parts.push(
        `No version of this section exists at your ${chapterType.toLowerCase()} yet — you're writing the first one.`,
      );
    }
    if (futureRevisions.length > 0) {
      parts.push(
        `This section changes again later in the story (${futureRevisions.length} ${
          futureRevisions.length === 1 ? "time" : "times"
        }); an admin may carry your edit forward.`,
      );
    }
    return parts.join(" ");
  })();

  return (
    <Box col className="gap-2 rounded-md border border-border bg-background/60 p-3">
      <Text className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        Revision history
      </Text>
      <Box className="items-start overflow-x-auto pb-1">
        {revisions.map((rev, i) => {
          const isFuture = rev.idx > cutoffIdx;
          const isEditing = editingRevision?.chapterId === rev.chapterId;
          const prevIsFuture = i > 0 && revisions[i - 1].idx > cutoffIdx;
          // The cutoff marker sits on the first segment that crosses the reader's progress.
          const crossesCutoff = isFuture && !prevIsFuture;
          return (
            <Fragment key={rev.chapterId}>
              {i > 0 && (
                <Box
                  col
                  className="min-w-8 flex-1 items-center self-stretch pt-1.5"
                >
                  <div
                    className={cn(
                      "h-px w-full",
                      isFuture
                        ? "border-t border-dashed border-amber-400/80 dark:border-amber-500/60"
                        : "bg-muted-foreground/40",
                    )}
                  />
                  {crossesCutoff && (
                    <Text className="mt-1 whitespace-nowrap text-[10px] leading-tight text-muted-foreground">
                      ← you are here
                    </Text>
                  )}
                </Box>
              )}
              <Tooltip
                content={
                  isFuture
                    ? `Revised again at a later ${chapterType.toLowerCase()} — content hidden to avoid spoilers`
                    : isEditing
                      ? "The version your suggestion starts from"
                      : `Revised at ${chapterType} ${rev.displayName}`
                }
              >
                <Box col className="w-14 shrink-0 items-center gap-1">
                  <div
                    className={cn(
                      "mt-1 shrink-0 rounded-full",
                      isEditing
                        ? "size-3 bg-primary ring-2 ring-primary/30"
                        : isFuture
                          ? "size-2.5 border-2 border-amber-400/80 bg-background dark:border-amber-500/60"
                          : "size-2.5 bg-muted-foreground/60",
                    )}
                  />
                  <Box col className="items-center">
                    <Text
                      className={cn(
                        "max-w-full truncate text-center text-[10px] leading-tight",
                        isFuture && "text-muted-foreground",
                      )}
                    >
                      {isFuture ? "Later" : `${rev.displayName}`}
                    </Text>
                    {isEditing && (
                      <Text className="whitespace-nowrap text-[10px] leading-tight text-primary">
                        editing this
                      </Text>
                    )}
                  </Box>
                </Box>
              </Tooltip>
            </Fragment>
          );
        })}
      </Box>
      <Text muted className="text-xs">
        {summary}
      </Text>
    </Box>
  );
}
