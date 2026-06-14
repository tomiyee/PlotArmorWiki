---
name: dal-refactor
description: Rule against raw db calls in page components; DAL conventions and PageStub slug addition
metadata:
  type: feedback
---

Never place raw `db.select()` calls directly in Next.js page components (`page.tsx`). All reads go in `src/data/<domain>/queries.ts`.

**Why:** The user is actively enforcing this pattern; raw DB calls in components were refactored out across `[serial]/page.tsx`, `[serial]/[page]/page.tsx`, and `[serial]/chapter/[chapterIdx]/page.tsx`.

**How to apply:** Before writing a raw DB query in a page or layout, check whether a DAL function exists. If not, add one to the appropriate domain file with a JSDoc `@example` block. Import return types from `@/types`, not from the DAL files. `PageStub` now includes `slug` (added during this refactor) and `fetchSerialPagesAtIdx` filters out deleted pages.
