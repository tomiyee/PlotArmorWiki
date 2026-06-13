import { notFound } from "next/navigation";
import Link from "next/link";
import { db } from "@/db/index";
import { serials } from "@/db/schema";
import { eq } from "drizzle-orm";
import { Text } from "@/components/ui/Text";
import { Box } from "@/components/ui/Box";
import { PageContainer } from "@/components/ui/PageContainer";
import { isSerialAdmin } from "@/lib/auth-guard";
import { NewPageForm } from "./NewPageForm";
import { getChapterCutoff, getNewPageFormData } from "./queries";

interface NewPagePageProps {
  /** Next.js dynamic route params containing the `serial` slug. */
  params: Promise<{ serial: string }>;
  /** Query params; `parentPageId` pre-selects the parent in the new-page form. */
  searchParams: Promise<{ parentPageId?: string }>;
}

/** Server Component for the new-page creation form. */
export default async function NewPagePage(props: NewPagePageProps) {
  const { params, searchParams } = props;
  const { serial: serialSlug } = await params;
  const { parentPageId: parentPageIdParam } = await searchParams;
  const defaultParentPageId = parentPageIdParam
    ? parseInt(parentPageIdParam, 10)
    : undefined;

  const [serial] = await db
    .select()
    .from(serials)
    .where(eq(serials.slug, serialSlug))
    .limit(1);

  if (!serial) {
    notFound();
  }

  const adminStatus = await isSerialAdmin(serial.id);
  if (!adminStatus) {
    notFound();
  }

  const [readingChapterId, { volumeList, chapterList, existingPages, serialTemplates }] =
    await Promise.all([
      getChapterCutoff(serial.id),
      getNewPageFormData(serial.id),
    ]);

  return (
    <main>
      <PageContainer className="max-w-lg">
        <Box col className="gap-8">
          {/* Breadcrumb */}
          <Text muted className="text-sm">
            <Link href={`/${serialSlug}`} className="hover:underline">
              {serial.title}
            </Link>
          </Text>

          <Text variant="h1" className="text-2xl">
            New page
          </Text>

          <NewPageForm
            serialSlug={serialSlug}
            chapterType={serial.chapterType}
            volumeList={volumeList}
            chapterList={chapterList}
            existingPages={existingPages}
            defaultParentPageId={defaultParentPageId}
            defaultIntroChapterId={readingChapterId ?? undefined}
            templates={serialTemplates}
          />
        </Box>
      </PageContainer>
    </main>
  );
}
