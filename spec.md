# PlotArmor — Design Spec

**PlotArmor** is a wiki platform for serial entertainment (books, TV shows, etc.) that protects readers from spoilers by only surfacing information up to a chapter they choose.

Standard wikis always show the latest state of any character, location, or other entry. This is a problem for readers mid-series: looking something up exposes them to events they haven't reached yet. PlotArmor solves this by treating every piece of wiki content as a time series tied to specific chapters, so the wiki can render a "snapshot" of the world as of any point in the story.

---

## Vocabulary

| Term         | Definition                                                               |
| ------------ | ------------------------------------------------------------------------ |
| **Serial**   | The story a wiki covers (a book series, TV show, etc.)                   |
| **Audience** | A reader or viewer consuming the series                                  |
| **Chapter**  | A single installment of the series (episode, book chapter, volume, etc.) |

---

## Concepts

### URL Structure

Wiki pages follow a consistent URL pattern:

```
/{serial}/{schema}/{page-name}
```

The root path `/` serves the home page (see below).

### Home Page

The home page is the entry point for users who are not navigating directly to a wiki. It provides:

- **Search** — a search bar for finding existing serial wikis by name.
- **Wiki creation** — users can create a new wiki if one does not already exist for a given serial. This is expected to be an uncommon action.

### Serial

A serial is the top-level container for a wiki. It has the following properties:

- **Title** — the name of the serial.
- **Authors** — one or more creators of the serial (writer, showrunner, etc.).
- **Description** — a spoiler-free summary of the serial, similar in style to a Netflix synopsis. This is a social convention; the system does not enforce it.
- **Splash art** _(optional)_ — a cover or banner image representing the serial.

### Schema

A schema defines a *type* of wiki page within a serial — for example, a serial might have a Character schema and a Location schema. Every wiki page belongs to exactly one schema, and all pages of that schema share the same structure.

Schemas are serial-specific: a serial can have many schemas, and each schema belongs to exactly one serial.

Every wiki page has the following required system property, regardless of schema:

- **Introduction chapter** — the chapter in which the subject is first introduced in the serial. Used to determine whether the page is visible to a given user.

A schema also defines two structural components for its pages:

- **Body** — an ordered list of named sections. Each section stores Markdown text.
- **Floater** _(optional)_ — a sidebar panel that floats in the top-right of the page, containing:
  - A header
  - An image URL
  - An arbitrary list of rows, where each row is a string or a list of tags/strings

### Chapters

Chapters are the atomic unit of progression in a serial. Key properties:

- Each chapter has a **display name** as it appears in the series (e.g., "Episode 4", "Act II", "Chapter 12").
- Each chapter is assigned an **internal index** for sorting.
- Not every series uses well-structured numbering, so the display name is always stored separately from the index.

### Chapter Revisions

All wiki page attributes are stored as a **time series**: every value is associated with the chapter in which it was introduced or last changed.

This is the core mechanism behind spoiler protection — when an audience member sets their chapter cutoff, the system renders only attribute values from chapters at or before that point.

### Spoiler-Aware Navigation

All links and search results are filtered through the user's current progress state.

**Blocked pages**
If a user navigates to or follows a link to a page whose introduction chapter is beyond their current progress, the page content is hidden entirely. In its place, a message is shown:

> *"This [page type] is introduced in [chapter name]. This page is hidden to prevent spoilers."*

The page's title is also withheld to avoid revealing names the user has not yet encountered.

**Search**
Search results exclude any pages whose introduction chapter is beyond the user's current progress. Those pages are invisible to the user as if they do not exist.

### User Progress State

A user's current chapter is their **progress state** for a given serial. It acts as the cutoff for all spoiler-protected rendering on that wiki.

**Setting the chapter**
The navbar exposes a chapter selector (menu or icon) on every wiki page. The user can open it at any time to change their current chapter for that serial.

**First-time visitors**
A user visiting a serial wiki for the first time defaults to the first chapter. A temporary callout is displayed to inform them of this default and prompt them to select the chapter they are actually on.

**Persistence**

- _Anonymous users_ — progress state is saved in browser storage (localStorage) per serial. Selections persist across sessions on the same device/browser.
- _Logged-in users_ — the selected chapter is saved to their account per serial. When they return or log in, their last saved chapter is restored automatically.
