/**
 * The possible lifecycle states of a user suggestion (page or synopsis).
 * Mirrors the Drizzle `text({ enum })` columns on `pageSuggestions.status`
 * and `chapterSynopsisSuggestions.status`.
 */
export type SuggestionStatus = "pending" | "approved" | "rejected";

export interface ChapterData {
  id: number;
  displayName: string;
  idx: number;
  volumeId: number;
}

export interface Volume {
  id: number;
  displayName: string;
  idx: number;
}

export interface CategoryNavData {
  id: number;
  name: string;
  slug: string;
}

export interface NavbarSerialData {
  serialSlug: string;
  serialTitle: string;
  categories: CategoryNavData[];
}
