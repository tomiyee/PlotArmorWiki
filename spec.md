# PlotArmor — Design Spec

**PlotArmor** is a wiki platform for serial entertainment (books, TV shows, etc.) that protects readers from spoilers by only surfacing information up to a chapter they choose.

Standard wikis always show the latest state of any character, location, or other entry. This is a problem for readers mid-series: looking something up exposes them to events they haven't reached yet. PlotArmor solves this by treating every piece of wiki content as a time series tied to specific chapters, so the wiki can render a "snapshot" of the world as of any point in the story.

---

## Vocabulary

| Term         | Definition                                                               |
| ------------ | ------------------------------------------------------------------------ |
| **Serial**   | The story a wiki covers (a book series, TV show, etc.)                   |
| **Audience** | A reader or viewer consuming the series                                  |
| **Chapter**  | A single installment of the series (episode, book chapter, volume, etc.) |

---

## Concepts

### URL Structure

Wiki pages follow a consistent URL pattern:

```
/{serial}/{schema}           # schema index: name, description, page list
/{serial}/{schema}/{page-name}
```

The root path `/` serves the home page (see below).

### Home Page

The home page is the entry point for users who are not navigating directly to a wiki. It provides:

- **Search** — a search bar for finding existing serial wikis by name.
- **Wiki creation** — users can create a new wiki if one does not already exist for a given serial. This is expected to be an uncommon action.

### Serial

A serial is the top-level container for a wiki. It has the following properties:

- **Title** — the name of the serial.
- **Authors** — one or more creators of the serial (writer, showrunner, etc.).
- **Description** — a spoiler-free summary of the serial, similar in style to a Netflix synopsis. This is a social convention; the system does not enforce it.
- **Splash art** _(optional)_ — a cover or banner image representing the serial.

### Schema

A schema defines a *type* of wiki page within a serial — for example, a serial might have a Character schema and a Location schema. Every wiki page belongs to exactly one schema, and all pages of that schema share the same structure.

Schemas are serial-specific: a serial can have many schemas, and each schema belongs to exactly one serial.

A schema has an optional **description** (`body`) — a markdown text field shown on the schema index page (`/{serial}/{schema}`) explaining what this category covers (e.g. "Characters introduced throughout the series").

Every wiki page has the following required system property, regardless of schema:

- **Introduction chapter** — the chapter in which the subject is first introduced in the serial. Used to determine whether the page is visible to a given user.

A schema also defines two structural components for its pages:

- **Body** — an ordered list of named sections. Each section stores Markdown text.
- **Floater** _(optional)_ — a sidebar panel that floats in the top-right of the page, containing:
  - A header
  - An image URL
  - An arbitrary list of rows, where each row is a string or a list of tags/strings

### Chapters

Chapters are the atomic unit of progression in a serial. Key properties:

- Each chapter has a **display name** as it appears in the series (e.g., "Episode 4", "Act II", "Chapter 12").
- Each chapter is assigned an **internal index** for sorting.
- Not every series uses well-structured numbering, so the display name is always stored separately from the index.

### Chapter Revisions

All wiki page attributes are stored as a **time series**: every value is associated with the chapter in which it was introduced or last changed.

This is the core mechanism behind spoiler protection — when an audience member sets their chapter cutoff, the system renders only attribute values from chapters at or before that point.

### Spoiler-Aware Navigation

All links and search results are filtered through the user's current progress state.

**Blocked pages**
If a user navigates to or follows a link to a page whose introduction chapter is beyond their current progress, the page content is hidden entirely. In its place, a message is shown:

> *"This [page type] is introduced in [chapter name]. This page is hidden to prevent spoilers."*

The page's title is also withheld to avoid revealing names the user has not yet encountered.

**Search**
Search results exclude any pages whose introduction chapter is beyond the user's current progress. Those pages are invisible to the user as if they do not exist.

### User Progress State

A user's current chapter is their **progress state** for a given serial. It acts as the cutoff for all spoiler-protected rendering on that wiki.

**Setting the chapter**
The navbar exposes a chapter selector (menu or icon) on every wiki page. The user can open it at any time to change their current chapter for that serial.

**First-time visitors**
A user visiting a serial wiki for the first time defaults to the first chapter. A temporary callout is displayed to inform them of this default and prompt them to select the chapter they are actually on.

**Persistence**

- _Anonymous users_ — progress state is saved in browser storage (localStorage) per serial. Selections persist across sessions on the same device/browser.
- _Logged-in users_ — the selected chapter is saved to their account per serial. When they return or log in, their last saved chapter is restored automatically.

---

## Data Model

### Versioning Strategy

All wiki page content is stored using **single-timestamp versioning**. Every versioned row carries a `chapter_id` — the chapter when that content was introduced or last changed. There is at most one revision per `(page, section, chapter)` tuple; the primary key enforces this.

Schema structure (sections, floater rows) and page content are versioned on separate axes:

- **Schema structure** — versioned by wall-clock time (`created_at` / `deleted_at`). Changes take effect immediately for all editors.
- **Page content** — versioned by chapter identity. Readers see only content from chapters at or before their progress cutoff.

Each section and floater row has a **stable ID** so that content rows survive renames and reordering of schema attributes without modification.

**Read rule**: To read a content value as of the user's cutoff chapter (idx N), find the revision for that dimension with the highest `chapter.idx` that is ≤ N:

```sql
SELECT ... FROM page_section_versions
JOIN chapters ON chapter_id = chapters.id
WHERE page_id = ? AND chapters.idx <= N
GROUP BY section_id
HAVING chapters.idx = MAX(chapters.idx)
```

**Chapter reordering**: Because revisions are keyed by `chapter_id` (not `chapters.idx`), reassigning `idx` during a reorder has no effect on which revision is "latest at or before" a given chapter — revisions naturally follow their chapter's new position. No post-reorder repair step is needed.

**User progress follows chapter identity, not position**: Anonymous progress is stored as a chapter ID (not an idx). If a user sets their cutoff to "Book 2, Chapter 3" and the author later inserts an earlier chapter before it, the user's cutoff chapter ID is unchanged — they are now implicitly past the new chapter too. This is intentional: a new chapter inserted before the user's current position is assumed to have been read, since the user self-reported being at the later chapter.

**Introduction chapter follows chapter identity**: `pages.intro_chapter_id` stores a chapter ID. If that chapter is reordered to a later position, the page becomes visible to fewer users; if moved earlier, it becomes visible to more. This is intentional — the author is making a structural correction to when the subject was first introduced, and visibility should follow that correction.

### SCD Write Path

Edits always write at the **head chapter** — the latest chapter in the serial — so fully-caught-up readers see changes immediately. For each versioned dimension being saved:

1. Find the currently-open row (`to_chapter_id IS NULL`).
2. If the open row's `from_chapter_id` already equals the head chapter ID, update it in-place (no new version is created).
3. Otherwise, close the open row (`to_chapter_id = headChapterId`) and insert a new open row (`from_chapter_id = headChapterId`, `to_chapter_id = NULL`).
4. If no open row exists, insert a new open row at head.

This is implemented in `savePageContent` in `src/app/[serial]/[schema]/[page]/actions.ts` and runs inside a single transaction.

---

### Tables

#### Core structure

```
serials
  id, title, slug, description, splash_art_url, chapter_type, volume_type

serial_authors
  serial_id, name, display_order

volumes
  id, serial_id, display_name, idx

chapters
  id, volume_id, display_name, idx
```

`chapters.idx` is a **global, serial-level** integer used in all range comparisons — it is strictly increasing across all volumes (all chapters in Volume N come before Volume N+1). Volumes are an organizational grouping layer only; they do not affect the SCD query logic.

#### Schema definition (wall-clock versioned)

```
page_schemas
  id, serial_id, name, body, has_floater

schema_sections
  id, schema_id, name, display_order, created_at, deleted_at

schema_floater_rows
  id, schema_id, label, display_order, created_at, deleted_at
```

`schema_floater_rows` only applies when `schemas.has_floater = true`. All floater rows store markdown text, identical in structure to sections.

#### Pages (chapter-versioned content)

```
pages
  id, schema_id, name, intro_chapter_id

page_section_versions
  page_id, section_id, chapter_id, content
  PK: (page_id, section_id, chapter_id)

page_floater_versions
  page_id, chapter_id, image_url
  PK: (page_id, chapter_id)

page_floater_row_versions
  page_id, floater_row_id, chapter_id, content
  PK: (page_id, floater_row_id, chapter_id)
```

Each `chapter_id` is the chapter when that content was introduced or last changed. At most one revision per `(page, section, chapter)` — the PK enforces uniqueness.

The floater header is always rendered from `pages.name` and is not stored separately. The image URL is versioned independently of row content to avoid unnecessary row closures when only one changes.

#### Users

```
users
  id, email, display_name, created_at

user_progress
  user_id, serial_id, chapter_id, updated_at
  PK: (user_id, serial_id)
```

Anonymous user progress is stored client-side in `localStorage` per serial — no server row is created.

---

## Tech Stack

### Framework: Next.js (App Router)
The URL pattern `/{serial}/{schema}/{page-name}` maps directly to file-based routing. SSR is required because spoiler filtering is user-specific — content is rendered per-request with the user's chapter cutoff. Next.js handles the API layer (auth, progress saves) in the same project.

### Database: PostgreSQL
The versioned content queries (finding the latest revision per group at or before a chapter cutoff) involve grouped aggregates and self-joins. PostgreSQL handles these cleanly, and the data model is inherently relational with multiple join paths.

### ORM: Drizzle ORM
The versioned queries are too custom for Prisma's generated queries to handle ergonomically. Drizzle allows typed SQL directly where needed, without fighting the abstraction. Schemas map 1:1 to the tables defined above.

### Auth: Auth.js (NextAuth v5)
Handles the anonymous → logged-in transition. Anonymous users fall through to `localStorage` for progress; logged-in users write to `user_progress`. Auth.js sessions expose `user_id` in Server Components cleanly.

### Search: PostgreSQL full-text search (tsvector)
Filtered search (excluding pages beyond the user's chapter) requires server-side filtering, making client-side or external search engines (Meilisearch, Typesense) more complex to sync. PG full-text search keeps the chapter filter as a plain SQL `WHERE` clause in the same query.

### Markdown: `@uiw/react-md-editor` + `react-markdown`
Editor for contributors, renderer for readers.

### Styling: Tailwind CSS

### Hosting: Vercel
Vercel hosts the app with free tiers sufficient for early development.

---

### Key Trade-offs

| Decision | Chosen | Alternative | Rationale |
|---|---|---|---|
| Framework | Next.js | Remix | Larger ecosystem; RSC reduces client bundle on content-heavy pages. Remix is the strongest alternative — its loader/action model maps cleanly to per-request versioned content fetching. |
| ORM | Drizzle | Prisma | Drizzle wins when queries are custom SQL-heavy |
| Search | PG FTS | Meilisearch | Meilisearch is faster/fuzzier but requires a sync pipeline |
| DB host | Serverless Postgres | Supabase, Railway | Supabase adds an auth layer that duplicates Auth.js |

### Known Risks

- **App Router complexity** — The chapter selector (reactive, in the navbar) must be a Client Component while the rest of the page can be a Server Component. Getting this boundary wrong causes unnecessary client JS or stale renders.
- **Vercel alignment** — Next.js works everywhere, but some features (Server Actions) have rough edges when self-hosting or deploying to Cloudflare Workers.
- **Versioned content read path** — Rendering a wiki page requires a subquery-join to find the latest revision per section/floater-row at or before the user's cutoff idx. The subquery groups by dimension, aggregates the max idx, then joins back for the content row.
