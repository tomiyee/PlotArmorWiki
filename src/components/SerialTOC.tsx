"use client";

import { useState, useMemo, useCallback, useRef } from "react";
import Link from "next/link";
import { useVirtualizer } from "@tanstack/react-virtual";
import { ChevronDownIcon, ChevronRightIcon } from "lucide-react";
import { Input } from "@/components/ui/Input";
import { Text } from "@/components/ui/Text";
import { cn } from "@/lib/utils";
import { ChapterData, Volume } from "@/types";

type SerialTOCProps = {
  /** The serial's database ID, used as the localStorage key namespace. */
  serialId: number;
  /** The serial's URL slug, used to build chapter hrefs. */
  serialSlug: string;
  /** Ordered list of volumes to render as accordion sections. */
  volumes: Volume[];
  /** Map from volume ID to its chapters, used to populate each accordion section. */
  chaptersByVolume: Partial<Record<number, ChapterData[]>>;
  /** Display label for an individual chapter (e.g. "Chapter", "Episode"). */
  chapterType: string;
};

/** A volume-header row in the flattened virtual list. */
type VolumeRow = {
  kind: "volume";
  /** Stable ID derived from the volume's database ID. */
  id: string;
  volumeId: number;
  displayName: string;
  expanded: boolean;
};

/** A chapter-link row in the flattened virtual list. */
type ChapterRow = {
  kind: "chapter";
  /** Stable ID derived from the chapter's database ID. */
  id: string;
  chapter: ChapterData;
};

type FlatRow = VolumeRow | ChapterRow;

/**
 * Manages expand/collapse state for the volume accordion sections.
 *
 * Uses `Set<number> | null` as a sentinel: `null` means "not yet
 * initialised — treat every volume as expanded." On the first toggle the
 * set is seeded from all volume IDs and the clicked ID is removed (collapse)
 * or added (expand). This avoids a separate initialisation render and lets
 * search-driven force-expand restore the prior state cleanly.
 *
 * @example
 * const { isExpanded, toggleVolume, collapseAll } = useVolumeAccordionState(volumes);
 */
function useVolumeAccordionState(volumes: Volume[]) {
  const [expandedIds, setExpandedIds] = useState<Set<number> | null>(null);

  const allIds = useMemo(
    () => new Set(volumes.map((v) => v.id)),
    [volumes],
  );

  // null sentinel: treat everything as expanded until the user first toggles
  const effectiveExpandedIds: ReadonlySet<number> = expandedIds ?? allIds;

  const isExpanded = useCallback(
    (volumeId: number) => effectiveExpandedIds.has(volumeId),
    [effectiveExpandedIds],
  );

  const toggleVolume = useCallback(
    (volumeId: number) => {
      setExpandedIds((prev) => {
        const base = prev ?? allIds;
        const next = new Set(base);
        if (next.has(volumeId)) next.delete(volumeId);
        else next.add(volumeId);
        return next;
      });
    },
    [allIds],
  );

  return { isExpanded, toggleVolume };
}

/**
 * Builds the flat list of visible rows from volumes, chapters, expand state,
 * and search query. Volumes with no matching chapters are excluded when
 * searching. All matching volumes are force-expanded during an active search.
 *
 * @example
 * const rows = buildFlatRows(visibleVolumes, chaptersByVolume, isExpanded, "chapter 5");
 */
function buildFlatRows(
  volumes: Volume[],
  chaptersByVolume: Partial<Record<number, ChapterData[]>>,
  isExpanded: (volumeId: number) => boolean,
  normalizedQuery: string,
): FlatRow[] {
  const rows: FlatRow[] = [];

  for (const volume of volumes) {
    const chapters = chaptersByVolume[volume.id] ?? [];
    if (chapters.length === 0) continue;

    const matchingChapters = normalizedQuery
      ? chapters.filter((c) =>
          c.displayName.toLowerCase().includes(normalizedQuery),
        )
      : chapters;

    // When searching, skip volumes with no matching chapters
    if (normalizedQuery && matchingChapters.length === 0) continue;

    // Force-expand when searching; otherwise respect accordion state
    const expanded = normalizedQuery ? true : isExpanded(volume.id);

    rows.push({
      kind: "volume",
      id: `vol-${volume.id}`,
      volumeId: volume.id,
      displayName: volume.displayName,
      expanded,
    });

    if (expanded) {
      for (const chapter of matchingChapters) {
        rows.push({
          kind: "chapter",
          id: `ch-${chapter.id}`,
          chapter,
        });
      }
    }
  }

  return rows;
}

/**
 * Collapsible table-of-contents listing volumes and their chapters. Collapse
 * state is managed with a Set-based sentinel that allows force-expand on
 * search and clean restore on clear. The list is virtualised with
 * `@tanstack/react-virtual` for serials with many chapters.
 * Used as the body of the desktop sidebar and the mobile navbar drawer.
 *
 * @example
 * <SerialTOC
 *   serialId={serial.id}
 *   serialSlug="my-serial"
 *   volumes={volumeList}
 *   chaptersByVolume={chaptersByVolume}
 *   chapterType="Chapter"
 * />
 */
export function SerialTOC(props: SerialTOCProps) {
  const { serialId: _serialId, serialSlug, volumes, chaptersByVolume, chapterType } =
    props;

  const [query, setQuery] = useState("");
  const normalizedQuery = query.trim().toLowerCase();

  const { isExpanded, toggleVolume } = useVolumeAccordionState(volumes);

  const flatRows = useMemo(
    () => buildFlatRows(volumes, chaptersByVolume, isExpanded, normalizedQuery),
    [volumes, chaptersByVolume, isExpanded, normalizedQuery],
  );

  const scrollParentRef = useRef<HTMLDivElement>(null);

  const virtualizer = useVirtualizer({
    count: flatRows.length,
    getScrollElement: () => scrollParentRef.current,
    estimateSize: () => 32,
    overscan: 5,
  });

  const visibleVolumes = volumes.filter(
    (v) => (chaptersByVolume[v.id] ?? []).length > 0,
  );

  if (visibleVolumes.length === 0) {
    return (
      <Text muted className="text-sm">
        No {chapterType.toLowerCase()}s yet - add your first one below.
      </Text>
    );
  }

  return (
    <nav aria-label="Table of contents" className="flex flex-col h-full">
      <Input
        placeholder={`Search ${chapterType.toLowerCase()}s…`}
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        className="mb-2 h-7 text-sm shrink-0"
      />
      {flatRows.length === 0 ? (
        <Text muted className="text-sm px-2">
          No {chapterType.toLowerCase()}s match &ldquo;{query}&rdquo;
        </Text>
      ) : (
        <div ref={scrollParentRef} className="overflow-y-auto flex-1 min-h-0">
          <div
            style={{ height: virtualizer.getTotalSize() }}
            className="relative"
          >
            {virtualizer.getVirtualItems().map((virtualItem) => {
              const row = flatRows[virtualItem.index];
              return (
                <div
                  key={row.id}
                  data-index={virtualItem.index}
                  ref={virtualizer.measureElement}
                  style={{
                    position: "absolute",
                    top: 0,
                    left: 0,
                    width: "100%",
                    transform: `translateY(${virtualItem.start}px)`,
                  }}
                >
                  {row.kind === "volume" ? (
                    <button
                      type="button"
                      onClick={() => toggleVolume(row.volumeId)}
                      className={cn(
                        "w-full flex items-center gap-1 border-none text-xs font-semibold uppercase tracking-wider text-muted-foreground py-1",
                        "hover:text-foreground bg-transparent hover:bg-transparent rounded-none text-left",
                      )}
                    >
                      {row.expanded ? (
                        <ChevronDownIcon className="h-3 w-3 shrink-0" />
                      ) : (
                        <ChevronRightIcon className="h-3 w-3 shrink-0" />
                      )}
                      {row.displayName}
                    </button>
                  ) : (
                    <Link
                      href={`/${serialSlug}/chapter/${row.chapter.idx}`}
                      className="block rounded px-2 py-1 text-sm text-foreground/80 hover:bg-muted hover:text-foreground transition-colors no-underline"
                    >
                      {row.chapter.displayName}
                    </Link>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </nav>
  );
}
