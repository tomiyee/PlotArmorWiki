# PlotArmor — Implementation TODO

---

## - [X] Step 1 — Neon DB + Vercel project setup

---

## - [X] Step 2 — Schema: extend users + add auth tables + serial_admins

---

## - [X] Step 3 — Schema: replace categories with DAG + per-page structure

---

## - [X] Step 4 — Routing: collapse `/{serial}/{category}/{page}` → `/{serial}/{page-slug}`

---

## - [X] Step 5 — Serial page: replace category list with wiki page DAG navigation

---

## - [X] Step 6 — Page creation with parent assignment and slug generation

---

## - [X] Step 7 — Temporal page titles

---

## - [X] Step 8 — Per-page sections

---

## - [X] Step 9 — Per-page infoboxes

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

## - [ ] Step 20 — Put Set Your Chapter to Avoid Spoilers in a Popover

- Currently the warning is in line. Instead, make it a popover that is open by default and dismissed only when the user manually sets their chapter for the first time or manually clicks an "x" button in the popover.
- The popover should also say it defaulted to the first chapter to avoid spoilers.
- This should only be visible for the first time across all sreials. Going to a second serial does not alsos show this

---

## - [ ] Step 21 — When the screen is thin, compact the top right nav bar

- When the screen is thin, replace the top right dropdown that controls the currently selected chapter into a hamburger menu that opens a side drawer.
- The warning to set your chapter should appear over the hamburger menu if relevant.

---

## - [ ] Step 22 — The Serial Page's Description should be the Home Page's top section

- When creating a new Serial, users enter a Description. Use a Markdown editor for that input field.
- This description should be used to populate the Serial's Home page's first section, the one without a header.
- The Serial's index page should show the Serial's Home page's sections.

---

## - [ ] Step 23 — Spoiler-aware search

- Add `to_tsvector` on `pages` (resolved title) and `serials.title` (inline or generated column with index).
- Create a server-side search endpoint (Server Action or route handler) that:
  - Matches serials by title.
  - Matches pages by resolved title at the user's chapter cutoff, filtering out pages whose `intro_chapter_id → idx` exceeds the user's progress for that serial.
  - Reads progress from the per-serial cookie (`plotarmor_chapter_{serialId}`); uses `idx = 0` for serials with no cookie.
- Replace the client-side filter in `<SerialList>` with a call to this endpoint.

**Note:** The home page has no single-serial context, so the endpoint must read per-serial progress cookies for each serial that appears in results.
