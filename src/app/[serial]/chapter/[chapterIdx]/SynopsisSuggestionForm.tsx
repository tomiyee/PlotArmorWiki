"use client";

import { useState, useTransition, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Box } from "@/components/ui/Box";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Label } from "@/components/ui/Label";
import { Text } from "@/components/ui/Text";
import { Textarea } from "@/components/ui/Textarea";
import { submitSynopsisSuggestion } from "./synopsisSuggestionActions";

type SynopsisSuggestionFormProps = {
  /** DB id of the chapter being suggested. */
  chapterId: number;
  /** Current synopsis content, used to pre-fill the draft. */
  currentContent: string;
  /** Called when the user cancels or successfully submits. */
  onClose: () => void;
};

/**
 * Inline form for authenticated non-admins to propose a synopsis edit for a chapter.
 * Pre-fills the draft with the current synopsis so the user can edit from there.
 *
 * @example
 * <SynopsisSuggestionForm
 *   chapterId={7}
 *   currentContent="Luffy arrives at..."
 *   onClose={() => setShowForm(false)}
 * />
 */
export function SynopsisSuggestionForm(props: SynopsisSuggestionFormProps) {
  const { chapterId, currentContent, onClose } = props;

  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [draft, setDraft] = useState(currentContent);
  const [citation, setCitation] = useState("");
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);

  const isDirty = draft !== currentContent || citation.trim().length > 0;

  const handleSubmit = useCallback(() => {
    if (!citation.trim()) {
      setSubmitError("Citation is required.");
      return;
    }
    if (!draft.trim()) {
      setSubmitError("Synopsis cannot be empty.");
      return;
    }
    if (draft === currentContent) {
      setSubmitError("Make at least one change before submitting.");
      return;
    }
    setSubmitError(null);
    startTransition(async () => {
      const result = await submitSynopsisSuggestion(chapterId, citation, draft);
      if (result.error) {
        setSubmitError(result.error);
      } else {
        setSubmitted(true);
        router.refresh();
      }
    });
  }, [chapterId, citation, draft, currentContent, router]);

  if (submitted) {
    return (
      <Box col className="gap-4 rounded-lg border border-border bg-muted/30 p-6">
        <Text variant="h3">Suggestion submitted</Text>
        <Text variant="body">
          Your synopsis suggestion has been submitted for admin review.
        </Text>
        <Button variant="outline" onClick={onClose}>
          Back
        </Button>
      </Box>
    );
  }

  return (
    <Box col className="gap-6 rounded-lg border border-border bg-muted/30 p-6">
      <Box className="items-center justify-between">
        <Text variant="h3">Suggest a synopsis edit</Text>
        <Button variant="ghost" onClick={onClose} disabled={isPending}>
          Cancel
        </Button>
      </Box>

      <Box col className="gap-2">
        <Label htmlFor="synopsis-draft">Proposed synopsis</Label>
        <Textarea
          id="synopsis-draft"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          rows={8}
          disabled={isPending}
          placeholder="Write the chapter synopsis here…"
        />
      </Box>

      <Box col className="gap-2">
        <Label htmlFor="synopsis-citation">Citation (required)</Label>
        <Input
          id="synopsis-citation"
          placeholder="e.g. Chapter 12, page 4 — 'Luffy said…'"
          value={citation}
          onChange={(e) => setCitation(e.target.value)}
          disabled={isPending}
        />
        <Text className="text-sm text-muted-foreground">
          Provide a quote, page number, or timestamp supporting your changes.
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
