import { Text } from "@/components/ui/Text";
import { Box } from "@/components/ui/Box";
import { WikiLinkMDEditor } from "@/components/MDEditor/index";
import { InfoIcon } from "@/components/ui/InfoIcon";
import { LastUpdatedTag } from "./LastUpdatedTag";
import type { SectionData } from "./types";

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
};

/**
 * Two-column editor for a single wiki page section: saved content on the left,
 * MDEditor draft on the right. The first section omits its heading and shows a
 * tooltip explaining it powers hover previews.
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
  } = props;
  return (
    <Box col className="gap-2">
      <Box className="items-center gap-2">
        {!isFirst && <Text variant="h2">{section.name}</Text>}
        {isFirst && (
          <InfoIcon contents="This section will appear in preview tooltips when this page is mentioned elsewhere." />
        )}
        <LastUpdatedTag
          lastUpdatedIdx={lastUpdatedIdx}
          selectedChapterIdx={selectedChapterIdx}
        />
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
    </Box>
  );
}
