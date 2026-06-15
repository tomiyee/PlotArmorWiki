import Link from "next/link";
import { Text } from "@/components/ui/Text";
import { Box } from "@/components/ui/Box";
import type { ChapterRow as Chapter } from "@/types";

export interface PageOption {
  id: number;
  name: string;
  slug: string;
  introChapterId: number | null;
}

type SimilarPagesWarningProps = {
  /** The page name currently typed by the user. */
  name: string;
  /** URL slug of the serial — used to build links to visible similar pages. */
  serialSlug: string;
  /** All existing non-deleted pages in the serial. */
  existingPages: PageOption[];
  /** All chapters in the serial — used to resolve display names and idx ordering. */
  chapterList: Chapter[];
  /**
   * The idx of the user's reading-cutoff chapter. Pages introduced after this
   * are shown spoiler-free (name hidden).
   */
  cutoffIdx: number;
};

const SIMILARITY_MIN_CHARS = 4;

/**
 * Warns against creating a duplicate page by listing existing pages whose names
 * overlap with what the user is typing. Future pages (introduced past the user's
 * chapter cutoff) are shown without their name to avoid spoilers.
 *
 * Returns null when there are no similar pages, so callers need no visibility guard.
 */
export function SimilarPagesWarning(props: SimilarPagesWarningProps) {
  const { name, serialSlug, existingPages, chapterList, cutoffIdx } = props;

  const chapterIdxById = Object.fromEntries(chapterList.map((c) => [c.id, c.idx]));
  const chapterById = new Map(chapterList.map((c) => [c.id, c]));

  const trimmedName = name.trim();
  const similarPages =
    trimmedName.length >= SIMILARITY_MIN_CHARS
      ? existingPages.filter((p) => {
          const lower = p.name.toLowerCase();
          const query = trimmedName.toLowerCase();
          if (lower.length < SIMILARITY_MIN_CHARS) return false;
          return lower.includes(query) || query.includes(lower);
        })
      : [];

  if (similarPages.length === 0) return null;

  const visibleSimilarPages = similarPages.filter(
    (p) =>
      p.introChapterId === null ||
      (chapterIdxById[p.introChapterId] ?? 0) <= cutoffIdx,
  );
  const futureSimilarPages = similarPages.filter(
    (p) =>
      p.introChapterId !== null &&
      (chapterIdxById[p.introChapterId] ?? 0) > cutoffIdx,
  );

  return (
    <div className="mt-1 rounded-md border border-yellow-400 bg-yellow-50 dark:bg-yellow-950/30 dark:border-yellow-600 p-3">
      <Text
        variant="label"
        className="text-yellow-800 dark:text-yellow-300 text-xs mb-1"
      >
        Similar pages:
      </Text>
      <Box col className="gap-0.5">
        {visibleSimilarPages.map((p) => (
          <Link
            key={p.id}
            href={`/${serialSlug}/${p.slug}`}
            className="text-sm text-yellow-700 dark:text-yellow-400 hover:underline"
          >
            {p.name}
          </Link>
        ))}
        {futureSimilarPages.map((p) => (
          <Link
            key={p.id}
            href={`/${serialSlug}/${p.slug}`}
            className="text-sm text-yellow-700 dark:text-yellow-400 italic hover:underline"
          >
            A page introduced in{" "}
            {chapterById.get(p.introChapterId!)?.displayName ?? "a future chapter"}
          </Link>
        ))}
      </Box>
    </div>
  );
}
