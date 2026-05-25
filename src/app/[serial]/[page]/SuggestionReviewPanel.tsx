"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Box } from "@/components/ui/Box";
import { Button } from "@/components/ui/Button";
import { Text } from "@/components/ui/Text";
import { Textarea } from "@/components/ui/Textarea";
import { MarkdownRenderer } from "@/components/ui/MarkdownRenderer";
import { approveSuggestion, rejectSuggestion } from "./suggestionActions";

type SectionChange = {
  sectionId: number;
  sectionName: string;
  currentContent: string;
  proposedContent: string;
};

type PendingSuggestion = {
  id: number;
  proposerUsername: string | null;
  targetChapterId: number;
  targetChapterName: string;
  citation: string;
  createdAt: Date;
  sectionChanges: SectionChange[];
};

type SuggestionReviewPanelProps = {
  /** Pending suggestions to review, fetched server-side. */
  suggestions: PendingSuggestion[];
  /** Slug of the serial, used for MarkdownRenderer wiki links. */
  serialSlug: string;
};

/**
 * Admin review panel listing pending suggestions for a wiki page.
 * Shows a before/after diff per section, citation, and approve/reject controls.
 * Reject opens an optional review note textarea before confirming.
 *
 * @example
 * <SuggestionReviewPanel suggestions={pendingSuggestions} serialSlug="one-piece" />
 */
export function SuggestionReviewPanel(props: SuggestionReviewPanelProps) {
  const { suggestions, serialSlug } = props;

  if (suggestions.length === 0) {
    return (
      <Box col className="gap-2 rounded-lg border border-border bg-muted/20 p-4">
        <Text variant="h3">Pending suggestions</Text>
        <Text muted className="text-sm">
          No pending suggestions for this page.
        </Text>
      </Box>
    );
  }

  return (
    <Box col className="gap-4">
      <Text variant="h3">Pending suggestions ({suggestions.length})</Text>
      {suggestions.map((suggestion) => (
        <SuggestionCard
          key={suggestion.id}
          suggestion={suggestion}
          serialSlug={serialSlug}
        />
      ))}
    </Box>
  );
}

type SuggestionCardProps = {
  suggestion: PendingSuggestion;
  serialSlug: string;
};

function SuggestionCard(props: SuggestionCardProps) {
  const { suggestion, serialSlug } = props;
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
      const result = await approveSuggestion(suggestion.id, reviewNote || undefined);
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
      const result = await rejectSuggestion(suggestion.id, reviewNote || undefined);
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
            Suggested by {suggestion.proposerUsername ?? "unknown user"}
          </Text>
          <Text muted className="text-sm">
            Submitted {submittedAt} · Target {suggestion.targetChapterName}
          </Text>
        </Box>
      </Box>

      {/* Citation */}
      <Box col className="gap-1">
        <Text className="text-sm font-medium text-muted-foreground">Citation</Text>
        <Text className="text-sm italic">{suggestion.citation}</Text>
      </Box>

      {/* Section diffs */}
      {suggestion.sectionChanges.map((change) => (
        <Box col key={change.sectionId} className="gap-2">
          <Text variant="h4">{change.sectionName}</Text>
          <Box className="gap-3 items-start flex-col sm:flex-row">
            {/* Current */}
            <Box col className="flex-1 gap-1 min-w-0">
              <Text muted className="text-xs font-medium uppercase tracking-wide">
                Current
              </Text>
              <Box className="rounded-md border border-border bg-muted/30 p-3 text-sm min-h-[60px] overflow-auto">
                {change.currentContent ? (
                  <MarkdownRenderer serialSlug={serialSlug} sm>
                    {change.currentContent}
                  </MarkdownRenderer>
                ) : (
                  <Text muted className="text-sm">
                    (empty)
                  </Text>
                )}
              </Box>
            </Box>
            {/* Proposed */}
            <Box col className="flex-1 gap-1 min-w-0">
              <Text
                className="text-xs font-medium uppercase tracking-wide"
                style={{ color: "var(--color-primary)" }}
              >
                Proposed
              </Text>
              <Box className="rounded-md border border-primary/40 bg-primary/5 p-3 text-sm min-h-[60px] overflow-auto">
                <MarkdownRenderer serialSlug={serialSlug} sm>
                  {change.proposedContent}
                </MarkdownRenderer>
              </Box>
            </Box>
          </Box>
        </Box>
      ))}

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
      <Box className="gap-2 flex-wrap">
        <Button
          onClick={handleApprove}
          disabled={isPending}
        >
          Approve
        </Button>
        {!showRejectForm ? (
          <Button
            variant="outline"
            onClick={() => setShowRejectForm(true)}
            disabled={isPending}
          >
            Reject
          </Button>
        ) : (
          <>
            <Button
              variant="destructive"
              onClick={handleReject}
              disabled={isPending}
            >
              {isPending ? "Rejecting…" : "Confirm rejection"}
            </Button>
            <Button
              variant="ghost"
              onClick={() => { setShowRejectForm(false); setReviewNote(""); }}
              disabled={isPending}
            >
              Cancel
            </Button>
          </>
        )}
      </Box>
    </Box>
  );
}
