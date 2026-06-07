import { notFound } from "next/navigation";
import { cookies } from "next/headers";
import { db } from "@/db/index";
import {
  serials,
  serialAuthors,
  volumes,
  chapters,
  pages,
  pageSections,
  pageSectionRevisions,
  pageInfoboxSections,
  pageInfoboxRevisions,
  pageInfoboxImageRevisions,
  pageRelationships,
  pageTitles,
  templates,
  templateSections,
  templateInfoboxSections,
  serialAdmins,
  users,
} from "@/db/schema";
import { and, asc, eq, inArray, isNull, lte, max, or } from "drizzle-orm";
import {
  resolvePageTitlesAtIdx,
  resolveHasChildrenSet,
  sectionMaxIdxSq as buildSectionMaxIdxSq,
  infoboxRowMaxIdxSq as buildInfoboxRowMaxIdxSq,
  childRelMaxIdxSq as buildChildRelMaxIdxSq,
  getChapterIdxById,
} from "@/db/queries";
import {
  addChapter,
  addVolume,
  deleteChapter,
  deleteVolume,
  renameChapter,
  renameVolume,
  updateSerialTypes,
  reorderVolumes,
  reorderAllChapters,
  updateSerialMetadata,
  bulkApplyToc,
  createTemplate,
  deleteTemplate,
  renameTemplate,
  toggleTemplateInfobox,
  addTemplateSection,
  deleteTemplateSection,
  addTemplateInfoboxSection,
  deleteTemplateInfoboxSection,
  addSerialAdmin,
  removeSerialAdmin,
  searchUsersForSerial,
} from "./actions";
import { Box } from "@/components/ui/Box";
import { PageContainer } from "@/components/ui/PageContainer";
import { Text } from "@/components/ui/Text";
import { SerialMetadataEditor } from "@/components/SerialMetadataEditor";
import { SerialTOCSidebar } from "@/components/SerialTOCSidebar";
import { PageEditor } from "./[page]/PageEditor";
import { TemplateManager } from "@/components/TemplateManager";
import { AdminManager } from "@/components/AdminManager";
import { EditModeAdminSetter } from "@/contexts/EditModeContext";
import { isSerialAdmin } from "@/lib/auth-guard";
import { auth } from "@/auth";
import { getPendingSuggestionsByPage } from "./[page]/suggestionActions";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/Accordion";

interface SerialPageProps {
  /** Next.js dynamic route params containing the `serial` slug. */
  params: Promise<{ serial: string }>;
}

async function getChapterCutoff(
  serialId: number,
): Promise<{ cutoffIdx: number; readingChapterId: number | null }> {
  const cookieStore = await cookies();
  const raw = cookieStore.get(`plotarmor_chapter_${serialId}`)?.value;
  if (!raw) return { cutoffIdx: 0, readingChapterId: null };

  const chapterId = parseInt(raw, 10);
  if (isNaN(chapterId)) return { cutoffIdx: 0, readingChapterId: null };

  const idx = await getChapterIdxById(chapterId);

  if (idx === null) return { cutoffIdx: 0, readingChapterId: null };
  return { cutoffIdx: idx, readingChapterId: chapterId };
}

/**
 * Serial home page: metadata editor, home wiki page content, template manager, and admin controls.
 *
 * @example
 * // Rendered automatically by Next.js for /{serial} routes.
 */
export default async function SerialPage(props: SerialPageProps) {
  const { params } = props;
  const { serial: serialSlug } = await params;

  const [serial] = await db
    .select()
    .from(serials)
    .where(eq(serials.slug, serialSlug))
    .limit(1);

  if (!serial) {
    notFound();
  }

  const [
    chapterCutoff,
    authors,
    volumeList,
    chapterList,
    homePage,
    serialTemplates,
    isAdmin,
    serialAdminList,
    session,
    pendingSuggestionsByPage,
  ] = await Promise.all([
    getChapterCutoff(serial.id),
    db
      .select()
      .from(serialAuthors)
      .where(eq(serialAuthors.serialId, serial.id))
      .orderBy(serialAuthors.displayOrder),
    db
      .select()
      .from(volumes)
      .where(eq(volumes.serialId, serial.id))
      .orderBy(volumes.idx),
    db
      .select({
        id: chapters.id,
        displayName: chapters.displayName,
        idx: chapters.idx,
        volumeId: chapters.volumeId,
      })
      .from(chapters)
      .innerJoin(volumes, eq(chapters.volumeId, volumes.id))
      .where(eq(volumes.serialId, serial.id))
      .orderBy(chapters.idx),
    db
      .select()
      .from(pages)
      .where(and(eq(pages.serialId, serial.id), eq(pages.isHomePage, true)))
      .limit(1)
      .then((rows) => rows[0] ?? null),
    // Fetch all templates with their sections and infobox sections.
    db
      .select({
        id: templates.id,
        name: templates.name,
        hasInfobox: templates.hasInfobox,
      })
      .from(templates)
      .where(eq(templates.serialId, serial.id))
      .orderBy(asc(templates.name))
      .then(async (rows) => {
        if (rows.length === 0) return [];
        const templateIds = rows.map((r) => r.id);
        const [sectionRows, infoboxRows] = await Promise.all([
          db
            .select()
            .from(templateSections)
            .where(inArray(templateSections.templateId, templateIds))
            .orderBy(asc(templateSections.displayOrder)),
          db
            .select()
            .from(templateInfoboxSections)
            .where(inArray(templateInfoboxSections.templateId, templateIds))
            .orderBy(asc(templateInfoboxSections.displayOrder)),
        ]);
        return rows.map((t) => ({
          id: t.id,
          name: t.name,
          hasInfobox: t.hasInfobox,
          sections: sectionRows.filter((s) => s.templateId === t.id),
          infoboxSections: infoboxRows.filter((s) => s.templateId === t.id),
        }));
      }),
    isSerialAdmin(serial.id),
    // Fetch all admins for this serial joined with their usernames.
    db
      .select({ userId: serialAdmins.userId, username: users.username })
      .from(serialAdmins)
      .innerJoin(users, eq(serialAdmins.userId, users.id))
      .where(eq(serialAdmins.serialId, serial.id))
      .orderBy(asc(serialAdmins.grantedAt)),
    auth(),
    getPendingSuggestionsByPage(serial.id),
  ]);

  const { cutoffIdx, readingChapterId } = chapterCutoff;
  const isUserAuthenticated = !!session?.user?.id;

  const chaptersByVolume: Record<
    number,
    { id: number; displayName: string; idx: number; volumeId: number }[]
  > = {};
  volumeList.forEach((v) => {
    chaptersByVolume[v.id] = [];
  });
  chapterList.forEach((c) => {
    chaptersByVolume[c.volumeId]?.push(c);
  });

  const updateMetadataForSerial = updateSerialMetadata.bind(null, serial.id);
  const addVolumeForSerial = addVolume.bind(null, serial.id);
  const addChapterForSerial = addChapter.bind(null, serial.id);
  const deleteChapterForSerial = deleteChapter.bind(null, serial.id);
  const deleteVolumeForSerial = deleteVolume.bind(null, serial.id);
  const renameChapterForSerial = renameChapter.bind(null, serial.id);
  const renameVolumeForSerial = renameVolume.bind(null, serial.id);
  const reorderVolumesForSerial = reorderVolumes.bind(null, serial.id);
  const reorderAllChaptersForSerial = reorderAllChapters.bind(null, serial.id);
  const updateSerialTypesForSerial = updateSerialTypes.bind(null, serial.id);
  const bulkApplyTocForSerial = bulkApplyToc.bind(null, serial.id);

  // Admin actions bound to this serial.
  const addAdminForSerial = addSerialAdmin.bind(null, serial.id);
  const removeAdminForSerial = removeSerialAdmin.bind(null, serial.id);
  const searchUsersForThisSerial = searchUsersForSerial.bind(null, serial.id);

  // Template actions bound to this serial.
  const createTemplateForSerial = createTemplate.bind(null, serial.id);
  const deleteTemplateForSerial = deleteTemplate.bind(null, serial.id);
  const renameTemplateForSerial = renameTemplate.bind(null, serial.id);
  const toggleTemplateInfoboxForSerial = toggleTemplateInfobox.bind(
    null,
    serial.id,
  );
  const addTemplateSectionForSerial = addTemplateSection.bind(null, serial.id);
  const deleteTemplateSectionForSerial = deleteTemplateSection.bind(
    null,
    serial.id,
  );
  const addTemplateInfoboxSectionForSerial = addTemplateInfoboxSection.bind(
    null,
    serial.id,
  );
  const deleteTemplateInfoboxSectionForSerial =
    deleteTemplateInfoboxSection.bind(null, serial.id);

  const headChapterId = chapterList.at(-1)?.id ?? null;
  const volumeNameById = new Map(volumeList.map((v) => [v.id, v.displayName]));
  const allChapters = chapterList.map((c) => ({
    id: c.id,
    displayName: c.displayName,
    idx: c.idx,
    volumeName: volumeNameById.get(c.volumeId) ?? "",
  }));

  // Wiki pages visible at the reader's cutoff. Pages with null introChapterId
  // (the home page) are always included since they predate any chapters.
  const rawWikiPages = await db
    .select({ id: pages.id, name: pages.name, slug: pages.slug })
    .from(pages)
    .leftJoin(chapters, eq(pages.introChapterId, chapters.id))
    .where(
      and(
        eq(pages.serialId, serial.id),
        or(isNull(pages.introChapterId), lte(chapters.idx, cutoffIdx)),
      ),
    )
    .orderBy(asc(pages.name));

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

  // ── Home page content ─────────────────────────────────────────────────────
  let pageSectionStructure: {
    id: number;
    name: string;
    displayOrder: number;
  }[] = [];
  let sections: {
    id: number;
    name: string;
    content: string;
    lastUpdatedChapterIdx: number | null;
  }[] = [];
  let infoboxSectionStructure: {
    id: number;
    label: string;
    displayOrder: number;
  }[] = [];
  let floaterImageUrl: string | null | undefined = undefined;
  let floaterRows: { id: number; label: string; content: string }[] = [];
  let childPages: {
    id: number;
    name: string;
    slug: string;
    title: string;
    hasChildren: boolean;
  }[] = [];

  if (homePage) {
    const sectionMaxIdxSq = buildSectionMaxIdxSq(homePage.id, cutoffIdx);

    const [activeSections, sectionVersions] = await Promise.all([
      db
        .select({
          id: pageSections.id,
          name: pageSections.name,
          displayOrder: pageSections.displayOrder,
        })
        .from(pageSections)
        .where(
          and(
            eq(pageSections.pageId, homePage.id),
            isNull(pageSections.deletedAt),
          ),
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
        .where(eq(pageSectionRevisions.pageId, homePage.id)),
    ]);

    const versionBySectionId = new Map(
      sectionVersions.map((v) => [
        v.sectionId,
        { content: v.content, chapterIdx: v.chapterIdx },
      ]),
    );
    pageSectionStructure = activeSections.map((s) => ({
      id: s.id,
      name: s.name,
      displayOrder: s.displayOrder,
    }));
    sections = activeSections.map((s) => {
      const v = versionBySectionId.get(s.id);
      return {
        id: s.id,
        name: s.name,
        content: v?.content ?? "",
        lastUpdatedChapterIdx: v?.chapterIdx ?? null,
      };
    });

    const activeInfoboxRows = await db
      .select({
        id: pageInfoboxSections.id,
        label: pageInfoboxSections.label,
        displayOrder: pageInfoboxSections.displayOrder,
      })
      .from(pageInfoboxSections)
      .where(
        and(
          eq(pageInfoboxSections.pageId, homePage.id),
          isNull(pageInfoboxSections.deletedAt),
        ),
      )
      .orderBy(asc(pageInfoboxSections.displayOrder));

    infoboxSectionStructure = activeInfoboxRows;

    if (activeInfoboxRows.length > 0) {
      const floaterMaxIdxSq = db
        .select({ maxIdx: max(chapters.idx).as("max_idx") })
        .from(pageInfoboxImageRevisions)
        .innerJoin(
          chapters,
          eq(pageInfoboxImageRevisions.chapterId, chapters.id),
        )
        .where(
          and(
            eq(pageInfoboxImageRevisions.pageId, homePage.id),
            lte(chapters.idx, cutoffIdx),
          ),
        )
        .as("floater_max_idx_sq");

      const ibRowMaxIdxSq = buildInfoboxRowMaxIdxSq(homePage.id, cutoffIdx);

      const [[floaterVersion], infoboxRowVersions] = await Promise.all([
        db
          .select({ imageUrl: pageInfoboxImageRevisions.imageUrl })
          .from(pageInfoboxImageRevisions)
          .innerJoin(
            chapters,
            eq(pageInfoboxImageRevisions.chapterId, chapters.id),
          )
          .innerJoin(floaterMaxIdxSq, eq(chapters.idx, floaterMaxIdxSq.maxIdx))
          .where(eq(pageInfoboxImageRevisions.pageId, homePage.id))
          .limit(1),
        db
          .select({
            infoboxSectionId: pageInfoboxRevisions.infoboxSectionId,
            content: pageInfoboxRevisions.content,
          })
          .from(pageInfoboxRevisions)
          .innerJoin(chapters, eq(pageInfoboxRevisions.chapterId, chapters.id))
          .innerJoin(
            ibRowMaxIdxSq,
            and(
              eq(
                pageInfoboxRevisions.infoboxSectionId,
                ibRowMaxIdxSq.infoboxSectionId,
              ),
              eq(chapters.idx, ibRowMaxIdxSq.maxIdx),
            ),
          )
          .where(eq(pageInfoboxRevisions.pageId, homePage.id)),
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

    // Child pages active at the user's cutoff (same max-idx pattern).
    const relMaxIdxSq = buildChildRelMaxIdxSq(homePage.id, cutoffIdx);

    const childPagesRaw = await db
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
      .where(eq(pageRelationships.parentPageId, homePage.id));

    const activeChildPages = childPagesRaw.filter((r) => r.isActive);
    const childPageIds = activeChildPages.map((r) => r.id);
    const [childTitleMap, hasChildrenSet] = await Promise.all([
      resolvePageTitlesAtIdx(childPageIds, cutoffIdx),
      resolveHasChildrenSet(childPageIds, cutoffIdx),
    ]);

    childPages = activeChildPages.map((r) => ({
      id: r.id,
      name: r.name,
      slug: r.slug,
      title: childTitleMap.get(r.id) ?? r.name,
      hasChildren: hasChildrenSet.has(r.id),
    }));
  }

  // ── Home page temporal title entries (for the edit-mode Titles panel) ────────
  let homePageTitleEntries: {
    chapterId: number;
    chapterLabel: string;
    title: string;
  }[] = [];

  if (homePage) {
    const allTitleRows = await db
      .select({
        chapterId: pageTitles.chapterId,
        title: pageTitles.title,
        chapterDisplayName: chapters.displayName,
        volumeName: volumes.displayName,
      })
      .from(pageTitles)
      .innerJoin(chapters, eq(pageTitles.chapterId, chapters.id))
      .innerJoin(volumes, eq(chapters.volumeId, volumes.id))
      .where(eq(pageTitles.pageId, homePage.id))
      .orderBy(asc(chapters.idx));

    homePageTitleEntries = allTitleRows.map((r) => ({
      chapterId: r.chapterId,
      chapterLabel: `${r.volumeName} - ${r.chapterDisplayName}`,
      title: r.title,
    }));
  }

  return (
    <main className="size-full">
      <EditModeAdminSetter isAdmin={isAdmin} />
      <div className="max-w-(--content-width) mx-auto w-full px-4 py-6 flex gap-6">
        {/* Left sidebar - sticky, independent scroll, desktop only */}
        <aside className="hidden md:block w-56 shrink-0">
          <div className="sticky top-6 overflow-y-auto max-h-[calc(var(--scroll-area-h)-1.5rem)] pr-1">
            <SerialTOCSidebar
              serialId={serial.id}
              serialSlug={serialSlug}
              volumes={volumeList}
              chaptersByVolume={chaptersByVolume}
              chapterType={serial.chapterType}
              volumeType={serial.volumeType}
              readingChapterId={readingChapterId}
              addChapterAction={addChapterForSerial}
              addVolumeAction={addVolumeForSerial}
              deleteChapterAction={deleteChapterForSerial}
              deleteVolumeAction={deleteVolumeForSerial}
              renameChapterAction={renameChapterForSerial}
              renameVolumeAction={renameVolumeForSerial}
              reorderVolumesAction={reorderVolumesForSerial}
              reorderAllChaptersAction={reorderAllChaptersForSerial}
              updateSerialTypesAction={updateSerialTypesForSerial}
              bulkApplyTocAction={bulkApplyTocForSerial}
              isAdmin={isAdmin}
            />
          </div>
        </aside>

        {/* Main content */}
        <PageContainer className="flex-1 min-w-0 mx-0 px-0 py-0">
          <Box col className="gap-6">
            <SerialMetadataEditor
              title={serial.title}
              splashArtUrl={serial.splashArtUrl}
              authors={authors.map((a) => a.name)}
              updateMetadataAction={updateMetadataForSerial}
              isAdmin={isAdmin}
            />

            {isAdmin &&
              pendingSuggestionsByPage.length > 0 &&
              (() => {
                const total = pendingSuggestionsByPage.reduce(
                  (s, p) => s + p.count,
                  0,
                );
                return (
                  <Accordion className="rounded-md border border-amber-400/40 bg-amber-50/50 dark:bg-amber-950/20 px-3 text-amber-700 dark:text-amber-400">
                    <AccordionItem
                      value="pending-suggestions"
                      className="border-none"
                    >
                      <AccordionTrigger className="text-sm font-medium hover:no-underline">
                        <span>
                          <span className="font-semibold">{total}</span> pending{" "}
                          {total === 1 ? "suggestion" : "suggestions"} across{" "}
                          <span className="font-semibold">
                            {pendingSuggestionsByPage.length}
                          </span>{" "}
                          {pendingSuggestionsByPage.length === 1
                            ? "page"
                            : "pages"}
                        </span>
                      </AccordionTrigger>
                      <AccordionContent>
                        <ul className="flex flex-col gap-1 pt-1">
                          {pendingSuggestionsByPage.map((p) => (
                            <li
                              key={p.pageId}
                              className="flex items-center justify-between text-sm"
                            >
                              <a
                                href={`/${serialSlug}/${p.pageSlug}`}
                                className="hover:underline font-medium"
                              >
                                {p.pageName}
                              </a>
                              <span className="text-xs text-amber-600 dark:text-amber-500">
                                {p.count}{" "}
                                {p.count === 1 ? "suggestion" : "suggestions"}
                              </span>
                            </li>
                          ))}
                        </ul>
                      </AccordionContent>
                    </AccordionItem>
                  </Accordion>
                );
              })()}

            {homePage ? (
              <PageEditor
                serialSlug={serialSlug}
                pageSlug={homePage.slug}
                pageId={homePage.id}
                pageTitleEntries={homePageTitleEntries}
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
                introChapterId={null}
                introChapterIdx={null}
                childPages={childPages}
                parentPages={[]}
                allSerialPages={[]}
                isHomePage
                isAdmin={isAdmin}
                isAuthenticated={isUserAuthenticated}
                editModeHeader={
                  <>
                    <AdminManager
                      serialId={serial.id}
                      currentUserId={session?.user?.id ?? ""}
                      admins={serialAdminList}
                      addAdminAction={addAdminForSerial}
                      removeAdminAction={removeAdminForSerial}
                      searchUsersAction={searchUsersForThisSerial}
                    />
                    <TemplateManager
                      templates={serialTemplates}
                      createTemplateAction={createTemplateForSerial}
                      deleteTemplateAction={deleteTemplateForSerial}
                      renameTemplateAction={renameTemplateForSerial}
                      toggleTemplateInfoboxAction={
                        toggleTemplateInfoboxForSerial
                      }
                      addTemplateSectionAction={addTemplateSectionForSerial}
                      deleteTemplateSectionAction={
                        deleteTemplateSectionForSerial
                      }
                      addTemplateInfoboxSectionAction={
                        addTemplateInfoboxSectionForSerial
                      }
                      deleteTemplateInfoboxSectionAction={
                        deleteTemplateInfoboxSectionForSerial
                      }
                    />
                  </>
                }
              />
            ) : (
              <Text muted>Home page not found.</Text>
            )}
          </Box>
        </PageContainer>
      </div>
    </main>
  );
}
