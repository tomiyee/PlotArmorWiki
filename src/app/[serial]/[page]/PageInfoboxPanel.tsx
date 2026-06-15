"use client";

import type { Dispatch, SetStateAction } from "react";
import { useServerAction } from "@/hooks/useServerAction";
import { Text } from "@/components/ui/Text";
import { Box } from "@/components/ui/Box";
import { Label } from "@/components/ui/Label";
import { Button } from "@/components/ui/Button";
import { InfoIcon } from "@/components/ui/InfoIcon";
import { WikiLinkMDEditor } from "@/components/MDEditor/index";
import { addInfoboxSection } from "./actions";
import { PageInfoboxManager, type InfoboxSection } from "./PageInfoboxManager";
import { GalleryImagePicker } from "./GalleryImagePicker";
import type { FloaterRowData } from "./types";
import type { GalleryImage } from "@/types";

type PageInfoboxPanelProps = {
  /** DB id of the page this infobox belongs to. */
  pageId: number;
  /** Wall-clock-versioned infobox row structure for the management panel. */
  infoboxSectionStructure: InfoboxSection[];
  /** Infobox rows at the reader's current chapter cutoff, used to seed draft state. */
  floaterRows: FloaterRowData[];
  /**
   * Controlled draft value for the selected gallery image id, owned by `PageEditor`.
   * Null when no image is selected.
   */
  draftFloaterImageId: number | null;
  /** Setter for `draftFloaterImageId`, owned by `PageEditor`. */
  setDraftFloaterImageId: Dispatch<SetStateAction<number | null>>;
  /** Controlled draft content keyed by infobox section id, owned by `PageEditor`. */
  draftFloaterRowContent: Record<number, string>;
  /** Setter for `draftFloaterRowContent`, owned by `PageEditor`. */
  setDraftFloaterRowContent: Dispatch<SetStateAction<Record<number, string>>>;
  /** Whether the parent editor is pending a transition (disables inputs). */
  isPending: boolean;
  /** Slug of the serial — forwarded to the MDEditor for wiki-link autocomplete. */
  serialSlug: string;
  /** All wiki pages for `[[Page]]` autocomplete in the MDEditor. */
  wikiPages: { name: string; slug: string }[];
  /** All chapters for `[[Chapter:Name]]` autocomplete in the MDEditor. */
  wikiChapters?: { name: string; idx: number }[];
  /** The serial's chapter type label (e.g. `"Chapter"`). */
  chapterType?: string;
  /**
   * Spoiler-filtered gallery images available for the infobox picker.
   * Empty when no images have been uploaded to the serial gallery yet.
   */
  galleryImages?: GalleryImage[];
};

/**
 * Edit-mode panel for the page infobox: enables/disables it, manages row structure,
 * and edits the gallery image selection and per-row content draft.
 * Draft state is owned by `PageEditor` so it can be included in the save payload.
 *
 * @example
 * <PageInfoboxPanel
 *   pageId={42}
 *   infoboxSectionStructure={[]}
 *   floaterRows={[]}
 *   draftFloaterImageId={null}
 *   setDraftFloaterImageId={setId}
 *   draftFloaterRowContent={{}}
 *   setDraftFloaterRowContent={setContent}
 *   isPending={false}
 *   serialSlug="one-piece"
 *   wikiPages={[{ name: "Luffy", slug: "luffy" }]}
 * />
 */
export function PageInfoboxPanel(props: PageInfoboxPanelProps) {
  const {
    pageId,
    infoboxSectionStructure,
    floaterRows,
    draftFloaterImageId,
    setDraftFloaterImageId,
    draftFloaterRowContent,
    setDraftFloaterRowContent,
    isPending: externalIsPending,
    serialSlug,
    wikiPages,
    wikiChapters,
    chapterType,
    galleryImages = [],
  } = props;
  const { runAsync, isPending } = useServerAction();

  const disabled = isPending || externalIsPending;

  return (
    <Box col className="gap-4 rounded-lg border border-infobox-border bg-infobox-bg p-4">
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
              const fd = new FormData();
              fd.set("pageId", String(pageId));
              fd.set("label", "Overview");
              runAsync(() => addInfoboxSection(fd));
            }}
          >
            Enable infobox
          </Button>
        </Box>
      ) : (
        <>
          <PageInfoboxManager
            pageId={pageId}
            sections={infoboxSectionStructure}
          />

          <Box col className="gap-1.5">
            <Label>Image</Label>
            <GalleryImagePicker
              serialSlug={serialSlug}
              pageId={pageId}
              galleryImages={galleryImages}
              selectedImageId={draftFloaterImageId}
              onSelect={setDraftFloaterImageId}
              disabled={disabled}
            />
          </Box>

          {floaterRows.map((row) => (
            <Box key={row.id} col className="gap-1.5">
              <Label>{row.label}</Label>
              <WikiLinkMDEditor
                value={draftFloaterRowContent[row.id] ?? ""}
                onChange={(val) =>
                  setDraftFloaterRowContent((prev) => ({
                    ...prev,
                    [row.id]: val ?? "",
                  }))
                }
                height={120}
                wikiPages={wikiPages}
                serialSlug={serialSlug}
                wikiChapters={wikiChapters}
                chapterType={chapterType}
              />
            </Box>
          ))}
        </>
      )}
    </Box>
  );
}
