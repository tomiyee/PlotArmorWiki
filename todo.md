# PlotArmor — Implementation TODO

---

## ~~Step 1 — Chapter-targeted write path~~ ✓

~~The save action currently hardcodes the head chapter. This step makes the target chapter a parameter so editors can contribute data points at any chapter in the series, not just the latest one.~~

~~- Add an optional `targetChapterId: number | undefined` parameter to `savePageContent` in `src/app/[serial]/[schema]/[page]/actions.ts`.~~
~~- When `targetChapterId` is provided, use it directly instead of calling `getHeadChapterId`.~~
~~- When omitted, keep the existing behavior of writing at the head chapter.~~
~~- No UI change in this step — `PageEditor` still passes `undefined`, behavior is identical to before.~~
~~- Commit: `feat: accept target chapter in savePageContent`~~

---

## ~~Step 2 — Server action: fetch content at a given chapter~~ ✓

~~Editors need to pre-fill the edit form with what exists at any chapter they select. The read query already exists in `page.tsx` but is embedded in the Server Component and tied to the reader's cookie cutoff. This step extracts it into a callable action.~~

~~- Add `getPageContentAtChapter(serialSlug, schemaName, pageName, chapterId)` to `src/app/[serial]/[schema]/[page]/actions.ts`.~~
~~- The function runs the same max-idx subquery join as `page.tsx` but takes an explicit `chapterId` (resolved to `chapters.idx`) instead of reading the cookie.~~
~~- Returns `{ sections: { id, content }[], floaterImageUrl: string | null, floaterRows: { id, content }[] }`.~~
~~- Commit: `feat: add getPageContentAtChapter server action`~~

---

## ~~Step 3 — Chapter selector in edit mode~~ ✓

~~Wires Steps 1 and 2 into the UI so editors can pick which chapter their edits apply to.~~

~~- In `src/app/[serial]/[schema]/[page]/page.tsx`, fetch all chapters for the serial (id, displayName, volumeName, idx) and pass them — alongside the head chapter id — to `<PageEditor>` as new props.~~
~~- In `<PageEditor>`, add a `chapters` prop and a `headChapterId` prop. In edit mode, render a `<Select>` labeled "Writing as of:" that defaults to the head chapter.~~
~~- When the selected chapter changes, call `getPageContentAtChapter` and replace the draft state with the returned content so the editor reflects what readers at that chapter currently see.~~
~~- On save, pass the selected `targetChapterId` to `savePageContent`.~~
~~- Commit: `feat: chapter selector in edit mode for targeted content versioning`~~

---

## ~~Step 4 — Consistent content widths~~ ✓

~~Pages currently have inconsistent max-widths and padding. Establish a single container constraint before adding more pages.~~

~~- Audit every page route for its root max-width class: `src/app/page.tsx`, `src/app/new/page.tsx`, `src/app/[serial]/page.tsx`, `src/app/[serial]/[schema]/page.tsx`, `src/app/[serial]/[schema]/new/page.tsx`, `src/app/[serial]/[schema]/[page]/page.tsx`.~~
~~- Create `src/components/ui/page-container.tsx` — a `<div>` with `max-w-5xl mx-auto w-full px-4 py-6`. Accept a `className` prop for per-page overrides.~~
~~- Replace ad-hoc width classes on each page's root element with `<PageContainer>`. The wiki page layout (with floater sidebar) may need `max-w-6xl` — override via `className`.~~
~~- Commit: `feat: PageContainer component for consistent content width across all pages`~~

---

## ~~Step 5 — Rename "Page Types" to "Page Categories"~~ ✓

~~The label "Page Types" is ambiguous. "Page Categories" communicates that schemas are categorical groupings of wiki pages, not type-system variants.~~

~~- `grep -ri "page type" src/` to locate all display-facing strings — headings, labels, button text, placeholder text.~~
~~- Update each occurrence. The internal identifier is `schema` throughout the codebase, so no DB migration or variable rename is needed — UI strings only.~~
~~- Commit: `chore: rename "Page Types" to "Page Categories" in all UI text`~~

---

## Step 6 — Tooltip wrapper for icon buttons

Icon-only buttons have no visible label; users cannot discover their purpose without a tooltip.

- Install or verify `@radix-ui/react-tooltip` is available (it ships with Shadcn).
- Create `src/components/ui/tooltip.tsx` exporting a `<Tooltip content={ReactNode} side?="top"|"right"|"bottom"|"left">` wrapper that composes `TooltipProvider`, `TooltipTrigger`, and `TooltipContent` from Radix. The API should be `<Tooltip content="Edit schema"><Button .../></Tooltip>`.
- Add `<TooltipProvider>` to `src/app/layout.tsx` so the provider is global.
- Audit all icon-only buttons across `SerialEditor`, `SchemaManager`, `SchemaIndexEditor`, `PageEditor`, `SerialMetadataEditor`, and `Navbar`. Wrap each with the appropriate `<Tooltip content="…">`.
- Commit: `feat: Tooltip wrapper component; add tooltips to all icon-only buttons`

---

## Step 7 — Search no-match redirect to Create Wiki with prefilled title

When a user types a wiki name and gets zero results, pressing Enter is a natural next action. Routing them directly to the creation form with their query pre-filled reduces friction.

- In `<SerialList>` (`src/components/SerialList.tsx`): add a `keydown` handler on the search `<Input>`. When the key is `Enter`, `query` is non-empty, and the filtered list has zero results, call `router.push('/new?title=' + encodeURIComponent(query))`.
- In `src/app/new/page.tsx`: read `searchParams.title` (string | undefined) and pass it as a `defaultTitle` prop to the form client component.
- In the new-serial form client component: attach a `ref` to the title `<Input>` and call `.focus()` inside a `useEffect` that fires when `defaultTitle` is non-empty.
- Commit: `feat: redirect to Create Wiki with prefilled title on no-results Enter`

---

## Step 8 — Seed new wikis with default page categories

New wikis start empty. Adding default "Character" and "Location" schemas on creation reduces the setup burden since these are near-universal categories.

- In `createSerial` (`src/app/new/actions.ts`): after inserting the serial row, insert two schemas into `schemas` and their default sections into `schema_sections` within the same transaction:
  - **Character** — sections: `Description`, `Appearances`.
  - **Location** — sections: `Description`, `Notable Events`.
- No UI change needed — the serial detail page will display them automatically after creation.
- Commit: `feat: seed new wikis with default Character and Location page categories`

---

## ~~Step 9 — Collapsible volumes in chapter selector and TOC~~ ✓

~~Long series have many volumes. Collapsing them makes the chapter selector and TOC navigable without scrolling through irrelevant entries.~~

~~- In `<ChapterSelector>` (`src/components/ChapterSelector.tsx`): group options by volume. Render each volume as a collapsible header (`▶ / ▼ Volume Name`) with its chapters indented beneath. Default state: all volumes expanded; persist per-volume collapse state in `localStorage` under `plotarmor:vol-collapsed:{serialId}:{volumeId}`.~~
~~- Apply the same collapsible pattern to the TOC component introduced in Step 10 — do this step first but leave a TODO comment if Step 10 is not yet complete.~~
~~- Commit: `feat: collapsible volume groups in chapter selector and table of contents`~~

---

## Step 10 — Table of contents as left sidebar / mobile drawer

The chapter list embedded inline in the serial page becomes unwieldy for long series. A persistent sidebar improves at-a-glance navigation.

- Extract the volume/chapter list from `src/app/[serial]/page.tsx` into `src/components/SerialTOC.tsx` — a Server Component that accepts `volumes` (with nested chapters) and `serialSlug`.
- On `md+` screens: render `<SerialTOC>` as a sticky left panel (`w-56 shrink-0`) alongside the main content using a two-column flex layout in `src/app/[serial]/page.tsx`.
- On `sm` screens: hide the sidebar (`hidden md:block`). Add a "Contents" icon button in the serial sub-bar that opens `<SerialTOC>` inside a `<Dialog>` (or Shadcn `Sheet`) drawer.
- Commit: `feat: table of contents as sticky left sidebar with mobile drawer`

---

## Step 11 — Merge serial sub-bar into top navbar

Two stacked nav bars feel heavy. Merging the serial name and chapter selector into the primary navbar reduces visual weight and saves vertical space.

- Introduce an optional `serialSlot` render prop (or a `SerialNavContext`) that pages can use to inject content into the right side of `<Navbar>`.
- In `src/app/[serial]/layout.tsx`: populate the slot with the serial title (linked to `/{serial}`) and `<ChapterSelector>`. Remove the dark sub-bar `<div>`.
- When not on a serial route the slot renders nothing; the navbar shows only the logo and auth.
- Adjust responsive styling so the serial title truncates gracefully at narrow widths.
- Commit: `feat: merge serial name and chapter selector into top navbar`

---

## Step 12 — Bulk chapter input

Adding chapters one at a time is tedious for a series with many entries. A bulk-entry textarea reduces this to a single action.

- In `<SerialEditor>` (`src/components/SerialEditor.tsx`): add a "Bulk add" expander beneath each volume's chapter list (visible in edit mode). The expander reveals a `<textarea>` labelled "One [chapterType] name per line" and a Submit button.
- Add `bulkAddChapters(serialSlug: string, volumeId: number, names: string[])` to `src/app/[serial]/actions.ts`. Filter empty/whitespace lines, then insert all chapters in a single transaction, assigning `idx` values sequentially after the current maximum for the series.
- Commit: `feat: bulk chapter input for adding multiple chapters at once`

---

## Step 13 — Consolidated floating edit mode

Edit controls are currently scattered across every component. A single global edit-mode toggle gives a cleaner reading experience and a consistent editing workflow.

- Create `src/contexts/EditModeContext.tsx` exporting `EditModeProvider` and `useEditMode()`. State: `{ isEditing: boolean; toggle(): void; registerHandlers(onSave, onDiscard): void }`. Each editable page registers its save/discard callbacks on mount and deregisters on unmount.
- Create `src/components/EditModeFAB.tsx` — a fixed bottom-right floating button:
  - **Read mode**: single pencil icon button (`<Tooltip content="Edit">`) that calls `toggle()`.
  - **Edit mode**: two buttons — "Save" (calls registered `onSave`) and "Discard" (calls registered `onDiscard`), both labeled.
- Wrap the root layout in `<EditModeProvider>` (`src/app/layout.tsx`). Render `<EditModeFAB>` inside the layout so it appears on every page.
- Audit each editable component (`SerialEditor`, `SchemaManager`, `SchemaIndexEditor`, `PageEditor`, `SerialMetadataEditor`): remove their inline edit-toggle buttons; show edit controls/forms only when `useEditMode().isEditing` is `true`; wire their save/discard logic to `registerHandlers`.
- Commit: `feat: consolidated floating edit mode FAB; remove per-component edit toggles`

---

## Step 14 — Move schema section editor to schema index page

Section management is currently buried inside `SchemaManager` on the serial page. Editors expect to manage a schema's structure while looking at the schema itself.

- On `src/app/[serial]/[schema]/page.tsx`: pass section and floater-row data to a new `<SchemaSectionEditor>` Client Component rendered below the schema description. Visibility is gated on `useEditMode().isEditing` (Step 13).
- `<SchemaSectionEditor>` reuses the add/rename/reorder/delete logic already in `SchemaManager`. Extract the shared pieces into `src/components/SectionEditorPanel.tsx` and import from both locations to avoid duplication.
- In `SchemaManager` on the serial page, replace the expanded section editor with a condensed read-only row count and a "Manage →" link to the schema index page.
- Commit: `feat: schema section editor on the schema index page`

---

## Step 15 — Empty states across the app

Empty lists with no message leave users confused about whether content is loading, missing, or simply not yet created.

- Serial page: if a serial has no volumes/chapters, show a prompt "No chapters yet — add your first one below" (visible always, not just in edit mode).
- Schema index page: if a schema has no pages, show "No pages yet — create the first one" with a link to the new-page form.
- Home page: if no serials exist at all, show a call-to-action "No wikis yet — create one" linking to `/new`.
- Wiki page: if a section has no content for the user's chapter cutoff, show a faint "No content for this chapter yet" placeholder rather than a blank section.
- Commit: `feat: empty state messages across serial, schema, page, and home views`

---

## Step 16 — Version history per section

After Step 3, editors can write at any chapter, but have no way to see what data points already exist in the time series. This step surfaces that.

- For each active section, fetch all `page_section_versions` rows for the current page joined to `chapters`, ordered by `chapters.idx`. This is the raw time series for that section.
- In `<PageEditor>` read mode, show a "History" toggle (collapsed by default) beneath each section listing the chapters that have an explicit version entry (e.g. "Chapter 3 · Chapter 7 · Chapter 12 (head)"). Each entry is clickable and switches the page into edit mode targeted at that chapter.
- No new DB tables or schema changes needed.
- Commit: `feat: section version history showing data points in the time series`

---

## Step 17 — Chapter pages with synopsis and introduced content

Each chapter should have its own wiki page showing a synopsis and a list of schema pages (characters, locations, etc.) introduced in that chapter. This makes chapters first-class content objects.

- Add a `chapter_synopses` table: `(chapter_id PK, content text, updated_at timestamptz)`. Run the squashed-migration workflow from CLAUDE.md.
- Create route `src/app/[serial]/chapter/[chapterIdx]/page.tsx`. Resolve the chapter by `serial_id` + `idx`. Fetch synopsis content from `chapter_synopses`. Fetch all pages whose `intro_chapter_id` matches this chapter, grouped by schema.
- Render: chapter title, synopsis (markdown, editable via Step 13's edit mode), then a grouped list of introduced pages (e.g. "Characters introduced: Anya, Yoru").
- In `<SerialTOC>` (Step 10) and `<ChapterSelector>` (Step 9), link each chapter label to `/{serial}/chapter/{idx}`.
- Commit: `feat: chapter pages with synopsis and list of introduced content`

---

## Step 18 — Text wraps around the floater sidebar

The current two-column grid layout for the wiki page body and floater sidebar places them in separate, rigid columns. Wrapping text around the floater creates a more natural reading layout.

- In `src/app/[serial]/[schema]/[page]/PageEditor.tsx`: replace the two-column CSS grid with a single-column prose container where the floater uses `float: right` with appropriate margin (`mr-0 ml-4 mb-4`) and a fixed width (e.g. `w-72`).
- The floater renders before the first section so text from all sections flows around it.
- On mobile (`sm`), remove the float and stack the floater above the content: `float-none w-full`.
- Commit: `feat: prose wraps around floater sidebar instead of rigid two-column layout`

---

## Step 19 — Spoiler-aware search

The home page currently filters serials by title client-side with substring matching. The spec calls for server-side full-text search across both serials and pages, with spoiler filtering on page results.

- Add `to_tsvector` on `pages.name` and `serials.title` (inline or as a generated column with index).
- Create a server-side search endpoint (Server Action or route handler) that:
  - Matches serials by title.
  - Matches pages by name, joining to resolve serial context.
  - Filters out pages whose `intro_chapter_id → idx` exceeds the user's progress for that serial. Read progress from the per-serial cookie (`plotarmor_chapter_{serialId}`); for serials with no cookie, use `idx = 0` (only show pages introduced at or before the first chapter).
- Replace the client-side filter in `<SerialList>` with a call to this endpoint.
- Commit: `feat: server-side spoiler-aware search with PG full-text search`

**Note:** The home page has no single-serial context, so the endpoint must read per-serial progress cookies for each serial that appears in results. This is fine — cookies are sent with every request — but the handler needs to iterate over each matched serial's cookie.

---

## Step 20 — Auth.js setup

Auth is intentionally deferred until all localStorage-based features are complete and working.

- Install `next-auth@beta` and a provider package (e.g. GitHub OAuth).
- Create `src/auth.ts` configuring Auth.js with the chosen provider; use a Drizzle adapter or custom adapter writing to the existing `users` table.
- Add `src/app/api/auth/[...nextauth]/route.ts`.
- Add `NEXTAUTH_SECRET`, `NEXTAUTH_URL`, and provider credentials to `.env.local`.
- Update `<Navbar>` to show a sign-in button (unauthenticated) or the user's display name + sign-out (authenticated) using `auth()` in a Server Component.
- Verify sign-in and sign-out work end-to-end.
- Commit: `feat: Auth.js setup with GitHub provider and session in navbar`

---

## Step 21 — Progress sync for logged-in users + auth gate

Depends on Step 20.

- In `<ChapterSelector>`, add auth awareness:
  - If the user is authenticated: call a Server Action that upserts `user_progress (user_id, serial_id, chapter_id)` in addition to writing the cookie.
  - If anonymous: cookie + localStorage only (existing behavior).
- On serial page load, read progress in priority order:
  1. `user_progress` table row (if session exists).
  2. Cookie fallback (existing anonymous behavior).
- Add auth gate to the content editor in `<PageEditor>`: only render the edit FAB (Step 13) for authenticated users.
- Merge anonymous `localStorage` progress into the DB on sign-in (nice-to-have; not required for initial ship).
- Commit: `feat: sync chapter progress to DB for authenticated users`

---

## Step 22 — Dark mode

Dark mode is deferred until the component palette is stable (after Steps 1–14 settle the layout) to avoid auditing twice.

- In `tailwind.config.ts`, set `darkMode: 'class'`.
- Create `src/components/ThemeToggle.tsx` — a sun/moon icon button that toggles a `dark` class on `<html>` and persists the preference in `localStorage` under `plotarmor:theme`.
- Add `<ThemeToggle>` to `<Navbar>`.
- Audit every component in `src/components/ui/` and every page for hardcoded light-mode colors. Add `dark:` variants where needed. Pay special attention to the markdown editor (`@uiw/react-md-editor` has a built-in `data-color-mode` prop).
- Commit: `feat: dark mode with system-preference default and manual toggle`
