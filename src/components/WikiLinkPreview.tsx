"use client";

import { Fragment, useState } from "react";
import { HoverCard } from "@/components/ui/HoverCard";
import { Text } from "@/components/ui/Text";
import { MarkdownRenderer } from "@/components/ui/MarkdownRenderer";
import { getWikiLinkPreview } from "@/lib/wiki-link-preview-action";
import type { WikiLinkPreviewData } from "@/lib/wiki-link-preview-action";
import {
  WIKI_LINK_CHIP_BASE,
  WIKI_LINK_CHIP_LINK,
} from "@/components/MDEditor/wikiLinkChipClasses";

interface WikiLinkPreviewProps {
  /** The URL the link points to. */
  href: string;
  /** Link label text. */
  children: React.ReactNode;
  /** Serial slug - used to fetch the preview. */
  serialSlug: string;
  /** Page name (slug) of the linked page. */
  pageName: string;
}

/** Maximum characters of first-section content shown in the preview. */
const PREVIEW_CHARS = 200;

/**
 * Wraps a wiki link anchor with a hover card that lazily fetches and displays
 * a compact page preview. The fetch fires once on first hover and the result
 * is cached in component state for subsequent hovers.
 *
 * Respects the user's chapter cutoff - hidden pages show a spoiler-safe
 * placeholder rather than content. Non-existent pages show a "not yet created"
 * message.
 *
 * @example
 * <WikiLinkPreview
 *   href="/my-serial/luffy"
 *   serialSlug="my-serial"
 *   pageName="Luffy"
 * >
 *   Luffy
 * </WikiLinkPreview>
 */
export function WikiLinkPreview({
  href,
  children,
  serialSlug,
  pageName,
}: WikiLinkPreviewProps) {
  const [preview, setPreview] = useState<
    WikiLinkPreviewData | "loading" | "missing"
  >("loading");

  async function handleMouseEnter() {
    // Only fetch once
    if (preview !== "loading") return;
    const data = await getWikiLinkPreview(serialSlug, pageName);
    setPreview(data ?? "missing");
  }

  const anchor = (
    <a
      href={href}
      className={`${WIKI_LINK_CHIP_BASE} ${WIKI_LINK_CHIP_LINK}`}
      onMouseEnter={handleMouseEnter}
    >
      {children}
    </a>
  );

  return (
    <HoverCard trigger={anchor}>
      <PreviewContent
        preview={preview}
        pageName={pageName}
        serialSlug={serialSlug}
      />
    </HoverCard>
  );
}

interface PreviewContentProps {
  preview: WikiLinkPreviewData | "loading" | "missing";
  pageName: string;
  serialSlug: string;
}

function PreviewContent({
  preview,
  pageName,
  serialSlug,
}: PreviewContentProps) {
  if (preview === "loading") {
    return (
      <Text muted className="text-sm">
        Loading…
      </Text>
    );
  }

  if (preview === "missing") {
    return (
      <div className="flex flex-col gap-1">
        <Text variant="label" className="font-semibold text-foreground">
          {pageName}
        </Text>
        <Text muted className="text-sm mt-1">
          This page has not been created yet.
        </Text>
      </div>
    );
  }

  if (preview.hidden) {
    return (
      <div className="flex flex-col gap-1">
        <Text variant="label" className="font-semibold text-foreground">
          {preview.pageName}
        </Text>
        <Text muted className="text-sm mt-1">
          Introduced in {preview.introChapterName ?? "a future chapter"}. Hidden
          to prevent spoilers.
        </Text>
      </div>
    );
  }

  const truncatedContent =
    preview.firstSectionContent.length > PREVIEW_CHARS
      ? preview.firstSectionContent.slice(0, PREVIEW_CHARS).trimEnd() + "…"
      : preview.firstSectionContent;

  return (
    <div className="flex flex-col gap-2">
      {/* Header */}
      <div>
        <Text variant="label" className="font-semibold text-foreground text-sm">
          {preview.pageName}
        </Text>
        {preview.introChapterName && (
          <Text muted as="span" className="text-xs block">
            <span className="text-muted-foreground">
              {preview.introChapterName}
            </span>
          </Text>
        )}
      </div>

      {/* Floater rows */}
      {preview.floaterRows.length > 0 && (
        <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-xs border-t border-border pt-2">
          {preview.floaterRows
            .filter((r) => r.content)
            .slice(0, 4)
            .map((row) => (
              <Fragment key={row.label}>
                <dt className="text-muted-foreground font-medium whitespace-nowrap">
                  {row.label}
                </dt>
                <dd className="text-foreground">
                  <MarkdownRenderer sm serialSlug={serialSlug} pageTitles={preview.pageTitles}>
                    {row.content}
                  </MarkdownRenderer>
                </dd>
              </Fragment>
            ))}
        </dl>
      )}

      {/* First section text */}
      {truncatedContent && (
        <div className="border-t border-border pt-2">
          <MarkdownRenderer
            sm
            serialSlug={serialSlug}
            pageTitles={preview.pageTitles}
            className="[&_p]:mb-1 [&_p:last-child]:mb-0"
          >
            {truncatedContent}
          </MarkdownRenderer>
        </div>
      )}

      {!truncatedContent && preview.floaterRows.length === 0 && (
        <Text muted className="text-xs">
          No content yet.
        </Text>
      )}
    </div>
  );
}
