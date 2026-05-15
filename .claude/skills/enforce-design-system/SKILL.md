---
name: enforce-design-system
description: Scan the codebase for native HTML elements that should use design-system components from src/components/ui/, then fix every violation found.
---

Scan all TSX/TS source files outside of `src/components/ui/` for native HTML elements that have a design-system replacement, then fix every violation in-place. Do not prompt for confirmation at any step.

---

## Design-system mapping

These are the only allowed substitutions. Do not replace elements that are used _inside_ the ui/ components themselves or that have no design-system equivalent.

| Native element                                                        | Replacement                                  | Import path              |
| --------------------------------------------------------------------- | -------------------------------------------- | ------------------------ |
| `<button`                                                             | `<Button`                                    | `@/components/ui/button` |
| `<input`                                                              | `<Input`                                     | `@/components/ui/input`  |
| `<select`                                                             | `<Select`                                    | `@/components/ui/select` |
| `<h1`, `<h2`, `<h3`, `<h4`                                            | `<Text variant="h1"` … `<Text variant="h4"`  | `@/components/ui/Text`   |
| `<p` (presentational text, not inside markdown renderers)             | `<Text` (defaults to `body` variant)         | `@/components/ui/Text`   |
| `<span` (text-only spans, not icon wrappers or structural containers) | `<Text variant="label"` or `<Text as="span"` | `@/components/ui/Text`   |
| `<label` (standalone labels outside a library primitive)              | `<Text as="label" variant="label"`           | `@/components/ui/Text`   |

### When NOT to replace

- Elements inside `src/components/ui/` (those files implement the primitives themselves).
- `<span className="sr-only">` — screen-reader-only spans; leave as-is.
- `<p>` or `<span>` rendered by third-party libraries (e.g. `react-markdown`, `@uiw/react-md-editor`) — these are outside our control.
- `<label>` that is part of a Radix/Base UI primitive's `render` prop — those propagate the ref and must stay as bare `label`.
- Short inline `<span>` used purely for styling a portion of a larger text node where `<Text>` would break the flow (e.g. `<span className="text-red-500">*</span>`).
- `<input type="hidden">` — `<Input>` renders a visible styled input; hidden inputs must stay as bare `<input type="hidden">`.
- `<select>` elements inside `src/components/ui/select.tsx` itself.

---

## Step 1 — Discover violations

Search every `.tsx` and `.ts` file under `src/` (excluding `src/components/ui/`) for each native element listed above:

```bash
grep -rn --include="*.tsx" --include="*.ts" \
  -e '<button' -e '<input' -e '<select' \
  -e '<h1' -e '<h2' -e '<h3' -e '<h4' \
  -e '<p ' -e '<p>' -e '<p\n' \
  -e '<span' -e '<label' \
  src/ \
  | grep -v 'src/components/ui/'
```

Collect the results. Group them by file. For each hit apply the exclusion rules above — if a line is covered by an exclusion, skip it.

---

## Step 2 — Fix violations file by file

For each file that has at least one non-excluded violation:

1. **Read the full file** to understand context before editing.
2. **Apply replacements** using the Edit tool (targeted string replacements, not whole-file rewrites):
   - Replace the opening tag, e.g. `<button` → `<Button`, `<h2` → `<Text variant="h2"`.
   - Replace the matching closing tag, e.g. `</button>` → `</Button>`, `</h2>` → `</Text>`.
   - For self-closing elements (`<input …/>`) replace in one step.
   - Preserve all existing props (className, onClick, type, etc.) — only the tag name changes, plus adding a `variant` prop for `<Text>`.
3. **Add missing imports** at the top of the file. Check if the import for the component already exists before adding. Use the same `@/components/ui/…` alias as the rest of the codebase.
   - If the file already imports from `@/components/ui/button`, add `Button` to the existing import rather than adding a duplicate import line.
4. **Remove now-unused native-element imports** only if they were explicitly imported (rare in TSX).

---

## Step 3 — Verify

After all edits, re-run the grep from Step 1 to confirm zero violations remain (accounting for the exclusion rules). If any remain, fix them before finishing.

Then run:

```bash
pnpm lint
```

Fix any lint errors introduced by the replacements.

---

## Step 4 — Report

Output a concise summary:

- Number of files changed.
- Total violations fixed (broken down by element type: button, input, select, h1–h4, p, span, label).
- Any exclusions applied (with a brief reason).
- Any files skipped and why.
