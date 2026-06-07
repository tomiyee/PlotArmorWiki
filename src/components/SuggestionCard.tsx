"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { Box } from "@/components/ui/Box";
import { Button } from "@/components/ui/Button";
import { Text } from "@/components/ui/Text";
import { Textarea } from "@/components/ui/Textarea";

type SuggestionCardProps = {
  /** Username of the reader who submitted the suggestion, or null if anonymous. */
  proposerUsername: string | null;
  /** Wall-clock timestamp of submission (Date or ISO string). */
  createdAt: Date | string;
  /**
   * Optional chapter name shown in the header subtitle.
   * When provided, renders "Submitted {date} · Target {chapter}".
   */
  targetChapterName?: string;
  /**
   * Called with the optional review note when the admin clicks Approve.
   * Should return `{}` on success or `{ error: string }` on failure.
   */
  onApprove: (reviewNote?: string) => Promise<{ error?: string }>;
  /**
   * Called with the optional review note when the admin confirms rejection.
   * Should return `{}` on success or `{ error?: string }` on failure.
   */
  onReject: (reviewNote?: string) => Promise<{ error?: string }>;
  /** Domain-specific diff content rendered inside the card. */
  children: ReactNode;
};

/**
 * Shared review card for admin suggestion workflows.
 * Encapsulates the approve/reject state machine so both
 * `SuggestionReviewPanel` and `SynopsisReviewPanel` stay in sync.
 *
 * @example
 * <SuggestionCard
 *   proposerUsername={suggestion.proposerUsername}
 *   createdAt={suggestion.createdAt}
 *   targetChapterName={suggestion.targetChapterName}
 *   onApprove={async (note) => approveSuggestion(suggestion.id, note)}
 *   onReject={async (note) => rejectSuggestion(suggestion.id, note)}
 * >
 *   <DiffContent />
 * </SuggestionCard>
 */
export function SuggestionCard(props: SuggestionCardProps) {
  const {
    proposerUsername,
    createdAt,
    targetChapterName,
    onApprove,
    onReject,
    children,
  } = props;

  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [showRejectForm, setShowRejectForm] = useState(false);
  const [reviewNote, setReviewNote] = useState("");
  const [actionError, setActionError] = useState<string | null>(null);
  const [resolved, setResolved] = useState(false);

  if (resolved) return null;

  const submittedAt = new Date(createdAt).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });

  function handleApprove() {
    setActionError(null);
    startTransition(async () => {
      const result = await onApprove(reviewNote || undefined);
      if (result.error) {
        setActionError(result.error);
      } else {
        setResolved(true);
        router.refresh();
      }
    });
  }

  function handleReject() {
    setActionError(null);
    startTransition(async () => {
      const result = await onReject(reviewNote || undefined);
      if (result.error) {
        setActionError(result.error);
      } else {
        setResolved(true);
        router.refresh();
      }
    });
  }

  return (
    <Box col className="gap-4 rounded-lg border border-border bg-background p-4">
      {/* Header */}
      <Box className="items-start justify-between gap-2 flex-wrap">
        <Box col className="gap-1">
          <Text variant="body" className="font-medium">
            Suggested by {proposerUsername ?? "unknown user"}
          </Text>
          <Text muted className="text-sm">
            Submitted {submittedAt}
            {targetChapterName && ` · Target ${targetChapterName}`}
          </Text>
        </Box>
      </Box>

      {/* Diff slot — caller-supplied */}
      {children}

      {/* Reject note form */}
      {showRejectForm && (
        <Box col className="gap-2">
          <Text className="text-sm text-muted-foreground">
            Optional: explain why this suggestion was not accepted.
          </Text>
          <Textarea
            value={reviewNote}
            onChange={(e) => setReviewNote(e.target.value)}
            placeholder="Review note (optional)"
            rows={3}
            disabled={isPending}
          />
        </Box>
      )}

      {actionError && (
        <Text className="text-sm text-destructive">{actionError}</Text>
      )}

      {/* Actions */}
      <Box className="gap-2 flex-wrap justify-end">
        {!showRejectForm ? (
          <>
            <Button
              variant="outline"
              onClick={() => setShowRejectForm(true)}
              disabled={isPending}
            >
              Reject
            </Button>
            <Button onClick={handleApprove} disabled={isPending}>
              Approve
            </Button>
          </>
        ) : (
          <>
            <Button
              variant="ghost"
              onClick={() => {
                setShowRejectForm(false);
                setReviewNote("");
              }}
              disabled={isPending}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleReject}
              disabled={isPending}
            >
              {isPending ? "Rejecting…" : "Confirm rejection"}
            </Button>
          </>
        )}
      </Box>
    </Box>
  );
}
