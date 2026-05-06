"use client";

import Image from "next/image";
import { useCallback, useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Text } from "@/components/ui/text";
import { MarkdownRenderer } from "@/components/ui/markdown-renderer";
import { Box } from "@/components/ui/box";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { savePageContent, getPageContentAtChapter } from "./actions";
import { useEditMode } from "@/contexts/EditModeContext";
import { MDEditor } from "@/components/MDEditor";

interface SectionData {
  id: number;
  name: string;
  content: string;
}

interface FloaterRowData {
  id: number;
  label: string;
  content: string;
}

interface ChapterData {
  id: number;
  displayName: string;
  idx: number;
  volumeName: string;
}

interface Props {
  serialSlug: string;
  schemaName: string;
  pageName: string;
  sections: SectionData[];
  /** null when the schema has no floater */
  floaterImageUrl: string | null | undefined;
  floaterRows: FloaterRowData[];
  /** All chapters for this serial, used to populate the "Writing as of:" selector. */
  allChapters: ChapterData[];
  /** The id of the head chapter (highest idx). Used as the fallback default target for saves. */
  headChapterId: number | null;
  /**
   * The chapter the reader is currently "reading up to" — set by ChapterSelector
   * and stored in a cookie. When present, this is used as the initial default for
   * the "Writing as of:" selector so editors write content that matches what they
   * just read. Falls back to headChapterId when null (no cookie present).
   */
  readingChapterId: number | null;
}

/**
 * Renders the page body in read mode and switches to an inline edit mode where
 * each section gets an MDEditor alongside its current rendered value, and
 * floater fields get plain text inputs.
 * Edit mode is driven by the global `EditModeContext`; the `<EditModeFAB>`
 * triggers save and discard.
 * On save, calls the `savePageContent` Server Action which writes via SCD Type 2.
 *
 * In edit mode, the "Writing as of:" chapter selector defaults to the reader's
 * current chapter (readingChapterId) so the editor writes content that aligns
 * with where they are in the story. Changing the selection reloads draft content
 * via `getPageContentAtChapter` so the editor always sees what readers at that
 * chapter currently see.
 *
 * Each section is shown in a two-column layout: the left column shows the
 * current saved value (read-only reference) and the right column contains the
 * MDEditor for the draft being written.
 *
 * @example
 * <PageEditor
 *   serialSlug="one-piece"
 *   schemaName="Characters"
 *   pageName="Luffy"
 *   sections={[{ id: 1, name: 'Overview', content: '...' }]}
 *   floaterImageUrl="https://..."
 *   floaterRows={[{ id: 2, label: 'Age', content: '19' }]}
 *   allChapters={[{ id: 5, displayName: '1', idx: 1, volumeName: 'Volume 1' }]}
 *   headChapterId={5}
 *   readingChapterId={3}
 * />
 */
export function PageEditor({
  serialSlug,
  schemaName,
  pageName,
  sections,
  floaterImageUrl,
  floaterRows,
  allChapters,
  headChapterId,
  readingChapterId,
}: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const { isEditing, registerHandlers } = useEditMode();

  const [draftSectionContent, setDraftSectionContent] = useState<
    Record<number, string>
  >(() => Object.fromEntries(sections.map((s) => [s.id, s.content])));

  // The "current value" shown as a reference beside each editor field. Starts
  // as the reader's chapter content (same as initial draft) and updates whenever
  // the chapter selector changes to reflect what readers at that chapter see.
  const [currentSectionContent, setCurrentSectionContent] = useState<
    Record<number, string>
  >(() => Object.fromEntries(sections.map((s) => [s.id, s.content])));

  const [draftFloaterImageUrl, setDraftFloaterImageUrl] = useState<string>(
    floaterImageUrl ?? "",
  );
  const [draftFloaterRowContent, setDraftFloaterRowContent] = useState<
    Record<number, string>
  >(() => Object.fromEntries(floaterRows.map((r) => [r.id, r.content])));

  // The chapter the editor is currently targeting.
  // Defaults to the reader's current chapter so writing stays in sync with what
  // the reader just read. Falls back to headChapterId when no reading chapter is set.
  const [selectedChapterId, setSelectedChapterId] = useState<number | null>(
    readingChapterId ?? headChapterId,
  );

  const hasFloater = floaterImageUrl !== undefined;

  const handleDiscard = useCallback(() => {
    setDraftSectionContent(
      Object.fromEntries(sections.map((s) => [s.id, s.content])),
    );
    setCurrentSectionContent(
      Object.fromEntries(sections.map((s) => [s.id, s.content])),
    );
    setDraftFloaterImageUrl(floaterImageUrl ?? "");
    setDraftFloaterRowContent(
      Object.fromEntries(floaterRows.map((r) => [r.id, r.content])),
    );
    setSelectedChapterId(readingChapterId ?? headChapterId);
  }, [sections, floaterImageUrl, floaterRows, readingChapterId, headChapterId]);

  const handleSave = useCallback(() => {
    startTransition(async () => {
      await savePageContent(
        serialSlug,
        schemaName,
        pageName,
        draftSectionContent,
        hasFloater ? draftFloaterImageUrl.trim() || null : null,
        hasFloater ? draftFloaterRowContent : {},
        selectedChapterId ?? undefined,
      );
      router.refresh();
    });
  }, [
    serialSlug,
    schemaName,
    pageName,
    draftSectionContent,
    hasFloater,
    draftFloaterImageUrl,
    draftFloaterRowContent,
    selectedChapterId,
    router,
  ]);

  useEffect(() => {
    return registerHandlers({ onSave: handleSave, onDiscard: handleDiscard });
  }, [registerHandlers, handleSave, handleDiscard]);

  /**
   * When the editor picks a different target chapter, fetch the content that
   * readers at that chapter currently see and replace both the reference view
   * and the draft with it so the editor can review and then overwrite it.
   */
  function handleChapterChange(chapterId: number) {
    setSelectedChapterId(chapterId);
    startTransition(async () => {
      const data = await getPageContentAtChapter(
        serialSlug,
        schemaName,
        pageName,
        chapterId,
      );
      const newContent = Object.fromEntries(
        data.sections.map((s) => [s.id, s.content]),
      );
      setCurrentSectionContent(newContent);
      setDraftSectionContent(newContent);
      if (hasFloater) {
        setDraftFloaterImageUrl(data.floaterImageUrl ?? "");
        setDraftFloaterRowContent(
          Object.fromEntries(data.floaterRows.map((r) => [r.id, r.content])),
        );
      }
    });
  }

  // ── Read mode ────────────────────────────────────────────────────────────────
  // Use props directly so content updates when router.refresh() delivers new
  // server-rendered props (e.g. after the user changes their chapter cutoff).
  // Draft state is only needed while editing.
  const hasFloaterContent =
    hasFloater && (floaterImageUrl || floaterRows.length > 0);

  if (!isEditing) {
    return (
      <div className="overflow-hidden">
        {hasFloaterContent && (
          <aside className="float-none w-full mb-4 sm:float-right sm:w-72 sm:ml-4 sm:mb-4 rounded-lg border border-gray-200 bg-gray-50 p-4 flex flex-col gap-3">
            {floaterImageUrl && (
              <Image
                src={floaterImageUrl}
                alt="Floater image"
                width={288}
                height={288}
                unoptimized
                className="w-full rounded object-cover"
              />
            )}

            {floaterRows.length > 0 && (
              <dl className="flex flex-col gap-2 text-sm">
                {floaterRows.map((row) => (
                  <div key={row.id}>
                    <dt className="font-medium text-gray-600">{row.label}</dt>
                    <dd className="text-gray-800 whitespace-pre-wrap">
                      {row.content || <span className="text-gray-400">—</span>}
                    </dd>
                  </div>
                ))}
              </dl>
            )}
          </aside>
        )}

        {sections.map((section) => (
          <div key={section.id} className="mb-6 last:mb-0">
            <Text variant="h2" className="mb-2">{section.name}</Text>
            {section.content ? (
              <MarkdownRenderer>{section.content}</MarkdownRenderer>
            ) : (
              <Text variant="faint">No content for this chapter yet.</Text>
            )}
          </div>
        ))}
      </div>
    );
  }

  // ── Edit mode ────────────────────────────────────────────────────────────────
  // Build Select options: volumes as optgroups, chapters as options inside each.
  const chapterSelectOptions = (() => {
    const volumeMap = new Map<
      string,
      { label: string; value: number; idx: number }[]
    >();
    for (const ch of allChapters) {
      const arr = volumeMap.get(ch.volumeName) ?? [];
      arr.push({ label: ch.displayName, value: ch.id, idx: ch.idx });
      volumeMap.set(ch.volumeName, arr);
    }
    return Array.from(volumeMap.entries()).map(([volumeName, chaps]) => ({
      label: volumeName,
      value: -1 as number, // group node — value unused
      children: chaps.map((c) => ({ label: c.label, value: c.value })),
    }));
  })();

  return (
    <Box col className="gap-6">
      {allChapters.length > 0 && (
        <Box className="items-center gap-3">
          <Label htmlFor="target-chapter" className="shrink-0 text-sm">
            Writing as of:
          </Label>
          <Select<number>
            id="target-chapter"
            options={chapterSelectOptions}
            value={selectedChapterId ?? undefined}
            onChange={handleChapterChange}
            disabled={isPending}
            className="w-52"
          />
        </Box>
      )}

      {sections.map((section) => (
        <Box key={section.id} col className="gap-2">
          <Text variant="h2">{section.name}</Text>
          {/* Two-column layout: current saved value on the left, editor on the right */}
          <div className="grid grid-cols-2 gap-4 items-start">
            {/* Left: current saved value at the selected chapter */}
            <div className="rounded-lg border border-gray-200 bg-gray-50 p-4 h-full">
              <Text
                variant="label"
                className="mb-2 block text-xs text-gray-400 uppercase tracking-wide"
              >
                Current value
              </Text>
              {currentSectionContent[section.id] ? (
                <MarkdownRenderer sm>
                  {currentSectionContent[section.id]}
                </MarkdownRenderer>
              ) : (
                <Text muted className="text-sm">
                  No content at this chapter.
                </Text>
              )}
            </div>
            {/* Right: markdown editor for the new draft */}
            <div data-color-mode="light">
              <MDEditor
                value={draftSectionContent[section.id] ?? ""}
                onChange={(val) =>
                  setDraftSectionContent((prev) => ({
                    ...prev,
                    [section.id]: val ?? "",
                  }))
                }
                height={300}
                preview="edit"
              />
            </div>
          </div>
        </Box>
      ))}

      {hasFloater && (
        <Box
          col
          className="gap-4 rounded-lg border border-gray-200 bg-gray-50 p-4"
        >
          <Text variant="h3">Floater fields</Text>

          <Box col className="gap-1.5">
            <Label htmlFor="floater-image-url">Image URL</Label>
            <Input
              id="floater-image-url"
              value={draftFloaterImageUrl}
              onChange={(e) => setDraftFloaterImageUrl(e.target.value)}
              placeholder="https://…"
              disabled={isPending}
            />
          </Box>

          {floaterRows.map((row) => (
            <Box key={row.id} col className="gap-1.5">
              <Label htmlFor={`floater-row-${row.id}`}>{row.label}</Label>
              <Input
                id={`floater-row-${row.id}`}
                value={draftFloaterRowContent[row.id] ?? ""}
                onChange={(e) =>
                  setDraftFloaterRowContent((prev) => ({
                    ...prev,
                    [row.id]: e.target.value,
                  }))
                }
                disabled={isPending}
              />
            </Box>
          ))}
        </Box>
      )}
    </Box>
  );
}
