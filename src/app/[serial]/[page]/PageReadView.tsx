"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
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
} | null;

/**
 * All data needed to render the suggestion form and status banner for
 * authenticated non-admin users. Grouped to avoid a sprawling flat props list.
 * Omit this prop entirely for anonymous or admin users.
 */
type SuggestionContext = {
  /** True when the viewer is an admin — hides the suggest button and status banner. */
  isAdmin: boolean;
  /** All chapters for the "Writing as of:" selector. */
  allChapters: ChapterData[];
  /** The chapter the user is currently reading up to. */
  readingChapterId: number | null;
  /** Wiki pages for `[[Page]]` autocomplete in the editor. */
  wikiPagesList: { name: string; slug: string }[];
  /** Chapters for `[[Chapter:Name]]` autocomplete. */
  wikiChaptersList: { name: string; idx: number }[];
  /** The current user's most recent suggestion for this page, or null. */
  myPageSuggestion: MyPageSuggestion;
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
   * When provided, the authenticated non-admin suggestion flow is enabled —
   * shows the "Suggest an edit" button, status banner, and inline form.
   * Omit for anonymous users or when the page is rendered in edit mode.
   */
  suggestionContext?: SuggestionContext;
};

/**
 * Read-mode layout for a wiki page: infobox floater, section content, and child page list.
 * Authenticated non-admins see a "Suggest an Edit" button that opens an inline form.
 * After submitting, the per-page status indicator shows review feedback.
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
 *   isAuthenticated={true}
 *   isAdmin={false}
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

  // Status banner for pending/approved/rejected suggestions.
  const suggestionStatusBanner = (() => {
    const suggestion = suggestionContext?.myPageSuggestion;
    if (!suggestion || suggestionContext?.isAdmin) return null;
    const { status, reviewNote } = suggestion;
    if (status === "pending") {
      return (
        <div className="rounded-md border border-border bg-muted/40 px-4 py-3 text-sm text-muted-foreground">
          Your suggestion is pending admin review.
        </div>
      );
    }
    if (status === "approved") {
      return (
        <div className="rounded-md border border-green-500/30 bg-green-50/50 dark:bg-green-950/20 px-4 py-3 text-sm text-green-700 dark:text-green-400">
          Your suggestion was approved and applied to the page.
        </div>
      );
    }
    if (status === "rejected") {
      return (
        <div className="rounded-md border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          Your suggestion was not accepted.
          {reviewNote && (
            <span className="block mt-1 text-muted-foreground">
              Admin note: {reviewNote}
            </span>
          )}
        </div>
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
                      <span className="text-muted-foreground">—</span>
                    )}
                  </dd>
                </div>
              ))}
            </dl>
          )}
        </aside>
      )}

      {sections.map((section, i) => (
        <div key={section.id} className="mb-6 last:mb-0">
          {i > 0 && (
            <Text variant="h2" className="mb-2">
              {section.name}
            </Text>
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

        {showSuggestButton && (
          <div>
            <Button
              variant="outline"
              onClick={() => setShowSuggestionForm(true)}
            >
              Suggest an edit
            </Button>
          </div>
        )}

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
        <Link
          href={`/${serialSlug}/new?parentPageId=${pageId}`}
          className="mt-3 text-sm text-primary hover:underline inline-block"
        >
          + New page
        </Link>
      </div>
    </div>
  );
}
