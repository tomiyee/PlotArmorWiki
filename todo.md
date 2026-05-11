# PlotArmor — Implementation TODO

---

## ~~Step 1 — Neon DB + Vercel project setup~~

~~Do this first so every subsequent step can be tested against the real hosted DB.~~

- ~~Create a Neon project (e.g. `plot-armor-wiki`). Copy the pooled connection string.~~
- ~~Create a Vercel project linked to the GitHub repo. Set the framework to Next.js.~~
- ~~Add `DATABASE_URL` (Neon pooled URL) to both `.env.local` and Vercel environment variables.~~
- ~~Run the squashed migration against Neon: `pnpm drizzle-kit migrate`.~~
- ~~Smoke-test: `pnpm dev` with the Neon URL — confirm the home page loads data.~~
- ~~Commit: `chore: switch to Neon DB`~~

---

## Step 2 — Schema: extend users + add auth tables + serial admins

Auth.js's Drizzle adapter requires specific table shapes. Align the schema before wiring anything up.

**Change `users` table:**

- Change `id` from `serial` (integer) to `text` (UUID, `$defaultFn(() => crypto.randomUUID())`). Update all foreign keys in `user_progress` accordingly.
- Add `username text UNIQUE` (nullable — set during onboarding after first sign-in).
- Add `image text` (profile picture URL from Google).
- Rename `displayName` → `name` to match Auth.js conventions (the adapter writes `name`).

**Add Auth.js adapter tables** (required by `@auth/drizzle-adapter`):

```
accounts (userId FK, type, provider, providerAccountId, refresh_token, access_token, expires_at, token_type, scope, id_token, session_state)
sessions (sessionToken PK, userId FK, expires)
verification_tokens (identifier, token, expires) — composite PK
```

**Add `serial_admins` table:**

```
serial_admins (userId FK → users.id, serialId FK → serials.id, grantedAt timestamp)
Primary key: (userId, serialId)
```

After schema edits:

1. `pnpm drizzle-kit generate` → creates a new incremental migration file.
2. `pnpm drizzle-kit migrate` (Neon).

- Commit: `feat: schema — uuid users, Auth.js adapter tables, serial_admins`

---

## Step 3 — Auth.js with Google provider

- Install: `pnpm add next-auth@beta @auth/drizzle-adapter`.
- Create `src/auth.ts`:
  - Use `@auth/drizzle-adapter` with the `db` instance.
  - Configure Google provider only (`AUTH_GOOGLE_ID`, `AUTH_GOOGLE_SECRET`).
  - Use database sessions (not JWT) so `session.user.id` is available server-side.
  - After sign-in callback, if `users.username` is null, set a flag or redirect to onboarding (Step 4).
- Add `src/app/api/auth/[...nextauth]/route.ts` (re-export handlers from `src/auth.ts`).
- Add env vars to `.env.local` and Vercel:
  - `AUTH_SECRET` (generate with `openssl rand -base64 32`)
  - `AUTH_GOOGLE_ID`, `AUTH_GOOGLE_SECRET` (from Google Cloud Console OAuth 2.0 client)
  - `AUTH_URL` (local: `http://localhost:3000`, Vercel: your `.vercel.app` domain)
- Set authorized redirect URIs in Google Cloud Console:
  - `http://localhost:3000/api/auth/callback/google`
  - `https://<your-app>.vercel.app/api/auth/callback/google`
- Update `<Navbar>` to use `auth()` (Server Component): show "Sign in" button when no session, or avatar + display name + "Sign out" when authenticated.
- Verify sign-in and sign-out work end-to-end (local + deployed).
- Commit: `feat: Auth.js setup with Google provider and session in navbar`

---

## Step 4 — Username onboarding

New Google sign-ins have `users.username = null`. Gate access until a username is chosen.

- Create `/onboarding` page (Server Component check + Client form):
  - Text input for username (alphanumeric + underscores, 3–20 chars).
  - Server Action `setUsername`: validates uniqueness (UNIQUE constraint + explicit check for a user-friendly error), writes to `users.username`, then redirects to `/`.
- In the root layout (or middleware), check if the session user has a null username and redirect to `/onboarding` if so. Skip the redirect for `/api/auth/**` and `/onboarding` itself to avoid loops.
- Commit: `feat: username onboarding flow for new Google sign-ins`

---

## Step 5 — Serial admin permissions: auto-grant on create + Server Action gates

- In `createSerial` Server Action (`src/app/new/actions.ts`):
  - Read the session; require authentication (return error if no session).
  - After inserting the serial, insert a row into `serial_admins (userId, serialId)` to make the creator an admin.
- Add a shared helper `requireSerialAdmin(serialId)` in `src/lib/auth-guard.ts`:
  - Reads the session via `auth()`.
  - Queries `serial_admins` for `(session.user.id, serialId)`.
  - Throws (or returns an error response) if not found.
- Gate every mutating Server Action in `[serial]/actions.ts`, `[serial]/[category]/actions.ts`, `[serial]/[category]/[page]/actions.ts` behind `requireSerialAdmin`.
- Commit: `feat: serial admin permission checks on all write actions`

---

## Step 6 — Edit UI gates (hide edit controls for non-admins)

Server Components can call `auth()` directly; use that to conditionally pass an `isAdmin` prop down to Client Components.

- In `src/app/[serial]/[category]/[page]/page.tsx`: call `auth()`, check `serial_admins` for the current user, pass `isAdmin: boolean` to `<PageEditor>`.
- In `<PageEditor>`: hide the edit FAB and all edit-mode controls when `isAdmin` is false.
- Apply the same pattern to `<CategoryIndexEditor>`, `<SerialEditor>`, `<CategoryManager>`, and `<SerialMetadataEditor>` — each gets an `isAdmin` prop from its parent Server Component.
- Do not show edit affordances to unauthenticated users or users without admin rights for that serial.
- Commit: `feat: hide edit controls for non-admin users`

---

## Step 7 — Admin management UI

- On the serial detail page (`/[serial]`), add an "Admins" section (only visible to existing admins):
  - List current admins (join `serial_admins` → `users`, show `username`).
  - "Add admin" input: look up user by username, insert into `serial_admins`.
  - "Remove" button per admin (prevent removing yourself if you're the only admin).
- Server Actions: `addSerialAdmin(serialId, username)`, `removeSerialAdmin(serialId, userId)` — both gated behind `requireSerialAdmin`.
- Commit: `feat: serial admin management UI`

---

## Step 8 — Deploy to Vercel + production smoke test

By this point auth is working locally. Flip to production.

- Push the branch to GitHub; Vercel auto-deploys.
- Verify all Vercel environment variables are set (`DATABASE_URL`, `AUTH_SECRET`, `AUTH_GOOGLE_ID`, `AUTH_GOOGLE_SECRET`, `AUTH_URL`).
- Test the full flow on the production URL: sign in with Google → onboarding → create serial (auto-granted admin) → edit a wiki page → sign out → confirm edits are hidden.
- If needed, assign a custom domain in Vercel and update `AUTH_URL` + Google redirect URIs.
- Commit: `chore: production deployment verified`

---

## Step 9 — Progress sync for logged-in users

After auth is stable, sync chapter progress to the DB.

- In `<ChapterSelector>`, add auth awareness:
  - Authenticated: call a Server Action that upserts `user_progress (user_id, serial_id, chapter_id)` in addition to writing the cookie.
  - Anonymous: cookie + localStorage only (existing behavior).
- On serial page load, read progress in priority order:
  1. `user_progress` table row (if session exists).
  2. Cookie fallback (existing anonymous behavior).
- Commit: `feat: sync chapter progress to DB for authenticated users`

---

## Step 10 — Dark mode

Dark mode is deferred until the component palette is stable (after auth/deploy settle the layout).

- In `tailwind.config.ts`, set `darkMode: 'class'`.
- Create `src/components/ThemeToggle.tsx` — sun/moon icon button that toggles a `dark` class on `<html>` and persists the preference in `localStorage` under `plotarmor:theme`.
- Add `<ThemeToggle>` to `<Navbar>`.
- Audit every component in `src/components/ui/` and every page for hardcoded light-mode colors; add `dark:` variants. Pay special attention to `@uiw/react-md-editor` (has a built-in `data-color-mode` prop).
- Commit: `feat: dark mode with system-preference default and manual toggle`

---

## Step 11 — Spoiler-aware search

- Add `to_tsvector` on `pages.name` and `serials.title` (inline or as a generated column with index).
- Create a server-side search endpoint (Server Action or route handler) that:
  - Matches serials by title.
  - Matches pages by name, joining to resolve serial context.
  - Filters out pages whose `intro_chapter_id → idx` exceeds the user's progress for that serial. Read progress from the per-serial cookie (`plotarmor_chapter_{serialId}`); for serials with no cookie, use `idx = 0`.
- Replace the client-side filter in `<SerialList>` with a call to this endpoint.
- Commit: `feat: server-side spoiler-aware search with PG full-text search`

**Note:** The home page has no single-serial context, so the endpoint must read per-serial progress cookies for each serial that appears in results.
