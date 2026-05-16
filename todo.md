# PlotArmor — Implementation TODO

---

## - [X] Step 1 — Templates

---

## - [X] Step 2 — Auth.js with Google provider

---

## - [X] Step 3 — Username onboarding

---

## - [ ] Step 4 — Serial admin permissions: auto-grant on create + Server Action gates

- In `createSerial` Server Action: require session; after inserting the serial, insert a `serial_admins` row for the creator.
- Add `requireSerialAdmin(serialId)` helper in `src/lib/auth-guard.ts`: reads session, queries `serial_admins`, throws if not found.
- Gate every mutating Server Action in `[serial]/actions.ts` and `[serial]/[page]/actions.ts` behind `requireSerialAdmin`.

---

## - [ ] Step 5 — Edit UI gates (hide edit controls for non-admins)

- In `src/app/[serial]/[page]/page.tsx`: call `auth()`, check `serial_admins`, pass `isAdmin: boolean` to `<PageEditor>`.
- In `<PageEditor>`: hide the edit FAB and all edit-mode controls when `isAdmin` is false.
- Apply the same pattern to `<SerialEditor>` and template management on `/{serial}` — each reads `isAdmin` from its parent Server Component.

---

## - [ ] Step 6 — Admin management UI

- On `/{serial}`, add an "Admins" section visible only to existing admins: list current admins (join `serial_admins → users`, show `username`); "Add admin" input (look up by username, insert into `serial_admins`); "Remove" button per admin (prevent removing yourself if sole admin).
- Server Actions: `addSerialAdmin(serialId, username)`, `removeSerialAdmin(serialId, userId)` — both gated behind `requireSerialAdmin`.

---

## - [ ] Step 7 — Deploy to Vercel + production smoke test

- Push to GitHub; Vercel auto-deploys.
- Verify all Vercel env vars are set (`DATABASE_URL`, `AUTH_SECRET`, `AUTH_GOOGLE_ID`, `AUTH_GOOGLE_SECRET`, `AUTH_URL`).
- Test full flow on production: sign in → onboarding → create serial → edit wiki page → sign out → confirm edit controls hidden.
- If needed, assign a custom domain and update `AUTH_URL` + Google redirect URIs.

---

## - [ ] Step 8 — Progress sync for logged-in users

- In `<ChapterSelector>`: when authenticated, call a Server Action that upserts `user_progress (user_id, serial_id, chapter_id)` in addition to writing the cookie/localStorage.
- On serial page load, read progress in priority order: (1) `user_progress` table row if session exists, (2) cookie fallback.

---

## - [ ] Step 9 — Dark mode

- In `tailwind.config.ts`, set `darkMode: 'class'`.
- Create `src/components/ThemeToggle.tsx` — sun/moon icon button toggling a `dark` class on `<html>`, persisted in `localStorage` under `plotarmor:theme`.
- Add `<ThemeToggle>` to `<Navbar>`.
- Audit all components and pages for hardcoded light-mode colors; add `dark:` variants. Pay special attention to `@uiw/react-md-editor` (`data-color-mode` prop).

---

## - [ ] Step 10 — Spoiler-aware search

- Add `to_tsvector` on `pages` (resolved title) and `serials.title` (inline or generated column with index).
- Create a server-side search endpoint (Server Action or route handler) that:
  - Matches serials by title.
  - Matches pages by resolved title at the user's chapter cutoff, filtering out pages whose `intro_chapter_id → idx` exceeds the user's progress for that serial.
  - Reads progress from the per-serial cookie (`plotarmor_chapter_{serialId}`); uses `idx = 0` for serials with no cookie.
- Replace the client-side filter in `<SerialList>` with a call to this endpoint.

**Note:** The home page has no single-serial context, so the endpoint must read per-serial progress cookies for each serial that appears in results.
