"use client";

import { useState, useTransition } from "react";
import ReactMarkdown from "react-markdown";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faPen } from "@fortawesome/free-solid-svg-icons";
import { Button } from "@/components/ui/button";
import { Box } from "@/components/ui/box";
import { Text } from "@/components/ui/text";

interface Props {
  serialSlug: string;
  chapterIdx: number;
  initialContent: string;
  saveAction: (serialSlug: string, chapterIdx: number, content: string) => Promise<void>;
}

/**
 * Inline markdown editor for a chapter's synopsis. Toggles between a rendered
 * read-only view and a textarea edit form. Shows a placeholder message when no
 * synopsis has been written yet.
 *
 * @example
 * <ChapterSynopsisEditor
 *   serialSlug="one-piece"
 *   chapterIdx={42}
 *   initialContent=""
 *   saveAction={saveChapterSynopsis}
 * />
 */
export function ChapterSynopsisEditor({
  serialSlug,
  chapterIdx,
  initialContent,
  saveAction,
}: Props) {
  const [isPending, startTransition] = useTransition();
  const [isEditing, setIsEditing] = useState(false);
  const [committed, setCommitted] = useState(initialContent);
  const [draft, setDraft] = useState(initialContent);

  function handleSave() {
    startTransition(async () => {
      await saveAction(serialSlug, chapterIdx, draft);
      setCommitted(draft);
      setIsEditing(false);
    });
  }

  function handleCancel() {
    setDraft(committed);
    setIsEditing(false);
  }

  if (isEditing) {
    return (
      <Box col className="gap-3">
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          disabled={isPending}
          rows={8}
          placeholder="Write a synopsis for this chapter…"
          className="w-full resize-y rounded-lg border border-input bg-transparent px-3 py-2 font-mono text-sm shadow-xs outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50"
        />
        <Box className="gap-2">
          <Button onClick={handleSave} disabled={isPending}>
            Save
          </Button>
          <Button variant="outline" onClick={handleCancel} disabled={isPending}>
            Cancel
          </Button>
        </Box>
      </Box>
    );
  }

  return (
    <Box className="items-start gap-2">
      <Box col flex={1} className="gap-2">
        {committed ? (
          <div className="prose prose-gray max-w-none text-gray-700">
            <ReactMarkdown>{committed}</ReactMarkdown>
          </div>
        ) : (
          <Text muted>No synopsis written yet.</Text>
        )}
      </Box>
      <Button
        variant="ghost"
        size="icon"
        onClick={() => setIsEditing(true)}
        title="Edit synopsis"
      >
        <FontAwesomeIcon icon={faPen} />
      </Button>
    </Box>
  );
}
