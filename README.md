# PlotArmor

A wiki platform for serial entertainment (books, TV shows, etc.) that protects readers from spoilers by only surfacing information up to a chapter they choose.

Standard wikis always show the latest state of any character, location, or other entry — a problem for readers mid-series. PlotArmor solves this by treating every piece of wiki content as a time series tied to specific chapters, so the wiki renders a snapshot of the world as of any point in the story.

## How it works

Users set a **progress cutoff** — the chapter they are currently on. All wiki content, search results, and links are then filtered to that point:

- Pages whose subject hasn't been introduced yet are hidden entirely (title included).
- Search results exclude pages beyond the user's current chapter.
- Every attribute on a page reflects only the state as of the user's cutoff.

Progress is stored in `localStorage` for anonymous users and synced to their account for logged-in users.

## Key concepts

| Term | Definition |
|------|------------|
| **Serial** | The story a wiki covers (a book series, TV show, etc.) |
| **Chapter** | A single installment — episode, book chapter, volume, etc. |
| **Schema** | A page type within a serial (e.g. Characters, Locations) |
| **Page** | A single wiki entry belonging to a schema |

### Pages

Every page belongs to a schema. Schemas define two layout components:

- **Body** — an ordered list of named sections, each storing Markdown text.
- **Floater** *(optional)* — a sidebar panel with a header, image, and labeled rows.

Every page also records the chapter it was first introduced in, which determines its visibility to a given user.

### URL structure

```
/{serial}/{schema}           # schema index page
/{serial}/{schema}/{page-name}
```

## Data model

Content versioning uses **single-timestamp versioning**: every content row carries a single `chapter_id` — the chapter when that value was introduced or last changed. At most one revision per `(page, section, chapter)` tuple (enforced by PK). To read a value at chapter N, find the revision with the highest `chapter.idx` ≤ N:

```sql
SELECT ... GROUP BY section_id HAVING chapters.idx = MAX(chapters.idx)
WHERE page_id = ? AND chapters.idx <= N
```

Schema structure (sections, floater rows) is versioned by wall-clock time. Page content is versioned by chapter index. These two axes are independent.

### Tables

```
serials          id, title, slug, description, splash_art_url, chapter_type, volume_type
serial_authors   serial_id, name, display_order
volumes          id, serial_id, display_name, idx
chapters         id, volume_id, display_name, idx

page_schemas         id, serial_id, name, body, has_floater
schema_sections      id, schema_id, name, display_order, created_at, deleted_at
schema_floater_rows  id, schema_id, label, display_order, created_at, deleted_at

pages                    id, schema_id, name, intro_chapter_id
page_section_versions    page_id, section_id, chapter_id, content
page_floater_versions    page_id, chapter_id, image_url
page_floater_row_versions  page_id, floater_row_id, chapter_id, content

users            id, email, display_name, created_at
user_progress    user_id, serial_id, chapter_id, updated_at
```

For the full design spec, see [spec.md](spec.md).

## Tech stack

| Layer | Choice |
|-------|--------|
| Framework | Next.js 16 (App Router) |
| Database | PostgreSQL |
| ORM | Drizzle ORM |
| Auth | Auth.js (NextAuth v5) |
| Search | PostgreSQL full-text search |
| Styling | Tailwind CSS v4 |
| UI components | Shadcn UI |
| Hosting | Vercel |

Rationale for each decision is in [spec.md § Tech Stack](spec.md#tech-stack).

## Getting started

```bash
pnpm install
```

Create `.env.local` with your database connection string.

**Production/staging:**
```
DATABASE_URL=postgres://<user>:<password>@<host>/<db>?sslmode=require
```

**Local Docker (development):**
```
DATABASE_URL=postgres://postgres:secret@localhost:5432/plotarmor
```

Then start the database. For local Docker, run the helper script (PowerShell):

```powershell
.\scripts\start-db.ps1
```

The script reads `DATABASE_URL` from `.env.local` and uses those values when creating the container, so credentials are defined in one place. To stop the container: `docker stop plotarmor-db`.

Apply the database migration:

```bash
npx drizzle-kit migrate
```

Start the dev server:

```bash
pnpm dev         # http://localhost:3000
pnpm build       # production build
pnpm lint        # ESLint
```

To regenerate migrations after schema changes:

```bash
pnpm drizzle-kit generate
```

## Saving and loading the database state

Two pairs of scripts let you snapshot and restore the local Docker database for quick testing or sharing a known-good seed.

### Save a snapshot

Dumps the running container's database to a plain-SQL file under `db-snapshots/` (the directory is git-ignored).

**Linux / macOS / WSL (bash):**
```bash
./scripts/save-db.sh                          # auto-named: db-snapshots/2024-01-15_14-30-00.sql
./scripts/save-db.sh db-snapshots/my-seed.sql # custom path
```

**Windows (PowerShell):**
```powershell
.\scripts\save-db.ps1                                      # auto-named
.\scripts\save-db.ps1 -OutputFile db-snapshots\my-seed.sql  # custom path
```

### Load a snapshot

Drops and recreates the database, then loads the specified dump. Prompts for confirmation unless `--force` / `-Force` is passed.

**Linux / macOS / WSL (bash):**
```bash
./scripts/load-db.sh db-snapshots/my-seed.sql          # with confirmation prompt
./scripts/load-db.sh db-snapshots/my-seed.sql --force  # skip prompt
```

**Windows (PowerShell):**
```powershell
.\scripts\load-db.ps1 -InputFile db-snapshots\my-seed.sql          # with confirmation prompt
.\scripts\load-db.ps1 -InputFile db-snapshots\my-seed.sql -Force   # skip prompt
```

> **Warning:** Loading a snapshot permanently deletes all current data in the local database. Make sure you save first if you need it.
