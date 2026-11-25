export type MediaKind = "sources" | "references" | "music" | "assets" | "sfx";

export type MediaItem = {
  name: string;
  relativePath: string;
  url: string;
  size: number;
  updatedAt: string;
  kind: MediaKind;
  /** Ses efektlerinde alt klasör (kategori). */
  category?: string;
};
