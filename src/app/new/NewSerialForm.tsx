'use client';

import { useEffect, useRef, useState } from 'react';
import { createSerial } from './actions';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Text } from '@/components/ui/text';
import { Box } from '@/components/ui/box';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { PageContainer } from '@/components/ui/page-container';
import { CHAPTER_TYPE_OPTIONS, VOLUME_TYPE_OPTIONS } from '@/lib/serial-types';
import { WikiLinkMDEditor } from '@/components/WikiLinkMDEditor';

type Props = {
  /** Pre-filled title value, e.g. from a search-to-create redirect. When non-empty the input is focused automatically. */
  defaultTitle?: string;
};

/**
 * Form for creating a new serial wiki.
 *
 * Accepts an optional `defaultTitle` to pre-fill and focus the title field —
 * used when the user is redirected here after a no-results search.
 *
 * @example
 * <NewSerialForm defaultTitle="One Piece" />
 */
export default function NewSerialForm({ defaultTitle }: Props) {
  const [authors, setAuthors] = useState<string[]>(['']);
  const [description, setDescription] = useState('');
  const titleRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (defaultTitle && titleRef.current) {
      titleRef.current.focus();
    }
  }, [defaultTitle]);

  function addAuthor() {
    setAuthors((prev) => [...prev, '']);
  }

  function removeAuthor(index: number) {
    setAuthors((prev) => prev.filter((_, i) => i !== index));
  }

  function updateAuthor(index: number, value: string) {
    setAuthors((prev) => prev.map((a, i) => (i === index ? value : a)));
  }

  return (
    <main className="flex-1 min-h-0 overflow-y-scroll">
      <PageContainer className="max-w-lg">
        <Text variant="h1" className="text-2xl mb-8">Create a new wiki</Text>
        <form action={createSerial} className="flex flex-col gap-5">
          {/* Title */}
          <Box col className="gap-1">
            <Label htmlFor="title">
              Title <span className="text-red-500">*</span>
            </Label>
            <Input
              ref={titleRef}
              id="title"
              name="title"
              required
              defaultValue={defaultTitle}
              placeholder="e.g. One Piece"
            />
          </Box>

          {/* Description */}
          <Box col className="gap-1">
            <Label htmlFor="description">
              Description <span className="text-gray-400">(optional, Markdown)</span>
            </Label>
            <WikiLinkMDEditor
              value={description}
              onChange={(v) => setDescription(v ?? '')}
              height={200}
              wikiPages={[]}
              serialSlug=""
            />
            {/* Bridge the controlled editor value into FormData for the server action */}
            <input type="hidden" name="description" value={description} />
          </Box>

          {/* Authors */}
          <Box col className="gap-2">
            <Text variant="label">Authors</Text>
            {authors.map((author, i) => (
              <Box key={i} className="items-center gap-2">
                <Input
                  name="authors"
                  value={author}
                  onChange={(e) => updateAuthor(i, e.target.value)}
                  placeholder={`Author ${i + 1}`}
                  className="flex-1"
                />
                {authors.length > 1 && (
                  <Button
                    type="button"
                    variant="destructive"
                    size="sm"
                    onClick={() => removeAuthor(i)}
                  >
                    Remove
                  </Button>
                )}
              </Box>
            ))}
            <Button
              type="button"
              variant="link"
              onClick={addAuthor}
              className="self-start"
            >
              + Add author
            </Button>
          </Box>

          {/* Volume type and Chapter type */}
          <Box className="gap-4">
            <Box col className="gap-1 flex-1">
              <Label htmlFor="volumeType">Volume type</Label>
              <Select
                id="volumeType"
                name="volumeType"
                options={VOLUME_TYPE_OPTIONS}
                defaultValue="Volume"
              />
            </Box>
            <Box col className="gap-1 flex-1">
              <Label htmlFor="chapterType">Chapter type</Label>
              <Select
                id="chapterType"
                name="chapterType"
                options={CHAPTER_TYPE_OPTIONS}
                defaultValue="Chapter"
              />
            </Box>
          </Box>

          {/* Splash art URL */}
          <Box col className="gap-1">
            <Label htmlFor="splashArtUrl">
              Splash art URL <span className="text-gray-400">(optional)</span>
            </Label>
            <Input
              id="splashArtUrl"
              name="splashArtUrl"
              type="url"
              placeholder="https://example.com/cover.jpg"
            />
          </Box>

          <Button type="submit" className="mt-2">
            Create wiki
          </Button>
        </form>
      </PageContainer>
    </main>
  );
}
