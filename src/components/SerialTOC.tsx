import Link from "next/link";
import { Text } from "@/components/ui/text";
import { ChapterData, Volume } from "@/types";

interface Props {
  serialSlug: string;
  volumes: Volume[];
  chaptersByVolume: Partial<Record<number, ChapterData[]>>;
  chapterType: string;
  volumeType: string;
}

/**
 * Static table-of-contents listing volumes and their chapters. Used as a
 * sticky left sidebar on wide screens; the same markup is also rendered inside
 * the mobile drawer. It is a Server Component — no client-side state.
 *
 * @example
 * <SerialTOC
 *   serialSlug="my-serial"
 *   volumes={volumeList}
 *   chaptersByVolume={chaptersByVolume}
 *   chapterType="Chapter"
 *   volumeType="Volume"
 * />
 */
export function SerialTOC({
  serialSlug,
  volumes,
  chaptersByVolume,
  chapterType,
  volumeType,
}: Props) {
  const visibleVolumes = volumes.filter(
    (v) => (chaptersByVolume[v.id] ?? []).length > 0,
  );

  if (visibleVolumes.length === 0) {
    return (
      <Text muted className="text-sm">
        No {chapterType.toLowerCase()}s yet.
      </Text>
    );
  }

  return (
    <nav aria-label="Table of contents">
      <ul className="space-y-3">
        {visibleVolumes.map((volume) => {
          const chaps = chaptersByVolume[volume.id] ?? [];
          return (
            <li key={volume.id}>
              <Text
                variant="label"
                className="block text-xs font-semibold uppercase tracking-wider text-gray-500 mb-1"
              >
                {volumeType} {volume.displayName}
              </Text>
              <ul className="space-y-0.5">
                {chaps.map((chapter) => (
                  <li key={chapter.id}>
                    <Link
                      href={`/${serialSlug}`}
                      className="block rounded px-2 py-1 text-sm text-gray-700 hover:bg-gray-100 hover:text-gray-900 transition-colors"
                    >
                      {chapterType} {chapter.displayName}
                    </Link>
                  </li>
                ))}
              </ul>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
