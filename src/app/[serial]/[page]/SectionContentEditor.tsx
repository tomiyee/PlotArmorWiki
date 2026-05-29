import { useState } from "react";
import { Eraser } from "lucide-react";
import { Text } from "@/components/ui/Text";
import { Box } from "@/components/ui/Box";
import { Button } from "@/components/ui/Button";
import { Tooltip } from "@/components/ui/Tooltip";
import { WikiLinkMDEditor } from "@/components/MDEditor/index";
import { InfoIcon } from "@/components/ui/InfoIcon";
import { LastUpdatedTag } from "./LastUpdatedTag";
import { RemoveRevisionDialog } from "./RemoveRevisionDialog";
import type { SectionData, ChapterData } from "./types";

type SectionContentEditorProps = {
  /** The section data including name, id, and saved content. */
  section: SectionData;
  /** When true, hides the section heading and shows a preview-tooltip info icon instead. */
  isFirst: boolean;
  /** The current unsaved draft content for this section. */
  draftContent: string;
  /** Chapter index of the last saved revision, or null if never saved. */
  lastUpdatedIdx: number | null;
  /** The currently selected chapter index for the "writing as of" context. */
  selectedChapterIdx: number | null;
  /** Called with the new markdown string whenever the draft changes. */
  onChange: (val: string) => void;
  /** Slug of the parent serial, used to resolve wiki links. */
  serialSlug: string;
  /** All wiki pages in this serial for `[[Page]]` autocomplete. */
  wikiPages: { name: string; slug: string }[];
  /** Chapters for `[[Chapter:Name]]` autocomplete in the editor. */
  wikiChapters?: { name: string; idx: number }[];
  /** The serial's chapter type label (e.g. `"Chapter"`). */
  chapterType?: string;
  /**
   * Content from the revision immediately before the selected chapter's revision.
   * Empty string when no prior revision exists. Clicking "Remove revision" loads
   * this value into the draft; saving it triggers the same-as-previous invariant
   * which deletes the current chapter's revision.
   */
  previousRevisionContent: string;
  /** Chapter idx of the revision immediately before the selected chapter's revision, or null when no prior revision exists. */
  previousRevisionChapterIdx: number | null;
  /**
   * Called when the user confirms removing the revision in the dialog. The parent
   * (PageEditor) handles the draft update and any necessary chapter switch.
   */
  onConfirmRemove: () => void;
  /** All chapters in the serial. Used to compute impact range in the remove-revision dialog. */
  allChapters: ChapterData[];
  /**
   * Chapter idx of the next revision strictly after the selected chapter, or null when
   * this is the most recent revision. Forwarded to the remove-revision dialog to show
   * the exact range of chapters that would be affected.
   */
  nextRevisionChapterIdx: number | null;
};

/**
 * Two-column editor for a single wiki page section: saved content on the left,
 * MDEditor draft on the right. The first section omits its heading and shows a
 * tooltip explaining it powers hover previews.
 *
 * Shows a "Remove revision" button when the selected chapter has a direct revision.
 * Clicking it opens a confirmation dialog with a side-by-side diff and chapter
 * impact timeline before loading the previous revision into the draft.
 *
 * @example
 * <SectionContentEditor
 *   section={section}
 *   isFirst={true}
 *   draftContent="..."
 *   lastUpdatedIdx={1}
 *   selectedChapterIdx={3}
 *   onChange={(val) => setDraft(val)}
 *   serialSlug="one-piece"
 *   wikiPages={[{ name: "Luffy", slug: "luffy" }]}
 *   previousRevisionContent="Earlier content"
 *   onConfirmRemove={() => {}}
 *   allChapters={allChapters}
 * />
 */
export function SectionContentEditor(props: SectionContentEditorProps) {
  const {
    section,
    isFirst,
    draftContent,
    lastUpdatedIdx,
    selectedChapterIdx,
    onChange,
    serialSlug,
    wikiPages,
    wikiChapters,
    chapterType,
    previousRevisionContent,
    previousRevisionChapterIdx,
    onConfirmRemove,
    allChapters,
    nextRevisionChapterIdx,
  } = props;

  const [isDialogOpen, setIsDialogOpen] = useState(false);

  function handleConfirmRemove() {
    onConfirmRemove();
    setIsDialogOpen(false);
  }

  return (
    <Box col className="gap-2">
      <Box className="items-center gap-2 flex-wrap">
        {!isFirst && <Text variant="h2">{section.name}</Text>}
        {isFirst && (
          <InfoIcon contents="This section will appear in preview tooltips when this page is mentioned elsewhere." />
        )}
        <LastUpdatedTag
          lastUpdatedIdx={lastUpdatedIdx}
          selectedChapterIdx={selectedChapterIdx}
        />
        <Box className="ml-auto">
          {lastUpdatedIdx !== null ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setIsDialogOpen(true)}
              aria-label="Remove this section's revision"
              className="text-muted-foreground hover:text-foreground gap-1.5"
            >
              <Eraser size={14} />
              Remove revision
            </Button>
          ) : (
            <Tooltip content="No revision exists for this section yet">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled
                aria-label="Remove this section's revision"
                className="gap-1.5"
              >
                <Eraser size={14} />
                Remove revision
              </Button>
            </Tooltip>
          )}
        </Box>
      </Box>

      <WikiLinkMDEditor
        value={draftContent}
        onChange={(val) => onChange(val ?? "")}
        height={300}
        preview="edit"
        wikiPages={wikiPages}
        serialSlug={serialSlug}
        wikiChapters={wikiChapters}
        chapterType={chapterType}
      />

      <RemoveRevisionDialog
        isOpen={isDialogOpen}
        onClose={() => setIsDialogOpen(false)}
        onConfirm={handleConfirmRemove}
        sectionName={isFirst ? "Summary" : section.name}
        currentContent={section.content}
        previousContent={previousRevisionContent}
        previousRevisionChapterIdx={previousRevisionChapterIdx}
        allChapters={allChapters}
        selectedChapterIdx={lastUpdatedIdx}
        nextRevisionChapterIdx={nextRevisionChapterIdx}
      />
    </Box>
  );
}
