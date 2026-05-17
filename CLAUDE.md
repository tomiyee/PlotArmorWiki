# CLAUDE.md

## Commands

```bash
npm run dev                          # start Next.js dev server
rtk npm run build                    # production build
rtk npm run lint                     # run ESLint
rtk npx drizzle-kit generate         # generate migration after schema changes
rtk npx drizzle-kit migrate          # apply pending migrations
```

### Schema change workflow

Whenever `src/db/schema.ts` changes: generate migration → apply → commit schema + migration + `drizzle/meta/` together.

Local dev: set `DATABASE_URL`, `AUTH_SECRET`, `AUTH_GOOGLE_ID`, `AUTH_GOOGLE_SECRET`, and `AUTH_URL` in `.env.local`, then `.\scripts\start-db.ps1` to create/start the Postgres container.

No test runner configured.

## Architecture

PlotArmor is a spoiler-safe wiki platform. Users set a **chapter cutoff** per serial and see only content introduced at or before that chapter.

### URL structure

```
/                    # home
/{serial}            # serial home (metadata + home wiki page)
/{serial}/new        # new wiki page form
/{serial}/{slug}     # wiki page
```

### Tech stack

| Layer         | Choice                                                       |
| ------------- | ------------------------------------------------------------ |
| Framework     | Next.js 16 (App Router, SSR)                                 |
| Database      | PostgreSQL (serverless)                                      |
| ORM           | Drizzle ORM                                                  |
| Auth          | Auth.js (NextAuth v5) — Google OAuth, Drizzle adapter        |
| Search        | PostgreSQL full-text search (tsvector) — not yet implemented |
| Markdown      | `@uiw/react-md-editor` (edit) + `react-markdown` (render)    |
| Styling       | Tailwind CSS v4                                              |
| UI components | Shadcn UI (Button, Input, Select, Dialog) + custom Text      |
| Hosting       | Vercel                                                       |

### Core data pattern: single-timestamp versioning

All wiki page content is chapter-versioned. Each revision carries a `chapter_id`. At most one revision per `(page, section, chapter)` (enforced by PK). Read content at index N = highest `chapter.idx ≤ N`:

```sql
SELECT ... GROUP BY section_id HAVING chapters.idx = MAX(chapters.idx)
WHERE page_id = ? AND chapters.idx <= N
```

**Page structure** (sections, infobox sections) is wall-clock versioned (`created_at`/`deleted_at`).
**Page content** is chapter-versioned. Stable IDs on `page_sections`/`page_infobox_sections` decouple content from renames/reorders.

### Server/Client Component boundary

Chapter selector = Client Component (reactive). Everything else (page body, floater, search) = Server Components using cookie-read cutoff. Wrong boundary → stale renders or unnecessary client JS.

### Progress state

- **Anonymous** — `localStorage` per serial.
- **Logged-in** — `user_progress` table (`user_id`, `serial_id`, `chapter_id`).

First-time visitors default to chapter 1 with a callout to update.

### Spoiler filtering

- Pages with `intro_chapter_id` > cutoff: fully hidden, title withheld.
- Search: excludes those pages server-side (same SQL filter).

### Key files

| File                                      | Purpose / non-obvious notes                                                                                                                                           |
| ----------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `spec.md`                                 | Canonical product + data model spec. Consult before changing data model or spoiler logic.                                                                             |
| `src/db/schema.ts`                        | Drizzle table definitions; source of truth.                                                                                                                           |
| `src/db/index.ts`                         | Drizzle client (postgres.js); exports `db`.                                                                                                                           |
| `src/app/layout.tsx`                      | Root layout. `overflow-y-auto` wrapper prevents scrollbar shift when dialogs open.                                                                                    |
| `src/app/[serial]/layout.tsx`             | Fetches serial/volumes/chapters/home-page children; injects `<ChapterSelector>` + `<SerialTOCDrawer>` via `<SerialNavInjector>`.                                      |
| `src/app/[serial]/page.tsx`               | Serial home; two-column layout with `<SerialTOCSidebar>`.                                                                                                             |
| `src/app/[serial]/actions.ts`             | Volume/chapter CRUD + reorder. Reorder reassigns `chapters.idx`; no version repair needed (revisions keyed by `chapter_id`).                                          |
| `src/app/[serial]/new/actions.ts`         | `createPage`: unique slug, inserts page + title + parent relationship, redirects.                                                                                     |
| `src/app/[serial]/[page]/page.tsx`        | Wiki page view. Reads cutoff from cookie, fetches chapter-filtered content, delegates to `<PageEditor>`.                                                              |
| `src/app/[serial]/[page]/PageEditor.tsx`  | Client Component owning page body. Edit mode: `<WikiLinkMDEditor>` per section, "Writing as of:" chapter selector, calls `getPageContentAtChapter` on chapter change. |
| `src/app/[serial]/[page]/actions.ts`      | `savePageContent` (upserts at target chapter) + `getPageContentAtChapter` (pre-fills edit drafts).                                                                    |
| `src/components/SerialEditor.tsx`         | Volume/chapter edit UI with drag-and-drop reorder (`@dnd-kit`). Uses serial's type names (e.g. "Episode"/"Season").                                                   |
| `src/components/SerialMetadataEditor.tsx` | Inline serial title/description/authors/art edit. Redirects on slug change.                                                                                           |
| `src/components/ChapterSelector.tsx`      | Reads/writes progress via `usePersistedStore` + mirrors to cookie for SSR. Grouped volume dropdown with collapsible headers (collapse state persisted).               |
| `src/components/WikiLinkMDEditor.tsx`     | `<MDEditor>` + `[[Category:Page]]` autocomplete. Uses `MarkdownRenderer` as preview so edit preview matches final render.                                             |
| `src/components/SerialNavInjector.tsx`    | Client Component (renders null); injects serial data into navbar via `useLayoutEffect`.                                                                               |
| `src/components/ui/MarkdownRenderer.tsx`  | Single source of truth for markdown styling. No `@tailwindcss/typography` — explicit Tailwind classes. Accepts `serialSlug` for wiki links, `sm` for compact mode.    |
| `src/components/ui/Text.tsx`              | `<Text variant>` typography. Variants: `h1`–`h4`, `body`, `label`. `as` overrides element. `muted` prop applies `text-gray-500`.                                      |
| `src/components/ui/Select.tsx`            | Generic `<Select<T>>` over native `<select>`. Client Component.                                                                                                       |
| `src/components/ui/Dialog.tsx`            | Controlled dialog (`isOpen`/`onClose`).                                                                                                                               |
| `src/hooks/useServerAction.ts`            | Wraps server action in `useTransition` + `router.refresh()`. Use in all Client Components calling Server Actions.                                                     |
| `src/hooks/usePersistedStore.ts`          | `useState`-compatible, backed by `localStorage`. SSR-safe via `useSyncExternalStore`, cross-tab via `storage` event.                                                  |
| `src/lib/serial-types.ts`                 | `ChapterType`/`VolumeType` types, arrays, parsers, Select options. Single source of truth — don't duplicate.                                                          |
| `src/lib/wiki-links.ts`                   | `WIKI_LINK_RE`, `parseWikiLink()`, `slugifyWikiName()`. Shared by remark plugin + editor autocomplete.                                                                |
| `src/lib/remark-wiki-links.ts`            | Remark plugin: `[[Category:Page]]` → markdown links. Skips code blocks.                                                                                               |
| `src/lib/slug.ts`                         | `titleToSlug`; computed at creation and stored in `serials.slug`.                                                                                                     |
| `src/auth.ts`                             | Auth.js v5 config: Google provider, Drizzle adapter (database sessions), session callback exposing `user.id` + `user.username`.                                       |
| `src/proxy.ts`                            | Next.js middleware (exported as default). Redirects authenticated users with `username === null` to `/onboarding`; skips `/api/auth/**` to avoid loops.               |
| `src/app/onboarding/page.tsx`             | Username-pick page shown after first sign-in. Redirects to `/` once username is saved.                                                                                |
| `src/app/onboarding/actions.ts`           | `setUsername` Server Action: validates uniqueness, writes to `users.username`, invalidates the session cache.                                                         |
| `src/components/navbar/AuthControls.tsx`  | Server Component: renders `<UserMenu>` when authenticated, or a sign-in button when not.                                                                              |
| `src/components/navbar/UserMenu.tsx`      | Client Component: avatar dropdown with username display and `<SignOutButton>`.                                                                                        |
| `src/components/navbar/SignOutButton.tsx` | Thin Client Component wrapping `signOut()` as a form action (required by Auth.js for CSRF safety).                                                                    |

### React import conventions

Always import React APIs as named imports — never use the `import * as React` namespace:

```ts
// ✅ correct
import { useState, useEffect, useCallback } from "react";
import type { ReactNode } from "react";

// ❌ wrong
import * as React from "react";
// React.useState, React.useEffect, React.useCallback, etc.
```

### UI component conventions

Always use design-system components instead of bare HTML:

| Instead of                                | Use                                              |
| ----------------------------------------- | ------------------------------------------------ |
| `<input>`                                 | `<Input>` from `@/components/ui/input`           |
| `<select>`                                | `<Select>` from `@/components/ui/select`         |
| `<button>`                                | `<Button>` from `@/components/ui/button`         |
| `<h1>`–`<h4>`, `<p>`, `<label>`, `<span>` | `<Text variant="…">` from `@/components/ui/Text` |

### JSDoc conventions

All exported components, hooks, and helpers must have a JSDoc block with at least one `@example`. Explain the non-obvious WHY — not what the name already says. Omit `@param`/`@returns` when types are self-documenting.

**Exception:** Skip JSDoc for functions bespoke to a single file (not exported for reuse) when name + signature are self-documenting.

```ts
/**
 * One-line summary of purpose or key constraint.
 *
 * @example
 * const [val, setVal] = usePersistedStore("key", defaultValue);
 */
```

### New component conventions

Every new component must:

1. **Declare an explicit named props type** — `type FooProps = { ... }` or `interface FooProps { ... }`. Never inline the type in the function signature.
2. **Add a one-line JSDoc comment to each explicitly-declared prop** — document only props that are unique to this component (not ones inherited via `& ComponentProps<"div">`).
3. **Use the `props` destructuring pattern** in the function body:
   ```ts
   export function Foo(props: FooProps) {
     const { bar, baz = "default", ...rest } = props;
   ```

See `src/components/ui/Box.tsx` for the canonical reference.
