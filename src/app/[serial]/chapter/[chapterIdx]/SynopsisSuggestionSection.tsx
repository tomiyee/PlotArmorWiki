"use client";

import { useState } from "react";
import { Box } from "@/components/ui/Box";
import { Button } from "@/components/ui/Button";
import { Text } from "@/components/ui/Text";
import { SynopsisSuggestionForm } from "./SynopsisSuggestionForm";

type MySuggestion = {
  id: number;
  status: "pending" | "approved" | "rejected";
  reviewNote: string | null;
  createdAt: Date;
} | null;

type SynopsisSuggestionSectionProps = {
  /** DB id of the chapter. */
  chapterId: number;
  /** Current synopsis text. */
  currentContent: string;
  /** The current user's most recent synopsis suggestion for this chapter, or null. */
  mySuggestion: MySuggestion;
};

/**
 * Read-mode wrapper: shows a "Suggest an edit to the synopsis" button for
 * authenticated non-admins, plus a status banner if they have an existing suggestion.
 *
 * @example
 * <SynopsisSuggestionSection chapterId={7} currentContent="..." mySuggestion={null} />
 */
export function SynopsisSuggestionSection(props: SynopsisSuggestionSectionProps) {
  const { chapterId, currentContent, mySuggestion } = props;
  const [showForm, setShowForm] = useState(false);

  const statusBanner = (() => {
    if (!mySuggestion) return null;
    const { status, reviewNote } = mySuggestion;
    if (status === "pending") {
      return (
        <div className="rounded-md border border-border bg-muted/40 px-4 py-3 text-sm text-muted-foreground">
          Your synopsis suggestion is pending admin review.
        </div>
      );
    }
    if (status === "approved") {
      return (
        <div className="rounded-md border border-green-500/30 bg-green-50/50 dark:bg-green-950/20 px-4 py-3 text-sm text-green-700 dark:text-green-400">
          Your synopsis suggestion was approved and applied.
        </div>
      );
    }
    if (status === "rejected") {
      return (
        <div className="rounded-md border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          Your synopsis suggestion was not accepted.
          {reviewNote && (
            <Text as="span" className="block mt-1 text-muted-foreground">
              Admin note: {reviewNote}
            </Text>
          )}
        </div>
      );
    }
    return null;
  })();

  return (
    <Box col className="gap-3 mt-2">
      {statusBanner}
      {!showForm && (
        <div>
          <Button variant="outline" onClick={() => setShowForm(true)}>
            Suggest an edit to the synopsis
          </Button>
        </div>
      )}
      {showForm && (
        <SynopsisSuggestionForm
          chapterId={chapterId}
          currentContent={currentContent}
          onClose={() => setShowForm(false)}
        />
      )}
    </Box>
  );
}
