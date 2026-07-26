#!/usr/bin/env node
// Dumps every wiki page's chapter revisions to markdown files for offline reading/diffing.
//
// Usage:
//   node scripts/backup-db.js [output-dir]   (default output-dir: backups)
//
// Layout: <output-dir>/<serial-slug>/<page-slug>-<chapter-idx>.md
// Each file is a full snapshot of the page as of that revision chapter (using the
// same max-idx-<=-cutoff read pattern the app uses), not just what changed there.

const path = require("path");
const fs = require("fs");
const { config } = require("dotenv");
const postgres = require("postgres");

config({ path: path.resolve(__dirname, "../.env.local") });

if (!process.env.DATABASE_URL) {
  console.error("error: DATABASE_URL not set (check .env.local)");
  process.exit(1);
}

const OUTPUT_DIR = path.resolve(__dirname, "..", process.argv[2] ?? "backups");

const sql = postgres(process.env.DATABASE_URL);

/**
 * Shifts markdown ATX headers down one level (H1 -> H2, ... H5 -> H6; H6 stays)
 * so a page's own headers never collide with the H1 this script injects for
 * each section/infobox name. Skips lines inside fenced code blocks.
 */
function shiftHeaders(markdown) {
  if (!markdown) return "";
  let inCodeBlock = false;
  return markdown
    .split("\n")
    .map((line) => {
      if (/^\s*```/.test(line)) {
        inCodeBlock = !inCodeBlock;
        return line;
      }
      if (inCodeBlock) return line;
      const match = line.match(/^(#{1,6})(\s+.*)$/);
      if (!match) return line;
      const hashes = match[1].length < 6 ? match[1] + "#" : match[1];
      return hashes + match[2];
    })
    .join("\n");
}

/** Groups revision rows by their target id, sorted ascending by chapter idx for reverse-cutoff lookups. */
function indexRevisionsById(rows, idKey) {
  const index = new Map();
  for (const row of rows) {
    const list = index.get(row[idKey]) ?? [];
    list.push(row);
    index.set(row[idKey], list);
  }
  for (const list of index.values()) list.sort((a, b) => a.chapter_idx - b.chapter_idx);
  return index;
}

/** Content in effect at `targetIdx`: the revision with the highest chapter idx <= targetIdx, or undefined if not yet introduced. */
function contentAt(index, id, targetIdx) {
  const list = index.get(id);
  if (!list) return undefined;
  let result;
  for (const rev of list) {
    if (rev.chapter_idx > targetIdx) break;
    result = rev;
  }
  return result ? (result.content ?? "") : undefined;
}

async function backupPage(serialDir, page) {
  const [sections, infoboxSections, sectionRevisions, infoboxRevisions, titleRevisions, imageRevisions] =
    await Promise.all([
      sql`SELECT id, name, display_order FROM page_sections
          WHERE page_id = ${page.id} AND deleted_at IS NULL ORDER BY display_order`,
      sql`SELECT id, label, display_order FROM page_infobox_sections
          WHERE page_id = ${page.id} AND deleted_at IS NULL ORDER BY display_order`,
      sql`SELECT r.section_id, r.content, c.idx AS chapter_idx FROM page_section_revisions r
          JOIN chapters c ON c.id = r.chapter_id WHERE r.page_id = ${page.id}`,
      sql`SELECT r.infobox_section_id, r.content, c.idx AS chapter_idx FROM page_infobox_revisions r
          JOIN chapters c ON c.id = r.chapter_id WHERE r.page_id = ${page.id}`,
      sql`SELECT c.idx AS chapter_idx FROM page_titles t
          JOIN chapters c ON c.id = t.chapter_id WHERE t.page_id = ${page.id}`,
      sql`SELECT c.idx AS chapter_idx FROM page_infobox_image_revisions r
          JOIN chapters c ON c.id = r.chapter_id WHERE r.page_id = ${page.id}`,
    ]);

  const revisionIdxs = [
    ...new Set([
      ...sectionRevisions.map((r) => r.chapter_idx),
      ...infoboxRevisions.map((r) => r.chapter_idx),
      ...titleRevisions.map((r) => r.chapter_idx),
      ...imageRevisions.map((r) => r.chapter_idx),
    ]),
  ].sort((a, b) => a - b);

  if (revisionIdxs.length === 0) return 0;

  const sectionIndex = indexRevisionsById(sectionRevisions, "section_id");
  const infoboxIndex = indexRevisionsById(infoboxRevisions, "infobox_section_id");

  for (const targetIdx of revisionIdxs) {
    const lines = [];

    for (const infobox of infoboxSections) {
      const content = contentAt(infoboxIndex, infobox.id, targetIdx);
      if (content === undefined) continue;
      lines.push(`# ${infobox.label}`, "", shiftHeaders(content).trim(), "");
    }

    lines.push("---", "");

    for (const section of sections) {
      const content = contentAt(sectionIndex, section.id, targetIdx);
      if (content === undefined) continue;
      lines.push(`# ${section.name}`, "", shiftHeaders(content).trim(), "");
    }

    const filePath = path.join(serialDir, `${page.slug}-${targetIdx}.md`);
    fs.writeFileSync(filePath, lines.join("\n").trimEnd() + "\n");
  }

  return revisionIdxs.length;
}

async function main() {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  const serials = await sql`SELECT id, slug FROM serials ORDER BY slug`;

  let pageCount = 0;
  let fileCount = 0;

  for (const serial of serials) {
    const serialDir = path.join(OUTPUT_DIR, serial.slug);
    fs.mkdirSync(serialDir, { recursive: true });

    const pages = await sql`SELECT id, slug FROM pages WHERE serial_id = ${serial.id} ORDER BY slug`;

    for (const page of pages) {
      fileCount += await backupPage(serialDir, page);
      pageCount += 1;
    }
  }

  console.log(`Backed up ${fileCount} revision(s) across ${pageCount} page(s) to ${OUTPUT_DIR}`);

  await sql.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
