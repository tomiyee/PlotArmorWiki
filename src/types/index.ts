export interface ChapterData {
  id: number;
  displayName: string;
  idx: number;
  volumeId: number;
}

export interface Volume {
  id: number;
  displayName: string;
}

export interface SchemaNavData {
  id: number;
  name: string;
}

export interface NavbarSerialData {
  serialSlug: string;
  serialTitle: string;
  schemas: SchemaNavData[];
}
