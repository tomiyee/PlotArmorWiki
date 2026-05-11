import {
  pgTable,
  pgEnum,
  serial,
  text,
  integer,
  boolean,
  timestamp,
  primaryKey,
} from 'drizzle-orm/pg-core';

export const chapterTypeEnum = pgEnum('chapter_type', [
  'Chapter',
  'Episode',
  'Issue',
  'Part',
]);

export const volumeTypeEnum = pgEnum('volume_type', [
  'Volume',
  'Season',
  'Arc',
  'Book',
]);

export const serials = pgTable('serials', {
  id: serial('id').primaryKey(),
  title: text('title').notNull(),
  slug: text('slug').notNull().unique(),
  description: text('description'),
  splashArtUrl: text('splash_art_url'),
  chapterType: chapterTypeEnum('chapter_type').notNull().default('Chapter'),
  volumeType: volumeTypeEnum('volume_type').notNull().default('Volume'),
});

export const serialAuthors = pgTable(
  'serial_authors',
  {
    serialId: integer('serial_id')
      .notNull()
      .references(() => serials.id),
    name: text('name').notNull(),
    displayOrder: integer('display_order').notNull(),
  },
  (t) => [primaryKey({ columns: [t.serialId, t.displayOrder] })],
);

export const volumes = pgTable('volumes', {
  id: serial('id').primaryKey(),
  serialId: integer('serial_id')
    .notNull()
    .references(() => serials.id),
  displayName: text('display_name').notNull(),
  idx: integer('idx').notNull(),
});

export const chapters = pgTable('chapters', {
  id: serial('id').primaryKey(),
  volumeId: integer('volume_id')
    .notNull()
    .references(() => volumes.id),
  displayName: text('display_name').notNull(),
  idx: integer('idx').notNull(),
});

export const pageCategories = pgTable('page_categories', {
  id: serial('id').primaryKey(),
  serialId: integer('serial_id')
    .notNull()
    .references(() => serials.id),
  name: text('name').notNull(),
  body: text('body'),
  hasFloater: boolean('has_floater').notNull().default(false),
});

export const categorySections = pgTable('category_sections', {
  id: serial('id').primaryKey(),
  categoryId: integer('category_id')
    .notNull()
    .references(() => pageCategories.id),
  name: text('name').notNull(),
  displayOrder: integer('display_order').notNull(),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  deletedAt: timestamp('deleted_at'),
});

export const categoryFloaterRows = pgTable('category_floater_rows', {
  id: serial('id').primaryKey(),
  categoryId: integer('category_id')
    .notNull()
    .references(() => pageCategories.id),
  label: text('label').notNull(),
  displayOrder: integer('display_order').notNull(),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  deletedAt: timestamp('deleted_at'),
});

export const pages = pgTable('pages', {
  id: serial('id').primaryKey(),
  categoryId: integer('category_id')
    .notNull()
    .references(() => pageCategories.id),
  name: text('name').notNull(),
  introChapterId: integer('intro_chapter_id')
    .notNull()
    .references(() => chapters.id),
});

export const pageSectionVersions = pgTable(
  'page_section_versions',
  {
    pageId: integer('page_id')
      .notNull()
      .references(() => pages.id),
    sectionId: integer('section_id')
      .notNull()
      .references(() => categorySections.id),
    chapterId: integer('chapter_id')
      .notNull()
      .references(() => chapters.id),
    content: text('content').notNull().default(''),
  },
  (t) => [primaryKey({ columns: [t.pageId, t.sectionId, t.chapterId] })],
);

export const pageFloaterVersions = pgTable(
  'page_floater_versions',
  {
    pageId: integer('page_id')
      .notNull()
      .references(() => pages.id),
    chapterId: integer('chapter_id')
      .notNull()
      .references(() => chapters.id),
    imageUrl: text('image_url'),
  },
  (t) => [primaryKey({ columns: [t.pageId, t.chapterId] })],
);

export const pageFloaterRowVersions = pgTable(
  'page_floater_row_versions',
  {
    pageId: integer('page_id')
      .notNull()
      .references(() => pages.id),
    floaterRowId: integer('floater_row_id')
      .notNull()
      .references(() => categoryFloaterRows.id),
    chapterId: integer('chapter_id')
      .notNull()
      .references(() => chapters.id),
    content: text('content').notNull().default(''),
  },
  (t) => [primaryKey({ columns: [t.pageId, t.floaterRowId, t.chapterId] })],
);

export const pageSummaries = pgTable(
  'page_summaries',
  {
    pageId: integer('page_id')
      .notNull()
      .references(() => pages.id),
    chapterId: integer('chapter_id')
      .notNull()
      .references(() => chapters.id),
    content: text('content').notNull().default(''),
  },
  (t) => [primaryKey({ columns: [t.pageId, t.chapterId] })],
);

export const chapterSynopses = pgTable('chapter_synopses', {
  chapterId: integer('chapter_id')
    .primaryKey()
    .references(() => chapters.id),
  content: text('content').notNull().default(''),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

export const users = pgTable('users', {
  id: text('id')
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  name: text('name'),
  username: text('username').unique(),
  email: text('email').notNull().unique(),
  emailVerified: timestamp('email_verified', { mode: 'date' }),
  image: text('image'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

export const accounts = pgTable(
  'accounts',
  {
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    type: text('type').notNull(),
    provider: text('provider').notNull(),
    providerAccountId: text('provider_account_id').notNull(),
    refreshToken: text('refresh_token'),
    accessToken: text('access_token'),
    expiresAt: integer('expires_at'),
    tokenType: text('token_type'),
    scope: text('scope'),
    idToken: text('id_token'),
    sessionState: text('session_state'),
  },
  (t) => [primaryKey({ columns: [t.provider, t.providerAccountId] })],
);

export const sessions = pgTable('sessions', {
  sessionToken: text('session_token').primaryKey(),
  userId: text('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  expires: timestamp('expires', { mode: 'date' }).notNull(),
});

export const verificationTokens = pgTable(
  'verification_tokens',
  {
    identifier: text('identifier').notNull(),
    token: text('token').notNull(),
    expires: timestamp('expires', { mode: 'date' }).notNull(),
  },
  (t) => [primaryKey({ columns: [t.identifier, t.token] })],
);

export const userProgress = pgTable(
  'user_progress',
  {
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    serialId: integer('serial_id')
      .notNull()
      .references(() => serials.id),
    chapterId: integer('chapter_id')
      .notNull()
      .references(() => chapters.id),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.serialId] })],
);

export const serialAdmins = pgTable(
  'serial_admins',
  {
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    serialId: integer('serial_id')
      .notNull()
      .references(() => serials.id, { onDelete: 'cascade' }),
    grantedAt: timestamp('granted_at').notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.serialId] })],
);
