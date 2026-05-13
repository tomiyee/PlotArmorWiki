# PlotArmor Wiki

## Overview

**PlotArmor** is a spoiler-protected wiki platform for serial media such as novels, comics, anime, manga, and TV shows.

Traditional wikis always display the latest known state of characters, locations, and events, which exposes readers to spoilers. PlotArmor solves this by treating all wiki content as **time-versioned data tied to chapters**. Readers select their current progress, and the wiki renders a snapshot of the story world only up to that point.

---

# Core Concepts

## Serials, Volumes, and Chapters

### Definitions

- **Serial** — a complete story or franchise.
- **Volume** — a collection of chapters.
- **Chapter** — the smallest progression unit in a serial.

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

The serial index page, or the "Home" page, is itself a Wiki Page that::

- Has no parent
- Serves as the DAG root

All other pages:

- Must have at least one parent

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

## Frontend Framework — Next.js (App Router)

Reasons:

- File-based routing
- SSR support for user-specific spoiler filtering
- Unified frontend and API layer

Example route:

```txt
/{serial}/{page}
```

---

## Database — PostgreSQL

Chosen for:

- Relational data modeling
- Temporal queries
- Aggregate + self-join support
- DAG relationship handling

---

## ORM — Drizzle ORM

Chosen because:

- Temporal queries require custom SQL
- Strong TypeScript integration
- Minimal abstraction overhead

---

## Authentication — Auth.js (NextAuth v5)

Responsibilities:

- User authentication
- Session management
- Anonymous-to-account progress migration

---

## Search — PostgreSQL Full-Text Search

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
