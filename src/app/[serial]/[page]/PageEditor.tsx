"use client";

import {
  useCallback,
  useEffect,
  useState,
  useTransition,
  type ReactNode,
} from "react";
import { useRouter } from "next/navigation";
import { Box } from "@/components/ui/Box";
import { Label } from "@/components/ui/Label";
import { Text } from "@/components/ui/Text";
import { Select } from "@/components/ui/Select";
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
import { SuggestionReviewPanel } from "./SuggestionReviewPanel";
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
   * the `[[slug]]` autocomplete in edit mode. */
  wikiPages: { name: string; slug: string }[];
  /** slug → chapter-versioned title map for resolving `[[slug]]` display text. */
  pageTitles?: Record<string, string>;
  /**
   * All chapters in the serial (name + idx), used to power the
   * `[[Chapter:Name]]` autocomplete in edit mode and resolve chapter links
   * in the markdown preview.
   */
  wikiChapters?: { name: string; idx: number }[];
  /**
   * The serial's chapter type (e.g. `"Chapter"`, `"Episode"`).
   * Required alongside `wikiChapters` to enable chapter link autocomplete
   * and routing in the editor preview.
   */
  chapterType?: string;
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
  /**
   * Whether the current user is an admin of this serial. When `false`, the
   * component always renders in read mode — edit controls and the edit FAB
   * are invisible to non-admins. The parent Server Component is responsible
   * for resolving this value via `isSerialAdmin`.
   */
  isAdmin?: boolean;
  /**
   * Whether the current user is authenticated (but not necessarily an admin).
   * When `true` and `isAdmin` is false, shows the "Suggest an Edit" button in
   * read mode. Resolved by the parent via `isAuthenticated()` from auth-guard.
   */
  isAuthenticated?: boolean;
  /**
   * Number of pending suggestions for this page. Shown as a badge next to the
   * edit mode controls when `isAdmin` is true and value > 0.
   */
  pendingSuggestionCount?: number;
  /**
   * Pre-fetched pending suggestions for this page, passed to `SuggestionReviewPanel`.
   * Only populated when `isAdmin` is true.
   */
  pendingSuggestions?: {
    id: number;
    proposerUsername: string | null;
    targetChapterId: number;
    targetChapterName: string;
    citation: string;
    createdAt: Date;
    sectionChanges: {
      sectionId: number;
      sectionName: string;
      currentContent: string;
      proposedContent: string;
    }[];
    infoboxChanges: {
      infoboxSectionId: number;
      infoboxSectionLabel: string;
      currentContent: string;
      proposedContent: string;
    }[];
  }[];
  /**
   * All suggestions the current non-admin user has submitted for this page,
   * most recent first. Passed through to PageReadView for per-page status feedback.
   */
  myPageSuggestions?: {
    id: number;
    status: "pending" | "approved" | "rejected";
    reviewNote: string | null;
    createdAt: Date;
    targetChapterName: string;
    sectionChanges: { sectionName: string; proposedContent: string }[];
    infoboxChanges: { label: string; proposedContent: string }[];
  }[];
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
export function PageEditor(props: Props) {
  const {
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
    pageTitles,
    wikiChapters,
    chapterType,
    introChapterIdx,
    childPages,
    parentPages,
    allSerialPages,
    isHomePage = false,
    editModeHeader,
    isAdmin = false,
    isAuthenticated = false,
    pendingSuggestionCount = 0,
    pendingSuggestions = [],
    myPageSuggestions = [],
  } = props;
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const { isEditing, registerHandlers, setIsDirty } = useEditMode();

  const [draftSectionContent, setDraftSectionContent] = useState<
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

  // Filter pending suggestions to those whose target chapter is within the admin's
  // reading cutoff. Suggestions targeting chapters beyond the cutoff could reveal
  // spoilers (the content being proposed may reference future events).
  const readingCutoffIdx =
    allChapters.find((c) => c.id === readingChapterId)?.idx ?? null;
  const visibleSuggestions = pendingSuggestions.filter((s) => {
    const targetIdx = allChapters.find((c) => c.id === s.targetChapterId)?.idx;
    return (
      readingCutoffIdx === null ||
      targetIdx === undefined ||
      targetIdx <= readingCutoffIdx
    );
  });
  const hiddenSuggestionCount =
    pendingSuggestions.length - visibleSuggestions.length;

  // Compute dirty state: true when any draft differs from the server-provided value.
  const isDirty =
    sections.some((s) => draftSectionContent[s.id] !== s.content) ||
    (hasInfobox && draftFloaterImageUrl !== (floaterImageUrl ?? "")) ||
    (hasInfobox &&
      floaterRows.some((r) => draftFloaterRowContent[r.id] !== r.content));

  // Propagate dirty state into EditModeContext so the navigation guard can react.
  useEffect(() => {
    setIsDirty(isDirty);
    // Reset dirty flag on unmount so the guard doesn't fire after discarding.
    return () => setIsDirty(false);
  }, [isDirty, setIsDirty]);

  const handleDiscard = useCallback(() => {
    setDraftSectionContent(
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

  // Build chapter name → idx map for MarkdownRenderer
  const wikiChaptersByName = wikiChapters
    ? Object.fromEntries(wikiChapters.map((c) => [c.name, c.idx]))
    : undefined;

  if (!isAdmin || !isEditing) {
    return (
      <Box col className="gap-6">
        <PageReadView
          serialSlug={serialSlug}
          sections={sections}
          hasInfobox={hasInfobox}
          floaterImageUrl={floaterImageUrl}
          floaterRows={floaterRows}
          childPages={childPages}
          pageId={pageId}
          pageTitles={pageTitles}
          wikiChapters={wikiChaptersByName}
          chapterType={chapterType}
          suggestionContext={
            isAuthenticated
              ? {
                  isAdmin,
                  allChapters,
                  readingChapterId: readingChapterId ?? null,
                  wikiPagesList: wikiPages,
                  wikiChaptersList: wikiChapters ?? [],
                  myPageSuggestions: myPageSuggestions,
                }
              : undefined
          }
        />
        {isAdmin && visibleSuggestions.length > 0 && (
          <SuggestionReviewPanel
            suggestions={visibleSuggestions}
            serialSlug={serialSlug}
          />
        )}
        {isAdmin && hiddenSuggestionCount > 0 && (
          <Text as="div" className="rounded-md border border-amber-400/40 bg-amber-50/50 dark:bg-amber-950/20 px-4 py-3 text-sm text-amber-700 dark:text-amber-400">
            {hiddenSuggestionCount} pending{" "}
            {hiddenSuggestionCount === 1 ? "suggestion" : "suggestions"} target
            {hiddenSuggestionCount === 1 ? "s" : ""} chapters beyond your
            current reading progress — advance your chapter to review them.
          </Text>
        )}
      </Box>
    );
  }

  // ── Edit mode ────────────────────────────────────────────────────────────────
  const selectedChapterIdx =
    allChapters.find((c) => c.id === selectedChapterId)?.idx ?? null;

  // Chapters before the page's intro chapter are disabled — content can't predate the page.
  // Chapters beyond the reader's cutoff are also disabled — editors can't write spoilers.
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

      {isAdmin && pendingSuggestionCount > 0 && (
        <Text as="div" className="inline-flex items-center gap-2 rounded-md border border-amber-400/40 bg-amber-50/50 dark:bg-amber-950/20 px-3 py-2 text-sm text-amber-700 dark:text-amber-400">
          <Text as="span" className="font-medium">{pendingSuggestionCount}</Text>
          {pendingSuggestionCount === 1
            ? "pending suggestion"
            : "pending suggestions"}{" "}
          — see below
        </Text>
      )}

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
          draftContent={draftSectionContent[section.id] ?? ""}
          lastUpdatedIdx={currentSectionLastUpdatedIdx[section.id] ?? null}
          selectedChapterIdx={selectedChapterIdx}
          onChange={(val) =>
            setDraftSectionContent((prev) => ({ ...prev, [section.id]: val }))
          }
          serialSlug={serialSlug}
          wikiPages={wikiPages}
          wikiChapters={wikiChapters}
          chapterType={chapterType}
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

      {visibleSuggestions.length > 0 && (
        <SuggestionReviewPanel
          suggestions={visibleSuggestions}
          serialSlug={serialSlug}
        />
      )}
      {hiddenSuggestionCount > 0 && (
        <Text as="div" className="rounded-md border border-amber-400/40 bg-amber-50/50 dark:bg-amber-950/20 px-4 py-3 text-sm text-amber-700 dark:text-amber-400">
          {hiddenSuggestionCount} pending{" "}
          {hiddenSuggestionCount === 1 ? "suggestion" : "suggestions"} target
          {hiddenSuggestionCount === 1 ? "s" : ""} chapters beyond your current
          reading progress — advance your chapter to review them.
        </Text>
      )}
    </Box>
  );
}
