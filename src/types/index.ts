/**
 * The possible lifecycle states of a user suggestion (page or synopsis).
 * Mirrors the Drizzle `text({ enum })` columns on `pageSuggestions.status`
 * and `chapterSynopsisSuggestions.status`.
 */
export type SuggestionStatus = "pending" | "approved" | "rejected";

// ── DAL return types ─────────────────────────────────────────────────────────
// One named type per distinct object shape returned by a DAL function.
// Exported from here so both the DAL (`src/data/`) and UI code import from one place.

/** Minimal serial fields — enough to render navigation and scope all /{serial}/… routes. */
export type SerialRow = {
  /** DB primary key. */
  id: number;
  /** Display title shown in the navbar and serial home page. */
  title: string;
  /** URL-safe slug used in all /{serial}/… routes. */
  slug: string;
  /** CDN URL for the serial's splash artwork; null when not uploaded. */
  splashArtUrl: string | null;
  /** Terminology for an individual chapter (e.g. "Episode" for anime, "Issue" for comics). */
  chapterType: "Chapter" | "Episode" | "Issue" | "Part";
  /** Terminology for a volume grouping (e.g. "Season" for anime, "Arc" for manga). */
  volumeType: "Volume" | "Season" | "Arc" | "Book";
};

/** A volume row scoped to the fields used by the chapter selector and TOC sidebar. */
export type VolumeRow = {
  /** DB primary key. */
  id: number;
  /** Human-readable name shown in the chapter selector accordion header (e.g. "Season 1"). */
  displayName: string;
  /** 1-based ordering integer within the serial; drives sort order in the selector. */
  idx: number;
  /** FK to the owning serial. */
  serialId: number;
};

/** Minimal volume fields returned by `fetchVolumeById` for chapter link previews. */
export type VolumeDisplayInfo = Pick<VolumeRow, "displayName">;

/**
 * A chapter row scoped to the fields used by the chapter selector and cutoff comparisons.
 * Previously exported as `ChapterData` from `@/types` — the two types are identical;
 * `ChapterRow` is the canonical name going forward.
 */
export type ChapterRow = {
  /** DB primary key; stored in the progress cookie to identify the reader's position. */
  id: number;
  /** Human-readable name shown in the chapter selector (e.g. "Episode 5"). */
  displayName: string;
  /** Global ordering integer; compared against `introChapterId.idx` for spoiler filtering. */
  idx: number;
  /** FK to the parent volume, used to group chapters under accordion headers. */
  volumeId: number;
};

/** Minimal chapter fields returned by `fetchChapterById` for spoiler-gate rendering. */
export type ChapterDisplayInfo = Pick<ChapterRow, "displayName" | "idx">;

/** Paired volumes and chapters for a serial, ready to pass to `<ChapterSelector>` and `<SerialTOCDrawer>`. */
export type SerialVolumesAndChapters = {
  volumeList: VolumeRow[];
  chapterList: ChapterRow[];
};

/** Resolved chapter cutoff for the current reader, derived from their progress cookie. */
export type ChapterCutoff = {
  /** Global chapter idx used as the upper bound in all chapter-versioned SQL subqueries. */
  cutoffIdx: number;
  /** The chapter DB id the reader is currently at; null when no progress cookie has been written yet. */
  readingChapterId: number | null;
};

/** A page stub with its intro chapter id, for the new-page parent dropdown and collision checks. */
export type SerialPageStub = Pick<WikiPageRow, "id" | "name" | "slug" | "introChapterId">;

/** Minimal page stub — enough to build option lists and wiki-link autocomplete entries. */
export type PageStub = Pick<WikiPageRow, "id" | "name" | "slug">;

/** A parent page stub with routing information, used to render breadcrumb links. */
export type ParentPageStub = Pick<WikiPageRow, "id" | "name" | "slug">;

/** Full wiki page row including soft-delete and idempotency fields. */
export type WikiPageRow = {
  /** DB primary key. */
  id: number;
  /** Canonical (creation-time) name; displayed before any chapter-versioned title revision exists. */
  name: string;
  /** URL-safe slug used in the /{serial}/{slug} route. */
  slug: string;
  /** FK to the owning serial. */
  serialId: number;
  /** FK to the chapter that introduced this page; null for the home page (always visible). */
  introChapterId: number | null;
  /** True only for the one home page per serial, which bypasses spoiler filtering. */
  isHomePage: boolean;
  /** Timestamp set when an admin soft-deletes the page; null while the page is live. */
  deletedAt: Date | null;
  /** Admin-supplied reason recorded alongside the soft-delete timestamp. */
  deletionReason: string | null;
  /** Idempotency token set on the create request to prevent double-inserts on network retry. */
  idempotencyKey: string | null;
};

/** A content section belonging to a page template. */
export type TemplateSectionRow = {
  /** FK to the parent template; used to group sections after the parallel fetch. */
  templateId: number;
  /** DB primary key. */
  id: number;
  /** Heading used for this section in the new-page form and the page editor. */
  name: string;
  /** 0-based position within the template; drives render order. */
  displayOrder: number;
};

/** An infobox row belonging to a page template. */
export type TemplateInfoboxSectionRow = {
  /** FK to the parent template; used to group rows after the parallel fetch. */
  templateId: number;
  /** DB primary key. */
  id: number;
  /** Label displayed as the row's key in the infobox sidebar (e.g. "Author", "Status"). */
  label: string;
  /** 0-based position within the template's infobox; drives render order. */
  displayOrder: number;
};

/** A template with its section and infobox row children, as returned by `fetchSerialTemplates`. */
export type TemplateSummary = {
  /** DB primary key. */
  id: number;
  /** Human-readable name shown in the template picker (e.g. "Character", "Location"). */
  name: string;
  /** Whether applying this template adds an infobox panel to the page. */
  hasInfobox: boolean;
  /** Ordered list of body sections this template contributes. */
  sections: TemplateSectionRow[];
  /** Ordered list of infobox rows this template contributes; empty when `hasInfobox` is false. */
  infoboxSections: TemplateInfoboxSectionRow[];
};

/** A serial admin record joined with their username, for the admin management panel. */
export type SerialAdminStub = {
  /** Auth.js user id (UUID string). */
  userId: string;
  /** Display username chosen during onboarding; null for accounts that skipped onboarding. */
  username: string | null;
};

/** A soft-deleted page row returned for the admin restore panel. */
export type DeletedPageStub = {
  /** DB primary key. */
  id: number;
  /** Canonical (creation-time) name. */
  name: string;
  /** URL-safe slug. */
  slug: string;
  /** Timestamp when an admin soft-deleted this page. */
  deletedAt: Date;
  /** Admin-supplied reason recorded alongside the soft-delete; null when omitted. */
  deletionReason: string | null;
};

/**
 * A page section with its chapter-versioned content at a given reading position.
 * Combines the wall-clock-versioned structure (id, name, displayOrder) with the
 * chapter-versioned content (content, lastUpdatedChapterIdx).
 */
export type PageSectionAtIdx = {
  /** DB primary key. */
  id: number;
  /** Section heading. */
  name: string;
  /** 0-based render order within the page. */
  displayOrder: number;
  /** Markdown body at the reader's cutoff; empty string when no revision exists yet. */
  content: string;
  /** The chapter idx of the revision that supplied `content`; null when no revision exists. */
  lastUpdatedChapterIdx: number | null;
};

/** A single infobox row as defined by the page structure (wall-clock versioned). */
export type InfoboxSectionStructure = {
  /** DB primary key. */
  id: number;
  /** Row label shown as the infobox key (e.g. "Author", "Status"). */
  label: string;
  /** 0-based render order within the infobox. */
  displayOrder: number;
};

/** An infobox row with its chapter-versioned content at a given reading position. */
export type InfoboxRowAtIdx = {
  /** DB primary key (matches the corresponding InfoboxSectionStructure.id). */
  id: number;
  /** Row label shown as the infobox key. */
  label: string;
  /** Markdown content at the reader's cutoff; empty string when no revision exists yet. */
  content: string;
};

/**
 * Combined infobox data for a page at a given reading position.
 * `floaterImageUrl` is `undefined` when the page has no infobox rows at all,
 * `null` when rows exist but no image has been uploaded, and a URL string otherwise.
 */
export type PageInfoboxAtIdx = {
  /** Wall-clock-versioned row structure for the edit-mode panel. */
  structure: InfoboxSectionStructure[];
  /** CDN URL of the floater image; undefined = no infobox, null = infobox but no image. */
  floaterImageUrl: string | null | undefined;
  /** Chapter-versioned row content for rendering. */
  rows: InfoboxRowAtIdx[];
};

/** A child page with its chapter-versioned title and sub-page indicator, for the sub-pages list. */
export type ChildPageStub = {
  /** DB primary key. */
  id: number;
  /** Canonical (creation-time) name; used as fallback when no chapter-versioned title exists. */
  name: string;
  /** URL-safe slug. */
  slug: string;
  /** Chapter-versioned display title at the reader's cutoff; falls back to name. */
  title: string;
  /** True when this page itself has at least one active child at the reader's cutoff. */
  hasChildren: boolean;
};

/** A temporal title entry for the edit-mode titles panel, with a human-readable chapter label. */
export type PageTitleEntry = {
  /** FK to the chapter that introduced this title revision. */
  chapterId: number;
  /** "VolumeName - ChapterName" label for the titles panel dropdown. */
  chapterLabel: string;
  /** The title string at this chapter. */
  title: string;
};

/** Title entries for a page up to a reading position, paired with the resolved display title. */
export type PageTitlesAtIdx = {
  /** All title entries at or before the reader's cutoff, ordered by chapter idx ascending. */
  entries: PageTitleEntry[];
  /** The title the reader should see: the entry with the highest chapter idx ≤ cutoff. Null when no entry exists. */
  resolvedTitle: string | null;
};

/** All data needed to render the new-page creation form for a serial. */
export type NewPageFormData = {
  volumeList: VolumeRow[];
  chapterList: ChapterRow[];
  existingPages: SerialPageStub[];
  serialTemplates: TemplateSummary[];
};

// ── Navbar / layout types ────────────────────────────────────────────────────

export interface CategoryNavData {
  id: number;
  name: string;
  slug: string;
}

export interface NavbarSerialData {
  serialSlug: string;
  serialTitle: string;
  categories: CategoryNavData[];
  /** True when the current viewer is a serial admin; gates the "+ Page" create option in search. */
  isAdmin: boolean;
}

// ── Display-only narrower types ───────────────────────────────────────────────
// These omit DB-internal fields (e.g. serialId) that UI components don't need.

/**
 * Volume fields needed for display components (chapter selector, TOC sidebar).
 * A `VolumeRow` is always assignable here; use `VolumeRow` at the DAL boundary.
 */
export interface Volume {
  id: number;
  displayName: string;
  idx: number;
}
