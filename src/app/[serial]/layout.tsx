import { notFound } from "next/navigation";
import { db } from "@/db/index";
import {
  pages,
  pageRelationships,
  chapters,
  userProgress,
} from "@/db/schema";
import { and, asc, eq } from "drizzle-orm";
import { getSerialBySlug } from "@/data/serials/queries";
import { getSerialVolumesAndChapters } from "@/data/chapters/queries";
import { childRelMaxIdxSq as buildChildRelMaxIdxSq, PG_INT_MAX } from "@/data/pages/queries";
import { ChapterSelector } from "@/components/ChapterSelector";
import { SerialNavInjector } from "@/components/SerialNavInjector";
import { SerialTOC } from "@/components/SerialTOC";
import { SerialTOCDrawer } from "@/components/SerialTOCDrawer";
import { ChapterRow, NavbarSerialData } from "@/types";
import { auth } from "@/auth";

interface SerialLayoutProps {
  /** Route segment children rendered inside the layout. */
  children: React.ReactNode;
  /** Next.js dynamic route params containing the `serial` slug. */
  params: Promise<{ serial: string }>;
}

/**
 * Layout for all pages under /{serial}/…. Injects typed serial data and a
 * pre-rendered ChapterSelector into the global navbar via SerialNavInjector.
 *
 * @example
 * // Automatically applied to /[serial], /[serial]/[schema], /[serial]/[schema]/[page], etc.
 */
export default async function SerialLayout(props: SerialLayoutProps) {
  const { children, params } = props;
  const { serial: serialSlug } = await params;

  const serial = await getSerialBySlug(serialSlug);

  if (!serial) {
    notFound();
  }

  // Read authenticated session to determine whether to load DB progress.
  const session = await auth();
  const userId = session?.user?.id ?? null;

  const { volumeList, chapterList } = await getSerialVolumesAndChapters(serial.id);

  const chaptersByVolume: Partial<Record<number, ChapterRow[]>> = {
    ...Object.groupBy(chapterList, (c) => c.volumeId),
  };

  // Priority (1): authenticated user's DB progress for this serial.
  // Priority (2): cookie/localStorage handled client-side by ChapterSelector.
  let dbChapterId: number | null = null;
  if (userId) {
    const [progressRow] = await db
      .select({ chapterId: userProgress.chapterId })
      .from(userProgress)
      .where(
        and(
          eq(userProgress.userId, userId),
          eq(userProgress.serialId, serial.id),
        ),
      )
      .limit(1);
    dbChapterId = progressRow?.chapterId ?? null;
  }

  // Navbar "Pages" dropdown: immediate children of the Home page.
  // Uses the max-idx pattern to get each child's latest relationship state
  // with no chapter cutoff applied - navigation shows all current children.
  const [homePage] = await db
    .select({ id: pages.id })
    .from(pages)
    .where(and(eq(pages.serialId, serial.id), eq(pages.isHomePage, true)))
    .limit(1);

  let navPages: { id: number; name: string; slug: string }[] = [];
  if (homePage) {
    // No chapter cutoff for the navbar — show all current children regardless of reader position.
    const relMaxIdxSq = buildChildRelMaxIdxSq(homePage.id, PG_INT_MAX);

    const rawChildren = await db
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
      .where(eq(pageRelationships.parentPageId, homePage.id))
      .orderBy(asc(pages.name));

    navPages = rawChildren
      .filter((r) => r.isActive)
      .map((r) => ({ id: r.id, name: r.name, slug: r.slug }));
  }

  const serialNavData: NavbarSerialData = {
    serialSlug,
    serialTitle: serial.title,
    categories: navPages,
  };

  const tocContent = (
    <SerialTOC
      key="serial-toc"
      serialId={serial.id}
      serialSlug={serialSlug}
      volumes={volumeList}
      chaptersByVolume={chaptersByVolume}
      chapterType={serial.chapterType}
    />
  );

  return (
    <>
      <SerialNavInjector
        data={serialNavData}
        chapterSelectorSlot={
          <ChapterSelector
            key="chapter-selector"
            serialId={serial.id}
            serialSlug={serialSlug}
            chapterType={serial.chapterType}
            volumes={volumeList}
            chaptersByVolume={chaptersByVolume}
            initialChapterId={dbChapterId}
            isAuthenticated={!!userId}
          />
        }
        tocSlot={<SerialTOCDrawer key="toc-drawer" tocContent={tocContent} />}
        tocContent={tocContent}
      />
      <div className="flex-1 min-h-0 overflow-y-auto">{children}</div>
    </>
  );
}
