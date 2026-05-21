"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { usePersistedStore } from "@/hooks/usePersistedStore";
import { Button } from "@/components/ui/Button";
import { Box } from "@/components/ui/Box";
import { Text } from "@/components/ui/Text";
import { Menu, MenuItem } from "@/components/ui/Menu";
import { Popover } from "@/components/ui/Popover";
import { BookmarkIcon, ExternalLinkIcon, XIcon } from "lucide-react";
import { ChapterData, Volume } from "@/types";
import { Tooltip } from "@/components/ui/Tooltip";
import { syncUserProgress } from "@/app/[serial]/actions";

interface Props {
  serialId: number;
  serialSlug: string;
  chapterType: string;
  volumes: Volume[];
  chaptersByVolume: Partial<Record<number, ChapterData[]>>;
  /**
   * Chapter ID sourced from the `user_progress` database row (for authenticated
   * users). When provided it seeds the initial selection, overriding any stale
   * localStorage value, so that progress is consistent across devices.
   */
  initialChapterId?: number | null;
  /** Whether the current visitor is signed in. Enables server-side progress sync. */
  isAuthenticated?: boolean;
}

function cookieName(serialId: number) {
  return `plotarmor_chapter_${serialId}`;
}

/**
 * Global key for the one-time spoiler popover. Once dismissed on any serial,
 * it never shows again across all serials.
 */
const GLOBAL_POPOVER_DISMISSED_KEY = "plotarmor:spoiler_popover_dismissed";

function volCollapsedKey(serialId: number) {
  return `plotarmor:vol-collapsed:${serialId}`;
}

/**
 * Chapter-progress selector that persists to localStorage and mirrors the
 * selection into a cookie so Server Components can read the cutoff without
 * waiting for hydration.
 *
 * On first visit globally (across all serials), a popover callout anchored
 * below the chapter button reminds the user to set their chapter. Dismisses
 * when the user picks a chapter or clicks the X.
 *
 * On wide screens renders an inline "Reading up to:" label + dropdown.
 * On narrow screens renders a book icon button that opens a bottom drawer.
 * An amber badge dot appears over the icon when the spoiler warning is active.
 *
 * @example
 * <ChapterSelector
 *   serialId={serial.id}
 *   serialSlug={serialSlug}
 *   chapterType={serial.chapterType}
 *   volumes={volumeList}
 *   chaptersByVolume={chaptersByVolume}
 * />
 */
export function ChapterSelector(props: Props) {
  const {
    serialId,
    serialSlug,
    chapterType,
    volumes,
    chaptersByVolume,
    initialChapterId,
    isAuthenticated,
  } = props;

  const allChapters = volumes
    .flatMap((v) => chaptersByVolume[v.id] ?? [])
    .sort((a, b) => a.idx - b.idx);

  const firstChapterId = allChapters[0]?.id ?? null;

  // When the server provides a DB-sourced chapter ID, use it as the default so
  // that progress from another device/session overrides the stale local value.
  const defaultChapterId = initialChapterId ?? firstChapterId;

  const [selectedChapterId, setSelectedChapterId] = usePersistedStore<
    number | null
  >(`plotarmor:progress:${serialId}`, defaultChapterId);

  // Single global key — once dismissed on any serial, never shows again.
  // suppressHydrationWarning: server renders closed (default=false),
  // client may have stored dismissed=true — intentional mismatch accepted.
  const [popoverDismissed, setPopoverDismissed] = usePersistedStore<boolean>(
    GLOBAL_POPOVER_DISMISSED_KEY,
    false,
  );

  const [volCollapsed, setVolCollapsed] = useCollapsedVolumes(serialId);

  const [dropdownOpen, setDropdownOpen] = useState(false);
  const triggerRef = useRef<HTMLDivElement>(null);

  const router = useRouter();

  function writeCookie(id: number) {
    document.cookie = `${cookieName(serialId)}=${id}; path=/; SameSite=Lax; Max-Age=${60 * 60 * 24 * 365}`;
  }

  useEffect(() => {
    const id = selectedChapterId ?? firstChapterId;
    if (id === null) return;
    writeCookie(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // When the server provides a DB-sourced initialChapterId, override localStorage
  // and sync the cookie so SSR sees the correct cutoff without waiting for a
  // chapter-change interaction.
  useEffect(() => {
    if (initialChapterId == null) return;
    setSelectedChapterId(initialChapterId);
    writeCookie(initialChapterId);
    // Only run once on mount when the server provides a DB value.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (allChapters.length === 0) return null;

  const effectiveChapterId = selectedChapterId ?? firstChapterId;
  const selectedChapter = allChapters.find((c) => c.id === effectiveChapterId);
  const selectedLabel = selectedChapter
    ? selectedChapter.displayName
    : `Select ${chapterType}`;

  function handleSelectChapter(chapterId: number) {
    setSelectedChapterId(chapterId);
    setPopoverDismissed(true);
    writeCookie(chapterId);
    setDropdownOpen(false);
    if (isAuthenticated) {
      // Fire-and-forget: persist progress to the database for cross-device sync.
      void syncUserProgress(serialId, chapterId);
    }
    router.refresh();
  }

  function dismissPopover() {
    setPopoverDismissed(true);
  }

  function toggleVolume(volumeId: number) {
    setVolCollapsed((prev) => ({
      ...prev,
      [volumeId]: !prev[volumeId],
    }));
  }

  const visibleVolumes = volumes.filter(
    (v) => (chaptersByVolume[v.id] ?? []).length > 0,
  );

  /** Shared chapter list rendered inside both the dropdown and the mobile drawer. */
  const chapterListContents = visibleVolumes.map((volume) => {
    const isCollapsed = !!volCollapsed[volume.id];
    const chaps = chaptersByVolume[volume.id] ?? [];
    return (
      <MenuItem
        key={volume.id}
        group
        label={volume.displayName}
        isOpen={!isCollapsed}
        onClick={() => toggleVolume(volume.id)}
      >
        {chaps.map((chapter) => (
          <MenuItem
            key={chapter.id}
            selected={chapter.id === effectiveChapterId}
            onClick={() => handleSelectChapter(chapter.id)}
            className="px-6"
          >
            <Box className="items-center justify-between gap-1 w-full">
              <Text as="span" variant="label" className="truncate">
                {chapter.displayName}
              </Text>
              <Link
                href={`/${serialSlug}/chapter/${chapter.idx}`}
                onClick={(e) => e.stopPropagation()}
                className="shrink-0 text-muted-foreground hover:text-foreground"
                aria-label={`View ${chapter.displayName} page`}
                title={`View ${chapter.displayName} page`}
              >
                <ExternalLinkIcon className="size-3" />
              </Link>
            </Box>
          </MenuItem>
        ))}
      </MenuItem>
    );
  });

  const spoilerCallout = (
    <Box className="items-start gap-2 px-3 py-2 text-sm">
      <Text variant="label" className="flex-1 leading-snug text-amber-800">
        We defaulted to the first {chapterType.toLowerCase()} to avoid spoilers.
        Set your {chapterType.toLowerCase()} here.
      </Text>
      <Tooltip content="Dismiss">
        <Button
          variant="ghost"
          size="icon-xs"
          onClick={dismissPopover}
          aria-label="Dismiss spoiler reminder"
          className="shrink-0 text-amber-600 hover:bg-amber-100 hover:text-amber-800"
        >
          <XIcon />
        </Button>
      </Tooltip>
    </Box>
  );

  return (
    <Box className="items-center">
      <div ref={triggerRef}>
        <Menu
          isOpen={dropdownOpen}
          onClose={() => setDropdownOpen(false)}
          align="right"
          role="listbox"
          aria-label="Chapter list"
          panelClassName="w-60 max-h-80"
          contents={chapterListContents}
        >
          <Tooltip content={`Set your ${chapterType}`} side="bottom">
            <Button
              variant="ghost"
              size="icon"
              className="sm:w-auto sm:px-2.5"
              aria-label={`Set ${chapterType} progress`}
              onClick={() => setDropdownOpen((o) => !o)}
            >
              <BookmarkIcon className="size-4" />
              <Text
                as="span"
                variant="label"
                className="hidden sm:inline truncate"
              >
                {selectedLabel}
              </Text>
            </Button>
          </Tooltip>
        </Menu>
      </div>

      {/*
       * suppressHydrationWarning: server renders open (popoverDismissed defaults
       * to false), but the client may have dismissed=true in localStorage.
       * Intentional mismatch — base-ui's Portal renders client-only anyway.
       */}
      <span suppressHydrationWarning>
        <Popover
          anchor={triggerRef}
          open={!popoverDismissed}
          onOpenChange={(open) => {
            if (!open) setPopoverDismissed(true);
          }}
          modal={false}
          side="bottom"
          align="end"
          className="w-64 border-amber-300 bg-amber-50 text-amber-800"
          content={spoilerCallout}
        />
      </span>
    </Box>
  );
}

const useCollapsedVolumes = (serialId: number) =>
  usePersistedStore<Record<number, boolean>>(volCollapsedKey(serialId), {});
