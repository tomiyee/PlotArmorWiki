import { notFound } from "next/navigation";
import { db } from "@/db/index";
import {
  serials,
  volumes,
  chapters,
  pages,
  pageRelationships,
  userProgress,
} from "@/db/schema";
import { and, asc, eq, max } from "drizzle-orm";
import { ChapterSelector } from "@/components/ChapterSelector";
import { SerialNavInjector } from "@/components/SerialNavInjector";
import { SerialTOC } from "@/components/SerialTOC";
import { SerialTOCDrawer } from "@/components/SerialTOCDrawer";
import { ChapterData, NavbarSerialData } from "@/types";
import { WritingAsOfBannerFlexSpacer } from "./[page]/WritingAsOfBanner";
import { auth } from "@/auth";

interface Props {
  children: React.ReactNode;
  params: Promise<{ serial: string }>;
}

/**
 * Layout for all pages under /{serial}/…. Injects typed serial data and a
 * pre-rendered ChapterSelector into the global navbar via SerialNavInjector.
 *
 * @example
 * // Automatically applied to /[serial], /[serial]/[schema], /[serial]/[schema]/[page], etc.
 */
export default async function SerialLayout({ children, params }: Props) {
  const { serial: serialSlug } = await params;

  const [serial] = await db
    .select()
    .from(serials)
    .where(eq(serials.slug, serialSlug))
    .limit(1);

  if (!serial) {
    notFound();
  }

  // Read authenticated session to determine whether to load DB progress.
  const session = await auth();
  const userId = session?.user?.id ?? null;

  const [volumeList, chapterList] = await Promise.all([
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
  ]);

  const chaptersByVolume: Partial<Record<number, ChapterData[]>> = {
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
    const relMaxIdxSq = db
      .select({
        childPageId: pageRelationships.childPageId,
        maxIdx: max(chapters.idx).as("max_idx"),
      })
      .from(pageRelationships)
      .innerJoin(chapters, eq(pageRelationships.chapterId, chapters.id))
      .where(eq(pageRelationships.parentPageId, homePage.id))
      .groupBy(pageRelationships.childPageId)
      .as("rel_max_idx_sq");

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
      <WritingAsOfBannerFlexSpacer />
      <div className="flex-1 min-h-0 overflow-y-scroll">{children}</div>
    </>
  );
}
