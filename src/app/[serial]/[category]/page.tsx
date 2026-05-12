import { notFound } from "next/navigation";
import Link from "next/link";
import { cookies } from "next/headers";
import { db } from "@/db/index";
import {
  serials,
  pages,
  chapters,
} from "@/db/schema";
import { and, eq, lte } from "drizzle-orm";
import { Text } from "@/components/ui/text";
import { Box } from "@/components/ui/box";
import { buttonVariants } from "@/components/ui/button";
import {
  Card,
  CardHeader,
  CardTitle,
  CardAction,
  CardContent,
} from "@/components/ui/card";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faPlus } from "@fortawesome/free-solid-svg-icons";
import { PageContainer } from "@/components/ui/page-container";

interface Props {
  params: Promise<{ serial: string; category: string }>;
}

async function getChapterCutoffIdx(serialId: number): Promise<number> {
  const cookieStore = await cookies();
  const raw = cookieStore.get(`plotarmor_chapter_${serialId}`)?.value;
  if (!raw) return 0;

  const chapterId = parseInt(raw, 10);
  if (isNaN(chapterId)) return 0;

  const [row] = await db
    .select({ idx: chapters.idx })
    .from(chapters)
    .where(eq(chapters.id, chapterId))
    .limit(1);

  return row?.idx ?? 0;
}

export default async function CategoryIndexPage({ params }: Props) {
  const { serial: serialSlug, category: categorySlug } = await params;

  const [serial] = await db
    .select()
    .from(serials)
    .where(eq(serials.slug, serialSlug))
    .limit(1);

  if (!serial) {
    notFound();
  }

  const cutoffIdx = await getChapterCutoffIdx(serial.id);

  const pageList = await db
    .select({ id: pages.id, name: pages.name, slug: pages.slug })
    .from(pages)
    .innerJoin(chapters, eq(pages.introChapterId, chapters.id))
    .where(and(eq(pages.serialId, serial.id), lte(chapters.idx, cutoffIdx)))
    .orderBy(pages.name);

  return (
    <main>
      <PageContainer>
        <Box col className="gap-6">
          <Text muted className="text-sm">
            <Link href={`/${serialSlug}`} className="hover:underline">
              {serial.title}
            </Link>
          </Text>

          <Text variant="h1">{decodeURIComponent(categorySlug)}</Text>

          <Card>
            <CardHeader>
              <CardTitle>
                <Text variant="h2">Pages</Text>
              </CardTitle>
              <CardAction>
                <Link
                  href={`/${serialSlug}/${categorySlug}/new`}
                  className={buttonVariants({ size: "sm" })}
                >
                  <FontAwesomeIcon icon={faPlus} className="h-3 w-3" />
                  New page
                </Link>
              </CardAction>
            </CardHeader>
            <CardContent>
              {pageList.length > 0 ? (
                <ul className="flex flex-col gap-1">
                  {pageList.map((page) => (
                    <li key={page.id}>
                      <Link
                        href={`/${serialSlug}/${categorySlug}/${encodeURIComponent(page.slug)}`}
                        className="text-blue-600 hover:underline"
                      >
                        {page.name}
                      </Link>
                    </li>
                  ))}
                </ul>
              ) : (
                <Text muted>
                  No pages yet —{" "}
                  <Link
                    href={`/${serialSlug}/${categorySlug}/new`}
                    className="text-blue-500 hover:underline"
                  >
                    create the first one
                  </Link>
                  .
                </Text>
              )}
            </CardContent>
          </Card>
        </Box>
      </PageContainer>
    </main>
  );
}
