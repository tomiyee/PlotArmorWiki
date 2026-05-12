import { notFound } from 'next/navigation';
import Link from 'next/link';
import { db } from '@/db/index';
import { serials, volumes, chapters, pages } from '@/db/schema';
import { asc, eq } from 'drizzle-orm';
import { Text } from '@/components/ui/text';
import { Box } from '@/components/ui/box';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Select } from '@/components/ui/select';
import { PageContainer } from '@/components/ui/page-container';
import { createPage } from './actions';

interface Props {
  params: Promise<{ serial: string }>;
}

export default async function NewPagePage({ params }: Props) {
  const { serial: serialSlug } = await params;

  const [serial] = await db
    .select()
    .from(serials)
    .where(eq(serials.slug, serialSlug))
    .limit(1);

  if (!serial) {
    notFound();
  }

  const [volumeList, chapterList, existingPages] = await Promise.all([
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
    // All pages in this serial, ordered by name, for the parent dropdown.
    db
      .select({ id: pages.id, name: pages.name })
      .from(pages)
      .where(eq(pages.serialId, serial.id))
      .orderBy(asc(pages.name)),
  ]);

  // Build grouped options: one optgroup per volume
  const chaptersByVolume: Record<
    number,
    { id: number; displayName: string; idx: number }[]
  > = {};
  volumeList.forEach((v) => { chaptersByVolume[v.id] = []; });
  chapterList.forEach((c) => { chaptersByVolume[c.volumeId]?.push(c); });

  const chapterOptions = volumeList
    .filter((v) => (chaptersByVolume[v.id]?.length ?? 0) > 0)
    .map((v) => ({
      label: v.displayName,
      value: -v.id, // placeholder — groups are non-selectable
      children: (chaptersByVolume[v.id] ?? []).map((c) => ({
        label: c.displayName,
        value: c.id,
      })),
    }));

  // Parent page options: a blank "None (root page)" option followed by all existing pages.
  const parentPageOptions = [
    { label: 'None (root page)', value: 0 },
    ...existingPages.map((p) => ({ label: p.name, value: p.id })),
  ];

  // Default to the latest chapter so the intro chapter selector starts at the end.
  const headChapterId =
    chapterList.length > 0
      ? chapterList.reduce((prev, cur) => (cur.idx > prev.idx ? cur : prev)).id
      : chapterList[0]?.id;

  const createPageAction = createPage.bind(null, serialSlug);

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

          <form action={createPageAction} className="flex flex-col gap-5">
            {/* Page name */}
            <Box col className="gap-1">
              <Label htmlFor="name">
                Page name <span className="text-red-500">*</span>
              </Label>
              <Input
                id="name"
                name="name"
                required
                placeholder="e.g. Monkey D. Luffy"
                autoFocus
              />
            </Box>

            {/* Intro chapter */}
            <Box col className="gap-1">
              <Label htmlFor="introChapterId">
                Intro {serial.chapterType.toLowerCase()}{' '}
                <span className="text-red-500">*</span>
              </Label>
              {chapterOptions.length > 0 ? (
                <Select
                  id="introChapterId"
                  name="introChapterId"
                  options={chapterOptions}
                  defaultValue={headChapterId}
                />
              ) : (
                <Text muted className="text-sm">
                  No {serial.chapterType.toLowerCase()}s yet.{' '}
                  <Link href={`/${serialSlug}`} className="text-blue-600 hover:underline">
                    Add a {serial.chapterType.toLowerCase()} first.
                  </Link>
                </Text>
              )}
            </Box>

            {/* Parent page (optional) */}
            <Box col className="gap-1">
              <Label htmlFor="parentPageId">Parent page</Label>
              <Select
                id="parentPageId"
                name="parentPageId"
                options={parentPageOptions}
                defaultValue={0}
              />
              <Text muted className="text-xs">
                Choose a parent to place this page in the wiki DAG hierarchy.
              </Text>
            </Box>

            <Button
              type="submit"
              className="mt-2"
              disabled={chapterOptions.length === 0}
            >
              Create page
            </Button>
          </form>
        </Box>
      </PageContainer>
    </main>
  );
}
