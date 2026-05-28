"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Box } from "@/components/ui/Box";
import { Button } from "@/components/ui/Button";
import { Text } from "@/components/ui/Text";
import { Textarea } from "@/components/ui/Textarea";
import { MarkdownRenderer } from "@/components/ui/MarkdownRenderer";
import { approveSynopsisSuggestion, rejectSynopsisSuggestion } from "./synopsisSuggestionActions";

type SynopsisSuggestion = {
  id: number;
  proposerUsername: string | null;
  proposedContent: string;
  citation: string;
  createdAt: Date;
};

type SynopsisReviewPanelProps = {
  /** Pending suggestions to review, fetched server-side. */
  suggestions: SynopsisSuggestion[];
  /** Current synopsis content, shown as "current" in the diff. */
  currentContent: string;
  /** Serial slug for MarkdownRenderer wiki links. */
  serialSlug: string;
};

/**
 * Admin review panel for pending chapter synopsis suggestions.
 * Shows the current synopsis alongside each proposed version, with approve/reject controls.
 *
 * @example
 * <SynopsisReviewPanel suggestions={suggestions} currentContent={synopsisContent} serialSlug="one-piece" />
 */
export function SynopsisReviewPanel(props: SynopsisReviewPanelProps) {
  const { suggestions, currentContent, serialSlug } = props;

  if (suggestions.length === 0) {
    return null;
  }

  return (
    <Box col className="gap-4">
      <Text variant="h3">Pending synopsis suggestions ({suggestions.length})</Text>
      {suggestions.map((suggestion) => (
        <SynopsisSuggestionCard
          key={suggestion.id}
          suggestion={suggestion}
          currentContent={currentContent}
          serialSlug={serialSlug}
        />
      ))}
    </Box>
  );
}

type SynopsisSuggestionCardProps = {
  suggestion: SynopsisSuggestion;
  currentContent: string;
  serialSlug: string;
};

function SynopsisSuggestionCard(props: SynopsisSuggestionCardProps) {
  const { suggestion, currentContent, serialSlug } = props;
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [showRejectForm, setShowRejectForm] = useState(false);
  const [reviewNote, setReviewNote] = useState("");
  const [actionError, setActionError] = useState<string | null>(null);
  const [resolved, setResolved] = useState(false);

  if (resolved) return null;

  const submittedAt = new Date(suggestion.createdAt).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });

  function handleApprove() {
    setActionError(null);
    startTransition(async () => {
      const result = await approveSynopsisSuggestion(suggestion.id, reviewNote || undefined);
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
      const result = await rejectSynopsisSuggestion(suggestion.id, reviewNote || undefined);
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
      <Box className="items-start justify-between gap-2 flex-wrap">
        <Box col className="gap-1">
          <Text variant="body" className="font-medium">
            Suggested by {suggestion.proposerUsername ?? "unknown user"}
          </Text>
          <Text muted className="text-sm">Submitted {submittedAt}</Text>
        </Box>
      </Box>

      <Box col className="gap-1">
        <Text className="text-sm font-medium text-muted-foreground">Citation</Text>
        <Text className="text-sm italic">{suggestion.citation}</Text>
      </Box>

      <Box className="gap-3 items-start flex-col sm:flex-row">
        <Box col className="flex-1 gap-1 min-w-0">
          <Text muted className="text-xs font-medium uppercase tracking-wide">Current</Text>
          <Box className="rounded-md border border-border bg-muted/30 p-3 text-sm min-h-[80px] overflow-auto">
            {currentContent ? (
              <MarkdownRenderer serialSlug={serialSlug} sm>{currentContent}</MarkdownRenderer>
            ) : (
              <Text muted className="text-sm">(empty)</Text>
            )}
          </Box>
        </Box>
        <Box col className="flex-1 gap-1 min-w-0">
          <Text className="text-xs font-medium uppercase tracking-wide" style={{ color: "var(--color-primary)" }}>
            Proposed
          </Text>
          <Box className="rounded-md border border-primary/40 bg-primary/5 p-3 text-sm min-h-[80px] overflow-auto">
            <MarkdownRenderer serialSlug={serialSlug} sm>{suggestion.proposedContent}</MarkdownRenderer>
          </Box>
        </Box>
      </Box>

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

      <Box className="gap-2 flex-wrap">
        <Button onClick={handleApprove} disabled={isPending}>Approve</Button>
        {!showRejectForm ? (
          <Button variant="outline" onClick={() => setShowRejectForm(true)} disabled={isPending}>
            Reject
          </Button>
        ) : (
          <>
            <Button variant="destructive" onClick={handleReject} disabled={isPending}>
              {isPending ? "Rejecting…" : "Confirm rejection"}
            </Button>
            <Button variant="ghost" onClick={() => { setShowRejectForm(false); setReviewNote(""); }} disabled={isPending}>
              Cancel
            </Button>
          </>
        )}
      </Box>
    </Box>
  );
}
