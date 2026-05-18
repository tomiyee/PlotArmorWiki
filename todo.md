# PlotArmor — Implementation TODO

---

## - [X] Step 1 — Templates

---

## - [X] Step 2 — Auth.js with Google provider

---

## - [X] Step 3 — Username onboarding

---

## - [X] Step 4 — Serial admin permissions: auto-grant on create + Server Action gates

---

## - [X] Step 5 — Edit UI gates (hide edit controls for non-admins)

---

## - [X] Step 6 — Admin management UI

---

## - [X] Step 7 — Deploy to Vercel + production smoke test

---

## - [ ] Step 8 — Progress sync for logged-in users

- In `<ChapterSelector>`: when authenticated, call a Server Action that upserts `user_progress (user_id, serial_id, chapter_id)` in addition to writing the cookie/localStorage.
- On serial page load, read progress in priority order: (1) `user_progress` table row if session exists, (2) cookie fallback.

---

## - [X] Step 9 — Dark mode

---

## - [ ] Step 10 — Spoiler-aware search
