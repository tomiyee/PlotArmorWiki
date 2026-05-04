"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { usePersistedStore } from "@/hooks/usePersistedStore";
import { Button } from "@/components/ui/button";
import { Box } from "@/components/ui/box";
import { Text } from "@/components/ui/text";
import { ChevronDownIcon, ChevronRightIcon, XIcon } from "lucide-react";
import { ChapterData, Volume } from "@/types";

interface Props {
  serialId: number;
  chapterType: string;
  volumes: Volume[];
  chaptersByVolume: Partial<Record<number, ChapterData[]>>;
}

/** Cookie name for storing the active chapter ID for a serial. */
function cookieName(serialId: number) {
  return `plotarmor_chapter_${serialId}`;
}

/** Key for tracking whether the user has explicitly set their chapter. */
function dismissedKey(serialId: number) {
  return `plotarmor:progress_set:${serialId}`;
}

/** Key for storing per-volume collapse state for a serial. */
function volCollapsedKey(serialId: number) {
  return `plotarmor:vol-collapsed:${serialId}`;
}

/**
 * Inline chapter-progress selector that persists to localStorage and mirrors
 * the selection into a cookie so Server Components can read the cutoff without
 * waiting for hydration. Renders a dismissible first-visit callout prompting
 * the user to pick their chapter.
 *
 * Each volume group is collapsible; collapse state is persisted per-serial in
 * localStorage under `plotarmor:vol-collapsed:{serialId}` as a Record<volumeId, boolean>.
 * Default state: all volumes expanded.
 *
 * Designed to be mounted inside the navbar when on a serial page.
 *
 * @example
 * <ChapterSelector
 *   serialId={serial.id}
 *   chapterType={serial.chapterType}
 *   volumes={volumeList}
 *   chaptersByVolume={chaptersByVolume}
 * />
 */
export function ChapterSelector(props: Props) {
  const { serialId, chapterType, volumes, chaptersByVolume } = props;

  // Collect all chapters in idx order to determine the default (first chapter).
  const allChapters = volumes
    .flatMap((v) => chaptersByVolume[v.id] ?? [])
    .sort((a, b) => a.idx - b.idx);

  const firstChapterId = allChapters[0]?.id ?? null;

  const [selectedChapterId, setSelectedChapterId] = usePersistedStore<
    number | null
  >(`plotarmor:progress:${serialId}`, firstChapterId);

  // Callout is dismissed once the user has explicitly acknowledged it.
  // usePersistedStore returns the server snapshot (false) during SSR, so the
  // callout is hidden server-side and appears only after client hydration if
  // the user hasn't dismissed it yet — no additional mount guard needed.
  const [calloutDismissed, setCalloutDismissed] = usePersistedStore<boolean>(
    dismissedKey(serialId),
    false,
  );

  const [volCollapsed, setVolCollapsed] = useCollapsedVolumes(serialId);

  // Dropdown open/close state (not persisted — resets on page navigation).
  const [dropdownOpen, setDropdownOpen] = useState(false);

  const dropdownRef = useRef<HTMLDivElement>(null);

  const router = useRouter();

  function writeCookie(id: number) {
    document.cookie = `${cookieName(serialId)}=${id}; path=/; SameSite=Lax; Max-Age=${60 * 60 * 24 * 365}`;
  }

  // Mirror the selected chapter ID into a cookie on mount so Server Components
  // can read the cutoff on the next navigation (initial hydration only).
  useEffect(() => {
    const id = selectedChapterId ?? firstChapterId;
    if (id === null) return;
    writeCookie(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Close dropdown when clicking outside.
  useEffect(() => {
    if (!dropdownOpen) return;
    function handleOutsideClick(e: MouseEvent) {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(e.target as Node)
      ) {
        setDropdownOpen(false);
      }
    }
    document.addEventListener("mousedown", handleOutsideClick);
    return () => document.removeEventListener("mousedown", handleOutsideClick);
  }, [dropdownOpen]);

  if (allChapters.length === 0) return null;

  const effectiveChapterId = selectedChapterId ?? firstChapterId;

  // Find the display name for the currently selected chapter.
  const selectedChapter = allChapters.find((c) => c.id === effectiveChapterId);
  const selectedLabel = selectedChapter
    ? `${chapterType} ${selectedChapter.displayName}`
    : "Select chapter";

  function handleSelectChapter(chapterId: number) {
    setSelectedChapterId(chapterId);
    setCalloutDismissed(true);
    // Set cookie synchronously before refresh so the server sees the new value.
    writeCookie(chapterId);
    setDropdownOpen(false);
    router.refresh();
  }

  function toggleVolume(volumeId: number) {
    setVolCollapsed((prev) => ({
      ...prev,
      [volumeId]: !prev[volumeId],
    }));
  }

  function dismissCallout() {
    setCalloutDismissed(true);
  }

  // Volumes that have at least one chapter.
  const visibleVolumes = volumes.filter(
    (v) => (chaptersByVolume[v.id] ?? []).length > 0,
  );

  return (
    <Box col className="gap-1.5 justify-center">
      {/* First-visit callout. suppressHydrationWarning because the server always
          renders this as visible (defaultValue=false) while the client may have
          a stored dismissed=true in localStorage — a known intentional mismatch. */}
      {!calloutDismissed && (
        <div suppressHydrationWarning>
          <Box className="mb-1 items-center gap-2 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-800">
            <Text variant="label" className="flex-1 text-amber-800">
              Set your chapter to avoid spoilers.
            </Text>
            <Button
              variant="ghost"
              size="icon-xs"
              onClick={dismissCallout}
              aria-label="Dismiss"
              className="text-amber-600 hover:bg-amber-100 hover:text-amber-800"
            >
              <XIcon />
            </Button>
          </Box>
        </div>
      )}

      {/* Chapter selector with collapsible volume groups */}
      <Box className="items-center gap-2">
        <Text variant="label" as="label" className="whitespace-nowrap text-sm">
          Reading up to:
        </Text>

        {/* Custom dropdown trigger + panel */}
        <div ref={dropdownRef} className="relative">
          {/* Trigger button — shows selected chapter */}
          <button
            type="button"
            onClick={() => setDropdownOpen((o) => !o)}
            aria-haspopup="listbox"
            aria-expanded={dropdownOpen}
            aria-label="Select chapter progress"
            className="flex h-9 w-52 items-center justify-between rounded-lg border border-input bg-background px-3 py-1 pr-8 text-sm shadow-xs outline-none transition-[color,box-shadow] focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 truncate"
          >
            <span className="truncate">{selectedLabel}</span>
            <ChevronDownIcon
              aria-hidden
              className="pointer-events-none absolute right-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
            />
          </button>

          {/* Dropdown panel */}
          {dropdownOpen && (
            <div
              role="listbox"
              aria-label="Chapter list"
              className="absolute right-0 top-full z-50 mt-1 w-60 max-h-80 overflow-y-auto rounded-lg border border-border bg-background shadow-md"
            >
              {/* TODO: Step 10 — apply same collapsible pattern to SerialTOC when it is implemented */}
              {visibleVolumes.map((volume) => {
                const isCollapsed = !!volCollapsed[volume.id];
                const chaps = chaptersByVolume[volume.id] ?? [];
                return (
                  <div key={volume.id}>
                    {/* Volume header — click to toggle collapse */}
                    <button
                      type="button"
                      onClick={() => toggleVolume(volume.id)}
                      className="flex w-full items-center gap-1.5 px-3 py-1.5 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground hover:bg-muted"
                    >
                      {isCollapsed ? (
                        <ChevronRightIcon
                          className="size-3 shrink-0"
                          aria-hidden
                        />
                      ) : (
                        <ChevronDownIcon
                          className="size-3 shrink-0"
                          aria-hidden
                        />
                      )}
                      {volume.displayName}
                    </button>

                    {/* Chapter list — hidden when volume is collapsed */}
                    {!isCollapsed && (
                      <ul>
                        {chaps.map((chapter) => {
                          const isSelected = chapter.id === effectiveChapterId;
                          return (
                            <li
                              key={chapter.id}
                              role="option"
                              aria-selected={isSelected}
                            >
                              <button
                                type="button"
                                onClick={() => handleSelectChapter(chapter.id)}
                                className={`w-full px-6 py-1.5 text-left text-sm hover:bg-muted ${
                                  isSelected
                                    ? "bg-primary/10 font-medium text-primary"
                                    : "text-foreground"
                                }`}
                              >
                                {chapterType} {chapter.displayName}
                              </button>
                            </li>
                          );
                        })}
                      </ul>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </Box>
    </Box>
  );
}

// Per-volume collapse state. Stored as Record<volumeId, boolean> where
// true means collapsed. Default: all volumes expanded (not in the record).
const useCollapsedVolumes = (serialId: number) =>
  usePersistedStore<Record<number, boolean>>(volCollapsedKey(serialId), {});
