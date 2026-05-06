"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { usePersistedStore } from "@/hooks/usePersistedStore";
import { Button } from "@/components/ui/button";
import { Box } from "@/components/ui/box";
import { Text } from "@/components/ui/text";
import { Menu, MenuItem } from "@/components/ui/menu";
import { ChevronDownIcon, ExternalLinkIcon, XIcon } from "lucide-react";
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

function dismissedKey(serialId: number) {
  return `plotarmor:progress_set:${serialId}`;
}

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
  const { serialId, serialSlug, chapterType, volumes, chaptersByVolume } = props;

  const allChapters = volumes
    .flatMap((v) => chaptersByVolume[v.id] ?? [])
    .sort((a, b) => a.idx - b.idx);

  const firstChapterId = allChapters[0]?.id ?? null;

  const [selectedChapterId, setSelectedChapterId] = usePersistedStore<
    number | null
  >(`plotarmor:progress:${serialId}`, firstChapterId);

  // suppressHydrationWarning: server always renders callout hidden (defaultValue=false),
  // client may have stored dismissed=true — intentional mismatch.
  const [calloutDismissed, setCalloutDismissed] = usePersistedStore<boolean>(
    dismissedKey(serialId),
    false,
  );

  const [volCollapsed, setVolCollapsed] = useCollapsedVolumes(serialId);

  const [open, setOpen] = useState(false);

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
    ? `${chapterType} ${selectedChapter.displayName}`
    : "Select chapter";

  function handleSelectChapter(chapterId: number) {
    setSelectedChapterId(chapterId);
    setCalloutDismissed(true);
    writeCookie(chapterId);
    setOpen(false);
    router.refresh();
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

  return (
    <Box col className="gap-1.5 justify-center">
      {!calloutDismissed && (
        <div suppressHydrationWarning>
          <Box className="mb-1 items-center gap-2 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-800">
            <Text variant="label" className="flex-1 text-amber-800">
              Set your chapter to avoid spoilers.
            </Text>
            <Tooltip content="Dismiss">
              <Button
                variant="ghost"
                size="icon-xs"
                onClick={() => setCalloutDismissed(true)}
                aria-label="Dismiss"
                className="text-amber-600 hover:bg-amber-100 hover:text-amber-800"
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
          isOpen={open}
          onClose={() => setOpen(false)}
          align="right"
          role="listbox"
          aria-label="Chapter list"
          panelClassName="w-60 max-h-80"
          contents={visibleVolumes.map((volume) => {
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
                        {chapterType} {chapter.displayName}
                      </Text>
                      <Link
                        href={`/${serialSlug}/chapter/${chapter.idx}`}
                        onClick={(e) => e.stopPropagation()}
                        className="shrink-0 text-muted-foreground hover:text-foreground"
                        aria-label={`View ${chapterType} ${chapter.displayName} page`}
                        title={`View ${chapterType} ${chapter.displayName} page`}
                      >
                        <ExternalLinkIcon className="size-3" />
                      </Link>
                    </Box>
                  </MenuItem>
                ))}
              </MenuItem>
            );
          })}
        >
          <Button
            variant="outline"
            size="lg"
            onClick={() => setOpen((o) => !o)}
            aria-haspopup="listbox"
            aria-expanded={open}
            aria-label="Select chapter progress"
            className="w-52 justify-between px-3 border-input shadow-xs hover:bg-background aria-expanded:bg-background"
          >
            <Text as="span" variant="label" className="truncate">{selectedLabel}</Text>
            <ChevronDownIcon
              aria-hidden
              className={cn(
                "size-4 shrink-0 text-muted-foreground transition-transform",
                open && "rotate-180",
              )}
            />
          </Button>
        </Menu>
      </Box>
    </Box>
  );
}

const useCollapsedVolumes = (serialId: number) =>
  usePersistedStore<Record<number, boolean>>(volCollapsedKey(serialId), {});
