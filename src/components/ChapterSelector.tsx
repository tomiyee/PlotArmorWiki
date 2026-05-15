"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { usePersistedStore } from "@/hooks/usePersistedStore";
import { Button } from "@/components/ui/button";
import { Box } from "@/components/ui/box";
import { Text } from "@/components/ui/text";
import { Menu, MenuItem } from "@/components/ui/menu";
import { Drawer } from "@base-ui/react/drawer";
import {
  ChevronDownIcon,
  ExternalLinkIcon,
  XIcon,
  BookOpenIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { ChapterData, Volume } from "@/types";
import { Tooltip } from "@/components/ui/tooltip";

interface Props {
  serialId: number;
  serialSlug: string;
  chapterType: string;
  volumes: Volume[];
  chaptersByVolume: Partial<Record<number, ChapterData[]>>;
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
  const { serialId, serialSlug, chapterType, volumes, chaptersByVolume } = props;

  const allChapters = volumes
    .flatMap((v) => chaptersByVolume[v.id] ?? [])
    .sort((a, b) => a.idx - b.idx);

  const firstChapterId = allChapters[0]?.id ?? null;

  const [selectedChapterId, setSelectedChapterId] = usePersistedStore<
    number | null
  >(`plotarmor:progress:${serialId}`, firstChapterId);

  // Single global key — once dismissed on any serial, never shows again.
  // suppressHydrationWarning: server renders closed (default=false),
  // client may have stored dismissed=true — intentional mismatch accepted.
  const [popoverDismissed, setPopoverDismissed] = usePersistedStore<boolean>(
    GLOBAL_POPOVER_DISMISSED_KEY,
    false,
  );

  const [volCollapsed, setVolCollapsed] = useCollapsedVolumes(serialId);

  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);

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
    setDrawerOpen(false);
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

  return (
    <>
      {/* ── Desktop (sm and up): inline label + dropdown with popover callout ── */}
      <Box col className="hidden sm:flex gap-1.5 justify-center">
        {/* Popover callout anchored below the chapter button */}
        {!popoverDismissed && (
          <div suppressHydrationWarning>
            <Box className="mb-1 items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-800 shadow-md max-w-64">
              <Text variant="label" className="flex-1 leading-snug text-amber-800">
                We defaulted to the first {chapterType.toLowerCase()} to avoid
                spoilers. Set your {chapterType.toLowerCase()} here.
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
          </div>
        )}

        <Box className="items-center gap-2">
          <Text variant="label" as="label" className="whitespace-nowrap text-sm">
            Reading up to:
          </Text>

          <Menu
            isOpen={dropdownOpen}
            onClose={() => setDropdownOpen(false)}
            align="right"
            role="listbox"
            aria-label="Chapter list"
            panelClassName="w-60 max-h-80"
            contents={chapterListContents}
          >
            <Button
              variant="outline"
              size="lg"
              onClick={() => setDropdownOpen((o) => !o)}
              aria-haspopup="listbox"
              aria-expanded={dropdownOpen}
              aria-label="Select chapter progress"
              className="w-52 justify-between px-3 border-input shadow-xs hover:bg-background aria-expanded:bg-background"
            >
              <Text as="span" variant="label" className="truncate">
                {selectedLabel}
              </Text>
              <ChevronDownIcon
                aria-hidden
                className={cn(
                  "size-4 shrink-0 text-muted-foreground transition-transform",
                  dropdownOpen && "rotate-180",
                )}
              />
            </Button>
          </Menu>
        </Box>
      </Box>

      {/* ── Mobile (below sm): icon button + bottom drawer ── */}
      <div className="relative sm:hidden" suppressHydrationWarning>
        <Drawer.Root
          open={drawerOpen}
          onOpenChange={setDrawerOpen}
          swipeDirection="down"
        >
          <Tooltip content={`Set your ${chapterType}`} side="bottom">
            <Drawer.Trigger
              render={
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={`Set ${chapterType} progress`}
                />
              }
            >
              <BookOpenIcon />
            </Drawer.Trigger>
          </Tooltip>

          {/* Badge dot: shown when the spoiler popover hasn't been dismissed yet */}
          {!popoverDismissed && (
            <span
              aria-hidden
              className="pointer-events-none absolute -top-0.5 -right-0.5 size-2.5 rounded-full bg-amber-400 ring-2 ring-background"
            />
          )}

          <Drawer.Portal>
            <Drawer.Backdrop className="fixed inset-0 z-40 bg-black/20 data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0 duration-200" />
            <Drawer.Popup className="fixed bottom-0 left-0 right-0 z-50 flex max-h-[85dvh] flex-col rounded-t-xl bg-background shadow-xl outline-none data-open:animate-in data-open:slide-in-from-bottom data-closed:animate-out data-closed:slide-out-to-bottom duration-300">
              {/* Drag handle */}
              <div className="mx-auto mt-3 h-1.5 w-10 shrink-0 rounded-full bg-muted" />

              {/* Header */}
              <Box className="items-center justify-between px-4 py-3 border-b">
                <Text variant="h4">Reading up to</Text>
                <Tooltip content="Close">
                  <Drawer.Close
                    render={
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        aria-label="Close chapter selector"
                      />
                    }
                  >
                    <XIcon />
                  </Drawer.Close>
                </Tooltip>
              </Box>

              {/* Spoiler callout inside the drawer — dismisses on chapter select */}
              {!popoverDismissed && (
                <div className="mx-4 mt-3 rounded-md border border-amber-300 bg-amber-50 px-3 py-2">
                  <Text variant="label" className="text-sm text-amber-800 leading-snug">
                    We defaulted to the first {chapterType.toLowerCase()} to
                    avoid spoilers. Set your {chapterType.toLowerCase()} here.
                  </Text>
                </div>
              )}

              {/* Chapter list */}
              <div className="flex-1 overflow-y-auto py-2">{chapterListContents}</div>
            </Drawer.Popup>
          </Drawer.Portal>
        </Drawer.Root>
      </div>
    </>
  );
}

const useCollapsedVolumes = (serialId: number) =>
  usePersistedStore<Record<number, boolean>>(volCollapsedKey(serialId), {});
