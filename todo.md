# PlotArmor — Implementation TODO

---

## ~~Step 1 — Neon DB + Vercel project setup~~

~~Do this first so every subsequent step can be tested against the real hosted DB.~~

- ~~Create a Neon project (e.g. `plot-armor-wiki`). Copy the pooled connection string.~~
- ~~Create a Vercel project linked to the GitHub repo. Set the framework to Next.js.~~
- ~~Add `DATABASE_URL` (Neon pooled URL) to both `.env.local` and Vercel environment variables.~~
- ~~Run the squashed migration against Neon: `pnpm drizzle-kit migrate`.~~
- ~~Smoke-test: `pnpm dev` with the Neon URL — confirm the home page loads data.~~

---

## ~~Step 2 — Schema: extend users + add auth tables + serial_admins~~

~~Auth.js's Drizzle adapter requires specific table shapes. Align the schema before wiring anything up.~~

- ~~Change `users.id` from `serial` to `text` UUID, add `username`, `image`, rename `displayName` → `name`.~~
- ~~Add Auth.js adapter tables: `accounts`, `sessions`, `verification_tokens`.~~
- ~~Add `serial_admins (userId, serialId, grantedAt)`.~~

---

## - [ ] Step 3 — Schema: replace categories with DAG + per-page structure

The category system is removed entirely. Pages now belong directly to a serial and relate to each other via a directed acyclic graph. Sections and infoboxes move from the category level to the individual page. Titles become temporally versioned.

**Remove tables:**
- `page_categories`
- `category_sections`
- `category_floater_rows`
- `page_section_versions`
- `page_floater_versions`
- `page_floater_row_versions`
- `page_summaries`

**Update `pages` table:**
- Remove `category_id` FK; add `serial_id` FK → `serials.id`.
- Add `slug text NOT NULL` with a unique index on `(serial_id, slug)`.
- Keep `intro_chapter_id` (temporal page visibility — unchanged).
- Keep `name` temporarily to seed initial `page_titles` entries; drop in a later migration once data is migrated.

**Add tables:**
```
page_titles        (page_id FK, chapter_id FK, title text)
                   PK (page_id, chapter_id)

page_sections      (id serial PK, page_id FK, name text, display_order int, created_at, deleted_at)

page_section_revisions  (page_id FK, section_id FK, chapter_id FK, content text)
                         PK (page_id, section_id, chapter_id)

page_infobox_sections   (id serial PK, page_id FK, label text, display_order int, created_at, deleted_at)

page_infobox_revisions  (page_id FK, infobox_section_id FK, chapter_id FK, content text)
                         PK (page_id, infobox_section_id, chapter_id)

page_infobox_image_revisions  (page_id FK, chapter_id FK, image_url text)
                               PK (page_id, chapter_id)

page_relationships  (parent_page_id FK, child_page_id FK, chapter_id FK, is_active boolean)
                    — each row is a snapshot: read the latest row per (parent, child) pair
                      where chapter_idx <= cutoff to determine current relationship state
                    PK (parent_page_id, child_page_id, chapter_id)

templates           (id serial PK, serial_id FK, name text, has_infobox boolean default false)

template_sections   (id serial PK, template_id FK, name text, display_order int)

template_infobox_sections  (id serial PK, template_id FK, label text, display_order int)
```

After schema edits: `pnpm drizzle-kit generate` → `pnpm drizzle-kit migrate`.

---

## - [ ] Step 4 — Routing: collapse `/{serial}/{category}/{page}` → `/{serial}/{page-slug}`

The category segment is removed from all URLs.

- Delete `src/app/[serial]/[category]/` directory tree (all routes, editors, actions).
- Create `src/app/[serial]/[page]/page.tsx` — resolves page by `slug` within the serial (query: `WHERE serial_id = ? AND slug = ?`); passes page data to `<PageEditor>`.
- Move page creation to `src/app/[serial]/new/` (was `[serial]/[category]/new/`).
- Update `src/app/[serial]/actions.ts` — remove all category/section/floater Server Actions; they are replaced in Steps 6–9.
- Update the `remarkWikiLinks` plugin and `slugifyWikiName` to emit 2-level URLs (`/{serial}/{page-slug}`), dropping the category prefix.
- Update wiki link autocomplete in `WikiLinkMDEditor` to remove the category segment from suggestions.

---

## - [ ] Step 5 — Serial page: replace category list with wiki page DAG navigation

The serial detail page (`/{serial}`) no longer shows a category list. It becomes the entry point to the wiki page tree.

- When creating a serial (`createSerial` action): automatically insert a root wiki page (`slug = "index"`, `intro_chapter_id` = first chapter) into `pages` and seed an initial entry in `page_titles`. This root page has no row in `page_relationships` (no parent — it is the DAG root).
- On `/{serial}`: remove `<CategoryManager>`. In its place show a list of top-level wiki pages (pages whose only parent is the root, or the root page itself), linking to `/{serial}/{slug}`.
- Remove `SerialMetadataEditor`'s category-aware redirect logic; the serial slug change redirect remains.
- Remove all category-related imports and Server Actions from `src/app/[serial]/actions.ts` and `src/app/[serial]/page.tsx`.

---

## - [ ] Step 6 — Page creation with parent assignment and slug generation

New pages are created under a chosen parent page (not a category).

- Page creation form at `src/app/[serial]/new/page.tsx`: fields for page name, intro chapter (grouped by volume), and parent page (dropdown of all pages visible at the head chapter).
- `createPage` Server Action in `src/app/[serial]/new/actions.ts`:
  1. Insert into `pages` (`serial_id`, `slug`, `intro_chapter_id`).
  2. Insert initial title into `page_titles` at `intro_chapter_id`.
  3. Slug generation: `titleToSlug(name)` deduped with a numeric suffix on collision within the serial.
  4. Insert a `page_relationships` row (`parent_page_id`, `child_page_id = new page`, `chapter_id = head chapter`, `is_active = true`).
  5. Redirect to `/{serial}/{slug}`.
- Show child pages in `<PageEditor>` read mode: query `page_relationships` for active children at the user's chapter cutoff; list them below the page content.

---

## - [ ] Step 7 — Temporal page titles

Page titles change over the story's progression. The static `pages.name` field is replaced with `page_titles`.

- In `PageEditor` (edit mode): add a "Titles" panel listing all `page_titles` rows for this page (title + chapter label). Allow adding a new title revision at any chapter via a small form (chapter selector + text input).
- Read-mode rendering: resolve the displayed title by finding the `page_titles` row with the highest `chapters.idx ≤ user_cutoff` (same read pattern as section content).
- Server Actions: `addPageTitle(pageId, chapterId, title)`, `deletePageTitle(pageId, chapterId)`.
- Once title data is confirmed seeded, drop `pages.name` in a follow-up migration.

---

## - [ ] Step 8 — Per-page sections

Sections belong to individual pages, not categories. The section structure is wall-clock versioned; content is chapter-versioned.

- In `PageEditor` (edit mode): add a "Sections" management panel — add section (name), delete section (only if no content revisions), reorder sections (drag-and-drop via `@dnd-kit`). Mirrors current category section manager but scoped to the page.
- `savePageContent` and `getPageContentAtChapter` Server Actions: rewrite to query `page_sections` + `page_section_revisions` instead of `category_sections` + `page_section_versions`.
- Server Actions: `addPageSection`, `deletePageSection`, `renamePageSection`, `reorderPageSections` in `src/app/[serial]/[page]/actions.ts`.
- Migrate existing data: for each existing page, create a `page_sections` row for every `category_section` that was assigned to its former category, and copy `page_section_versions` rows into `page_section_revisions`. Convert `page_summaries` rows into the first `page_sections` row (named "Summary") per page.

---

## - [ ] Step 9 — Per-page infoboxes

Infoboxes move from the category level (floaters) to the individual page.

- Each page optionally has an infobox: a chapter-versioned image + ordered labeled rows, each with their own chapter-versioned content.
- In `PageEditor` (edit mode): "Infobox" panel — toggle infobox on/off (presence of any `page_infobox_sections` rows determines this); add/remove/reorder infobox sections; edit image URL and row content, all versioned by the target chapter selector.
- Read-mode rendering: render infobox at user's chapter cutoff using the same `max(idx) ≤ cutoff` pattern for image and each row.
- Server Actions: `addInfboxSection`, `deleteInfboxSection`, `reorderInfboxSections`, `saveInfboxContent` in `src/app/[serial]/[page]/actions.ts`.
- Migrate existing data: copy `page_floater_versions` → `page_infobox_image_revisions`, `page_floater_row_versions` → `page_infobox_revisions`, `category_floater_rows` → `page_infobox_sections` for each page that was in a category with `has_floater = true`.

---

## - [ ] Step 10 — DAG page relationships UI

Pages can have multiple parents. Relationships are temporal.

- In `PageEditor` (read mode): show a breadcrumb of parent pages resolved at the user's chapter cutoff (query: latest `page_relationships` row per parent where `chapter_idx ≤ cutoff AND is_active = true`).
- In `PageEditor` (edit mode): "Relationships" panel — list current active parents; "Add parent" dropdown (all pages in serial); "Remove" button per parent.
- Server Actions: `addPageRelationship(childPageId, parentPageId, chapterId)`, `removePageRelationship(childPageId, parentPageId, chapterId)` — both insert a new row (is_active true/false respectively) rather than mutating existing rows.
- Cycle detection: before inserting an `is_active = true` relationship, verify the resulting graph remains acyclic (DFS/BFS from the proposed child; reject if it reaches the proposed parent).
- Guard: prevent removing a relationship if it would leave a non-root page with zero parents at any chapter snapshot.

---

## - [ ] Step 11 — Templates

Admins can define reusable page templates per serial to pre-populate sections and infobox structure.

- Template management UI on `/{serial}` — visible only to admins in edit mode: create/delete/rename templates, add/remove section names, toggle `has_infobox`, add/remove infobox section labels.
- Server Actions: `createTemplate`, `deleteTemplate`, `renameTemplate`, `addTemplateSection`, `deleteTemplateSection`, `reorderTemplateSections`, `addTemplateInfboxSection`, `deleteTemplateInfboxSection` in `src/app/[serial]/actions.ts`.
- Page creation form (Step 6): add optional "Use template" dropdown. On selection, preview the template's sections and infobox sections. On submit, `createPage` seeds `page_sections` and `page_infobox_sections` from the selected template before redirecting.

---

## - [ ] Step 12 — Auth.js with Google provider

- Install: `pnpm add next-auth@beta @auth/drizzle-adapter`.
- Create `src/auth.ts`: use `@auth/drizzle-adapter`, configure Google provider (`AUTH_GOOGLE_ID`, `AUTH_GOOGLE_SECRET`), use database sessions so `session.user.id` is available server-side. After sign-in, redirect to `/onboarding` if `users.username` is null.
- Add `src/app/api/auth/[...nextauth]/route.ts` (re-export handlers).
- Add env vars to `.env.local` and Vercel: `AUTH_SECRET`, `AUTH_GOOGLE_ID`, `AUTH_GOOGLE_SECRET`, `AUTH_URL`.
- Set authorized redirect URIs in Google Cloud Console for local and deployed URLs.
- Update `<Navbar>` to use `auth()` (Server Component): show "Sign in" / avatar + "Sign out" based on session.
- Verify sign-in and sign-out work end-to-end.

---

## - [ ] Step 13 — Username onboarding

New Google sign-ins have `users.username = null`. Gate access until a username is chosen.

- Create `/onboarding` page: text input for username (alphanumeric + underscores, 3–20 chars). Server Action `setUsername`: validates uniqueness, writes `users.username`, redirects to `/`.
- In root layout or middleware: redirect session users with null username to `/onboarding`. Skip `/api/auth/**` and `/onboarding` to avoid redirect loops.

---

## - [ ] Step 14 — Serial admin permissions: auto-grant on create + Server Action gates

- In `createSerial` Server Action: require session; after inserting the serial, insert a `serial_admins` row for the creator.
- Add `requireSerialAdmin(serialId)` helper in `src/lib/auth-guard.ts`: reads session, queries `serial_admins`, throws if not found.
- Gate every mutating Server Action in `[serial]/actions.ts` and `[serial]/[page]/actions.ts` behind `requireSerialAdmin`.

---

## - [ ] Step 15 — Edit UI gates (hide edit controls for non-admins)

- In `src/app/[serial]/[page]/page.tsx`: call `auth()`, check `serial_admins`, pass `isAdmin: boolean` to `<PageEditor>`.
- In `<PageEditor>`: hide the edit FAB and all edit-mode controls when `isAdmin` is false.
- Apply the same pattern to `<SerialEditor>` and template management on `/{serial}` — each reads `isAdmin` from its parent Server Component.

---

## - [ ] Step 16 — Admin management UI

- On `/{serial}`, add an "Admins" section visible only to existing admins: list current admins (join `serial_admins → users`, show `username`); "Add admin" input (look up by username, insert into `serial_admins`); "Remove" button per admin (prevent removing yourself if sole admin).
- Server Actions: `addSerialAdmin(serialId, username)`, `removeSerialAdmin(serialId, userId)` — both gated behind `requireSerialAdmin`.

---

## - [ ] Step 17 — Deploy to Vercel + production smoke test

- Push to GitHub; Vercel auto-deploys.
- Verify all Vercel env vars are set (`DATABASE_URL`, `AUTH_SECRET`, `AUTH_GOOGLE_ID`, `AUTH_GOOGLE_SECRET`, `AUTH_URL`).
- Test full flow on production: sign in → onboarding → create serial → edit wiki page → sign out → confirm edit controls hidden.
- If needed, assign a custom domain and update `AUTH_URL` + Google redirect URIs.

---

## - [ ] Step 18 — Progress sync for logged-in users

- In `<ChapterSelector>`: when authenticated, call a Server Action that upserts `user_progress (user_id, serial_id, chapter_id)` in addition to writing the cookie/localStorage.
- On serial page load, read progress in priority order: (1) `user_progress` table row if session exists, (2) cookie fallback.

---

## - [ ] Step 19 — Dark mode

- In `tailwind.config.ts`, set `darkMode: 'class'`.
- Create `src/components/ThemeToggle.tsx` — sun/moon icon button toggling a `dark` class on `<html>`, persisted in `localStorage` under `plotarmor:theme`.
- Add `<ThemeToggle>` to `<Navbar>`.
- Audit all components and pages for hardcoded light-mode colors; add `dark:` variants. Pay special attention to `@uiw/react-md-editor` (`data-color-mode` prop).

---

## - [ ] Step 20 — Spoiler-aware search

- Add `to_tsvector` on `pages` (resolved title) and `serials.title` (inline or generated column with index).
- Create a server-side search endpoint (Server Action or route handler) that:
  - Matches serials by title.
  - Matches pages by resolved title at the user's chapter cutoff, filtering out pages whose `intro_chapter_id → idx` exceeds the user's progress for that serial.
  - Reads progress from the per-serial cookie (`plotarmor_chapter_{serialId}`); uses `idx = 0` for serials with no cookie.
- Replace the client-side filter in `<SerialList>` with a call to this endpoint.

**Note:** The home page has no single-serial context, so the endpoint must read per-serial progress cookies for each serial that appears in results.
