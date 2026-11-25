"use client";

import { useCallback } from "react";
import { upsertMediaItem } from "@/lib/client/media";
import type { MediaItem } from "@/lib/media-types";
import { useQuery } from "./useQuery";

type MediaResponse = {
  sources: MediaItem[];
  references: MediaItem[];
  music?: MediaItem[];
  assets?: MediaItem[];
};

export type StudioMediaKind = "sources" | "references" | "music" | "assets";

const EMPTY: MediaItem[] = [];

/** Stüdyonun seçim listeleri: kaynak/referans videolar, müzikler ve görseller. Yüklenen dosya listeye hemen eklenir. */
export function useStudioMedia() {
  const query = useQuery<MediaResponse>("/api/media", { fallbackError: "Medya listesi alınamadı." });
  const { setData } = query;

  const add = useCallback(
    (kind: StudioMediaKind, item: MediaItem) =>
      setData((current) => {
        const base: MediaResponse = current ?? { sources: [], references: [] };
        return { ...base, [kind]: upsertMediaItem(base[kind] ?? [], item) };
      }),
    [setData],
  );

  return {
    sources: query.data?.sources ?? EMPTY,
    references: query.data?.references ?? EMPTY,
    music: query.data?.music ?? EMPTY,
    assets: query.data?.assets ?? EMPTY,
    error: query.error,
    add,
  };
}
