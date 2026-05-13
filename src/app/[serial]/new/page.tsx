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
  searchParams: Promise<{ parentPageId?: string }>;
}

export default async function NewPagePage({ params, searchParams }: Props) {
  const { serial: serialSlug } = await params;
  const { parentPageId: parentPageIdParam } = await searchParams;
  const defaultParentPageId = parentPageIdParam ? parseInt(parentPageIdParam, 10) : undefined;

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

  const chapterOptions = [
    // Sentinel placeholder — value 0 is never a real chapter ID.
    { label: `Select a ${serial.chapterType.toLowerCase()}…`, value: 0, disabled: true },
    ...volumeList
      .filter((v) => (chaptersByVolume[v.id]?.length ?? 0) > 0)
      .map((v) => ({
        label: v.displayName,
        value: -v.id, // placeholder — groups are non-selectable
        children: (chaptersByVolume[v.id] ?? []).map((c) => ({
          label: c.displayName,
          value: c.id,
        })),
      })),
  ];

  // Parent page options: all existing pages. The home page is always present
  // since it's created with the serial, so this list is never empty.
  const parentPageOptions = existingPages.map((p) => ({ label: p.name, value: p.id }));

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

            {/* Parent page (required) */}
            <Box col className="gap-1">
              <Label htmlFor="parentPageId">
                Parent page <span className="text-red-500">*</span>
              </Label>
              <Select
                id="parentPageId"
                name="parentPageId"
                options={parentPageOptions}
                defaultValue={defaultParentPageId}
              />
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
