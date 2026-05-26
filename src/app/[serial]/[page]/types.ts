export interface SectionData {
  id: number;
  name: string;
  content: string;
  /** The chapters.idx of the revision currently active at the reader's cutoff, or null if no content yet. */
  lastUpdatedChapterIdx: number | null;
}

export interface FloaterRowData {
  id: number;
  label: string;
  content: string;
}

export interface ChapterData {
  id: number;
  displayName: string;
  idx: number;
  volumeName: string;
}

export interface PageTitleEntry {
  chapterId: number;
  /** Human-readable label, e.g. "Volume 1 - Chapter 3". */
  chapterLabel: string;
  title: string;
}

/** A volume group option for the "Writing as of:" chapter selector. */
export type ChapterGroupOption = {
  label: string;
  value: number;
  children: { label: string; value: number; disabled: boolean }[];
};
