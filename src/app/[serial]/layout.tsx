import { notFound } from "next/navigation";
import { db } from "@/db/index";
import { serials, volumes, chapters, pageSchemas } from "@/db/schema";
import { eq } from "drizzle-orm";
import { ChapterSelector } from "@/components/ChapterSelector";
import { SerialNavInjector } from "@/components/SerialNavInjector";
import { SerialTOC } from "@/components/SerialTOC";
import { SerialTOCDrawer } from "@/components/SerialTOCDrawer";
import { ChapterData, NavbarSerialData } from "@/types";

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

  const [volumeList, chapterList, schemaList] = await Promise.all([
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
      .select({ id: pageSchemas.id, name: pageSchemas.name })
      .from(pageSchemas)
      .where(eq(pageSchemas.serialId, serial.id)),
  ]);

  const chaptersByVolume: Partial<Record<number, ChapterData[]>> = {
    ...Object.groupBy(chapterList, (c) => c.volumeId),
  };

  const serialNavData: NavbarSerialData = {
    serialSlug,
    serialTitle: serial.title,
    schemas: schemaList,
  };

  const tocContent = (
    <SerialTOC
      serialId={serial.id}
      serialSlug={serialSlug}
      volumes={volumeList}
      chaptersByVolume={chaptersByVolume}
      chapterType={serial.chapterType}
      volumeType={serial.volumeType}
    />
  );

  return (
    <>
      <SerialNavInjector
        data={serialNavData}
        chapterSelectorSlot={
          <ChapterSelector
            serialId={serial.id}
            serialSlug={serialSlug}
            chapterType={serial.chapterType}
            volumes={volumeList}
            chaptersByVolume={chaptersByVolume}
          />
        }
        tocSlot={<SerialTOCDrawer tocContent={tocContent} />}
      />
      <div className="flex-1 min-h-0 overflow-y-scroll">{children}</div>
    </>
  );
}
