"use client";

import { useState } from "react";
import { HoverCard } from "@/components/ui/HoverCard";
import { Text } from "@/components/ui/Text";
import { MarkdownRenderer } from "@/components/ui/MarkdownRenderer";
import { getChapterLinkPreview } from "@/lib/wiki-link-preview-action";
import type { ChapterLinkPreviewData } from "@/lib/wiki-link-preview-action";
import { WIKI_LINK_CHIP_CLASSES } from "@/components/MDEditor/wikiLinkChipClasses";

type ChapterLinkPreviewProps = {
  /** The URL the link points to (e.g. `/my-serial/chapter/5`). */
  href: string;
  /** Link label text. */
  children: React.ReactNode;
  /** Serial slug - used to fetch the preview. */
  serialSlug: string;
  /** Numeric chapter idx from the URL path segment. */
  chapterIdx: number;
};

/**
 * Wraps a chapter wiki-link anchor with a hover card that lazily fetches and
 * displays a compact chapter preview (display name, volume, synopsis snippet).
 *
 * Respects the user's chapter cutoff - chapters beyond the cutoff show a
 * spoiler-safe placeholder. Non-existent chapters show a "not found" message.
 *
 * @example
 * <ChapterLinkPreview
 *   href="/one-piece/chapter/5"
 *   serialSlug="one-piece"
 *   chapterIdx={5}
 * >
 *   Chapter 5
 * </ChapterLinkPreview>
 */
export function ChapterLinkPreview(props: ChapterLinkPreviewProps) {
  const { href, children, serialSlug, chapterIdx } = props;

  const [preview, setPreview] = useState<
    ChapterLinkPreviewData | "loading" | "missing"
  >("loading");

  async function handleMouseEnter() {
    if (preview !== "loading") return;
    const data = await getChapterLinkPreview(serialSlug, chapterIdx);
    setPreview(data ?? "missing");
  }

  const anchor = (
    <a
      href={href}
      className={`${WIKI_LINK_CHIP_CLASSES} cursor-pointer hover:bg-accent hover:text-accent-foreground`}
      onMouseEnter={handleMouseEnter}
    >
      {children}
    </a>
  );

  return (
    <HoverCard trigger={anchor}>
      <ChapterPreviewContent preview={preview} serialSlug={serialSlug} />
    </HoverCard>
  );
}

type ChapterPreviewContentProps = {
  preview: ChapterLinkPreviewData | "loading" | "missing";
  serialSlug: string;
};

function ChapterPreviewContent(props: ChapterPreviewContentProps) {
  const { preview, serialSlug } = props;

  if (preview === "loading") {
    return (
      <Text muted className="text-sm">
        Loading…
      </Text>
    );
  }

  if (preview === "missing") {
    return (
      <Text muted className="text-sm">
        Chapter not found.
      </Text>
    );
  }

  if (preview.hidden) {
    return (
      <div className="flex flex-col gap-1">
        <Text variant="label" className="font-semibold text-foreground">
          {preview.chapterType} {preview.displayName}
        </Text>
        <Text muted className="text-sm mt-1">
          You haven&apos;t reached this {preview.chapterType.toLowerCase()} yet.
          Hidden to prevent spoilers.
        </Text>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <div>
        <Text variant="label" className="font-semibold text-foreground text-sm">
          {preview.chapterType} {preview.displayName}
        </Text>
        {preview.volumeName && (
          <Text muted as="span" className="text-xs block">
            {preview.volumeName}
          </Text>
        )}
      </div>

      {preview.synopsisSnippet ? (
        <div className="border-t border-border pt-2">
          <MarkdownRenderer
            sm
            serialSlug={serialSlug}
            className="[&_p]:mb-1 [&_p:last-child]:mb-0"
          >
            {preview.synopsisSnippet}
          </MarkdownRenderer>
        </div>
      ) : (
        <Text muted className="text-xs">
          No synopsis yet.
        </Text>
      )}
    </div>
  );
}
