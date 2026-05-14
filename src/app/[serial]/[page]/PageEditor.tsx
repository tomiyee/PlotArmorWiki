"use client";

import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Text } from "@/components/ui/text";
import { MarkdownRenderer } from "@/components/ui/markdown-renderer";
import { Box } from "@/components/ui/box";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { savePageContent, getPageContentAtChapter, addPageTitle, deletePageTitle } from "./actions";
import { useEditMode } from "@/contexts/EditModeContext";
import { WikiLinkMDEditor } from "@/components/WikiLinkMDEditor";
import { InfoIcon } from "@/components/ui/info-icon";
import { Button } from "@/components/ui/button";

interface SectionData {
  id: number;
  name: string;
  content: string;
  /** The chapters.idx of the revision currently active at the reader's cutoff, or null if no content yet. */
  lastUpdatedChapterIdx: number | null;
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

interface PageTitleEntry {
  chapterId: number;
  /** Human-readable label, e.g. "Volume 1 — Chapter 3". */
  chapterLabel: string;
  title: string;
}

interface Props {
  serialSlug: string;
  pageName: string;
  pageSlug: string;
  /**
   * All page_titles rows for this page, ordered by chapter idx ascending.
   * Used to render the Titles panel in edit mode.
   */
  pageTitleEntries: PageTitleEntry[];
  /**
   * Chapter-versioned summary content shown at the top of the page with no
   * section header in read mode. Always present; empty string means no content yet.
   */
  summaryContent: string;
  /** The chapters.idx of the active summary revision at the reader's cutoff, or null if no content yet. */
  summaryLastUpdatedChapterIdx: number | null;
  sections: SectionData[];
  /** null when the page has no infobox */
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
  /** Wiki pages visible to the reader at their chapter cutoff, used to power
   * the `[[Page]]` autocomplete in edit mode. */
  wikiPages: { name: string }[];
  /** The idx of the chapter this page was introduced in. Chapters before this are disabled in the "Writing as of:" selector. */
  introChapterIdx: number | null;
  /**
   * Child pages that are actively related to this page at the reader's chapter
   * cutoff (derived from `page_relationships`). Rendered as a sub-page list
   * below the content in read mode.
   */
  childPages: { id: number; name: string; slug: string; title: string }[];
  /** The DB id of this page, forwarded to the new-page form as the default parent. */
  pageId: number;
}

/**
 * Returns a short human-readable label describing when the currently shown
 * "current value" was last updated relative to the selected target chapter.
 * - `null` when there is no content (nothing to annotate).
 * - `"This Chapter"` when the last update is at exactly the selected chapter.
 * - `"Last Updated N Chapter(s) Ago"` when the last update is before the selected chapter.
 */
function lastUpdatedLabel(
  lastUpdatedIdx: number | null,
  selectedChapterIdx: number | null,
): string | null {
  if (lastUpdatedIdx === null) return null;
  if (selectedChapterIdx === null) return null;
  const delta = selectedChapterIdx - lastUpdatedIdx;
  if (delta === 0) return "This Chapter";
  if (delta === 1) return "Last Updated 1 Chapter Ago";
  return `Last Updated ${delta} Chapters Ago`;
}

function LastUpdatedTag({
  lastUpdatedIdx,
  selectedChapterIdx,
}: {
  lastUpdatedIdx: number | null;
  selectedChapterIdx: number | null;
}) {
  const label = lastUpdatedLabel(lastUpdatedIdx, selectedChapterIdx);
  if (!label) return null;
  const isCurrent = lastUpdatedIdx === selectedChapterIdx;
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
        isCurrent
          ? "bg-blue-100 text-blue-700"
          : "bg-gray-100 text-gray-500"
      }`}
    >
      {label}
    </span>
  );
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
 * The "Titles" panel in edit mode lists all `page_titles` revisions and lets
 * editors add new title revisions at any chapter or delete existing ones.
 * The title shown in read mode is resolved by the parent Server Component using
 * the max-idx pattern and displayed as `<Text variant="h1">` above this component.
 *
 * Each section is shown in a two-column layout: the left column shows the
 * current saved value (read-only reference) and the right column contains the
 * MDEditor for the draft being written.
 *
 * @example
 * <PageEditor
 *   serialSlug="one-piece"
 *   pageName="Luffy"
 *   pageSlug="luffy"
 *   summaryContent="Monkey D. Luffy is the captain of the Straw Hat Pirates."
 *   summaryLastUpdatedChapterIdx={1}
 *   sections={[{ id: 1, name: 'Overview', content: '...', lastUpdatedChapterIdx: 1 }]}
 *   floaterImageUrl="https://..."
 *   floaterRows={[{ id: 2, label: 'Age', content: '19' }]}
 *   allChapters={[{ id: 5, displayName: '1', idx: 1, volumeName: 'Volume 1' }]}
 *   headChapterId={5}
 *   readingChapterId={3}
 *   wikiPages={[{ name: 'Luffy' }]}
 * />
 */
export function PageEditor({
  serialSlug,
  pageName: _pageName,
  pageSlug,
  pageTitleEntries,
  summaryContent,
  summaryLastUpdatedChapterIdx,
  sections,
  floaterImageUrl,
  floaterRows,
  allChapters,
  headChapterId,
  readingChapterId,
  wikiPages,
  introChapterIdx,
  childPages,
  pageId,
}: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const { isEditing, registerHandlers } = useEditMode();

  // ── Titles panel state ────────────────────────────────────────────────────
  // -1 is used as the sentinel "no chapter selected" value for the Select placeholder.
  const [newTitleChapterId, setNewTitleChapterId] = useState<number>(-1);
  const [newTitleText, setNewTitleText] = useState<string>("");

  const [draftSummaryContent, setDraftSummaryContent] = useState<string>(summaryContent);
  // Reference view for summary in edit mode — same as draft initially; updates on chapter change.
  const [currentSummaryContent, setCurrentSummaryContent] = useState<string>(summaryContent);
  // The chapters.idx of the revision currently shown in the summary "Current value" panel.
  const [currentSummaryLastUpdatedIdx, setCurrentSummaryLastUpdatedIdx] = useState<number | null>(
    summaryLastUpdatedChapterIdx,
  );

  const [draftSectionContent, setDraftSectionContent] = useState<
    Record<number, string>
  >(() => Object.fromEntries(sections.map((s) => [s.id, s.content])));

  // The "current value" shown as a reference beside each editor field. Starts
  // as the reader's chapter content (same as initial draft) and updates whenever
  // the chapter selector changes to reflect what readers at that chapter see.
  const [currentSectionContent, setCurrentSectionContent] = useState<
    Record<number, string>
  >(() => Object.fromEntries(sections.map((s) => [s.id, s.content])));
  // The chapters.idx of the revision currently shown for each section in the "Current value" panel.
  const [currentSectionLastUpdatedIdx, setCurrentSectionLastUpdatedIdx] = useState<
    Record<number, number | null>
  >(() => Object.fromEntries(sections.map((s) => [s.id, s.lastUpdatedChapterIdx])));

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
    setDraftSummaryContent(summaryContent);
    setCurrentSummaryContent(summaryContent);
    setCurrentSummaryLastUpdatedIdx(summaryLastUpdatedChapterIdx);
    setDraftSectionContent(
      Object.fromEntries(sections.map((s) => [s.id, s.content])),
    );
    setCurrentSectionContent(
      Object.fromEntries(sections.map((s) => [s.id, s.content])),
    );
    setCurrentSectionLastUpdatedIdx(
      Object.fromEntries(sections.map((s) => [s.id, s.lastUpdatedChapterIdx])),
    );
    setDraftFloaterImageUrl(floaterImageUrl ?? "");
    setDraftFloaterRowContent(
      Object.fromEntries(floaterRows.map((r) => [r.id, r.content])),
    );
    setSelectedChapterId(readingChapterId ?? headChapterId);
  }, [summaryContent, summaryLastUpdatedChapterIdx, sections, floaterImageUrl, floaterRows, readingChapterId, headChapterId]);

  const handleSave = useCallback(() => {
    startTransition(async () => {
      await savePageContent(
        serialSlug,
        pageSlug,
        draftSummaryContent,
        draftSectionContent,
        hasFloater ? draftFloaterImageUrl.trim() || null : null,
        hasFloater ? draftFloaterRowContent : {},
        selectedChapterId ?? undefined,
      );
      router.refresh();
    });
  }, [
    serialSlug,
    pageSlug,
    draftSummaryContent,
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
        pageSlug,
        chapterId,
      );
      setCurrentSummaryContent(data.summaryContent);
      setDraftSummaryContent(data.summaryContent);
      setCurrentSummaryLastUpdatedIdx(data.summaryLastUpdatedChapterIdx);
      const newContent = Object.fromEntries(
        data.sections.map((s) => [s.id, s.content]),
      );
      setCurrentSectionContent(newContent);
      setDraftSectionContent(newContent);
      setCurrentSectionLastUpdatedIdx(
        Object.fromEntries(data.sections.map((s) => [s.id, s.lastUpdatedChapterIdx])),
      );
      if (hasFloater) {
        setDraftFloaterImageUrl(data.floaterImageUrl ?? "");
        setDraftFloaterRowContent(
          Object.fromEntries(data.floaterRows.map((r) => [r.id, r.content])),
        );
      }
    });
  }

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

        {/* Summary — shown at the top with no header */}
        {summaryContent && (
          <div className="mb-6">
            <MarkdownRenderer serialSlug={serialSlug}>{summaryContent}</MarkdownRenderer>
          </div>
        )}

        {sections.map((section) => (
          <div key={section.id} className="mb-6 last:mb-0">
            <Text variant="h2" className="mb-2">
              {section.name}
            </Text>
            {section.content ? (
              <MarkdownRenderer serialSlug={serialSlug}>{section.content}</MarkdownRenderer>
            ) : (
              <Text muted>No content for this chapter yet.</Text>
            )}
          </div>
        ))}

        <div className="mt-6 pt-6 border-t border-gray-200">
          <Text variant="h3" className="mb-3">
            Child pages
          </Text>
          {childPages.length > 0 ? (
            <ul className="flex flex-col gap-2">
              {childPages.map((child) => (
                <li key={child.id}>
                  <Link
                    href={`/${serialSlug}/${child.slug}`}
                    className="rounded-lg border border-gray-200 px-4 py-2 flex items-center hover:bg-gray-50 transition-colors"
                  >
                    <Text variant="body" as="span">
                      {child.title}
                    </Text>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <Text muted className="text-sm">No child pages yet.</Text>
          )}
          <Link
            href={`/${serialSlug}/new?parentPageId=${pageId}`}
            className="mt-3 text-sm text-blue-600 hover:underline inline-block"
          >
            + New page
          </Link>
        </div>
      </div>
    );
  }

  // ── Edit mode ────────────────────────────────────────────────────────────────
  // The chapters.idx for the currently selected target chapter (for label computation).
  const selectedChapterIdx = allChapters.find((c) => c.id === selectedChapterId)?.idx ?? null;

  // Build Select options: volumes as optgroups, chapters as options inside each.
  // Chapters before the page's intro chapter are disabled — content can't predate the page.
  // Chapters beyond the reader's cutoff are also disabled — editors can't write spoilers.
  const readingCutoffIdx = allChapters.find((c) => c.id === readingChapterId)?.idx ?? null;
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
      children: chaps.map((c) => ({
        label: c.label,
        value: c.value,
        disabled:
          (introChapterIdx !== null && c.idx < introChapterIdx) ||
          (readingCutoffIdx !== null && c.idx > readingCutoffIdx),
      })),
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

      {/* Titles panel — list all page_titles rows + add-new form */}
      <Box col className="gap-3 rounded-lg border border-gray-200 bg-gray-50 p-4">
        <Box className="items-center gap-2">
          <Text variant="h3">Titles</Text>
          <InfoIcon contents="A page's display name can change over the story. Each revision is shown to readers whose chapter cutoff is at or after the listed chapter." />
        </Box>

        {pageTitleEntries.length > 0 ? (
          <ul className="flex flex-col gap-2">
            {pageTitleEntries.map((entry) => (
              <li key={entry.chapterId} className="flex items-center justify-between gap-3 rounded border border-gray-200 bg-white px-3 py-2">
                <div className="flex flex-col min-w-0">
                  <Text variant="label" className="text-xs text-gray-400 uppercase tracking-wide">{entry.chapterLabel}</Text>
                  <Text variant="body" as="span" className="font-medium truncate">{entry.title}</Text>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleDeleteTitle(entry.chapterId)}
                  disabled={isPending || pageTitleEntries.length <= 1}
                  className="shrink-0 text-red-500 hover:text-red-700 hover:bg-red-50"
                >
                  Delete
                </Button>
              </li>
            ))}
          </ul>
        ) : (
          <Text muted className="text-sm">No title revisions yet. Add one below.</Text>
        )}

        {/* Add new title revision form */}
        {allChapters.length > 0 && (
          <Box className="items-end gap-2 flex-wrap">
            <Box col className="gap-1 flex-1 min-w-40">
              <Label htmlFor="new-title-chapter" className="text-xs">Chapter</Label>
              <Select<number>
                id="new-title-chapter"
                options={[
                  { label: "Select a chapter…", value: -1, disabled: true },
                  ...chapterSelectOptions,
                ]}
                value={newTitleChapterId}
                onChange={(id) => { if (id !== -1) setNewTitleChapterId(id); }}
                disabled={isPending}
                className="w-full"
              />
            </Box>
            <Box col className="gap-1 flex-[2] min-w-48">
              <Label htmlFor="new-title-text" className="text-xs">Title</Label>
              <Input
                id="new-title-text"
                value={newTitleText}
                onChange={(e) => setNewTitleText(e.target.value)}
                placeholder="Enter title…"
                disabled={isPending}
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); handleAddTitle(); } }}
              />
            </Box>
            <Button
              onClick={handleAddTitle}
              disabled={isPending || newTitleChapterId === -1 || !newTitleText.trim()}
              size="sm"
            >
              Add title
            </Button>
          </Box>
        )}
      </Box>

      {/* Summary — always first; labeled in edit mode but has no header in read mode */}
      <Box col className="gap-2">
        <Box className="items-center gap-2">
          <Text variant="h2">Summary</Text>
          <InfoIcon contents="Shown at the top of the page with no heading." />
        </Box>
        <div className="grid grid-cols-2 gap-4 items-start">
          <div className="rounded-lg border border-gray-200 bg-gray-50 p-4 h-full">
            <div className="mb-2 flex items-center gap-2">
              <Text
                variant="label"
                className="block text-xs text-gray-400 uppercase tracking-wide"
              >
                Current value
              </Text>
              <LastUpdatedTag lastUpdatedIdx={currentSummaryLastUpdatedIdx} selectedChapterIdx={selectedChapterIdx} />
            </div>
            {currentSummaryContent ? (
              <MarkdownRenderer serialSlug={serialSlug}>
                {currentSummaryContent}
              </MarkdownRenderer>
            ) : (
              <Text muted className="text-sm">
                No content at this chapter.
              </Text>
            )}
          </div>
          <WikiLinkMDEditor
            value={draftSummaryContent}
            onChange={(val) => setDraftSummaryContent(val ?? "")}
            height={300}
            preview="edit"
            wikiPages={wikiPages}
            serialSlug={serialSlug}
          />
        </div>
      </Box>

      {sections.map((section) => (
        <Box key={section.id} col className="gap-2">
          <Text variant="h2">{section.name}</Text>
          {/* Two-column layout: current saved value on the left, editor on the right */}
          <div className="grid grid-cols-2 gap-4 items-start">
            {/* Left: current saved value at the selected chapter */}
            <div className="rounded-lg border border-gray-200 bg-gray-50 p-4 h-full">
              <div className="mb-2 flex items-center gap-2">
                <Text
                  variant="label"
                  className="block text-xs text-gray-400 uppercase tracking-wide"
                >
                  Current value
                </Text>
                <LastUpdatedTag lastUpdatedIdx={currentSectionLastUpdatedIdx[section.id] ?? null} selectedChapterIdx={selectedChapterIdx} />
              </div>
              {currentSectionContent[section.id] ? (
                <MarkdownRenderer serialSlug={serialSlug}>
                  {currentSectionContent[section.id]}
                </MarkdownRenderer>
              ) : (
                <Text muted className="text-sm">
                  No content at this chapter.
                </Text>
              )}
            </div>
            {/* Right: markdown editor for the new draft */}
            <WikiLinkMDEditor
              value={draftSectionContent[section.id] ?? ""}
              onChange={(val) =>
                setDraftSectionContent((prev) => ({
                  ...prev,
                  [section.id]: val ?? "",
                }))
              }
              height={300}
              preview="edit"
              wikiPages={wikiPages}
              serialSlug={serialSlug}
            />
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
