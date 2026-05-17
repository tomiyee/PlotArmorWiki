import { Text } from "@/components/ui/Text";
import { Box } from "@/components/ui/Box";
import { MarkdownRenderer } from "@/components/ui/MarkdownRenderer";
import { WikiLinkMDEditor } from "@/components/WikiLinkMDEditor";
import { InfoIcon } from "@/components/ui/InfoIcon";
import { LastUpdatedTag } from "./LastUpdatedTag";
import type { SectionData } from "./types";

interface Props {
  section: SectionData;
  isFirst: boolean;
  currentContent: string;
  draftContent: string;
  lastUpdatedIdx: number | null;
  selectedChapterIdx: number | null;
  onChange: (val: string) => void;
  serialSlug: string;
  wikiPages: { name: string; slug: string }[];
  /** slug → title map for resolving `[[slug]]` display text in the current-value panel. */
  pageTitles?: Record<string, string>;
}

/**
 * Two-column editor for a single wiki page section: current saved content on the left,
 * MDEditor draft on the right. The first section omits its heading and shows a tooltip
 * explaining it powers hover previews.
 *
 * @example
 * <SectionContentEditor
 *   section={{ id: 1, name: "Summary", content: "...", lastUpdatedChapterIdx: 1 }}
 *   isFirst={true}
 *   currentContent="..."
 *   draftContent="..."
 *   lastUpdatedIdx={1}
 *   selectedChapterIdx={3}
 *   onChange={(val) => setDraft(val)}
 *   serialSlug="one-piece"
 *   wikiPages={[{ name: "Luffy" }]}
 * />
 */
export function SectionContentEditor({
  section,
  isFirst,
  currentContent,
  draftContent,
  lastUpdatedIdx,
  selectedChapterIdx,
  onChange,
  serialSlug,
  wikiPages,
  pageTitles,
}: Props) {
  return (
    <Box col className="gap-2">
      <Box className="items-center gap-2">
        {!isFirst && <Text variant="h2">{section.name}</Text>}
        {isFirst && (
          <InfoIcon contents="This section will appear in preview tooltips when this page is mentioned elsewhere." />
        )}
      </Box>
      <div className="grid grid-cols-2 gap-4 items-start">
        <div className="rounded-lg border border-border bg-muted/40 p-4 h-full">
          <div className="mb-2 flex items-center gap-2">
            <Text
              variant="label"
              className="block text-xs text-muted-foreground uppercase tracking-wide"
            >
              Current value
            </Text>
            <LastUpdatedTag
              lastUpdatedIdx={lastUpdatedIdx}
              selectedChapterIdx={selectedChapterIdx}
            />
          </div>
          {currentContent ? (
            <MarkdownRenderer serialSlug={serialSlug} pageTitles={pageTitles}>
              {currentContent}
            </MarkdownRenderer>
          ) : (
            <Text muted className="text-sm">
              No content at this chapter.
            </Text>
          )}
        </div>
        <WikiLinkMDEditor
          value={draftContent}
          onChange={(val) => onChange(val ?? "")}
          height={300}
          preview="edit"
          wikiPages={wikiPages}
          serialSlug={serialSlug}
        />
      </div>
    </Box>
  );
}
