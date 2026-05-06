# PlotArmor — Implementation TODO

---

## Step 1 — ~~Tooltip wrapper for icon buttons~~

---

## Step 2 — ~~Search no-match redirect to Create Wiki with prefilled title~~

---

## Step 3 — Seed new wikis with default page categories

New wikis start empty. Adding default "Character" and "Location" schemas on creation reduces the setup burden since these are near-universal categories.

- In `createSerial` (`src/app/new/actions.ts`): after inserting the serial row, insert two schemas into `schemas` and their default sections into `schema_sections` within the same transaction:
  - **Character** — sections: `Description`, `Appearances`.
  - **Location** — sections: `Description`, `Notable Events`.
- No UI change needed — the serial detail page will display them automatically after creation.
- Commit: `feat: seed new wikis with default Character and Location page categories`

---

## Step 4 — Bulk chapter input

Adding chapters one at a time is tedious for a series with many entries. A bulk-entry textarea reduces this to a single action.

- In `<SerialEditor>` (`src/components/SerialEditor.tsx`): add a "Bulk add" expander beneath each volume's chapter list (visible in edit mode). The expander reveals a `<textarea>` labelled "One [chapterType] name per line" and a Submit button.
- Add `bulkAddChapters(serialSlug: string, volumeId: number, names: string[])` to `src/app/[serial]/actions.ts`. Filter empty/whitespace lines, then insert all chapters in a single transaction, assigning `idx` values sequentially after the current maximum for the series.
- Commit: `feat: bulk chapter input for adding multiple chapters at once`

---

## Step 5 — ~~Consolidated floating edit mode~~

---

## Step 6 — ~~Empty states across the app~~

---

## Step 7 — Version history per section

After Step 3, editors can write at any chapter, but have no way to see what data points already exist in the time series. This step surfaces that.

- For each active section, fetch all `page_section_versions` rows for the current page joined to `chapters`, ordered by `chapters.idx`. This is the raw time series for that section.
- In `<PageEditor>` read mode, show a "History" toggle (collapsed by default) beneath each section listing the chapters that have an explicit version entry (e.g. "Chapter 3 · Chapter 7 · Chapter 12 (head)"). Each entry is clickable and switches the page into edit mode targeted at that chapter.
- No new DB tables or schema changes needed.
- Commit: `feat: section version history showing data points in the time series`

---

## Step 8 — Text wraps around the floater sidebar

The current two-column grid layout for the wiki page body and floater sidebar places them in separate, rigid columns. Wrapping text around the floater creates a more natural reading layout.

- In `src/app/[serial]/[schema]/[page]/PageEditor.tsx`: replace the two-column CSS grid with a single-column prose container where the floater uses `float: right` with appropriate margin (`mr-0 ml-4 mb-4`) and a fixed width (e.g. `w-72`).
- The floater renders before the first section so text from all sections flows around it.
- On mobile (`sm`), remove the float and stack the floater above the content: `float-none w-full`.
- Commit: `feat: prose wraps around floater sidebar instead of rigid two-column layout`

---

## Step 9 — Spoiler-aware search

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

## Step 10 — Auth.js setup

Auth is intentionally deferred until all localStorage-based features are complete and working.

- Install `next-auth@beta` and a provider package (e.g. GitHub OAuth).
- Create `src/auth.ts` configuring Auth.js with the chosen provider; use a Drizzle adapter or custom adapter writing to the existing `users` table.
- Add `src/app/api/auth/[...nextauth]/route.ts`.
- Add `NEXTAUTH_SECRET`, `NEXTAUTH_URL`, and provider credentials to `.env.local`.
- Update `<Navbar>` to show a sign-in button (unauthenticated) or the user's display name + sign-out (authenticated) using `auth()` in a Server Component.
- Verify sign-in and sign-out work end-to-end.
- Commit: `feat: Auth.js setup with GitHub provider and session in navbar`

---

## Step 11 — Progress sync for logged-in users + auth gate

Depends on Step 10.

- In `<ChapterSelector>`, add auth awareness:
  - If the user is authenticated: call a Server Action that upserts `user_progress (user_id, serial_id, chapter_id)` in addition to writing the cookie.
  - If anonymous: cookie + localStorage only (existing behavior).
- On serial page load, read progress in priority order:
  1. `user_progress` table row (if session exists).
  2. Cookie fallback (existing anonymous behavior).
- Add auth gate to the content editor in `<PageEditor>`: only render the edit FAB (Step 5) for authenticated users.
- Merge anonymous `localStorage` progress into the DB on sign-in (nice-to-have; not required for initial ship).
- Commit: `feat: sync chapter progress to DB for authenticated users`

---

## Step 12 — Dark mode

Dark mode is deferred until the component palette is stable (after Steps 1–14 settle the layout) to avoid auditing twice.

- In `tailwind.config.ts`, set `darkMode: 'class'`.
- Create `src/components/ThemeToggle.tsx` — a sun/moon icon button that toggles a `dark` class on `<html>` and persists the preference in `localStorage` under `plotarmor:theme`.
- Add `<ThemeToggle>` to `<Navbar>`.
- Audit every component in `src/components/ui/` and every page for hardcoded light-mode colors. Add `dark:` variants where needed. Pay special attention to the markdown editor (`@uiw/react-md-editor` has a built-in `data-color-mode` prop).
- Commit: `feat: dark mode with system-preference default and manual toggle`
