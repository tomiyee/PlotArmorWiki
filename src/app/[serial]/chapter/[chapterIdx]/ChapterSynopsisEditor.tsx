"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { MarkdownRenderer } from "@/components/ui/MarkdownRenderer";
import { Box } from "@/components/ui/Box";
import { Text } from "@/components/ui/Text";
import { useEditMode } from "@/contexts/EditModeContext";
import { WikiLinkMDEditor } from "@/components/WikiLinkMDEditor";

type ChapterSynopsisEditorProps = {
  /** URL slug of the serial, used for markdown preview links. */
  serialSlug: string;
  /** Global ordering index of the chapter being edited. */
  chapterIdx: number;
  /** Saved synopsis content loaded from the server. */
  initialContent: string;
  /** Wiki pages visible at the reader's cutoff, used for `[[` autocomplete. */
  wikiPages: { name: string; slug: string }[];
  /** Server action that persists the synopsis. */
  saveAction: (
    serialSlug: string,
    chapterIdx: number,
    content: string,
  ) => Promise<void>;
};

/**
 * Inline markdown editor for a chapter's synopsis. In read mode renders the
 * synopsis as styled markdown (or a placeholder when empty). In edit mode
 * (driven by the global `EditModeContext` / bottom-right FAB) shows a
 * `WikiLinkMDEditor` with `[[Page]]` autocomplete.
 *
 * Save and discard are handled by the global FAB via registered handlers,
 * keeping this component consistent with the rest of the edit-mode pattern.
 *
 * @example
 * <ChapterSynopsisEditor
 *   serialSlug="one-piece"
 *   chapterIdx={42}
 *   initialContent=""
 *   wikiPages={wikiPages}
 *   saveAction={saveChapterSynopsis}
 * />
 */
export function ChapterSynopsisEditor(props: ChapterSynopsisEditorProps) {
  const { serialSlug, chapterIdx, initialContent, wikiPages, saveAction } =
    props;
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const { isEditing, registerHandlers } = useEditMode();

  const [committed, setCommitted] = useState(initialContent);
  const [draft, setDraft] = useState(initialContent);

  const handleSave = useCallback(() => {
    startTransition(async () => {
      await saveAction(serialSlug, chapterIdx, draft);
      setCommitted(draft);
      router.refresh();
    });
  }, [saveAction, serialSlug, chapterIdx, draft, router]);

  const handleDiscard = useCallback(() => {
    setDraft(committed);
  }, [committed]);

  useEffect(() => {
    return registerHandlers({ onSave: handleSave, onDiscard: handleDiscard });
  }, [registerHandlers, handleSave, handleDiscard]);

  if (isEditing) {
    return (
      <Box col className="gap-3">
        <WikiLinkMDEditor
          value={draft}
          onChange={(val) => setDraft(val ?? "")}
          height={300}
          preview="edit"
          wikiPages={wikiPages}
          serialSlug={serialSlug}
        />
        {isPending && (
          <Text muted className="text-sm">
            Saving…
          </Text>
        )}
      </Box>
    );
  }

  return (
    <Box col className="gap-2">
      {committed ? (
        <MarkdownRenderer serialSlug={serialSlug}>{committed}</MarkdownRenderer>
      ) : (
        <Text muted>No synopsis written yet.</Text>
      )}
    </Box>
  );
}
