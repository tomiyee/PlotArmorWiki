'use client';

import { useState } from 'react';
import Link from 'next/link';
import { createPage } from './actions';
import { Text } from '@/components/ui/text';
import { Box } from '@/components/ui/box';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Select } from '@/components/ui/select';

interface Chapter {
  id: number;
  displayName: string;
  idx: number;
  volumeId: number;
}

interface Volume {
  id: number;
  displayName: string;
}

interface PageOption {
  id: number;
  name: string;
  introChapterId: number | null;
}

interface Props {
  serialSlug: string;
  chapterType: string;
  volumeList: Volume[];
  chapterList: Chapter[];
  existingPages: PageOption[];
  defaultParentPageId?: number;
}

/**
 * Page creation form. Tracks the selected intro chapter and narrows the parent
 * page dropdown to pages that are visible at (i.e. introduced at or before) that
 * chapter, so a child page cannot reference a parent that doesn't exist yet.
 *
 * @example
 * <NewPageForm serialSlug="one-piece" chapterType="Chapter" ... />
 */
export function NewPageForm({
  serialSlug,
  chapterType,
  volumeList,
  chapterList,
  existingPages,
  defaultParentPageId,
}: Props) {
  const chapterTypeLabel = chapterType.toLowerCase();

  // Build chapter id → idx lookup for filtering.
  const chapterIdxById: Record<number, number> = {};
  chapterList.forEach((c) => { chapterIdxById[c.id] = c.idx; });

  // Build grouped chapter options.
  const chaptersByVolume: Record<number, Chapter[]> = {};
  volumeList.forEach((v) => { chaptersByVolume[v.id] = []; });
  chapterList.forEach((c) => { chaptersByVolume[c.volumeId]?.push(c); });

  const firstChapterId = chapterList[0]?.id ?? 0;
  const [selectedIntroChapterId, setSelectedIntroChapterId] = useState<number>(firstChapterId);

  const chapterOptions = [
    { label: `Select a ${chapterTypeLabel}…`, value: 0, disabled: true },
    ...volumeList
      .filter((v) => (chaptersByVolume[v.id]?.length ?? 0) > 0)
      .map((v) => ({
        label: v.displayName,
        value: -v.id,
        children: (chaptersByVolume[v.id] ?? []).map((c) => ({
          label: c.displayName,
          value: c.id,
        })),
      })),
  ];

  // Pages visible at the selected intro chapter: home page (null introChapterId)
  // is always included; others must have been introduced at or before it.
  const selectedIdx =
    selectedIntroChapterId > 0
      ? (chapterIdxById[selectedIntroChapterId] ?? Infinity)
      : Infinity;
  const visiblePages = existingPages.filter(
    (p) => p.introChapterId === null || (chapterIdxById[p.introChapterId] ?? 0) <= selectedIdx,
  );
  const parentPageOptions = visiblePages.map((p) => ({ label: p.name, value: p.id }));

  // Only pre-select the defaultParentPageId if it is still visible.
  const visibleParentDefault =
    defaultParentPageId !== undefined &&
    visiblePages.some((p) => p.id === defaultParentPageId)
      ? defaultParentPageId
      : undefined;

  const createPageAction = createPage.bind(null, serialSlug);
  const hasChapters = chapterList.length > 0;

  return (
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
          Intro {chapterTypeLabel} <span className="text-red-500">*</span>
        </Label>
        {hasChapters ? (
          <Select
            id="introChapterId"
            name="introChapterId"
            options={chapterOptions}
            value={selectedIntroChapterId}
            onChange={(val) => setSelectedIntroChapterId(val as number)}
          />
        ) : (
          <Text muted className="text-sm">
            No {chapterTypeLabel}s yet.{' '}
            <Link href={`/${serialSlug}`} className="text-blue-600 hover:underline">
              Add a {chapterTypeLabel} first.
            </Link>
          </Text>
        )}
      </Box>

      {/* Parent page (restricted to pages visible at the selected intro chapter) */}
      <Box col className="gap-1">
        <Label htmlFor="parentPageId">
          Parent page <span className="text-red-500">*</span>
        </Label>
        <Select
          id="parentPageId"
          name="parentPageId"
          options={parentPageOptions}
          defaultValue={visibleParentDefault}
        />
      </Box>

      <Button type="submit" className="mt-2" disabled={!hasChapters}>
        Create page
      </Button>
    </form>
  );
}
