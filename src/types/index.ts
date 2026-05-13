export interface ChapterData {
  id: number;
  displayName: string;
  idx: number;
  volumeId: number;
}

export interface Volume {
  id: number;
  displayName: string;
  idx: number;
}

export interface CategoryNavData {
  id: number;
  name: string;
  slug: string;
}

export interface NavbarSerialData {
  serialSlug: string;
  serialTitle: string;
  categories: CategoryNavData[];
}
