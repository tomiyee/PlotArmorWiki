"use client";

import Link from "next/link";
import {
  Accordion,
  AccordionItem,
  AccordionTrigger,
  AccordionContent,
} from "@/components/ui/Accordion";
import { Text } from "@/components/ui/Text";
import { usePersistedStore } from "@/hooks/usePersistedStore";
import { ChapterData, Volume } from "@/types";

interface Props {
  serialId: number;
  serialSlug: string;
  volumes: Volume[];
  chaptersByVolume: Partial<Record<number, ChapterData[]>>;
  chapterType: string;
  volumeType: string;
}

/**
 * Collapsible table-of-contents listing volumes and their chapters. Collapse
 * state is persisted per-serial via localStorage (same key as SerialEditor),
 * so opening/closing volumes here stays in sync with the editor dialog.
 * Used as the body of the desktop sidebar and the mobile navbar drawer.
 *
 * @example
 * <SerialTOC
 *   serialId={serial.id}
 *   serialSlug="my-serial"
 *   volumes={volumeList}
 *   chaptersByVolume={chaptersByVolume}
 *   chapterType="Chapter"
 *   volumeType="Volume"
 * />
 */
export function SerialTOC({
  serialId,
  serialSlug,
  volumes,
  chaptersByVolume,
  chapterType,
  volumeType: _volumeType,
}: Props) {
  const [volCollapsed, setVolCollapsed] = usePersistedStore<
    Record<number, boolean>
  >(`plotarmor:toc-collapsed:${serialId}`, {});

  const visibleVolumes = volumes.filter(
    (v) => (chaptersByVolume[v.id] ?? []).length > 0,
  );

  if (visibleVolumes.length === 0) {
    return (
      <Text muted className="text-sm">
        No {chapterType.toLowerCase()}s yet — add your first one below.
      </Text>
    );
  }

  // Accordion expects the list of open (non-collapsed) item values.
  const openIds = visibleVolumes
    .filter((v) => !volCollapsed[v.id])
    .map((v) => v.id);

  function handleValueChange(newValues: number[]) {
    setVolCollapsed(() => {
      const next: Record<number, boolean> = {};
      visibleVolumes.forEach((v) => {
        if (!newValues.includes(v.id)) next[v.id] = true;
      });
      return next;
    });
  }

  return (
    <nav aria-label="Table of contents">
      <Accordion
        value={openIds}
        onValueChange={handleValueChange}
        multiple
        className="gap-0"
      >
        {visibleVolumes.map((volume) => {
          const chaps = chaptersByVolume[volume.id] ?? [];
          return (
            <AccordionItem
              key={volume.id}
              value={volume.id}
              className="border-none"
            >
              <AccordionTrigger className="border-none text-xs font-semibold uppercase tracking-wider text-muted-foreground py-1 hover:no-underline hover:text-foreground bg-transparent hover:bg-transparent rounded-none">
                {volume.displayName}
              </AccordionTrigger>
              <AccordionContent className="[&_a]:no-underline [&_a]:hover:text-foreground pb-0">
                <ul className="space-y-0.5 mb-2">
                  {chaps.map((chapter) => (
                    <li key={chapter.id}>
                      <Link
                        href={`/${serialSlug}/chapter/${chapter.idx}`}
                        className="block rounded px-2 py-1 text-sm text-foreground/80 hover:bg-muted hover:text-foreground transition-colors"
                      >
                        {chapter.displayName}
                      </Link>
                    </li>
                  ))}
                </ul>
              </AccordionContent>
            </AccordionItem>
          );
        })}
      </Accordion>
    </nav>
  );
}
