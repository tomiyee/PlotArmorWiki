'use client';

import { useEffect, useState } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faPlus, faXmark } from '@fortawesome/free-solid-svg-icons';
import { Text } from '@/components/ui/text';
import { Box } from '@/components/ui/box';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { useServerAction } from '@/hooks/useServerAction';
import { useEditMode } from '@/contexts/EditModeContext';
import { Tooltip } from '@/components/ui/tooltip';

interface SerialMetadataEditorProps {
  title: string;
  description: string | null;
  splashArtUrl: string | null;
  authors: string[];
  updateMetadataAction: (formData: FormData) => Promise<void>;
}

/**
 * Displays the serial's title, authors, description, and splash art in read
 * mode. Switches to an inline edit form when the global edit mode is active.
 * Registers save/discard handlers with `EditModeContext` so the `<EditModeFAB>`
 * can trigger them.
 *
 * @example
 * <SerialMetadataEditor
 *   title={serial.title}
 *   description={serial.description}
 *   splashArtUrl={serial.splashArtUrl}
 *   authors={authors.map((a) => a.name)}
 *   updateMetadataAction={updateMetadataForSerial}
 * />
 */
export function SerialMetadataEditor({
  title,
  description,
  splashArtUrl,
  authors,
  updateMetadataAction,
}: SerialMetadataEditorProps) {
  const { run, isPending } = useServerAction();
  const { isEditing, registerHandlers } = useEditMode();
  const [authorFields, setAuthorFields] = useState<string[]>(
    authors.length > 0 ? authors : ['']
  );
  // Draft values for controlled form fields in edit mode.
  const [draftTitle, setDraftTitle] = useState(title);
  const [draftDescription, setDraftDescription] = useState(description ?? '');
  const [draftSplashArtUrl, setDraftSplashArtUrl] = useState(splashArtUrl ?? '');

  function addAuthor() {
    setAuthorFields((prev) => [...prev, '']);
  }

  function removeAuthor(index: number) {
    setAuthorFields((prev) => prev.filter((_, i) => i !== index));
  }

  function updateAuthor(index: number, value: string) {
    setAuthorFields((prev) => prev.map((a, i) => (i === index ? value : a)));
  }

  function handleDiscard() {
    setDraftTitle(title);
    setDraftDescription(description ?? '');
    setDraftSplashArtUrl(splashArtUrl ?? '');
    setAuthorFields(authors.length > 0 ? authors : ['']);
  }

  function handleSave() {
    const fd = new FormData();
    fd.set('title', draftTitle.trim());
    fd.set('description', draftDescription);
    fd.set('splashArtUrl', draftSplashArtUrl);
    for (const author of authorFields) {
      fd.append('authors', author);
    }
    run(updateMetadataAction, fd);
  }

  useEffect(() => {
    return registerHandlers({ onSave: handleSave, onDiscard: handleDiscard });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draftTitle, draftDescription, draftSplashArtUrl, authorFields]);

  if (!isEditing) {
    return (
      <Box col className="gap-2">
        <Text variant="h1">{title}</Text>
        {authors.length > 0 && (
          <Text muted>{authors.join(', ')}</Text>
        )}
        {description && (
          <Text className="mt-1">{description}</Text>
        )}
        {splashArtUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={splashArtUrl}
            alt={`${title} splash art`}
            className="mt-2 rounded-lg max-h-64 object-cover"
          />
        )}
      </Box>
    );
  }

  return (
    <Box col className="gap-4">
      <Text variant="h2">Edit serial info</Text>

      <Box col className="gap-4">
        {/* Title */}
        <Box col className="gap-1">
          <Label htmlFor="meta-title">
            Title <span className="text-red-500">*</span>
          </Label>
          <Input
            id="meta-title"
            name="title"
            required
            value={draftTitle}
            onChange={(e) => setDraftTitle(e.target.value)}
            placeholder="e.g. One Piece"
          />
        </Box>

        {/* Description */}
        <Box col className="gap-1">
          <Label htmlFor="meta-description">Description</Label>
          <textarea
            id="meta-description"
            name="description"
            rows={4}
            value={draftDescription}
            onChange={(e) => setDraftDescription(e.target.value)}
            placeholder="A brief spoiler-free synopsis…"
            className="rounded-lg border px-4 py-2 text-sm outline-none focus:ring-2 focus:ring-black resize-none"
          />
        </Box>

        {/* Authors */}
        <Box col className="gap-2">
          <Text variant="label">Authors</Text>
          {authorFields.map((author, i) => (
            <Box key={i} className="items-center gap-2">
              <Input
                name="authors"
                value={author}
                onChange={(e) => updateAuthor(i, e.target.value)}
                placeholder={`Author ${i + 1}`}
                className="flex-1"
              />
              {authorFields.length > 1 && (
                <Tooltip content="Remove author">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    onClick={() => removeAuthor(i)}
                    aria-label="Remove author"
                  >
                    <FontAwesomeIcon icon={faXmark} className="h-3 w-3" />
                  </Button>
                </Tooltip>
              )}
            </Box>
          ))}
          <Button
            type="button"
            variant="link"
            onClick={addAuthor}
            className="self-start"
          >
            <FontAwesomeIcon icon={faPlus} className="h-3 w-3" />
            Add author
          </Button>
        </Box>

        {/* Splash art URL */}
        <Box col className="gap-1">
          <Label htmlFor="meta-splashArtUrl">
            Splash art URL <span className="text-gray-400">(optional)</span>
          </Label>
          <Input
            id="meta-splashArtUrl"
            name="splashArtUrl"
            type="url"
            value={draftSplashArtUrl}
            onChange={(e) => setDraftSplashArtUrl(e.target.value)}
            placeholder="https://example.com/cover.jpg"
          />
        </Box>

        {isPending && (
          <Text muted>Saving…</Text>
        )}
      </Box>
    </Box>
  );
}
