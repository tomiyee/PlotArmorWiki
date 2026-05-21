import Image from "next/image";
import Link from "next/link";
import { Text } from "@/components/ui/Text";
import { MarkdownRenderer } from "@/components/ui/MarkdownRenderer";
import type { SectionData, FloaterRowData } from "./types";

interface Props {
  serialSlug: string;
  sections: SectionData[];
  hasInfobox: boolean;
  floaterImageUrl: string | null | undefined;
  floaterRows: FloaterRowData[];
  childPages: { id: number; name: string; slug: string; title: string }[];
  pageId: number;
  /** slug → title map passed to MarkdownRenderer so `[[slug]]` links show the correct title. */
  pageTitles?: Record<string, string>;
  /** Chapter display name → idx map for resolving `[[Chapter:Name]]` links. */
  wikiChapters?: Record<string, number>;
  /** The serial's chapter type (e.g. `"Chapter"`, `"Episode"`). */
  chapterType?: string;
}

/**
 * Read-mode layout for a wiki page: infobox floater, section content, and child page list.
 * Renders directly from server-provided props so router.refresh() delivers fresh content.
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
export function PageReadView({
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
}: Props) {
  const hasFloaterContent =
    hasInfobox && (floaterImageUrl || floaterRows.length > 0);

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
                  <dt className="font-medium text-muted-foreground">{row.label}</dt>
                  <dd className="text-foreground whitespace-pre-wrap">
                    {row.content || <span className="text-muted-foreground">—</span>}
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

      <div className="mt-6 pt-6 border-t border-border">
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
