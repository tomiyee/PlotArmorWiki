# PlotArmor — Implementation TODO

---

## Step 1 — Auth.js setup

Auth is intentionally deferred until all localStorage-based features are complete and working.

- Install `next-auth@beta` and a provider package (e.g. GitHub OAuth).
- Create `src/auth.ts` configuring Auth.js with the chosen provider; use a Drizzle adapter or custom adapter writing to the existing `users` table.
- Add `src/app/api/auth/[...nextauth]/route.ts`.
- Add `NEXTAUTH_SECRET`, `NEXTAUTH_URL`, and provider credentials to `.env.local`.
- Update `<Navbar>` to show a sign-in button (unauthenticated) or the user's display name + sign-out (authenticated) using `auth()` in a Server Component.
- Verify sign-in and sign-out work end-to-end.
- Commit: `feat: Auth.js setup with GitHub provider and session in navbar`

---

## Step 2 — Progress sync for logged-in users + auth gate

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

## Step 3 — Dark mode

Dark mode is deferred until the component palette is stable (after Steps 1–14 settle the layout) to avoid auditing twice.

- In `tailwind.config.ts`, set `darkMode: 'class'`.
- Create `src/components/ThemeToggle.tsx` — a sun/moon icon button that toggles a `dark` class on `<html>` and persists the preference in `localStorage` under `plotarmor:theme`.
- Add `<ThemeToggle>` to `<Navbar>`.
- Audit every component in `src/components/ui/` and every page for hardcoded light-mode colors. Add `dark:` variants where needed. Pay special attention to the markdown editor (`@uiw/react-md-editor` has a built-in `data-color-mode` prop).
- Commit: `feat: dark mode with system-preference default and manual toggle`

## Step 4 — Spoiler-aware search

The home page currently filters serials by title client-side with substring matching. The spec calls for server-side full-text search across both serials and pages, with spoiler filtering on page results.

- Add `to_tsvector` on `pages.name` and `serials.title` (inline or as a generated column with index).
- Create a server-side search endpoint (Server Action or route handler) that:
  - Matches serials by title.
  - Matches pages by name, joining to resolve serial context.
  - Filters out pages whose `intro_chapter_id → idx` exceeds the user's progress for that serial. Read progress from the per-serial cookie (`plotarmor_chapter_{serialId}`); for serials with no cookie, use `idx = 0` (only show pages introduced at or before the first chapter).
- Replace the client-side filter in `<SerialList>` with a call to this endpoint.
- Commit: `feat: server-side spoiler-aware search with PG full-text search`

**Note:** The home page has no single-serial context, so the endpoint must read per-serial progress cookies for each serial that appears in results. This is fine — cookies are sent with every request — but the handler needs to iterate over each matched serial's cookie.
