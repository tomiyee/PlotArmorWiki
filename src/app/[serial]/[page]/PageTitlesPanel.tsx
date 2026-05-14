"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Text } from "@/components/ui/text";
import { Box } from "@/components/ui/box";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { InfoIcon } from "@/components/ui/info-icon";
import { addPageTitle, deletePageTitle } from "./actions";
import type { PageTitleEntry, ChapterGroupOption } from "./types";

interface Props {
  serialSlug: string;
  pageSlug: string;
  pageTitleEntries: PageTitleEntry[];
  chapterSelectOptions: ChapterGroupOption[];
  /** Whether the parent editor is pending a transition (disables inputs). */
  isPending: boolean;
}

/**
 * Edit-mode panel for managing chapter-versioned page title revisions.
 * Maintains its own add/delete state independently from the parent editor.
 *
 * @example
 * <PageTitlesPanel
 *   serialSlug="one-piece"
 *   pageSlug="luffy"
 *   pageTitleEntries={[{ chapterId: 1, chapterLabel: "Chapter 1", title: "Luffy" }]}
 *   chapterSelectOptions={[]}
 *   isPending={false}
 * />
 */
export function PageTitlesPanel({
  serialSlug,
  pageSlug,
  pageTitleEntries,
  chapterSelectOptions,
  isPending: externalIsPending,
}: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [newTitleChapterId, setNewTitleChapterId] = useState<number>(-1);
  const [newTitleText, setNewTitleText] = useState<string>("");

  const disabled = isPending || externalIsPending;

  function handleAddTitle() {
    if (newTitleChapterId === -1 || !newTitleText.trim()) return;
    startTransition(async () => {
      await addPageTitle(serialSlug, pageSlug, newTitleChapterId, newTitleText.trim());
      setNewTitleText("");
      setNewTitleChapterId(-1);
      router.refresh();
    });
  }

  function handleDeleteTitle(chapterId: number) {
    startTransition(async () => {
      const result = await deletePageTitle(serialSlug, pageSlug, chapterId);
      if (result.error) {
        alert(result.error);
        return;
      }
      router.refresh();
    });
  }

  return (
    <Box col className="gap-3 rounded-lg border border-gray-200 bg-gray-50 p-4">
      <Box className="items-center gap-2">
        <Text variant="h3">Titles</Text>
        <InfoIcon contents="A page's display name can change over the story. Each revision is shown to readers whose chapter cutoff is at or after the listed chapter." />
      </Box>

      {pageTitleEntries.length > 0 ? (
        <ul className="flex flex-col gap-2">
          {pageTitleEntries.map((entry) => (
            <li
              key={entry.chapterId}
              className="flex items-center justify-between gap-3 rounded border border-gray-200 bg-white px-3 py-2"
            >
              <div className="flex flex-col min-w-0">
                <Text
                  variant="label"
                  className="text-xs text-gray-400 uppercase tracking-wide"
                >
                  {entry.chapterLabel}
                </Text>
                <Text variant="body" as="span" className="font-medium truncate">
                  {entry.title}
                </Text>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => handleDeleteTitle(entry.chapterId)}
                disabled={disabled || pageTitleEntries.length <= 1}
                className="shrink-0 text-red-500 hover:text-red-700 hover:bg-red-50"
              >
                Delete
              </Button>
            </li>
          ))}
        </ul>
      ) : (
        <Text muted className="text-sm">
          No title revisions yet. Add one below.
        </Text>
      )}

      {chapterSelectOptions.length > 0 && (
        <Box className="items-end gap-2 flex-wrap">
          <Box col className="gap-1 flex-1 min-w-40">
            <Label htmlFor="new-title-chapter" className="text-xs">
              Chapter
            </Label>
            <Select<number>
              id="new-title-chapter"
              options={[
                { label: "Select a chapter…", value: -1, disabled: true },
                ...chapterSelectOptions,
              ]}
              value={newTitleChapterId}
              onChange={(id) => {
                if (id !== -1) setNewTitleChapterId(id);
              }}
              disabled={disabled}
              className="w-full"
            />
          </Box>
          <Box col className="gap-1 flex-[2] min-w-48">
            <Label htmlFor="new-title-text" className="text-xs">
              Title
            </Label>
            <Input
              id="new-title-text"
              value={newTitleText}
              onChange={(e) => setNewTitleText(e.target.value)}
              placeholder="Enter title…"
              disabled={disabled}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  handleAddTitle();
                }
              }}
            />
          </Box>
          <Button
            onClick={handleAddTitle}
            disabled={disabled || newTitleChapterId === -1 || !newTitleText.trim()}
            size="sm"
          >
            Add title
          </Button>
        </Box>
      )}
    </Box>
  );
}
