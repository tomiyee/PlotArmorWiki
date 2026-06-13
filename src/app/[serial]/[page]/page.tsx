import { notFound, redirect } from "next/navigation";
import { Button } from "@/components/ui/Button";
import Link from "next/link";
import { db } from "@/db/index";
import {
  pages,
  chapters,
  volumes,
  pageSections,
  pageSectionRevisions,
  pageInfoboxSections,
  pageInfoboxRevisions,
  pageInfoboxImageRevisions,
  pageRelationships,
  pageTitles,
} from "@/db/schema";
import { and, asc, eq, isNull, lte, max, or } from "drizzle-orm";
import {
  getSerialBySlug,
  getChapterCutoff,
  getSerialVolumesAndChapters,
  fetchPageAtSlug,
  fetchSerialTemplates,
  resolvePageTitlesAtIdx,
  resolveHasChildrenSet,
  fetchActiveParentPagesAtIdx,
  fetchSerialPagesAtIdx,
  sectionMaxIdxSq as buildSectionMaxIdxSq,
  infoboxRowMaxIdxSq as buildInfoboxRowMaxIdxSq,
  childRelMaxIdxSq as buildChildRelMaxIdxSq,
} from "@/db/queries";
import { Text } from "@/components/ui/Text";
import { Box } from "@/components/ui/Box";
import { PageContainer } from "@/components/ui/PageContainer";
import { MarkdownRenderer } from "@/components/ui/MarkdownRenderer";
import { PageEditor } from "./PageEditor";
import { EditModeAdminSetter } from "@/contexts/EditModeContext";
import { isSerialAdmin, isAuthenticated } from "@/lib/auth-guard";
import {
  getPendingSuggestionCount,
  getPendingSuggestions,
  getMyPageSuggestions,
} from "./suggestionActions";
import { restorePage } from "./actions";

interface PageViewProps {
  /** Next.js dynamic route params: `serial` slug and `page` slug. */
  params: Promise<{ serial: string; page: string }>;
}

/** Server Component that renders a wiki page at the reader's chapter cutoff. */
export default async function PageView(props: PageViewProps) {
  const { params } = props;
  const { serial: serialSlug, page: pageParam } = await params;

  const decodedPageSlug = decodeURIComponent(pageParam);

  const serial = await getSerialBySlug(serialSlug);

  if (!serial) {
    notFound();
  }

  const [chapterCutoff, { volumeList, chapterList }, adminStatus, authUserId] =
    await Promise.all([
      getChapterCutoff(serial.id),
      getSerialVolumesAndChapters(serial.id),
      isSerialAdmin(serial.id),
      isAuthenticated(),
    ]);
  const isAdmin = adminStatus;
  const isUserAuthenticated = !!authUserId;
  const { cutoffIdx, readingChapterId } = chapterCutoff;

  // Build a structured chapter list for the chapter selector in edit mode.
  const volumeNameById = new Map(volumeList.map((v) => [v.id, v.displayName]));
  const allChapters = chapterList.map((c) => ({
    id: c.id,
    displayName: c.displayName,
    idx: c.idx,
    volumeName: volumeNameById.get(c.volumeId) ?? "",
  }));

  // Head chapter is the one with the highest idx (last in the ordered list).
  const headChapterId = chapterList.at(-1)?.id ?? null;

  // Wiki pages visible at the reader's cutoff. Pages with null introChapterId
  // (the home page) are always included since they predate any chapters.
  // Deleted pages are excluded from the editor autocomplete list.
  const [rawWikiPages, page] = await Promise.all([
    db
      .select({ id: pages.id, name: pages.name, slug: pages.slug })
      .from(pages)
      .leftJoin(chapters, eq(pages.introChapterId, chapters.id))
      .where(
        and(
          eq(pages.serialId, serial.id),
          isNull(pages.deletedAt),
          or(isNull(pages.introChapterId), lte(chapters.idx, cutoffIdx)),
        ),
      )
      .orderBy(asc(pages.name)),
    fetchPageAtSlug(serial.id, decodedPageSlug),
  ]);

  if (!page) {
    notFound();
  }

  // Resolve chapter-versioned titles for all wiki pages at the reader's cutoff.
  const wikiPageIds = rawWikiPages.map((p) => p.id);
  const wikiTitleByPageId = await resolvePageTitlesAtIdx(wikiPageIds, cutoffIdx);

  // slug → chapter-versioned title (falls back to pages.name for pages without title entries).
  const wikiPageTitles: Record<string, string> = Object.fromEntries(
    rawWikiPages.map((p) => [p.slug, wikiTitleByPageId.get(p.id) ?? p.name]),
  );
  const wikiPages = rawWikiPages.map((p) => ({
    name: wikiTitleByPageId.get(p.id) ?? p.name,
    slug: p.slug,
  }));

  // The home page is canonical at /{serial}; visiting /{serial}/home redirects there.
  if (page.isHomePage) {
    redirect(`/${serialSlug}`);
  }

  // Soft-deleted pages: admins see a restore banner; everyone else gets 404.
  if (page.deletedAt) {
    if (!isAdmin) {
      notFound();
    }
    return (
      <main>
        <PageContainer>
          <Box col className="gap-6">
            <Text muted className="text-sm">
              <Link href={`/${serialSlug}`} className="hover:underline">
                {serial.title}
              </Link>
            </Text>
            <Box col className="gap-4 rounded-lg border border-destructive/30 bg-destructive/5 p-6">
              <Text variant="h1" className="text-destructive">
                {page.name}
              </Text>
              <Text variant="body" className="text-destructive/80">
                This page was deleted on{" "}
                {page.deletedAt.toLocaleDateString("en-US", {
                  year: "numeric",
                  month: "long",
                  day: "numeric",
                })}
                . All versioned content is preserved and will be visible once
                the page is restored.
              </Text>
              {page.deletionReason && (
                <div>
                  <Text variant="label" className="mb-1 block text-destructive/70">
                    Reason for deletion
                  </Text>
                  <MarkdownRenderer sm serialSlug={serialSlug} className="text-destructive/70">
                    {page.deletionReason}
                  </MarkdownRenderer>
                </div>
              )}
              <form
                action={async () => {
                  "use server";
                  await restorePage(serialSlug, decodedPageSlug);
                  redirect(`/${serialSlug}/${decodedPageSlug}`);
                }}
              >
                <Button type="submit" variant="outline">
                  Restore page
                </Button>
              </form>
            </Box>
          </Box>
        </PageContainer>
      </main>
    );
  }

  const introChapter = page.introChapterId
    ? await db
        .select({ displayName: chapters.displayName, idx: chapters.idx })
        .from(chapters)
        .where(eq(chapters.id, page.introChapterId))
        .limit(1)
        .then((rows) => rows[0] ?? null)
    : null;

  if (introChapter && introChapter.idx > cutoffIdx) {
    return (
      <main>
        <PageContainer>
          <Box col className="gap-6">
            <Text muted className="text-sm">
              <Link href={`/${serialSlug}`} className="hover:underline">
                {serial.title}
              </Link>
            </Text>
            <Text variant="body">
              This page is introduced in {serial.chapterType}{" "}
              {introChapter.displayName}. This page is hidden to prevent
              spoilers.
            </Text>
          </Box>
        </PageContainer>
      </main>
    );
  }

  // ── Section content (chapter-versioned) ───────────────────────────────────
  const sectionMaxIdxSq = buildSectionMaxIdxSq(page.id, cutoffIdx);

  const [activeSections, sectionVersions] = await Promise.all([
    db
      .select({
        id: pageSections.id,
        name: pageSections.name,
        displayOrder: pageSections.displayOrder,
      })
      .from(pageSections)
      .where(
        and(eq(pageSections.pageId, page.id), isNull(pageSections.deletedAt)),
      )
      .orderBy(asc(pageSections.displayOrder)),
    db
      .select({
        sectionId: pageSectionRevisions.sectionId,
        content: pageSectionRevisions.content,
        chapterIdx: chapters.idx,
      })
      .from(pageSectionRevisions)
      .innerJoin(chapters, eq(pageSectionRevisions.chapterId, chapters.id))
      .innerJoin(
        sectionMaxIdxSq,
        and(
          eq(pageSectionRevisions.sectionId, sectionMaxIdxSq.sectionId),
          eq(chapters.idx, sectionMaxIdxSq.maxIdx),
        ),
      )
      .where(eq(pageSectionRevisions.pageId, page.id)),
  ]);

  const versionBySectionId = new Map(
    sectionVersions.map((v) => [
      v.sectionId,
      { content: v.content, chapterIdx: v.chapterIdx },
    ]),
  );

  // pageSectionStructure - wall-clock-versioned rows for the section manager panel.
  const pageSectionStructure = activeSections.map((s) => ({
    id: s.id,
    name: s.name,
    displayOrder: s.displayOrder,
  }));

  const sections = activeSections.map((s) => {
    const v = versionBySectionId.get(s.id);
    return {
      id: s.id,
      name: s.name,
      content: v?.content ?? "",
      lastUpdatedChapterIdx: v?.chapterIdx ?? null,
    };
  });

  // ── Infobox data ───────────────────────────────────────────────────────────
  const activeInfoboxRows = await db
    .select({
      id: pageInfoboxSections.id,
      label: pageInfoboxSections.label,
      displayOrder: pageInfoboxSections.displayOrder,
    })
    .from(pageInfoboxSections)
    .where(
      and(
        eq(pageInfoboxSections.pageId, page.id),
        isNull(pageInfoboxSections.deletedAt),
      ),
    )
    .orderBy(asc(pageInfoboxSections.displayOrder));

  // Wall-clock-versioned infobox structure for the edit-mode panel.
  const infoboxSectionStructure = activeInfoboxRows.map((r) => ({
    id: r.id,
    label: r.label,
    displayOrder: r.displayOrder,
  }));

  let floaterImageUrl: string | null | undefined = undefined;
  let floaterRows: { id: number; label: string; content: string }[] = [];

  if (activeInfoboxRows.length > 0) {
    const floaterMaxIdxSq = db
      .select({ maxIdx: max(chapters.idx).as("max_idx") })
      .from(pageInfoboxImageRevisions)
      .innerJoin(chapters, eq(pageInfoboxImageRevisions.chapterId, chapters.id))
      .where(
        and(
          eq(pageInfoboxImageRevisions.pageId, page.id),
          lte(chapters.idx, cutoffIdx),
        ),
      )
      .as("floater_max_idx_sq");

    const infoboxRowMaxIdxSq = buildInfoboxRowMaxIdxSq(page.id, cutoffIdx);

    const [[floaterVersion], infoboxRowVersions] = await Promise.all([
      db
        .select({ imageUrl: pageInfoboxImageRevisions.imageUrl })
        .from(pageInfoboxImageRevisions)
        .innerJoin(
          chapters,
          eq(pageInfoboxImageRevisions.chapterId, chapters.id),
        )
        .innerJoin(floaterMaxIdxSq, eq(chapters.idx, floaterMaxIdxSq.maxIdx))
        .where(eq(pageInfoboxImageRevisions.pageId, page.id))
        .limit(1),
      db
        .select({
          infoboxSectionId: pageInfoboxRevisions.infoboxSectionId,
          content: pageInfoboxRevisions.content,
        })
        .from(pageInfoboxRevisions)
        .innerJoin(chapters, eq(pageInfoboxRevisions.chapterId, chapters.id))
        .innerJoin(
          infoboxRowMaxIdxSq,
          and(
            eq(
              pageInfoboxRevisions.infoboxSectionId,
              infoboxRowMaxIdxSq.infoboxSectionId,
            ),
            eq(chapters.idx, infoboxRowMaxIdxSq.maxIdx),
          ),
        )
        .where(eq(pageInfoboxRevisions.pageId, page.id)),
    ]);

    const rowContentMap = new Map(
      infoboxRowVersions.map((v) => [v.infoboxSectionId, v.content]),
    );

    floaterImageUrl = floaterVersion?.imageUrl ?? null;
    floaterRows = activeInfoboxRows.map((r) => ({
      id: r.id,
      label: r.label,
      content: rowContentMap.get(r.id) ?? "",
    }));
  }

  // ── Child pages (active at the user's cutoff) ──────────────────────────────
  const relMaxIdxSq = buildChildRelMaxIdxSq(page.id, cutoffIdx);

  const [childPagesRaw, activeParentPagesRaw, allSerialPagesRaw] =
    await Promise.all([
      db
        .select({
          id: pages.id,
          name: pages.name,
          slug: pages.slug,
          isActive: pageRelationships.isActive,
        })
        .from(pageRelationships)
        .innerJoin(pages, eq(pageRelationships.childPageId, pages.id))
        .innerJoin(chapters, eq(pageRelationships.chapterId, chapters.id))
        .innerJoin(
          relMaxIdxSq,
          and(
            eq(pageRelationships.childPageId, relMaxIdxSq.childPageId),
            eq(chapters.idx, relMaxIdxSq.maxIdx),
          ),
        )
        .where(and(eq(pageRelationships.parentPageId, page.id), isNull(pages.deletedAt))),
      fetchActiveParentPagesAtIdx(page.id, cutoffIdx),
      fetchSerialPagesAtIdx(serial.id, cutoffIdx),
    ]);

  const activeChildPages = childPagesRaw.filter((r) => r.isActive);

  const childPageIds = activeChildPages.map((r) => r.id);
  const allSerialPageIds = allSerialPagesRaw.map((r) => r.id);

  // allSerialPageIds is a superset of parentPageIds (parents are visible serial pages),
  // so one resolvePageTitlesAtIdx call covers both parent and serial-list lookups.
  const [childTitleMap, hasChildrenSet, allSerialTitleMap] = await Promise.all([
    resolvePageTitlesAtIdx(childPageIds, cutoffIdx),
    resolveHasChildrenSet(childPageIds, cutoffIdx),
    resolvePageTitlesAtIdx(allSerialPageIds, cutoffIdx),
  ]);

  const childPages = activeChildPages.map((r) => ({
    id: r.id,
    name: r.name,
    slug: r.slug,
    title: childTitleMap.get(r.id) ?? r.name,
    hasChildren: hasChildrenSet.has(r.id),
  }));

  const parentPages = activeParentPagesRaw.map((r) => ({
    id: r.id,
    name: r.name,
    slug: r.slug,
    title: allSerialTitleMap.get(r.id) ?? r.name,
  }));

  // All pages in the serial with chapter-versioned titles for the "Add parent" dropdown.
  const allSerialPages = allSerialPagesRaw.map((r) => ({
    id: r.id,
    title: allSerialTitleMap.get(r.id) ?? r.name,
  }));

  // ── Temporal title resolution ──────────────────────────────────────────────
  // Resolve the title the reader should see: the page_titles row with the
  // highest chapters.idx ≤ cutoffIdx (same max-idx read pattern as sections).
  // Falls back to pages.name when no page_titles rows exist yet.
  const titleMaxIdxSq = db
    .select({ maxIdx: max(chapters.idx).as("max_idx") })
    .from(pageTitles)
    .innerJoin(chapters, eq(pageTitles.chapterId, chapters.id))
    .where(and(eq(pageTitles.pageId, page.id), lte(chapters.idx, cutoffIdx)))
    .as("title_max_idx_sq");

  const [allPageTitleRows, [resolvedTitleRow]] = await Promise.all([
    // All title rows for the edit-mode panel (with chapter labels for display).
    db
      .select({
        chapterId: pageTitles.chapterId,
        title: pageTitles.title,
        chapterDisplayName: chapters.displayName,
        volumeName: volumes.displayName,
      })
      .from(pageTitles)
      .innerJoin(chapters, eq(pageTitles.chapterId, chapters.id))
      .innerJoin(volumes, eq(chapters.volumeId, volumes.id))
      .where(and(eq(pageTitles.pageId, page.id), lte(chapters.idx, cutoffIdx)))
      .orderBy(asc(chapters.idx)),
    // Resolved title at the reader's cutoff.
    db
      .select({ title: pageTitles.title })
      .from(pageTitles)
      .innerJoin(chapters, eq(pageTitles.chapterId, chapters.id))
      .innerJoin(titleMaxIdxSq, eq(chapters.idx, titleMaxIdxSq.maxIdx))
      .where(eq(pageTitles.pageId, page.id))
      .limit(1),
  ]);

  const resolvedTitle = resolvedTitleRow?.title ?? page.name;

  const pageTitleEntries = allPageTitleRows.map((r) => ({
    chapterId: r.chapterId,
    chapterLabel: `${r.volumeName} - ${r.chapterDisplayName}`,
    title: r.title,
  }));

  // ── Suggestion data ───────────────────────────────────────────────────────
  // Fetch in parallel: pending count + full list for admins, user status for
  // non-admins. Both functions are no-ops when the user lacks permission.
  const [pendingSuggestionCount, pendingSuggestions, myPageSuggestions, serialTemplates] =
    await Promise.all([
      isAdmin ? getPendingSuggestionCount(page.id) : Promise.resolve(0),
      isAdmin ? getPendingSuggestions(page.id) : Promise.resolve([]),
      !isAdmin && isUserAuthenticated
        ? getMyPageSuggestions(page.id)
        : Promise.resolve([]),
      // Only fetched for admins; non-admins never see the edit panel.
      isAdmin ? fetchSerialTemplates(serial.id) : Promise.resolve([]),
    ]);

  return (
    <main>
      <EditModeAdminSetter isAdmin={isAdmin} />
      <PageContainer>
          <Box col className="gap-6">
            <Text muted className="text-sm flex items-center gap-1 flex-wrap">
              <Link href={`/${serialSlug}`} className="hover:underline">
                {serial.title}
              </Link>
              {parentPages.length > 0 && (
                <>
                  <span>&gt;</span>
                  {parentPages.map((parent, i) => (
                    <span key={parent.id} className="flex items-center gap-1">
                      {i > 0 && <Text as="span">,</Text>}
                      <Link
                        href={`/${serialSlug}/${parent.slug}`}
                        className="hover:underline"
                      >
                        {parent.title}
                      </Link>
                    </span>
                  ))}
                </>
              )}
            </Text>

            <Box col className="gap-2">
              <Text variant="h1">{resolvedTitle}</Text>
              {introChapter && (
                <Text muted className="text-sm">
                  Introduced in {serial.chapterType} {introChapter.displayName}
                </Text>
              )}
            </Box>

            <PageEditor
              serialSlug={serialSlug}
              pageSlug={decodedPageSlug}
              pageId={page.id}
              pageTitleEntries={pageTitleEntries}
              pageSectionStructure={pageSectionStructure}
              sections={sections}
              infoboxSectionStructure={infoboxSectionStructure}
              floaterImageUrl={floaterImageUrl}
              floaterRows={floaterRows}
              allChapters={allChapters}
              headChapterId={headChapterId}
              readingChapterId={readingChapterId}
              wikiPages={wikiPages}
              pageTitles={wikiPageTitles}
              wikiChapters={allChapters.map((c) => ({
                name: c.displayName,
                idx: c.idx,
              }))}
              chapterType={serial.chapterType}
              introChapterId={page.introChapterId ?? null}
              introChapterIdx={introChapter?.idx ?? null}
              childPages={childPages}
              parentPages={parentPages}
              allSerialPages={allSerialPages}
              serialTemplates={serialTemplates}
              isAdmin={isAdmin}
              isAuthenticated={isUserAuthenticated}
              pendingSuggestionCount={pendingSuggestionCount}
              pendingSuggestions={pendingSuggestions}
              myPageSuggestions={myPageSuggestions}
            />
          </Box>
      </PageContainer>
    </main>
  );
}
