"use client";

import { ActionIcon, Button, Group, Select, Slider, Stack, Text } from "@mantine/core";
import { useElementSize, useMergedRef, useWindowEvent } from "@mantine/hooks";
import { IconPhoto, IconPlayerPause, IconPlayerPlay, IconSparkles } from "@tabler/icons-react";
import { useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { fileName, formatTimecode } from "@/lib/format";
import type { AssetRange, TimeRange } from "@/lib/studio";
import { RangeInspector } from "./RangeInspector";
import { RangeList } from "./RangeList";
import { TimelineTrack, type DragMode } from "./TimelineTrack";
import {
  DEFAULT_LENGTH,
  FALLBACK_WIDTH,
  MAX_ZOOM,
  MIN_LENGTH,
  TRACK_COLORS,
  TRACK_HEIGHT,
  clamp,
  newRangeId,
  roundTime,
  sortedRanges,
  tickStep,
  type TimelineAsset,
  type TimelineClip,
  type Track,
  type TrackRange,
} from "./timeline-utils";
import { useTimelinePlayer } from "./useTimelinePlayer";

export type { TimelineAsset, TimelineClip } from "./timeline-utils";

type Ranges = { animationRanges: TimeRange[]; assetRanges: AssetRange[] };
type Drag = { track: Track; id: string; mode: DragMode; origin: number; from: number; to: number };
type Draft = { track: Track; from: number; to: number };

const SCROLL_MARGIN = 40;
const TRACKS: Track[] = ["animation", "asset"];

type TimelineEditorProps = Ranges & {
  clips: TimelineClip[];
  assets: TimelineAsset[];
  onChange: (next: Ranges) => void;
};

const isTyping = (target: EventTarget | null) =>
  target instanceof HTMLElement && (target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName));

/**
 * Kaynak videoların (arka arkaya) zaman çizelgesi. Kullanıcı animasyon ve görsel aralıklarını işaretler;
 * ajan yalnızca bu aralıklarda çalışır.
 */
export function TimelineEditor({ clips, assets, animationRanges, assetRanges, onChange }: TimelineEditorProps) {
  const [zoom, setZoom] = useState(1);
  const [selected, setSelected] = useState<{ track: Track; id: string } | null>(null);
  const [assetChoice, setAssetChoice] = useState<string | null>(assets[0]?.path ?? null);
  const [draft, setDraftState] = useState<Draft | null>(null);
  // Bırakma olayı, son çizim henüz ekrana yansımadan gelebilir; bu yüzden taslak ref'te de tutulur.
  const draftRef = useRef<Draft | null>(null);
  const drag = useRef<Drag | null>(null);
  const scrubbing = useRef(false);

  const scroller = useRef<HTMLDivElement | null>(null);
  const { ref: sizeRef, width: measuredWidth } = useElementSize<HTMLDivElement>();
  const scrollerRef = useMergedRef(scroller, sizeRef);

  const viewport = measuredWidth || FALLBACK_WIDTH;
  const width = Math.max(viewport, viewport * zoom);
  const total = clips.reduce((sum, clip) => sum + clip.duration, 0);
  const pxPerSecond = total > 0 ? width / total : 1;
  const player = useTimelinePlayer(clips, followPlayhead);

  /** Oynatma kafası görünür alanın dışına çıkınca zaman çizelgesini kaydırır. */
  function followPlayhead(seconds: number) {
    const element = scroller.current;
    if (!element) return;
    const x = seconds * pxPerSecond;
    if (x < element.scrollLeft || x > element.scrollLeft + element.clientWidth - SCROLL_MARGIN) {
      element.scrollLeft = Math.max(0, x - SCROLL_MARGIN);
    }
  }

  const chosenAsset = assets.some((item) => item.path === assetChoice) ? assetChoice : (assets[0]?.path ?? null);
  const rangesOf = (track: Track): TimeRange[] => (track === "animation" ? animationRanges : assetRanges);
  const assetName = (path: string) => assets.find((item) => item.path === path)?.name ?? fileName(path);

  // --- aralık işlemleri ---

  function updateRange(track: Track, id: string, patch: Partial<AssetRange>) {
    const apply = <T extends TimeRange>(list: T[]) => list.map((item) => (item.id === id ? { ...item, ...patch } : item));
    onChange(track === "animation" ? { animationRanges: apply(animationRanges), assetRanges } : { animationRanges, assetRanges: apply(assetRanges) });
  }

  function removeRange(track: Track, id: string) {
    const without = <T extends TimeRange>(list: T[]) => list.filter((item) => item.id !== id);
    onChange(track === "animation" ? { animationRanges: without(animationRanges), assetRanges } : { animationRanges, assetRanges: without(assetRanges) });
    setSelected(null);
  }

  function addRange(track: Track, from: number, to: number) {
    const range = { id: newRangeId(), from: roundTime(from), to: roundTime(to), note: "" };
    if (track === "animation") onChange({ animationRanges: [...animationRanges, range], assetRanges });
    else if (chosenAsset) onChange({ animationRanges, assetRanges: [...assetRanges, { ...range, asset: chosenAsset }] });
    else return;
    setSelected({ track, id: range.id });
  }

  /** `start` saniyesinden varsayılan uzunlukta aralık açar (çizelgenin sonuna taşmadan). */
  function addDefaultRange(track: Track, start: number) {
    const from = Math.min(start, Math.max(0, total - DEFAULT_LENGTH));
    addRange(track, from, Math.min(total, from + DEFAULT_LENGTH));
  }

  // --- fareyle sürükleme ---

  function setDraft(next: Draft | null) {
    draftRef.current = next;
    setDraftState(next);
  }

  function secondsAt(clientX: number): number {
    const element = scroller.current;
    if (!element) return 0;
    const rect = element.getBoundingClientRect();
    return clamp((clientX - rect.left + element.scrollLeft) / pxPerSecond, 0, total);
  }

  function startDrag(event: ReactPointerEvent, track: Track, range: TimeRange | null, mode: DragMode) {
    event.stopPropagation();
    event.preventDefault();
    const origin = secondsAt(event.clientX);
    if (mode === "create") {
      if (track === "asset" && !chosenAsset) return;
      setDraft(null);
      drag.current = { track, id: "", mode, origin, from: origin, to: origin };
    } else if (range) {
      setSelected({ track, id: range.id });
      drag.current = { track, id: range.id, mode, origin, from: range.from, to: range.to };
    }
  }

  function moveDrag(current: Drag, clientX: number) {
    const at = secondsAt(clientX);
    const delta = at - current.origin;
    let { from, to } = current;
    if (current.mode === "create") {
      setDraft({ track: current.track, from: Math.min(current.origin, at), to: Math.max(current.origin, at) });
      return;
    }
    if (current.mode === "move") {
      const length = to - from;
      from = clamp(from + delta, 0, total - length);
      to = from + length;
    } else if (current.mode === "start") {
      from = clamp(from + delta, 0, to - MIN_LENGTH);
    } else {
      to = Math.max(Math.min(total, to + delta), from + MIN_LENGTH);
    }
    updateRange(current.track, current.id, { from: roundTime(from), to: roundTime(Math.min(total, to)) });
  }

  function endDrag(current: Drag) {
    if (current.mode !== "create") return;
    // Sürüklemeden tıklanırsa varsayılan uzunlukta aralık açılır.
    const drawn = draftRef.current;
    if (drawn && drawn.to - drawn.from >= MIN_LENGTH) addRange(current.track, drawn.from, drawn.to);
    else addDefaultRange(current.track, current.origin);
    setDraft(null);
  }

  function startScrub(event: ReactPointerEvent) {
    event.preventDefault();
    player.pause();
    scrubbing.current = true;
    player.seek(secondsAt(event.clientX));
  }

  // Pencere dinleyicileri sürekli bağlıdır; sürükleme yokken hiçbir şey yapmazlar.
  useWindowEvent("pointermove", (event) => {
    if (scrubbing.current) player.seek(secondsAt(event.clientX));
    else if (drag.current) moveDrag(drag.current, event.clientX);
  });
  useWindowEvent("pointerup", () => {
    scrubbing.current = false;
    const current = drag.current;
    drag.current = null;
    if (current) endDrag(current);
  });
  // Seçili aralık Delete / Backspace ile silinir (bir yazı alanındayken değil).
  useWindowEvent("keydown", (event) => {
    if (!selected || isTyping(event.target) || (event.key !== "Delete" && event.key !== "Backspace")) return;
    event.preventDefault();
    removeRange(selected.track, selected.id);
  });

  if (clips.length === 0 || total <= 0) {
    return (
      <Text size="sm" c="dimmed">
        Zaman çizelgesi için önce kaynak video seç.
      </Text>
    );
  }

  const step = tickStep(pxPerSecond);
  const ticks = Array.from({ length: Math.floor(total / step) + 1 }, (_, index) => index * step);
  const selectedRange = selected ? (rangesOf(selected.track).find((item) => item.id === selected.id) ?? null) : null;
  const playheadX = player.time * pxPerSecond;

  const describe = ({ track, range }: TrackRange) =>
    track === "asset" && "asset" in range
      ? `${assetName(range.asset)}${range.note ? ` · ${range.note}` : ""}`
      : range.note || "Animasyon (ajan seçer)";

  const rangeLabel = (track: Track, range: TimeRange) =>
    track === "asset" && "asset" in range ? assetName((range as AssetRange).asset) : range.note || `${(range.to - range.from).toFixed(1)} sn`;

  return (
    <Stack gap="sm">
      <video {...player.videoProps} style={{ display: "block", width: "100%", maxHeight: 360, background: "#000", borderRadius: 8 }} />
      <Group justify="space-between" gap="xs">
        <Group gap="xs">
          <ActionIcon variant="light" onClick={player.togglePlay} aria-label={player.playing ? "Duraklat" : "Oynat"}>
            {player.playing ? <IconPlayerPause size={16} /> : <IconPlayerPlay size={16} />}
          </ActionIcon>
          <Text size="sm" ff="monospace">
            {formatTimecode(player.time)} / {formatTimecode(total)}
          </Text>
        </Group>
        <Group gap="xs" style={{ flex: 1, maxWidth: 220 }}>
          <Text size="xs" c="dimmed">
            Yakınlaştır
          </Text>
          <Slider style={{ flex: 1 }} min={1} max={MAX_ZOOM} step={0.5} value={zoom} onChange={setZoom} label={(value) => `${value}x`} />
        </Group>
      </Group>

      <div
        ref={scrollerRef}
        onWheel={(event) => {
          if (!event.ctrlKey) return;
          event.preventDefault();
          setZoom((current) => clamp(current * (event.deltaY < 0 ? 1.2 : 1 / 1.2), 1, MAX_ZOOM));
        }}
        style={{ overflowX: "auto", overflowY: "hidden", paddingBottom: 6 }}
      >
        <div style={{ position: "relative", width }}>
          <div
            onPointerDown={startScrub}
            style={{ position: "relative", height: 22, cursor: "ew-resize", userSelect: "none", touchAction: "none", borderBottom: "1px solid var(--mantine-color-default-border)" }}
          >
            {ticks.map((tick) => (
              <span
                key={tick}
                style={{ position: "absolute", left: tick * pxPerSecond, top: 0, fontSize: 10, paddingLeft: 3, borderLeft: "1px solid var(--mantine-color-dimmed)", height: 22, color: "var(--mantine-color-dimmed)" }}
              >
                {formatTimecode(tick)}
              </span>
            ))}
            {player.starts.slice(1).map((start) => (
              <span
                key={`clip-${start}`}
                style={{ position: "absolute", left: start * pxPerSecond, top: 0, bottom: -2 * TRACK_HEIGHT - 20, borderLeft: "2px dashed var(--mantine-color-dimmed)" }}
              />
            ))}
          </div>
          {TRACKS.map((track) => (
            <TimelineTrack
              key={track}
              track={track}
              ranges={rangesOf(track)}
              draft={draft?.track === track ? draft : null}
              selectedId={selected?.track === track ? selected.id : null}
              pxPerSecond={pxPerSecond}
              disabled={track === "asset" && !chosenAsset}
              rangeLabel={rangeLabel}
              onPointerDown={startDrag}
              onSeek={player.seek}
              onRemove={removeRange}
            />
          ))}
          <div style={{ position: "absolute", top: 0, bottom: 0, left: playheadX, width: 2, background: "var(--mantine-color-red-6)", pointerEvents: "none" }} />
          <div
            onPointerDown={startScrub}
            title="Sürükleyerek videoda gez"
            style={{
              position: "absolute",
              top: 0,
              left: playheadX - 7,
              width: 16,
              height: 16,
              background: "var(--mantine-color-red-6)",
              clipPath: "polygon(0 0, 100% 0, 100% 55%, 50% 100%, 0 55%)",
              cursor: "ew-resize",
              touchAction: "none",
            }}
          />
        </div>
      </div>

      <Group gap="md">
        <Legend color={TRACK_COLORS.animation.border} label="Üst şerit: animasyon" />
        <Legend color={TRACK_COLORS.asset.border} label="Alt şerit: görsel" />
      </Group>
      <Text size="xs" c="dimmed">
        Şeridin üstünde sürükleyerek aralık çiz; aralığı tutup taşı, kenarlarından uzat/kısalt. Silmek için aralıktaki ✕ işaretine,
        listedeki çöp kutusuna bas ya da aralığı seçip Delete tuşuna bas. Cetvelde (en üstteki saniyeler) basılı tutup sürükleyerek
        videoda gez; aralığa çift tıklayınca başına gider. Ctrl + tekerlek ile yakınlaş.
      </Text>

      <Group gap="xs" align="flex-end">
        <Button size="xs" variant="light" leftSection={<IconSparkles size={14} />} onClick={() => addDefaultRange("animation", player.time)}>
          Buraya animasyon aralığı ekle
        </Button>
        {assets.length ? (
          <>
            <Select
              size="xs"
              w={190}
              label="Görsel şeridine eklenecek"
              data={assets.map((item) => ({ value: item.path, label: item.name }))}
              value={chosenAsset}
              onChange={setAssetChoice}
              allowDeselect={false}
            />
            <Button size="xs" variant="light" color="teal" leftSection={<IconPhoto size={14} />} onClick={() => addDefaultRange("asset", player.time)}>
              Buraya görsel aralığı ekle
            </Button>
          </>
        ) : (
          <Text size="xs" c="dimmed">
            Görsel şeridini kullanmak için önce kaynak görsel yükle.
          </Text>
        )}
      </Group>

      {selected && selectedRange ? (
        <RangeInspector
          track={selected.track}
          range={selectedRange}
          total={total}
          assets={assets}
          onChange={(patch) => updateRange(selected.track, selected.id, patch)}
          onRemove={() => removeRange(selected.track, selected.id)}
        />
      ) : null}

      <RangeList
        items={sortedRanges(animationRanges, assetRanges)}
        describe={describe}
        onSelect={({ track, range }) => {
          setSelected({ track, id: range.id });
          player.seek(range.from);
        }}
        onRemove={removeRange}
        onClear={() => {
          onChange({ animationRanges: [], assetRanges: [] });
          setSelected(null);
        }}
      />
    </Stack>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <Group gap={6}>
      <span style={{ width: 12, height: 12, background: color, borderRadius: 2 }} />
      <Text size="xs">{label}</Text>
    </Group>
  );
}
