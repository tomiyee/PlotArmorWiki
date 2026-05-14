"use client";

import type { Dispatch, SetStateAction } from "react";
import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Text } from "@/components/ui/text";
import { Box } from "@/components/ui/box";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { InfoIcon } from "@/components/ui/info-icon";
import { addInfoboxSection } from "./actions";
import { PageInfoboxManager, type InfoboxSection } from "./PageInfoboxManager";
import type { FloaterRowData } from "./types";

interface Props {
  pageId: number;
  infoboxSectionStructure: InfoboxSection[];
  floaterRows: FloaterRowData[];
  draftFloaterImageUrl: string;
  setDraftFloaterImageUrl: Dispatch<SetStateAction<string>>;
  draftFloaterRowContent: Record<number, string>;
  setDraftFloaterRowContent: Dispatch<SetStateAction<Record<number, string>>>;
  /** Whether the parent editor is pending a transition (disables inputs). */
  isPending: boolean;
}

/**
 * Edit-mode panel for the page infobox: enables/disables it, manages row structure,
 * and edits the image URL and per-row content draft.
 * Draft state is owned by `PageEditor` so it can be included in the save payload.
 *
 * @example
 * <PageInfoboxPanel
 *   pageId={42}
 *   infoboxSectionStructure={[]}
 *   floaterRows={[]}
 *   draftFloaterImageUrl=""
 *   setDraftFloaterImageUrl={setUrl}
 *   draftFloaterRowContent={{}}
 *   setDraftFloaterRowContent={setContent}
 *   isPending={false}
 * />
 */
export function PageInfoboxPanel({
  pageId,
  infoboxSectionStructure,
  floaterRows,
  draftFloaterImageUrl,
  setDraftFloaterImageUrl,
  draftFloaterRowContent,
  setDraftFloaterRowContent,
  isPending: externalIsPending,
}: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const disabled = isPending || externalIsPending;

  return (
    <Box col className="gap-4 rounded-lg border border-gray-200 bg-gray-50 p-4">
      <Box className="items-center gap-2">
        <Text variant="h3">Infobox</Text>
        <InfoIcon contents="The infobox floats on the right side of the page showing an image and key facts about this subject. It's chapter-versioned: each row's content is tied to the 'Writing as of:' chapter you select above." />
      </Box>

      {infoboxSectionStructure.length === 0 ? (
        <Box col className="gap-2">
          <Text muted className="text-sm">
            This page has no infobox. Add a row below to enable the infobox.
          </Text>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="self-start"
            disabled={disabled}
            onClick={() => {
              startTransition(async () => {
                const fd = new FormData();
                fd.set("pageId", String(pageId));
                fd.set("label", "Overview");
                await addInfoboxSection(fd);
                router.refresh();
              });
            }}
          >
            Enable infobox
          </Button>
        </Box>
      ) : (
        <>
          <PageInfoboxManager pageId={pageId} sections={infoboxSectionStructure} />

          <Box col className="gap-1.5">
            <Label htmlFor="floater-image-url">Image URL</Label>
            <Input
              id="floater-image-url"
              value={draftFloaterImageUrl}
              onChange={(e) => setDraftFloaterImageUrl(e.target.value)}
              placeholder="https://…"
              disabled={disabled}
            />
          </Box>

          {floaterRows.map((row) => (
            <Box key={row.id} col className="gap-1.5">
              <Label htmlFor={`floater-row-${row.id}`}>{row.label}</Label>
              <Input
                id={`floater-row-${row.id}`}
                value={draftFloaterRowContent[row.id] ?? ""}
                onChange={(e) =>
                  setDraftFloaterRowContent((prev) => ({
                    ...prev,
                    [row.id]: e.target.value,
                  }))
                }
                disabled={disabled}
              />
            </Box>
          ))}
        </>
      )}
    </Box>
  );
}
