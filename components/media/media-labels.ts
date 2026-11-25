import type { MediaItem } from "@/lib/media-types";

export const kindLabel = (kind: MediaItem["kind"]) => (kind === "sources" ? "Kaynak" : "Referans");
