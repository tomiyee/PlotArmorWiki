"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { FilePenLine, ChevronLeft, ChevronRight } from "lucide-react";
import { Text } from "@/components/ui/Text";
import { Button } from "@/components/ui/Button";
import { MarkdownRenderer } from "@/components/ui/MarkdownRenderer";
import { SuggestionForm } from "./SuggestionForm";
import type { SectionData, FloaterRowData, ChapterData } from "./types";

type MyPageSuggestion = {
  id: number;
  status: "pending" | "approved" | "rejected";
  reviewNote: string | null;
  createdAt: Date;
  targetChapterName: string;
  sectionChanges: { sectionName: string; proposedContent: string }[];
  infoboxChanges: { label: string; proposedContent: string }[];
} | null;

/**
 * All data needed to render the suggestion form and status banner for
 * authenticated non-admin users. Grouped to avoid a sprawling flat props list.
 * Omit this prop entirely for anonymous or admin users.
 */
type SuggestionContext = {
  /** True when the viewer is an admin - hides the suggest button and status banner. */
  isAdmin: boolean;
  /** All chapters for the "Writing as of:" selector. */
  allChapters: ChapterData[];
  /** The chapter the user is currently reading up to. */
  readingChapterId: number | null;
  /** Wiki pages for `[[Page]]` autocomplete in the editor. */
  wikiPagesList: { name: string; slug: string }[];
  /** Chapters for `[[Chapter:Name]]` autocomplete. */
  wikiChaptersList: { name: string; idx: number }[];
  /** All of the current user's suggestions for this page, most recent first. */
  myPageSuggestions: MyPageSuggestion[];
};

type PageReadViewProps = {
  /** Slug of the parent serial, used to resolve wiki links. */
  serialSlug: string;
  /** Page sections with chapter-versioned content. */
  sections: SectionData[];
  /** True when the page has infobox rows. */
  hasInfobox: boolean;
  /** URL of the infobox cover image, or null/undefined when absent. */
  floaterImageUrl: string | null | undefined;
  /** Infobox rows to render in the floater panel. */
  floaterRows: FloaterRowData[];
  /** Child pages active at the reader's chapter cutoff. */
  childPages: { id: number; name: string; slug: string; title: string }[];
  /** DB id of this page, used for linking to the new-page form and suggestion submission. */
  pageId: number;
  /** slug → title map passed to MarkdownRenderer so `[[slug]]` links show the correct title. */
  pageTitles?: Record<string, string>;
  /** Chapter display name → idx map for resolving `[[Chapter:Name]]` links. */
  wikiChapters?: Record<string, number>;
  /** The serial's chapter type (e.g. `"Chapter"`, `"Episode"`). */
  chapterType?: string;
  /**
   * When provided, the authenticated non-admin suggestion flow is enabled -
   * shows "Suggest an edit" icon buttons on section headers, status banner, and inline form.
   * Omit for anonymous users or when the page is rendered in edit mode.
   */
  suggestionContext?: SuggestionContext;
};

/**
 * Read-mode layout for a wiki page: infobox floater, section content, and child page list.
 * Authenticated non-admins see a FilePenLine icon on hover over section headers to open the
 * inline suggestion form. Multiple past suggestions can be browsed via prev/next navigation.
 *
 * @example
 * <PageReadView
 *   serialSlug="one-piece"
 *   sections={[{ id: 1, name: "Summary", content: "...", lastUpdatedChapterIdx: 1 }]}
 *   hasInfobox={true}
 *   floaterImageUrl="https://..."
 *   floaterRows={[{ id: 1, label: "Age", content: "19" }]}
 *   childPages={[]}
 *   pageId={42}
 * />
 */
export function PageReadView(props: PageReadViewProps) {
  const {
    serialSlug,
    sections,
    hasInfobox,
    floaterImageUrl,
    floaterRows,
    childPages,
    pageId,
    pageTitles,
    wikiChapters,
    chapterType,
    suggestionContext,
  } = props;

  const [showSuggestionForm, setShowSuggestionForm] = useState(false);
  const [showSuggestionDetail, setShowSuggestionDetail] = useState(false);
  const [selectedSuggestionIdx, setSelectedSuggestionIdx] = useState(0);

  const hasFloaterContent =
    hasInfobox && (floaterImageUrl || floaterRows.length > 0);

  const showSuggestButton =
    !!suggestionContext && !suggestionContext.isAdmin && !showSuggestionForm;

  // Map sections to the flat format expected by SuggestionForm as initialSections.
  const initialSections = sections.map((s) => ({
    id: s.id,
    name: s.name,
    content: s.content,
    lastUpdatedChapterIdx: s.lastUpdatedChapterIdx,
  }));

  const initialInfoboxSections = floaterRows.map((r) => ({
    id: r.id,
    label: r.label,
    content: r.content,
  }));

  const allSuggestions = suggestionContext?.myPageSuggestions ?? [];
  const totalSuggestions = allSuggestions.length;
  const currentSuggestion =
    totalSuggestions > 0
      ? (allSuggestions[selectedSuggestionIdx] ?? null)
      : null;

  // Prev/next pager shown when the user has submitted multiple suggestions.
  const suggestionPager =
    totalSuggestions > 1 ? (
      <div className="flex items-center gap-1 shrink-0">
        <Text as="span" className="text-xs text-muted-foreground">
          {selectedSuggestionIdx + 1} of {totalSuggestions}
        </Text>
        <Button
          variant="ghost"
          size="icon-xs"
          onClick={() => {
            setSelectedSuggestionIdx((i) => i - 1);
          }}
          disabled={selectedSuggestionIdx === 0}
        >
          <ChevronLeft />
          <span className="sr-only">Previous suggestion</span>
        </Button>
        <Button
          variant="ghost"
          size="icon-xs"
          onClick={() => {
            setSelectedSuggestionIdx((i) => i + 1);
          }}
          disabled={selectedSuggestionIdx === totalSuggestions - 1}
        >
          <ChevronRight />
          <span className="sr-only">Next suggestion</span>
        </Button>
      </div>
    ) : null;

  // Status banner for pending/approved/rejected suggestions.
  const suggestionStatusBanner = (() => {
    if (!currentSuggestion || suggestionContext?.isAdmin) return null;
    const { status, reviewNote } = currentSuggestion;
    if (status === "pending") {
      const hasChanges =
        currentSuggestion.sectionChanges.length > 0 ||
        currentSuggestion.infoboxChanges.length > 0;
      return (
        <Text
          as="div"
          className="rounded-md border border-border bg-muted/40 px-4 py-3 text-sm text-muted-foreground"
        >
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Text as="span">Your suggestion is pending admin review.</Text>
              {suggestionPager}
            </div>
            {hasChanges && (
              <Button
                variant="ghost"
                className="h-auto px-2 py-1 text-xs shrink-0"
                onClick={() => setShowSuggestionDetail((v) => !v)}
              >
                {showSuggestionDetail ? "Hide" : "View your suggestion"}
              </Button>
            )}
          </div>
          {showSuggestionDetail && hasChanges && (
            <div className="mt-3 flex flex-col gap-3 border-t border-border pt-3">
              <Text className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Writing as of {currentSuggestion.targetChapterName}
              </Text>
              {currentSuggestion.sectionChanges.map((change, i) => (
                <div key={i} className="flex flex-col gap-1">
                  <Text className="text-xs font-medium">
                    {change.sectionName}
                  </Text>
                  <div className="rounded border border-border bg-background p-3 text-xs overflow-auto">
                    <MarkdownRenderer serialSlug={serialSlug} sm>
                      {change.proposedContent}
                    </MarkdownRenderer>
                  </div>
                </div>
              ))}
              {currentSuggestion.infoboxChanges.length > 0 && (
                <div className="flex flex-col gap-2">
                  <Text className="text-xs font-medium">Infobox changes</Text>
                  {currentSuggestion.infoboxChanges.map((change, i) => (
                    <div key={i} className="flex gap-2 text-xs">
                      <Text
                        as="span"
                        className="font-medium text-muted-foreground shrink-0"
                      >
                        {change.label}:
                      </Text>
                      <span className="whitespace-pre-wrap">
                        {change.proposedContent}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </Text>
      );
    }
    if (status === "approved") {
      return (
        <Text
          as="div"
          className="rounded-md border border-green-500/30 bg-green-50/50 dark:bg-green-950/20 px-4 py-3 text-sm text-green-700 dark:text-green-400"
        >
          <div className="flex items-center justify-between gap-2">
            <Text as="span">
              Your suggestion was approved and applied to the page.
            </Text>
            {suggestionPager}
          </div>
        </Text>
      );
    }
    if (status === "rejected") {
      return (
        <Text
          as="div"
          className="rounded-md border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive"
        >
          <div className="flex items-center justify-between gap-2">
            <Text as="span">Your suggestion was not accepted.</Text>
            {suggestionPager}
          </div>
          {reviewNote && (
            <Text as="span" muted className="block mt-1">
              Admin note: {reviewNote}
            </Text>
          )}
        </Text>
      );
    }
    return null;
  })();

  return (
    <div className="overflow-hidden">
      {hasFloaterContent && (
        <aside className="float-none w-full mb-4 sm:float-right sm:w-72 sm:ml-4 sm:mb-4 rounded-lg border border-border bg-muted/40 p-4 flex flex-col gap-3">
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
                  <dt className="font-medium text-muted-foreground">
                    {row.label}
                  </dt>
                  <dd className="text-foreground whitespace-pre-wrap">
                    {row.content || (
                      <Text as="span" muted>
                        -
                      </Text>
                    )}
                  </dd>
                </div>
              ))}
            </dl>
          )}
        </aside>
      )}

      {sections.map((section, i) => (
        <div key={section.id} className="group mb-6 last:mb-0">
          {i > 0 && (
            <div className="flex items-center gap-2 mb-2">
              <Text variant="h2">{section.name}</Text>
              {showSuggestButton && (
                <Button
                  variant="ghost"
                  size="icon-sm"
                  className="opacity-0 group-hover:opacity-100 transition-opacity"
                  onClick={() => setShowSuggestionForm(true)}
                >
                  <FilePenLine />
                  <span className="sr-only">Suggest an edit</span>
                </Button>
              )}
            </div>
          )}
          {section.content ? (
            <MarkdownRenderer
              serialSlug={serialSlug}
              pageTitles={pageTitles}
              chapterType={chapterType}
              wikiChapters={wikiChapters}
            >
              {section.content}
            </MarkdownRenderer>
          ) : (
            <Text muted>No content for this chapter yet.</Text>
          )}
        </div>
      ))}

      {/* Suggestion form or status feedback */}
      <div className="clear-right mt-4 flex flex-col gap-4">
        {suggestionStatusBanner}

        {showSuggestionForm && suggestionContext && (
          <SuggestionForm
            pageId={pageId}
            allChapters={suggestionContext.allChapters}
            readingChapterId={suggestionContext.readingChapterId}
            wikiPages={suggestionContext.wikiPagesList}
            wikiChapters={suggestionContext.wikiChaptersList}
            chapterType={chapterType}
            serialSlug={serialSlug}
            initialSections={initialSections}
            initialInfoboxSections={initialInfoboxSections}
            onClose={() => setShowSuggestionForm(false)}
          />
        )}
      </div>

      <div className="clear-right mt-6 pt-6 border-t border-border">
        <Text variant="h3" className="mb-3">
          Child pages
        </Text>
        {childPages.length > 0 ? (
          <ul className="flex flex-col gap-2">
            {childPages.map((child) => (
              <li key={child.id}>
                <Link
                  href={`/${serialSlug}/${child.slug}`}
                  className="rounded-lg border border-border px-4 py-2 flex items-center hover:bg-muted transition-colors"
                >
                  <Text variant="body" as="span">
                    {child.title}
                  </Text>
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <Text muted className="text-sm">
            No child pages yet.
          </Text>
        )}
        {suggestionContext?.isAdmin && (
          <Link
            href={`/${serialSlug}/new?parentPageId=${pageId}`}
            className="mt-3 text-sm text-primary hover:underline inline-block"
          >
            + New page
          </Link>
        )}
      </div>
    </div>
  );
}
