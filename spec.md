# PlotArmor Wiki

## Overview

**PlotArmor** is a spoiler-protected wiki platform for serial media such as novels, comics, anime, manga, and TV shows.

Traditional wikis always display the latest known state of characters, locations, and events, which exposes readers to spoilers. PlotArmor solves this by treating all wiki content as **time-versioned data tied to chapters**. Readers select their current progress, and the wiki renders a snapshot of the story world only up to that point.

---

# Core Concepts

## Serials, Volumes, and Chapters

### Definitions

- **Serial** - a complete story or franchise.
- **Volume** - a collection of chapters.
- **Chapter** - the smallest progression unit in a serial.

The exact terminology for Chapter and Volume can change per Serial. For example, for a TV show, it could be Seasons and Episodes. For a book series, it could be Books and Chapters.

### Ordering Rules

- Volumes and chapters are strictly ordered.
- Every chapter belongs to exactly one volume.
- Chapters never occur simultaneously.
- Chapter ordering defines the canonical story timeline.

### IDs vs Indices

Each volume and chapter has:

- A stable **ID**
- A mutable **index/order**

All references use the stable **chapter ID**, not the index.

This allows:

- Reordering chapters
- Inserting chapters retroactively
- Preserving existing references

### Constraints

- Chapters or volumes may only be deleted if nothing references them.
- Temporal data always references chapter IDs.

---

# User Progress System

Each user has a **progress chapter** per serial. This acts as the spoiler cutoff for all rendering.

## First-Time Visitors

- New visitors default to the first chapter.
- A temporary callout prompts them to select their actual progress.

## Persistence

### Anonymous Users

- Progress is stored in `localStorage`
- Scoped per serial
- Persists across browser sessions

### Logged-In Users

- Progress is stored server-side per serial
- Automatically restored on login or revisit

---

# Wiki Pages

## Structure

Every wiki page belongs to a single serial and contains temporal content.

A page consists of:

- Temporal page visibility
- Temporal titles
- Ordered page sections
- Optional infoboxes
- Temporal relationships to other pages

---

## Temporal Rendering Model

Every piece of content becomes visible starting at a specific chapter ID.

When rendering a page for a user:

1. Determine the user's cutoff chapter
2. Fetch the latest valid revision whose chapter index is less than or equal to the cutoff
3. Hide all future revisions

---

## Page Visibility

The page itself is temporal.

A page only exists for users once its visibility chapter has been reached.

---

## Temporal Titles

Page titles are versioned over time.

Each title revision includes:

- The title text
- The chapter ID where it becomes valid

---

## Page Sections

Each wiki page contains ordered sections.

### Properties

- Section order is permanent
- Section names are permanent
- Section visibility is temporal
- Section content is versioned over time

Each section includes:

- Visibility chapter ID
- Temporal content revisions

---

## Infoboxes

Pages may optionally include an infobox.

### Infobox Structure

- Optional image
- Ordered infobox sections
- Temporal values

Each infobox section includes:

- Visibility chapter ID
- Versioned values over time

---

# Wiki Page Relationships

Wiki pages form a **directed acyclic graph (DAG)**.

## Rules

- Pages may have multiple parents
- Pages may have multiple children
- Relationships are temporal
- Cycles are forbidden

The serial index page, or the "Home" page, is itself a Wiki Page that:

- Has no parent
- Serves as the DAG root

All other pages:

- Must have at least one parent

### Home page edit restrictions

The home page has two permanent constraints that restrict its edit UI:

- **No title renaming** - The home page slug is fixed and canonical (`/{serial}`). Its name cannot be changed, so the Titles panel is hidden in edit mode.
- **No parent relationships** - The home page is the DAG root and can never have a parent. The Relationships panel is hidden in edit mode.

In edit mode on the serial index page, Page Templates are shown at the top of the edit panel so administrators can manage templates before editing content. The "Writing as of:" banner is a static indicator pinned to the admin's reading cutoff — there is no separate chapter selector for editing.

---

## Temporal Relationships

Parent-child relationships can change over time.

Examples:

- Pages gaining new parents
- Pages losing parents
- Reorganizing page hierarchies

At any chapter snapshot:

- The graph must still remain acyclic

---

## Common Query

Given:

- A wiki page
- A chapter ID

Return:

- All visible parent pages
- All visible child pages

---

# URL and Slug System

## Slugs

Each page has a unique slug within its serial.

### Requirements

- Generated from the earliest visible title
- Must avoid spoiler-sensitive names
- Deduplicated with numeric suffixes

Example:

- `john-doe`
- `john-doe-2`

---

## URL Format

```txt
/{serial-slug}/{page-slug}
```

---

# Templates

Each serial may define reusable page templates.

## Template Features

Templates may define:

- Page sections
- Infobox presence
- Infobox sections

## Usage

When creating a page, contributors may choose a template to initialize the page structure.

Templates are manageable from the serial index page by administrators in edit mode.

---

# Contributor Suggestions

Authenticated non-admin users can propose content changes for admin review. Suggestions never go live without an explicit admin approval - admin review is the sole spoiler gate.

## What can be suggested

Each suggestion targets a single reviewable unit:

- **One wiki page section** - exactly one body section edit per suggestion.
- **The infobox** - proposed values for one or more rows on the page's infobox (small, related fields edited together as one unit). A suggestion cannot mix a body section with infobox rows.
- **Chapter synopses** - a proposed replacement for the synopsis text on a chapter page (separate workflow).

## Suggestion workflow

1. A logged-in non-admin picks a section on a wiki page (hover edit icon on the section heading, or the "Suggest an edit to" buttons below the content), or clicks "Suggest an edit to the synopsis" on a chapter page.
2. They edit the content (using the same WYSIWYG editor as admins) and provide a required citation. The suggestion always applies **as of the user's current reading cutoff** - there is no separate "Writing as of:" selector, and the server resolves the target chapter from the reading-progress cookie / `user_progress` rather than trusting the client. To suggest at an earlier chapter, the user moves their reading progress there first.
3. The form shows a revision timeline for the focused section: which stored revision the edit starts from, plus markers (chapter identity only, no content) for revisions after the user's cutoff.
4. On submit, a pending suggestion record is created. The contributor sees a status banner indicating their suggestion is under review.
5. The admin reviews suggestions inline - on the wiki page itself (review panel above the page body), in the serial home page's review queue (all unreviewed suggestions across the serial, grouped by page), or on the chapter page (synopsis review panel). The panel shows a before/after diff for each changed field, where "current" is the content readers at the suggestion's target chapter see.
6. Approving a suggestion writes the proposed content directly into the appropriate revision table at the target chapter (same upsert as a direct admin save). Rejecting accepts an optional review note shown to the contributor.
7. **Carry-forward:** when the suggested section/row also has revisions at chapters after the target, the review card explains that the approved change is only visible until the next revision, and offers an editor per later revision (pre-filled with that revision's content) so the admin can weave the change into it. Enabled, modified carry-forward edits are applied in the same transaction as the approval, ascending by chapter idx, through the shared `applyPageContentRevisions` invariant helper - a carried-forward revision that becomes identical to its predecessor is deleted automatically. Later revisions beyond the admin's own reading progress are hidden behind a "reveal" button with a spoiler badge.

## Data model

```
page_suggestions                 id, page_id, proposed_by_user_id, target_chapter_id, status, citation, created_at, reviewed_at, reviewed_by_user_id, review_note
page_suggestion_section_changes  id, suggestion_id, section_id, proposed_content
page_suggestion_infobox_changes  id, suggestion_id, infobox_section_id, proposed_content
chapter_synopsis_suggestions     id, chapter_id, serial_id, proposed_by_user_id, proposed_content, citation, status, created_at, reviewed_at, reviewed_by_user_id, review_note
```

The schema allows multiple changes per `page_suggestions` row; the single-unit rule (one section XOR infobox rows) is enforced in the submit action, not the schema. `chapter_synopsis_suggestions` is a separate table since synopses are keyed by chapter rather than page.

The serial home page shows admins a full review queue ("Suggestions awaiting review"): every pending suggestion in the serial, grouped by page and reviewable in place (approve / reject / carry-forward), so outstanding review work is handled without visiting every page. Suggestions targeting chapters beyond the admin's reading progress are hidden behind a count, in both the queue and the per-page panel.

---

# Home Page

The home page provides:

## Search

Users can search for existing serial wikis.

## Wiki Creation

Users can create a new serial wiki if one does not already exist.

---

# Versioning Strategy

PlotArmor uses **single-timestamp versioning**.

## Read Rule

To resolve content for chapter `N`:

- Find the latest revision whose chapter index is `<= N`

---

## Progress Semantics

User progress stores a **chapter ID**, not a positional index.

This ensures:

- Reordering chapters does not invalidate progress
- Inserted earlier chapters are implicitly considered read

Example:

- User selects "Book 2, Chapter 3"
- A new earlier chapter is inserted later
- User progress still points to the same chapter ID

This behavior is intentional.

---

# Technical Stack

## Frontend Framework - Next.js (App Router)

Reasons:

- File-based routing
- SSR support for user-specific spoiler filtering
- Unified frontend and API layer

Example route:

```txt
/{serial}/{page}
```

---

## Database - PostgreSQL

Chosen for:

- Relational data modeling
- Temporal queries
- Aggregate + self-join support
- DAG relationship handling

---

## ORM - Drizzle ORM

Chosen because:

- Temporal queries require custom SQL
- Strong TypeScript integration
- Minimal abstraction overhead

---

## Authentication - Auth.js (NextAuth v5)

Responsibilities:

- User authentication
- Session management
- Anonymous-to-account progress migration

---

## Search - PostgreSQL Full-Text Search

Chosen because:

- Spoiler filtering must happen server-side
- Search queries integrate naturally with chapter visibility filtering
- Avoids syncing external search infrastructure

Uses:

- `tsvector`
- SQL `WHERE` filtering by chapter visibility

---

## Markdown Editor

### Editing

- `@uiw/react-md-editor`

### Rendering

- `react-markdown`

---

## Styling

- Tailwind CSS

---

## Hosting

### Vercel

Chosen for:

- Simple deployment workflow
- SSR support
- Free-tier viability during early development
