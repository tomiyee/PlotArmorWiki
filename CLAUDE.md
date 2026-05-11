# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
pnpm dev          # start Next.js dev server
pnpm build        # production build
pnpm lint         # run ESLint
pnpm drizzle-kit generate   # generate migration after schema changes
pnpm drizzle-kit migrate    # apply pending migrations
```

### Schema change workflow

Whenever `src/db/schema.ts` changes:

1. Run `pnpm drizzle-kit generate` to generate a new incremental migration file in `drizzle/`.
2. Run `pnpm drizzle-kit migrate` to apply it to the local database.
3. Commit the schema change, the new migration file, and the updated `drizzle/meta/` files together in one commit.

For local development with Docker, set `DATABASE_URL` in `.env.local` to a `localhost` connection string, then:

```powershell
.\scripts\start-db.ps1   # create or start the local Postgres container
```

The script reads `DATABASE_URL` from `.env.local` and uses those values when creating the Docker container, so credentials are defined in one place.

No test runner is configured yet.

## Architecture

PlotArmor is a spoiler-safe wiki platform. Users set a **chapter cutoff** per serial and see only content introduced at or before that chapter.

### URL structure

```
/                           # home — search serials, create new wiki
/{serial}/{category}        # category index page (name, body description, page list)
/{serial}/{category}/{page} # wiki page
```

### Tech stack

Database, ORM, home page UI, serial/chapter/category/page management, markdown rendering (including `[[Category:Page]]` wiki link syntax), floater sidebar, and chapter progress selector (localStorage) are implemented. Auth and Search are not yet.

| Layer | Choice |
|---|---|
| Framework | Next.js 16 (App Router, SSR) |
| Database | PostgreSQL (serverless) |
| ORM | Drizzle ORM |
| Auth | Auth.js (NextAuth v5) |
| Search | PostgreSQL full-text search (tsvector) |
| Markdown | `@uiw/react-md-editor` (edit) + `react-markdown` (render) |
| Styling | Tailwind CSS v4 |
| UI components | Shadcn UI (Button, Input, Select, Dialog) + custom Text |
| Hosting | Vercel |

### Core data pattern: single-timestamp versioning

All wiki page content is chapter-versioned. Each revision row carries a single `chapter_id` — the chapter when that content was introduced or last changed. At most one revision per `(page, section, chapter)` tuple (enforced by PK). To read content at chapter index N, find the revision with the highest `chapter.idx` that is ≤ N:

```sql
-- conceptual read pattern (implemented as a subquery-join in Drizzle)
SELECT ... GROUP BY section_id HAVING chapters.idx = MAX(chapters.idx)
WHERE page_id = ? AND chapters.idx <= N
```

**Category structure** (sections, floater rows) is wall-clock versioned (`created_at`/`deleted_at`).  
**Page content** is chapter-versioned. These are separate axes.

Stable IDs on `category_sections` and `category_floater_rows` decouple content rows from renames/reorders.

### Server/Client Component boundary

The chapter selector in the navbar must be a **Client Component** (reactive to user input). Everything else — page body, floater, search results — should be **Server Components** rendering with the user's chapter cutoff fetched server-side. Getting this boundary wrong causes stale renders or unnecessary client JS.

### Progress state

- **Anonymous users** — chapter progress stored in `localStorage` per serial, no server row.
- **Logged-in users** — stored in `user_progress` table (`user_id`, `serial_id`, `chapter_id`). Auth.js session exposes `user_id` in Server Components.

First-time visitors on any serial default to chapter 1 and see a callout prompting them to update.

### Spoiler filtering rules

- **Pages** whose `intro_chapter_id` exceeds the user's cutoff are fully hidden — title withheld, placeholder message shown.
- **Search** excludes those pages entirely (server-side SQL filter, same query as the chapter range check).

### Key design files

- `spec.md` — canonical product and data model spec; consult before changing data model or spoiler logic.
- `src/db/schema.ts` — Drizzle ORM table definitions; source of truth for the data model.
- `src/db/index.ts` — Drizzle client (postgres.js driver); exports `db` for use in Server Components and API routes.
- `drizzle.config.ts` — Drizzle Kit config; reads `DATABASE_URL` from `.env.local`.
- `src/app/layout.tsx` — root layout with Geist fonts, Tailwind base, `<Navbar>`, and a full-height `overflow-y-auto` wrapper that prevents scrollbar layout shift when dialogs open.
- `src/components/ui/input.tsx` — Shadcn-style `<Input>` wrapping `<input>`; defaults `type` to `"text"`. Use this instead of bare `<input>`.
- `src/components/ui/select.tsx` — generic `<Select<T>>` backed by native `<select>`; accepts `options: Option<T>[]` with optional grouping via `children` and per-option `disabled`. Client Component. Use this instead of bare `<select>`.
- `src/components/ui/text.tsx` — `<Text>` typography component; accepts a `variant` prop (`h1`–`h4`, `body`, `muted`, `faint`, `label`) and an optional `as` prop to override the rendered element. Use this instead of bare heading/paragraph/label elements.
- `src/components/ui/dialog.tsx` — controlled Dialog component (`isOpen`/`onClose` props) with `DialogHeader`, `DialogBody`, `DialogFooter`, `DialogTitle`, `DialogDescription`, and `DialogClose`.
- `src/components/ui/markdown-renderer.tsx` — `<MarkdownRenderer>` renders a markdown string as styled HTML using explicit Tailwind utility classes (no `@tailwindcss/typography`). Accepts `serialSlug` to enable `[[Category:Page]]` wiki link resolution via `remarkWikiLinks`, and `sm` for compact sizing in reference panels. This is the single source of truth for how markdown looks — the editor preview uses it too.
- `src/app/page.tsx` — home page; async Server Component that fetches all serials and passes them to `<SerialList>`.
- `src/app/new/page.tsx` — serial creation form (title, description, authors, splash art URL, volume type, chapter type).
- `src/app/new/actions.ts` — `createSerial` Server Action; inserts into `serials` and `serial_authors` (storing the computed slug, chapter type, and volume type), redirects to `/{slug}`.
- `src/app/[serial]/page.tsx` — serial detail page; resolves serial via `WHERE slug = ?`, lists chapters grouped by volume, delegates editing to `<SerialEditor>` and category management to `<CategoryManager>`.
- `src/app/[serial]/actions.ts` — Server Actions for volume/chapter CRUD (`addVolume`, `addChapter`, `deleteVolume`, `deleteChapter`, `renameVolume`, `renameChapter`, `updateSerialTypes`, `reorderVolumes`, `reorderChapters`, `reorderAllChapters`) and category/section/floater-row CRUD (`addCategory`, `deleteCategory`, `renameCategory`, `updateCategory`, `addSection`, `deleteSection`, `renameSection`, `reorderSections`, `addFloaterRow`, `deleteFloaterRow`, `renameFloaterRow`, `reorderFloaterRows`). Reorder actions reassign `chapters.idx` — no post-reorder version repair is needed because content revisions are keyed by `chapter_id` and follow their chapter's new position automatically.
- `src/app/[serial]/[category]/page.tsx` — category index page; resolves serial via slug and category via `WHERE serial_id = ? AND name = ?`, renders `<CategoryIndexEditor>` and a chapter-filtered list of pages (hides pages whose `intro_chapter_idx` exceeds the user's cutoff) linking to `/{serial}/{category}/{page}`.
- `src/app/[serial]/[category]/CategoryIndexEditor.tsx` — Client Component for inline editing of a category's name and markdown body; toggles between rendered view and edit form, navigates to the new URL when the name changes.
- `src/app/[serial]/[category]/new/page.tsx` — page creation form; collects page name and intro chapter (chapters grouped by volume via optgroup), submits via `createPage` Server Action.
- `src/app/[serial]/[category]/new/actions.ts` — `createPage` Server Action; validates serial and category exist, inserts into `pages`, redirects to `/{serial}/{category}/{page}`.
- `src/app/[serial]/layout.tsx` — serial-scoped nested layout; fetches the serial, its volumes, and chapters, then renders a dark sub-bar with `<ChapterSelector>` above all `/{serial}/…` pages.
- `src/app/[serial]/[category]/[page]/page.tsx` — wiki page view; resolves serial/category/page, reads the user's chapter cutoff from cookie, fetches chapter-filtered section content and floater data (subquery-join: max `chapters.idx` ≤ cutoff per section/floater-row), fetches all chapters and the head chapter id for the edit-mode chapter selector, fetches all wiki pages visible at the user's cutoff (passed to the editor for wiki link autocomplete), then delegates all rendering (read and edit modes) to `<PageEditor>`.
- `src/app/[serial]/[category]/[page]/PageEditor.tsx` — Client Component that owns the page body layout. In read mode renders sections and floater directly from props (so `router.refresh()` after a chapter change immediately reflects new content). In edit mode each section gets a `<WikiLinkMDEditor>` (SSR disabled), floater fields get text inputs, and a "Writing as of:" `<Select>` lets the editor target any chapter. Changing the chapter calls `getPageContentAtChapter` to pre-fill drafts; on save, calls `savePageContent` with the selected `targetChapterId` then refreshes.
- `src/app/[serial]/[category]/[page]/actions.ts` — `savePageContent` Server Action and `getPageContentAtChapter` Server Action. `savePageContent` resolves serial/category/page by slug/name and upserts each section/floater field at `(pageId, sectionId, chapterId)` — uses the optional `targetChapterId` when provided, otherwise defaults to the head chapter. `getPageContentAtChapter` runs the same max-idx subquery join but against an explicit chapter id instead of the cookie, returning `{ sections, floaterImageUrl, floaterRows }` for use by the edit-mode chapter selector.
- `src/components/SerialMetadataEditor.tsx` — Client Component for inline editing of a serial's title, description, authors, and splash art URL; pen-icon toggle swaps between read view and edit form; redirects if the title (slug) changes.
- `src/components/SerialEditor.tsx` — Client Component managing edit mode for the serial's volumes and chapters; in edit mode shows inline volume/chapter type selectors (persisted immediately on change) rendered as "Each [chapterType] is grouped by [volumeType]", inline rename forms, add-volume/chapter forms, delete confirmations, and drag-and-drop reordering via `@dnd-kit`. All labels, placeholders, and confirmation messages use the serial's chosen type names (e.g. "Episode"/"Season") instead of generic "chapter"/"volume".
- `src/components/CategoryManager.tsx` — Client Component for managing page categories; accepts `serialSlug` to render a "View" link to each category's index page, expand/collapse per-category detail with section and floater-row add/rename/reorder/delete.
- `src/components/WikiLinkMDEditor.tsx` — wraps `<MDEditor>` with `[[Category:Page]]` autocomplete. Triggers on `[[`, filters categories before the `:` and pages after it, applies suggestions via keyboard or click. Passes `MarkdownRenderer` as the editor's preview renderer so the preview matches the final page render exactly (including wiki link resolution and Tailwind styling).
- `src/components/RenameForm.tsx` — shared generic inline rename form (hidden ID field + text input + Save/Cancel); used by `CategoryManager`.
- `src/components/Navbar.tsx` — shared navbar with site logo and auth placeholder.
- `src/components/SerialList.tsx` — Client Component owning the search input; filters serial list client-side by title.
- `src/hooks/useServerAction.ts` — `useServerAction()` hook; wraps a server action in `useTransition` + `router.refresh()`. Returns `{ run, isPending }`. Use in all Client Components that call Server Actions.
- `src/lib/serial-types.ts` — shared `ChapterType`/`VolumeType` types, `CHAPTER_TYPES`/`VOLUME_TYPES` arrays, `parseChapterType`/`parseVolumeType` helpers, and `CHAPTER_TYPE_OPTIONS`/`VOLUME_TYPE_OPTIONS` for `<Select>` components. Single source of truth — import from here instead of duplicating in action files or components.
- `src/lib/wiki-links.ts` — shared wiki link parser: `WIKI_LINK_RE` regex, `parseWikiLink()` (parses `Category:Page` inner content), and `slugifyWikiName()` (URL-encodes names for link generation). Used by both the remark plugin and the editor autocomplete so parsing stays in sync.
- `src/lib/remark-wiki-links.ts` — remark plugin (`remarkWikiLinks(serialSlug)`) that transforms `[[Category:Page]]` tokens in markdown into standard markdown links (`/serialSlug/category/page`). Uses `mdast-util-find-and-replace` so code blocks and inline code are left untouched.
- `src/lib/slug.ts` — `titleToSlug` utility; slug is computed at creation time and stored in `serials.slug`.
- `src/lib/utils.ts` — `cn()` utility for Tailwind class merging (Shadcn UI helper).
- `src/hooks/usePersistedStore.ts` — `useState`-compatible hook backed by `localStorage`; built on `useSyncExternalStore` for SSR safety and cross-tab sync via the native `storage` event.
- `src/components/ChapterSelector.tsx` — Client Component that reads/writes chapter progress via `usePersistedStore` (key `plotarmor:progress:{serialId}`) and mirrors the selection into a cookie (`plotarmor_chapter_{serialId}`) so Server Components can read the cutoff. Renders a dismissible first-visit callout prompting the user to set their chapter. Chapters are displayed in a custom dropdown grouped by volume; each volume header is collapsible and collapse state is persisted per-serial under `plotarmor:vol-collapsed:{serialId}` as a `Record<volumeId, boolean>`.

### UI component conventions

Always use the design-system components in `src/components/ui/` instead of bare HTML elements:

| Instead of | Use |
|---|---|
| `<input>` | `<Input>` from `@/components/ui/input` |
| `<select>` | `<Select>` from `@/components/ui/select` |
| `<button>` | `<Button>` from `@/components/ui/button` |
| `<h1>`–`<h4>`, `<p>`, `<label>`, `<span>` (text) | `<Text variant="…">` from `@/components/ui/text` |

`<Text>` variants and their default elements: `h1` → `<h1>`, `h2` → `<h2>`, `h3` → `<h3>`, `h4` → `<h4>`, `body` → `<p>` (gray-700), `faint` → `<p>` (gray-400), `label` → `<span>`. Pass `muted` (boolean) to override any variant's text color to gray-500. Override the rendered element with `as` (e.g. `<Text as="label" variant="label" htmlFor="…">`). One-off spacing or layout tweaks go in `className`.

### JSDoc conventions

All exported components, hooks, and helper functions must have a JSDoc block with at least one `@example`. Keep the description concise — explain the non-obvious WHY (constraints, invariants, gotchas), not what the name already says. Omit `@param`/`@returns` for simple cases where TypeScript types are self-documenting; include them when the semantics aren't obvious from the type alone.

**Exception:** Skip the JSDoc block if the function or hook is bespoke to a single file/page (not exported for reuse elsewhere) and its name and signature are self-documenting.

```ts
/**
 * One-line summary of purpose or key constraint.
 *
 * @example
 * const [val, setVal] = usePersistedStore("key", defaultValue);
 */
```
