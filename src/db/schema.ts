import {
  pgTable,
  pgEnum,
  serial,
  text,
  integer,
  boolean,
  timestamp,
  primaryKey,
  uniqueIndex,
} from "drizzle-orm/pg-core";

export const chapterTypeEnum = pgEnum("chapter_type", [
  "Chapter",
  "Episode",
  "Issue",
  "Part",
]);

export const volumeTypeEnum = pgEnum("volume_type", [
  "Volume",
  "Season",
  "Arc",
  "Book",
]);

export const serials = pgTable("serials", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  slug: text("slug").notNull().unique(),
  splashArtUrl: text("splash_art_url"),
  chapterType: chapterTypeEnum("chapter_type").notNull().default("Chapter"),
  volumeType: volumeTypeEnum("volume_type").notNull().default("Volume"),
});

export const serialAuthors = pgTable(
  "serial_authors",
  {
    serialId: integer("serial_id")
      .notNull()
      .references(() => serials.id),
    name: text("name").notNull(),
    displayOrder: integer("display_order").notNull(),
  },
  (t) => [primaryKey({ columns: [t.serialId, t.displayOrder] })],
);

export const volumes = pgTable("volumes", {
  id: serial("id").primaryKey(),
  serialId: integer("serial_id")
    .notNull()
    .references(() => serials.id),
  displayName: text("display_name").notNull(),
  idx: integer("idx").notNull(),
});

export const chapters = pgTable("chapters", {
  id: serial("id").primaryKey(),
  volumeId: integer("volume_id")
    .notNull()
    .references(() => volumes.id),
  displayName: text("display_name").notNull(),
  idx: integer("idx").notNull(),
});

/**
 * Wiki pages belonging directly to a serial.
 *
 * `name` is kept temporarily to seed `page_titles` entries; it will be
 * dropped in a later migration once data is migrated.
 *
 * `slug` is unique per serial and is used in URL routing.
 *
 * `introChapterId` is nullable for the serial's home page, which is created
 * before any chapters exist and is always visible regardless of cutoff.
 *
 * `isHomePage` marks the single automatically-created root page for a serial.
 * Every serial has exactly one home page.
 *
 * `deletedAt` supports soft-delete so that deleted pages can be restored. A
 * non-null value hides the page from readers and excludes it from search and
 * wiki-link resolution, but the row (and all its versioned content) is preserved.
 */
export const pages = pgTable(
  "pages",
  {
    id: serial("id").primaryKey(),
    serialId: integer("serial_id")
      .notNull()
      .references(() => serials.id),
    /** Kept temporarily; will be replaced by `page_titles` entries. */
    name: text("name").notNull(),
    slug: text("slug").notNull(),
    /** Null for the home page, which predates any chapters and is always visible. */
    introChapterId: integer("intro_chapter_id").references(() => chapters.id),
    /** True for the single automatically-created root page per serial. */
    isHomePage: boolean("is_home_page").notNull().default(false),
    /** Non-null when the page has been soft-deleted. Null for live pages. */
    deletedAt: timestamp("deleted_at"),
    /** Admin-supplied markdown reason for the deletion. Null when no reason was given. */
    deletionReason: text("deletion_reason"),
    /**
     * UUID generated on the new-page form mount and submitted with the creation
     * request. Uniqueness is enforced so that a network retry carrying the same
     * key hits the constraint, is caught server-side, and redirects to the
     * already-created page rather than inserting a duplicate.
     *
     * Null for the home page (created programmatically without a form) and for
     * pages created before this column was added.
     */
    idempotencyKey: text("idempotency_key").unique(),
  },
  (t) => [uniqueIndex("pages_serial_id_slug_idx").on(t.serialId, t.slug)],
);

/**
 * Temporal page titles - a page's display name can change over story
 * progression. Follows the same max-idx read pattern as section content.
 */
export const pageTitles = pgTable(
  "page_titles",
  {
    pageId: integer("page_id")
      .notNull()
      .references(() => pages.id),
    chapterId: integer("chapter_id")
      .notNull()
      .references(() => chapters.id),
    title: text("title").notNull(),
  },
  (t) => [primaryKey({ columns: [t.pageId, t.chapterId] })],
);

/**
 * Wall-clock versioned section structure per page.
 * Soft-deleted via `deleted_at`.
 */
export const pageSections = pgTable("page_sections", {
  id: serial("id").primaryKey(),
  pageId: integer("page_id")
    .notNull()
    .references(() => pages.id),
  name: text("name").notNull(),
  displayOrder: integer("display_order").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  deletedAt: timestamp("deleted_at"),
});

/**
 * Chapter-versioned section content.
 * Read pattern: max `chapters.idx` ≤ cutoff per `(page_id, section_id)`.
 */
export const pageSectionRevisions = pgTable(
  "page_section_revisions",
  {
    pageId: integer("page_id")
      .notNull()
      .references(() => pages.id),
    sectionId: integer("section_id")
      .notNull()
      .references(() => pageSections.id),
    chapterId: integer("chapter_id")
      .notNull()
      .references(() => chapters.id),
    content: text("content"),
  },
  (t) => [primaryKey({ columns: [t.pageId, t.sectionId, t.chapterId] })],
);

/**
 * Wall-clock versioned infobox rows per page.
 * Soft-deleted via `deleted_at`.
 */
export const pageInfoboxSections = pgTable("page_infobox_sections", {
  id: serial("id").primaryKey(),
  pageId: integer("page_id")
    .notNull()
    .references(() => pages.id),
  label: text("label").notNull(),
  displayOrder: integer("display_order").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  deletedAt: timestamp("deleted_at"),
});

/**
 * Chapter-versioned infobox row content.
 * Read pattern: max `chapters.idx` ≤ cutoff per `(page_id, infobox_section_id)`.
 */
export const pageInfoboxRevisions = pgTable(
  "page_infobox_revisions",
  {
    pageId: integer("page_id")
      .notNull()
      .references(() => pages.id),
    infoboxSectionId: integer("infobox_section_id")
      .notNull()
      .references(() => pageInfoboxSections.id),
    chapterId: integer("chapter_id")
      .notNull()
      .references(() => chapters.id),
    content: text("content"),
  },
  (t) => [primaryKey({ columns: [t.pageId, t.infoboxSectionId, t.chapterId] })],
);

/**
 * Chapter-versioned infobox image per page.
 * Read pattern: max `chapters.idx` ≤ cutoff per `page_id`.
 */
export const pageInfoboxImageRevisions = pgTable(
  "page_infobox_image_revisions",
  {
    pageId: integer("page_id")
      .notNull()
      .references(() => pages.id),
    chapterId: integer("chapter_id")
      .notNull()
      .references(() => chapters.id),
    imageUrl: text("image_url"),
  },
  (t) => [primaryKey({ columns: [t.pageId, t.chapterId] })],
);

/**
 * DAG edges between wiki pages.
 *
 * Each row is a snapshot; read the latest row per `(parent_page_id, child_page_id)`
 * where `chapter_idx <= cutoff` to determine whether the relationship is
 * currently active. `is_active = false` rows act as tombstones.
 */
export const pageRelationships = pgTable(
  "page_relationships",
  {
    parentPageId: integer("parent_page_id")
      .notNull()
      .references(() => pages.id),
    childPageId: integer("child_page_id")
      .notNull()
      .references(() => pages.id),
    chapterId: integer("chapter_id")
      .notNull()
      .references(() => chapters.id),
    isActive: boolean("is_active").notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.parentPageId, t.childPageId, t.chapterId] }),
  ],
);

/**
 * Reusable page templates per serial.
 * A template defines the section and infobox structure for a category of pages.
 */
export const templates = pgTable("templates", {
  id: serial("id").primaryKey(),
  serialId: integer("serial_id")
    .notNull()
    .references(() => serials.id),
  name: text("name").notNull(),
  hasInfobox: boolean("has_infobox").notNull().default(false),
});

/** Section slots defined by a template. */
export const templateSections = pgTable("template_sections", {
  id: serial("id").primaryKey(),
  templateId: integer("template_id")
    .notNull()
    .references(() => templates.id),
  name: text("name").notNull(),
  displayOrder: integer("display_order").notNull(),
});

/** Infobox row slots defined by a template. */
export const templateInfoboxSections = pgTable("template_infobox_sections", {
  id: serial("id").primaryKey(),
  templateId: integer("template_id")
    .notNull()
    .references(() => templates.id),
  label: text("label").notNull(),
  displayOrder: integer("display_order").notNull(),
});

/**
 * Serial-level registry of infobox row labels whose content is included in
 * page search. Replaces the per-template and per-page `include_in_search` flags.
 * PK is (serial_id, label) — one row per enabled label per serial.
 */
export const serialSearchableInfoboxLabels = pgTable(
  "serial_searchable_infobox_labels",
  {
    serialId: integer("serial_id")
      .notNull()
      .references(() => serials.id),
    label: text("label").notNull(),
  },
  (t) => [primaryKey({ columns: [t.serialId, t.label] })],
);

export const chapterSynopses = pgTable("chapter_synopses", {
  chapterId: integer("chapter_id")
    .primaryKey()
    .references(() => chapters.id),
  content: text("content").notNull().default(""),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const users = pgTable("users", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  name: text("name"),
  username: text("username").unique(),
  email: text("email").notNull().unique(),
  emailVerified: timestamp("email_verified", { mode: "date" }),
  image: text("image"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

/**
 * OAuth account rows managed by @auth/drizzle-adapter.
 *
 * Column property names use snake_case to match the names expected by the
 * DrizzleAdapter type contract (refresh_token, access_token, etc.). The
 * underlying DB column names are identical.
 */
export const accounts = pgTable(
  "accounts",
  {
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    type: text("type").notNull(),
    provider: text("provider").notNull(),
    providerAccountId: text("provider_account_id").notNull(),
    refresh_token: text("refresh_token"),
    access_token: text("access_token"),
    expires_at: integer("expires_at"),
    token_type: text("token_type"),
    scope: text("scope"),
    id_token: text("id_token"),
    session_state: text("session_state"),
  },
  (t) => [primaryKey({ columns: [t.provider, t.providerAccountId] })],
);

export const sessions = pgTable("sessions", {
  sessionToken: text("session_token").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  expires: timestamp("expires", { mode: "date" }).notNull(),
});

export const verificationTokens = pgTable(
  "verification_tokens",
  {
    identifier: text("identifier").notNull(),
    token: text("token").notNull(),
    expires: timestamp("expires", { mode: "date" }).notNull(),
  },
  (t) => [primaryKey({ columns: [t.identifier, t.token] })],
);

export const userProgress = pgTable(
  "user_progress",
  {
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    serialId: integer("serial_id")
      .notNull()
      .references(() => serials.id),
    chapterId: integer("chapter_id")
      .notNull()
      .references(() => chapters.id),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.serialId] })],
);

export const serialAdmins = pgTable(
  "serial_admins",
  {
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    serialId: integer("serial_id")
      .notNull()
      .references(() => serials.id, { onDelete: "cascade" }),
    grantedAt: timestamp("granted_at").notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.serialId] })],
);

/**
 * A user-submitted suggestion to change section content on a wiki page.
 * One suggestion can cover multiple sections via `page_suggestion_section_changes`.
 * Admin review is the only spoiler gate - no server-side content filtering.
 */
export const pageSuggestions = pgTable("page_suggestions", {
  id: serial("id").primaryKey(),
  pageId: integer("page_id")
    .notNull()
    .references(() => pages.id),
  proposedByUserId: text("proposed_by_user_id")
    .notNull()
    .references(() => users.id),
  targetChapterId: integer("target_chapter_id")
    .notNull()
    .references(() => chapters.id),
  status: text("status", { enum: ["pending", "approved", "rejected"] })
    .notNull()
    .default("pending"),
  /** A quote, timestamp, or chapter reference supporting all proposed changes in this suggestion. */
  citation: text("citation").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  reviewedAt: timestamp("reviewed_at"),
  reviewedByUserId: text("reviewed_by_user_id").references(() => users.id),
  reviewNote: text("review_note"),
});

/**
 * One row per section changed in a suggestion.
 * Unique per (suggestion, section) - a suggestion can only propose one change per section.
 */
export const pageSuggestionSectionChanges = pgTable(
  "page_suggestion_section_changes",
  {
    id: serial("id").primaryKey(),
    suggestionId: integer("suggestion_id")
      .notNull()
      .references(() => pageSuggestions.id, { onDelete: "cascade" }),
    sectionId: integer("section_id")
      .notNull()
      .references(() => pageSections.id),
    proposedContent: text("proposed_content").notNull(),
  },
  (t) => [uniqueIndex().on(t.suggestionId, t.sectionId)],
);

/**
 * One row per infobox row changed in a suggestion.
 * Unique per (suggestion, infobox_section) - one proposed value per row.
 */
export const pageSuggestionInfoboxChanges = pgTable(
  "page_suggestion_infobox_changes",
  {
    id: serial("id").primaryKey(),
    suggestionId: integer("suggestion_id")
      .notNull()
      .references(() => pageSuggestions.id, { onDelete: "cascade" }),
    infoboxSectionId: integer("infobox_section_id")
      .notNull()
      .references(() => pageInfoboxSections.id),
    proposedContent: text("proposed_content").notNull(),
  },
  (t) => [uniqueIndex().on(t.suggestionId, t.infoboxSectionId)],
);

/**
 * A user-submitted suggestion to update a chapter's synopsis text.
 * One pending suggestion per (user, chapter) - submitting again replaces the previous pending one.
 */
export const chapterSynopsisSuggestions = pgTable(
  "chapter_synopsis_suggestions",
  {
    id: serial("id").primaryKey(),
    chapterId: integer("chapter_id")
      .notNull()
      .references(() => chapters.id),
    serialId: integer("serial_id")
      .notNull()
      .references(() => serials.id),
    proposedByUserId: text("proposed_by_user_id")
      .notNull()
      .references(() => users.id),
    proposedContent: text("proposed_content").notNull(),
    citation: text("citation").notNull(),
    status: text("status", { enum: ["pending", "approved", "rejected"] })
      .notNull()
      .default("pending"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    reviewedAt: timestamp("reviewed_at"),
    reviewedByUserId: text("reviewed_by_user_id").references(() => users.id),
    reviewNote: text("review_note"),
  },
);
