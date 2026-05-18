"use client";

import { useState } from "react";
import { Trash2Icon } from "lucide-react";
import { Text } from "@/components/ui/Text";
import { Box } from "@/components/ui/Box";
import { Select } from "@/components/ui/Select";
import { Button } from "@/components/ui/Button";
import { Tooltip } from "@/components/ui/Tooltip";
import { useServerAction } from "@/hooks/useServerAction";
import { addPageRelationship, removePageRelationship } from "./actions";

export interface ParentPageEntry {
  id: number;
  name: string;
  slug: string;
  title: string;
}

interface PageRelationshipsPanelProps {
  /** The DB id of the current (child) page. */
  pageId: number;
  /** Active parent pages at the reader's chapter cutoff. */
  parentPages: ParentPageEntry[];
  /** All pages in the serial (used for the "Add parent" dropdown). Excludes the current page. */
  allSerialPages: { id: number; name: string }[];
  /** The chapter to stamp new/removed relationship rows with. */
  chapterId: number | null;
}

/**
 * Edit-mode panel for managing a page's parent relationships in the DAG.
 * Lists current active parents with a Remove button per entry. Provides an
 * "Add parent" dropdown to link a new parent at the currently-selected chapter.
 *
 * Cycle detection and orphan-guard are enforced server-side; errors are shown
 * inline.
 *
 * @example
 * <PageRelationshipsPanel
 *   pageId={42}
 *   parentPages={[{ id: 1, name: 'Characters', slug: 'characters', title: 'Characters' }]}
 *   allSerialPages={[{ id: 1, name: 'Characters' }, { id: 3, name: 'Straw Hats' }]}
 *   chapterId={7}
 * />
 */
export function PageRelationshipsPanel({
  pageId,
  parentPages,
  allSerialPages,
  chapterId,
}: PageRelationshipsPanelProps) {
  const { run, isPending } = useServerAction();
  const [removeError, setRemoveError] = useState<string | null>(null);
  const [addError, setAddError] = useState<string | null>(null);
  const [selectedParentId, setSelectedParentId] = useState<number | null>(null);

  // Pages already a parent, plus self, are excluded from the "add" dropdown.
  const currentParentIds = new Set(parentPages.map((p) => p.id));
  const addablePages = allSerialPages.filter(
    (p) => p.id !== pageId && !currentParentIds.has(p.id),
  );

  async function handleAddParent() {
    if (!selectedParentId || !chapterId) return;
    setAddError(null);
    const result = await addPageRelationship(
      pageId,
      selectedParentId,
      chapterId,
    );
    if (result?.error) {
      setAddError(result.error);
    } else {
      setSelectedParentId(null);
      run(async (_fd) => {}, new FormData()); // trigger router.refresh()
    }
  }

  async function handleRemoveParent(parentPageId: number) {
    if (!chapterId) return;
    setRemoveError(null);
    const result = await removePageRelationship(
      pageId,
      parentPageId,
      chapterId,
    );
    if (result?.error) {
      setRemoveError(result.error);
    } else {
      run(async (_fd) => {}, new FormData()); // trigger router.refresh()
    }
  }

  const addSelectOptions = addablePages.map((p) => ({
    label: p.name,
    value: p.id,
  }));

  return (
    <Box col className="gap-3 rounded-lg border border-border bg-card p-4">
      <Text variant="h4">Relationships</Text>

      {/* Current parents list */}
      {parentPages.length > 0 ? (
        <ul className="flex flex-col gap-1">
          {parentPages.map((parent) => (
            <li
              key={parent.id}
              className="flex items-center gap-2 rounded-md px-3 py-2 text-sm bg-muted/50"
            >
              <Text as="span" variant="label" className="flex-1">
                {parent.title}
              </Text>
              <Tooltip content={`Remove parent "${parent.title}"`}>
                <Button
                  type="button"
                  variant="destructive"
                  size="icon-xs"
                  aria-label={`Remove parent ${parent.title}`}
                  disabled={isPending || !chapterId}
                  onClick={() => handleRemoveParent(parent.id)}
                >
                  <Trash2Icon className="h-2.5 w-2.5" />
                </Button>
              </Tooltip>
            </li>
          ))}
        </ul>
      ) : (
        <Text muted className="text-sm">
          No parents yet.
        </Text>
      )}

      {removeError && (
        <Text variant="body" className="text-red-600 text-sm">
          {removeError}
        </Text>
      )}

      {/* Add parent */}
      {addablePages.length > 0 && (
        <Box className="items-center gap-2 flex-wrap">
          <Select<number>
            options={[
              { label: "Add a parent page…", value: -1, disabled: true },
              ...addSelectOptions,
            ]}
            value={selectedParentId ?? -1}
            onChange={(v) => setSelectedParentId(v === -1 ? null : v)}
            className="flex-1 min-w-40"
            disabled={isPending || !chapterId}
          />
          <Button
            type="button"
            size="sm"
            disabled={!selectedParentId || isPending || !chapterId}
            onClick={handleAddParent}
          >
            Add
          </Button>
        </Box>
      )}

      {addError && (
        <Text variant="body" className="text-red-600 text-sm">
          {addError}
        </Text>
      )}

      {!chapterId && (
        <Text muted className="text-sm">
          Select a chapter above to manage relationships.
        </Text>
      )}
    </Box>
  );
}
