import { notFound } from "next/navigation";
import Link from "next/link";
import { db } from "@/db/index";
import { serials, volumes, chapters } from "@/db/schema";
import { eq } from "drizzle-orm";
import { ChapterSelector } from "@/components/ChapterSelector";
import { SerialNavInjector } from "@/components/SerialNavInjector";

interface Props {
  children: React.ReactNode;
  params: Promise<{ serial: string }>;
}

/**
 * Layout for all pages under /{serial}/…. Injects the serial title and
 * <ChapterSelector> into the global navbar via SerialNavInjector, replacing
 * the dark sub-bar that previously sat between the navbar and the page content.
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

  return (
    <>
      {/* Inject serial title + chapter selector into the top navbar */}
      <SerialNavInjector
        slot={
          <div className="flex items-center gap-3 min-w-0">
            <Link
              href={`/${serialSlug}`}
              className="hidden sm:block truncate text-sm font-medium text-gray-700 hover:text-gray-900 max-w-40"
            >
              {serial.title}
            </Link>
            <ChapterSelector
              serialId={serial.id}
              chapterType={serial.chapterType}
              volumes={volumeList}
              chaptersByVolume={chaptersByVolume}
            />
          </div>
        }
      />
      <div className="flex-1 min-h-0 overflow-y-scroll">{children}</div>
    </>
  );
}
