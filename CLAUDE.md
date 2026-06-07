# CLAUDE.md

## Commands

```bash
npm run dev                          # start Next.js dev server
rtk npm run build                    # production build
rtk npm run lint                     # run ESLint
rtk npx drizzle-kit generate         # generate migration after schema changes
rtk npx drizzle-kit migrate          # apply pending migrations
```

### RTK command prefixes (token savings)

Always prefix these shell commands with `rtk` to compress output:

```bash
rtk git <args>        # instead of: git <args>
rtk grep <args>       # instead of: grep <args>
rtk find <args>       # instead of: find <args>  (simple paths/names only — no -not, -exec, or other compound predicates; use plain `find` for those)
rtk ls <args>         # instead of: ls <args>
rtk gh <args>         # instead of: gh <args>
rtk read <file>       # instead of: cat <file>
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
/help                # static help & documentation page
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
| Markdown      | `@mdxeditor/editor` (WYSIWYG edit) + `react-markdown` (render) |
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
| `src/app/[serial]/[page]/page.tsx`        | Wiki page view. Reads cutoff from cookie, fetches chapter-filtered content, delegates to `<PageEditor>`. Parses `?trail=` query param (comma-delimited slug list) and renders a "← Back to …" breadcrumb when arriving via a wiki link. |
| `src/app/[serial]/[page]/PageEditor.tsx`  | Client Component owning page body. Edit mode: `<WikiLinkMDEditor>` per section, "Writing as of:" chapter selector, calls `getPageContentAtChapter` on chapter change. |
| `src/app/[serial]/[page]/actions.ts`      | `savePageContent` (upserts at target chapter) + `getPageContentAtChapter` (pre-fills edit drafts). Delegates write-invariant logic to `revisionHelpers.ts`.           |
| `src/app/[serial]/[page]/revisionHelpers.ts` | Shared write-invariant helper (`applyPageContentRevisions`) used by both `savePageContent` and `approveSuggestion`. Enforces no-consecutive-duplicate-revision rule. |
| `src/app/help/page.tsx`                       | Static server-rendered help & documentation page. Covers core concepts, wiki creation, editing (including wiki-link syntax), and the suggestion workflow. Linked from the Navbar and contextual hints throughout the app. |
| `src/app/[serial]/[page]/suggestionActions.ts` | Server Actions for the user suggestion workflow: submit, approve, reject, query (by page/serial). Also contains `getSectionsAtChapter` (pre-fills suggestion form when target chapter changes). |
| `src/app/[serial]/[page]/SuggestionForm.tsx` | Inline suggestion form for authenticated non-admins. Edits body sections (MDEditor) + infobox rows (Textarea); fetches content at the chosen target chapter on change. |
| `src/app/[serial]/[page]/SuggestionReviewPanel.tsx` | Admin review panel: lists pending suggestions with before/after diffs for sections and infobox rows; approve/reject with optional review note. |
| `src/app/[serial]/chapter/[chapterIdx]/synopsisSuggestionActions.ts` | Server Actions for chapter synopsis suggestions: submit, approve (writes to `chapterSynopses`), reject, query. |
| `src/app/[serial]/chapter/[chapterIdx]/SynopsisSuggestionSection.tsx` | Client Component: "Suggest an edit" toggle button + status banner for non-admin authenticated users on the chapter page. |
| `src/app/[serial]/chapter/[chapterIdx]/SynopsisReviewPanel.tsx` | Admin review panel for pending synopsis suggestions on the chapter page: current vs. proposed diff, approve/reject. |
| `src/lib/auth-guard.ts`                   | `isSerialAdmin`, `requireSerialAdmin`, `isAuthenticated`, `requireAuthenticated` — auth helpers used by Server Components and Server Actions respectively.              |
| `src/components/SerialEditor.tsx`         | Volume/chapter edit UI with drag-and-drop reorder (`@dnd-kit`). Uses serial's type names (e.g. "Episode"/"Season").                                                   |
| `src/components/SerialMetadataEditor.tsx` | Inline serial title/description/authors/art edit. Redirects on slug change.                                                                                           |
| `src/components/ChapterSelector.tsx`      | Reads/writes progress via `usePersistedStore` + mirrors to cookie for SSR. Grouped volume dropdown with collapsible headers (collapse state persisted). On first visit shows a `<Popover>` spoiler callout anchored below the trigger button. |
| `src/components/WikiLinkMDEditor.tsx`     | MDXEditor WYSIWYG + `[[page:Name]]` / `[[chapter:Name]]` autocomplete with cursor-aware suggestions. Custom Lexical node handles wiki-link syntax end-to-end.          |
| `src/components/ForwardRefEditor.tsx`     | Non-SSR entry point for `@mdxeditor/editor`; imported via `dynamic()` with `{ ssr: false }` to keep browser-only editor code off the server.                         |
| `src/components/SerialNavInjector.tsx`    | Client Component (renders null); injects serial data into navbar via `useLayoutEffect`.                                                                               |
| `src/components/ui/MarkdownRenderer.tsx`  | Single source of truth for markdown styling. No `@tailwindcss/typography` — explicit Tailwind classes. Accepts `serialSlug` for wiki links, `sm` for compact mode. Pass `currentPageSlug` + `trailParam` to append `?trail=…` to outgoing wiki-link hrefs for back-navigation. |
| `src/components/ui/Text.tsx`              | `<Text variant>` typography. Variants: `h1`–`h4`, `body`, `label`. `as` overrides element. `muted` prop applies `text-gray-500`.                                      |
| `src/components/ui/Select.tsx`            | Searchable, hierarchical `<Select<T>>` combobox with keyboard navigation and ARIA semantics. Supports grouped options (accordion headers), `placeholder`, and `searchable={false}` to hide the search input. Client Component. |
| `src/components/ui/Dialog.tsx`            | Controlled dialog (`isOpen`/`onClose`).                                                                                                                               |
| `src/components/ui/Popover.tsx`           | Two-mode popover: **trigger mode** (wraps `children`, self-managed open state) and **anchor mode** (`anchor` ref + controlled `open`). Combobox and ChapterSelector use anchor mode to position dropdowns/callouts under existing elements without a separate trigger. |
| `src/hooks/useServerAction.ts`            | Wraps server action in `useTransition` + `router.refresh()`. Use in all Client Components calling Server Actions.                                                     |
| `src/hooks/usePersistedStore.ts`          | `useState`-compatible, backed by `localStorage`. SSR-safe via `useSyncExternalStore`, cross-tab via `storage` event.                                                  |
| `src/lib/serial-types.ts`                 | `ChapterType`/`VolumeType` types, arrays, parsers, Select options. Single source of truth — don't duplicate.                                                          |
| `src/lib/wiki-links.ts`                   | `WIKI_LINK_RE`, `parseWikiLink()`, `slugifyWikiName()`. Shared by remark plugin + editor autocomplete.                                                                |
| `src/lib/remark-wiki-links.ts`            | Remark plugin: `[[page:Name]]` / `[[chapter:Name]]` → markdown links. Skips code blocks.                                                                              |
| `src/lib/slug.ts`                         | `titleToSlug`; computed at creation and stored in `serials.slug`.                                                                                                     |
| `src/auth.ts`                             | Auth.js v5 config: Google provider, Drizzle adapter (database sessions), session callback exposing `user.id` + `user.username`.                                       |
| `src/proxy.ts`                            | Next.js middleware (exported as default). Redirects authenticated users with `username === null` to `/onboarding`; skips `/api/auth/**` to avoid loops.               |
| `src/app/onboarding/page.tsx`             | Username-pick page shown after first sign-in. Redirects to `/` once username is saved.                                                                                |
| `src/app/onboarding/actions.ts`           | `setUsername` Server Action: validates uniqueness, writes to `users.username`, invalidates the session cache.                                                         |
| `src/components/navbar/AuthControls.tsx`  | Server Component: renders `<UserMenu>` when authenticated, or a sign-in button + `<UnauthMenu>` when not. Sign-in button hidden on mobile (`hidden sm:block`).        |
| `src/components/navbar/UserMenu.tsx`      | Client Component: avatar dropdown with username display and `<SignOutButton>`.                                                                                        |
| `src/components/navbar/UnauthMenu.tsx`    | Client Component: user-icon button always visible on mobile; opens a dropdown with a sign-in link and theme toggle.                                                   |
| `src/components/navbar/MobileMenuDrawer.tsx` | Client Component: hamburger button (mobile only) that opens a left-side drawer with serial title, page-category links, and the full TOC.                           |
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
| `<select>`                                | `<Select>` from `@/components/ui/Select`         |
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
