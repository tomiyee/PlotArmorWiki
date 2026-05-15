"use client";

import {
  useCallback,
  useEffect,
  useState,
  useTransition,
  type ReactNode,
} from "react";
import { useRouter } from "next/navigation";
import { Box } from "@/components/ui/box";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import {
  savePageContent,
  getPageContentAtChapter,
  getParentPagesAtChapter,
} from "./actions";
import { useEditMode } from "@/contexts/EditModeContext";
import { PageSectionManager, type PageSection } from "./PageSectionManager";
import { type InfoboxSection } from "./PageInfoboxManager";
import { PageReadView } from "./PageReadView";
import { PageTitlesPanel } from "./PageTitlesPanel";
import { SectionContentEditor } from "./SectionContentEditor";
import { PageInfoboxPanel } from "./PageInfoboxPanel";
import {
  PageRelationshipsPanel,
  type ParentPageEntry,
} from "./PageRelationshipsPanel";
import type {
  SectionData,
  FloaterRowData,
  ChapterData,
  PageTitleEntry,
  ChapterGroupOption,
} from "./types";

interface Props {
  serialSlug: string;
  pageSlug: string;
  /** The DB id of this page, forwarded to the new-page form as the default parent. */
  pageId: number;
  /**
   * All page_titles rows for this page, ordered by chapter idx ascending.
   * Used to render the Titles panel in edit mode.
   */
  pageTitleEntries: PageTitleEntry[];
  /**
   * Wall-clock-versioned section structure for this page, used to power the
   * Sections management panel in edit mode. Separate from `sections` (which
   * carries chapter-versioned content).
   */
  pageSectionStructure: PageSection[];
  sections: SectionData[];
  /**
   * Wall-clock-versioned infobox row structure for this page, used to power
   * the Infobox management panel in edit mode.
   */
  infoboxSectionStructure: InfoboxSection[];
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
  /**
   * Parent pages that are actively related to this page at the reader's chapter
   * cutoff (derived from `page_relationships`). Shown as a breadcrumb in read
   * mode and as a list in the Relationships edit panel.
   */
  parentPages: ParentPageEntry[];
  /**
   * All pages in the serial (excluding the current page) used to populate the
   * "Add parent" dropdown in the Relationships edit panel.
   */
  allSerialPages: { id: number; name: string }[];
  /**
   * When true, hides the Titles and Relationships panels in edit mode. The home
   * page has a fixed name/slug (cannot be renamed) and is the DAG root (no
   * parents), so both panels are irrelevant there.
   */
  isHomePage?: boolean;
  /**
   * Optional slot rendered at the top of the edit-mode panel, before the
   * "Writing as of:" selector. Used by the serial home page to inject the
   * TemplateManager above the content editors.
   */
  editModeHeader?: ReactNode;
}

/**
 * Renders the page body in read mode and switches to an inline edit mode where
 * each section gets an MDEditor alongside its current rendered value, and
 * infobox fields get plain text inputs.
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
 * @example
 * <PageEditor
 *   serialSlug="one-piece"
 *   pageName="Luffy"
 *   pageSlug="luffy"
 *   pageId={42}
 *   pageTitleEntries={[]}
 *   pageSectionStructure={[{ id: 1, name: 'Summary', displayOrder: 0 }]}
 *   sections={[{ id: 1, name: 'Summary', content: '...', lastUpdatedChapterIdx: 1 }]}
 *   infoboxSectionStructure={[{ id: 1, label: 'Age', displayOrder: 0 }]}
 *   floaterImageUrl="https://..."
 *   floaterRows={[{ id: 2, label: 'Age', content: '19' }]}
 *   allChapters={[{ id: 5, displayName: '1', idx: 1, volumeName: 'Volume 1' }]}
 *   headChapterId={5}
 *   readingChapterId={3}
 *   wikiPages={[{ name: 'Luffy' }]}
 *   introChapterIdx={1}
 *   childPages={[]}
 *   parentPages={[]}
 *   allSerialPages={[]}
 * />
 */
export function PageEditor({
  serialSlug,
  pageSlug,
  pageId,
  pageTitleEntries,
  pageSectionStructure,
  sections,
  infoboxSectionStructure,
  floaterImageUrl,
  floaterRows,
  allChapters,
  headChapterId,
  readingChapterId,
  wikiPages,
  introChapterIdx,
  childPages,
  parentPages,
  allSerialPages,
  isHomePage = false,
  editModeHeader,
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
  const [currentSectionLastUpdatedIdx, setCurrentSectionLastUpdatedIdx] =
    useState<Record<number, number | null>>(() =>
      Object.fromEntries(sections.map((s) => [s.id, s.lastUpdatedChapterIdx])),
    );

  const [currentParentPages, setCurrentParentPages] =
    useState<ParentPageEntry[]>(parentPages);

  const [draftFloaterImageUrl, setDraftFloaterImageUrl] = useState<string>(
    floaterImageUrl ?? "",
  );
  const [draftFloaterRowContent, setDraftFloaterRowContent] = useState<
    Record<number, string>
  >(() => Object.fromEntries(floaterRows.map((r) => [r.id, r.content])));

  // Defaults to the reader's current chapter so writing stays in sync with what
  // the reader just read. Falls back to headChapterId when no reading chapter is set.
  const [selectedChapterId, setSelectedChapterId] = useState<number | null>(
    readingChapterId ?? headChapterId,
  );

  const hasInfobox = infoboxSectionStructure.length > 0;

  const handleDiscard = useCallback(() => {
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
    setCurrentParentPages(parentPages);
    setSelectedChapterId(readingChapterId ?? headChapterId);
  }, [
    sections,
    floaterImageUrl,
    floaterRows,
    parentPages,
    readingChapterId,
    headChapterId,
  ]);

  const handleSave = useCallback(() => {
    startTransition(async () => {
      await savePageContent(
        serialSlug,
        pageSlug,
        "",
        draftSectionContent,
        hasInfobox ? draftFloaterImageUrl.trim() || null : null,
        hasInfobox ? draftFloaterRowContent : {},
        selectedChapterId ?? undefined,
      );
      router.refresh();
    });
  }, [
    serialSlug,
    pageSlug,
    draftSectionContent,
    hasInfobox,
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
      const [data, parents] = await Promise.all([
        getPageContentAtChapter(serialSlug, pageSlug, chapterId),
        getParentPagesAtChapter(serialSlug, pageSlug, chapterId),
      ]);
      const newContent = Object.fromEntries(
        data.sections.map((s) => [s.id, s.content]),
      );
      setCurrentSectionContent(newContent);
      setDraftSectionContent(newContent);
      setCurrentSectionLastUpdatedIdx(
        Object.fromEntries(
          data.sections.map((s) => [s.id, s.lastUpdatedChapterIdx]),
        ),
      );
      if (hasInfobox) {
        setDraftFloaterImageUrl(data.floaterImageUrl ?? "");
        setDraftFloaterRowContent(
          Object.fromEntries(data.floaterRows.map((r) => [r.id, r.content])),
        );
      }
      setCurrentParentPages(parents);
    });
  }

  if (!isEditing) {
    return (
      <PageReadView
        serialSlug={serialSlug}
        sections={sections}
        hasInfobox={hasInfobox}
        floaterImageUrl={floaterImageUrl}
        floaterRows={floaterRows}
        childPages={childPages}
        pageId={pageId}
      />
    );
  }

  // ── Edit mode ────────────────────────────────────────────────────────────────
  const selectedChapterIdx =
    allChapters.find((c) => c.id === selectedChapterId)?.idx ?? null;

  // Chapters before the page's intro chapter are disabled — content can't predate the page.
  // Chapters beyond the reader's cutoff are also disabled — editors can't write spoilers.
  const readingCutoffIdx =
    allChapters.find((c) => c.id === readingChapterId)?.idx ?? null;
  const chapterSelectOptions: ChapterGroupOption[] = (() => {
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
      value: -1 as number,
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
      {editModeHeader}

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

      {!isHomePage && (
        <PageTitlesPanel
          serialSlug={serialSlug}
          pageSlug={pageSlug}
          pageTitleEntries={pageTitleEntries}
          chapterSelectOptions={chapterSelectOptions}
          isPending={isPending}
        />
      )}

      {!isHomePage && (
        <PageRelationshipsPanel
          pageId={pageId}
          parentPages={currentParentPages}
          allSerialPages={allSerialPages}
          chapterId={selectedChapterId}
        />
      )}

      <PageSectionManager pageId={pageId} sections={pageSectionStructure} />

      {sections.map((section, i) => (
        <SectionContentEditor
          key={section.id}
          section={section}
          isFirst={i === 0}
          currentContent={currentSectionContent[section.id] ?? ""}
          draftContent={draftSectionContent[section.id] ?? ""}
          lastUpdatedIdx={currentSectionLastUpdatedIdx[section.id] ?? null}
          selectedChapterIdx={selectedChapterIdx}
          onChange={(val) =>
            setDraftSectionContent((prev) => ({ ...prev, [section.id]: val }))
          }
          serialSlug={serialSlug}
          wikiPages={wikiPages}
        />
      ))}

      <PageInfoboxPanel
        pageId={pageId}
        infoboxSectionStructure={infoboxSectionStructure}
        floaterRows={floaterRows}
        draftFloaterImageUrl={draftFloaterImageUrl}
        setDraftFloaterImageUrl={setDraftFloaterImageUrl}
        draftFloaterRowContent={draftFloaterRowContent}
        setDraftFloaterRowContent={setDraftFloaterRowContent}
        isPending={isPending}
      />
    </Box>
  );
}
