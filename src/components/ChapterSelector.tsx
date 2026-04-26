"use client";

import { useEffect } from "react";
import { usePersistedStore } from "@/hooks/usePersistedStore";
import { Select } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Box } from "@/components/ui/box";
import { Text } from "@/components/ui/text";
import { XIcon } from "lucide-react";

interface Chapter {
  id: number;
  displayName: string;
  idx: number;
  volumeId: number;
}

interface Volume {
  id: number;
  displayName: string;
}

interface Props {
  serialId: number;
  chapterType: string;
  volumes: Volume[];
  chaptersByVolume: Record<number, Chapter[]>;
}

/** Cookie name for storing the active chapter ID for a serial. */
function cookieName(serialId: number) {
  return `plotarmor_chapter_${serialId}`;
}

/** Key for tracking whether the user has explicitly set their chapter. */
function dismissedKey(serialId: number) {
  return `plotarmor:progress_set:${serialId}`;
}

/**
 * Inline chapter-progress selector that persists to localStorage and mirrors
 * the selection into a cookie so Server Components can read the cutoff without
 * waiting for hydration. Renders a dismissible first-visit callout prompting
 * the user to pick their chapter.
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
export function ChapterSelector({
  serialId,
  chapterType,
  volumes,
  chaptersByVolume,
}: Props) {
  // Collect all chapters in idx order to determine the default (first chapter).
  const allChapters = volumes
    .flatMap((v) => chaptersByVolume[v.id] ?? [])
    .sort((a, b) => a.idx - b.idx);

  const firstChapterId = allChapters[0]?.id ?? null;

  const [selectedChapterId, setSelectedChapterId] = usePersistedStore<number | null>(
    `plotarmor:progress:${serialId}`,
    firstChapterId,
  );

  // Callout is dismissed once the user has explicitly acknowledged it.
  // usePersistedStore returns the server snapshot (false) during SSR, so the
  // callout is hidden server-side and appears only after client hydration if
  // the user hasn't dismissed it yet — no additional mount guard needed.
  const [calloutDismissed, setCalloutDismissed] = usePersistedStore<boolean>(
    dismissedKey(serialId),
    false,
  );

  // Mirror the selected chapter ID into a cookie so Server Components can read it.
  useEffect(() => {
    const id = selectedChapterId ?? firstChapterId;
    if (id === null) return;
    document.cookie = `${cookieName(serialId)}=${id}; path=/; SameSite=Lax; Max-Age=${60 * 60 * 24 * 365}`;
  }, [selectedChapterId, firstChapterId, serialId]);

  if (allChapters.length === 0) return null;

  // Build grouped options for <Select>.
  const options = volumes
    .filter((v) => (chaptersByVolume[v.id] ?? []).length > 0)
    .map((v) => ({
      label: v.displayName,
      value: -v.id, // placeholder — not selectable
      children: (chaptersByVolume[v.id] ?? []).map((c) => ({
        label: `${chapterType} ${c.displayName}`,
        value: c.id,
      })),
    }));

  const effectiveChapterId = selectedChapterId ?? firstChapterId;

  function handleChange(chapterId: number) {
    setSelectedChapterId(chapterId);
    setCalloutDismissed(true);
  }

  function dismissCallout() {
    setCalloutDismissed(true);
  }

  return (
    <Box col className="gap-1.5">
      {/* First-visit callout. suppressHydrationWarning because the server always
          renders this as visible (defaultValue=false) while the client may have
          a stored dismissed=true in localStorage — a known intentional mismatch. */}
      <div suppressHydrationWarning>
        {!calloutDismissed && (
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
        )}
      </div>

      {/* Chapter select */}
      <Box className="items-center gap-2">
        <Text variant="label" as="label" className="whitespace-nowrap text-gray-200 text-sm">
          Reading up to:
        </Text>
        <Select<number>
          options={options}
          value={effectiveChapterId ?? undefined}
          onChange={handleChange}
          className="w-52"
          aria-label="Select chapter progress"
        />
      </Box>
    </Box>
  );
}
