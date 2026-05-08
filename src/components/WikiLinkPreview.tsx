"use client";

import { useState } from "react";
import { HoverCard } from "@/components/ui/hovercard";
import { Text } from "@/components/ui/text";
import { getWikiLinkPreview } from "@/lib/wiki-link-preview-action";
import type { WikiLinkPreviewData } from "@/lib/wiki-link-preview-action";

interface Props {
  /** The URL the link points to. */
  href: string;
  /** Link label text. */
  children: React.ReactNode;
  /** Serial slug — used to fetch the preview. */
  serialSlug: string;
  /** Category name of the linked page. */
  categoryName: string;
  /** Page name of the linked page. */
  pageName: string;
}

/** Maximum characters of first-section content shown in the preview. */
const PREVIEW_CHARS = 200;

/**
 * Wraps a wiki link anchor with a hover card that lazily fetches and displays
 * a compact page preview. The fetch fires once on first hover and the result
 * is cached in component state for subsequent hovers.
 *
 * Respects the user's chapter cutoff — hidden pages show a spoiler-safe
 * placeholder rather than content. Non-existent pages show a "not yet created"
 * message.
 *
 * @example
 * <WikiLinkPreview
 *   href="/my-serial/Characters/Luffy"
 *   serialSlug="my-serial"
 *   categoryName="Characters"
 *   pageName="Luffy"
 * >
 *   Luffy
 * </WikiLinkPreview>
 */
export function WikiLinkPreview({
  href,
  children,
  serialSlug,
  categoryName,
  pageName,
}: Props) {
  const [preview, setPreview] = useState<WikiLinkPreviewData | "loading" | "missing">("loading");

  async function handleMouseEnter() {
    // Only fetch once
    if (preview !== "loading") return;
    const data = await getWikiLinkPreview(serialSlug, categoryName, pageName);
    setPreview(data ?? "missing");
  }

  const anchor = (
    <a
      href={href}
      className="text-blue-600 underline hover:text-blue-800"
      onMouseEnter={handleMouseEnter}
    >
      {children}
    </a>
  );

  return (
    <HoverCard trigger={anchor}>
      <PreviewContent preview={preview} categoryName={categoryName} pageName={pageName} />
    </HoverCard>
  );
}

interface PreviewContentProps {
  preview: WikiLinkPreviewData | "loading" | "missing";
  categoryName: string;
  pageName: string;
}

function PreviewContent({ preview, categoryName, pageName }: PreviewContentProps) {
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
        <Text variant="label" className="font-semibold text-gray-900">
          {pageName}
        </Text>
        <Text muted className="text-xs">
          {categoryName}
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
        <Text variant="label" className="font-semibold text-gray-900">
          {pageName}
        </Text>
        <Text muted className="text-xs">
          {categoryName}
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
        <Text variant="label" className="font-semibold text-gray-900 text-sm">
          {preview.pageName}
        </Text>
        <Text muted as="span" className="text-xs block">
          {preview.categoryName}
          {preview.introChapterName && (
            <span className="ml-2 text-gray-400">· {preview.introChapterName}</span>
          )}
        </Text>
      </div>

      {/* Floater rows */}
      {preview.floaterRows.length > 0 && (
        <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-xs border-t border-gray-100 pt-2">
          {preview.floaterRows
            .filter((r) => r.content)
            .slice(0, 4)
            .map((row) => (
              <>
                <dt key={`dt-${row.label}`} className="text-gray-500 font-medium whitespace-nowrap">
                  {row.label}
                </dt>
                <dd key={`dd-${row.label}`} className="text-gray-800 truncate">
                  {row.content}
                </dd>
              </>
            ))}
        </dl>
      )}

      {/* First section text */}
      {truncatedContent && (
        <p className="text-xs text-gray-700 leading-relaxed border-t border-gray-100 pt-2">
          {truncatedContent}
        </p>
      )}

      {!truncatedContent && preview.floaterRows.length === 0 && (
        <Text muted className="text-xs">
          No content yet.
        </Text>
      )}
    </div>
  );
}
