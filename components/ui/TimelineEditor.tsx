"use client";

import { ActionIcon, Badge, Button, Group, NumberInput, Paper, Select, Slider, Stack, Text, TextInput } from "@mantine/core";
import { IconPhoto, IconPlayerPause, IconPlayerPlay, IconPlus, IconSparkles, IconTrash, IconX } from "@tabler/icons-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { AssetRange, TimeRange } from "@/lib/studio";

type Clip = { path: string; url: string; duration: number };
type Track = "animation" | "asset";
type Drag = { track: Track; id: string; mode: "move" | "start" | "end" | "create"; origin: number; from: number; to: number };

const MIN_LENGTH = 0.3;
const DEFAULT_LENGTH = 2;
const TRACK_HEIGHT = 44;
const COLORS: Record<Track, { fill: string; border: string }> = {
  animation: { fill: "rgba(232,163,61,0.35)", border: "#E8A33D" },
  asset: { fill: "rgba(79,138,139,0.4)", border: "#4F8A8B" },
};

function newId(): string {
  return `r${Date.now().toString(36)}${Math.floor(Math.random() * 1e4).toString(36)}`;
}

function formatTime(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  const rest = seconds - minutes * 60;
  return `${minutes}:${rest.toFixed(1).padStart(4, "0")}`;
}

function tickStep(pixelsPerSecond: number): number {
  for (const step of [0.5, 1, 2, 5, 10, 15, 30, 60]) {
    if (step * pixelsPerSecond >= 70) return step;
  }
  return 120;
}

/**
 * Kaynak videoların (arka arkaya) zaman çizelgesi. Kullanıcı animasyon ve görsel aralıklarını işaretler;
 * ajan yalnızca bu aralıklarda çalışır.
 */
export function TimelineEditor({
  clips,
  assets,
  animationRanges,
  assetRanges,
  onChange,
}: {
  clips: Clip[];
  assets: { path: string; name: string; url: string }[];
  animationRanges: TimeRange[];
  assetRanges: AssetRange[];
  onChange: (next: { animationRanges: TimeRange[]; assetRanges: AssetRange[] }) => void;
}) {
  const total = clips.reduce((sum, clip) => sum + clip.duration, 0);
  const [zoom, setZoom] = useState(1);
  const [time, setTime] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [selected, setSelected] = useState<{ track: Track; id: string } | null>(null);
  const [assetChoice, setAssetChoice] = useState<string | null>(assets[0]?.path ?? null);
  const [viewport, setViewport] = useState(600);
  const dragRef = useRef<Drag | null>(null);
  const handlers = useRef<{
    move: (event: PointerEvent) => void;
    up: () => void;
    scrub: (clientX: number) => void;
    remove: () => void;
  } | null>(null);
  // Yeni aralık çizilirken taslak; bırakınca eklenir.
  const [draft, setDraft] = useState<{ track: Track; from: number; to: number } | null>(null);
  const draftRef = useRef<{ track: Track; from: number; to: number } | null>(null);
  const video = useRef<HTMLVideoElement | null>(null);
  const scroller = useRef<HTMLDivElement | null>(null);
  const clipIndex = useRef(0);
  const pendingSeek = useRef<number | null>(null);

  const chosenAsset = assets.some((item) => item.path === assetChoice) ? assetChoice : (assets[0]?.path ?? null);
  const width = Math.max(viewport, viewport * zoom);
  const pxPerSecond = total > 0 ? width / total : 1;

  const starts = useMemo(
    () => clips.map((_, index) => clips.slice(0, index).reduce((sum, clip) => sum + clip.duration, 0)),
    [clips],
  );

  // Zaman çizelgesi ancak kaynak seçilince çizilir; ölçümü o zaman başlat.
  const hasClips = clips.length > 0;
  useEffect(() => {
    const element = scroller.current;
    if (!element) return;
    const observer = new ResizeObserver(() => setViewport(element.clientWidth || 600));
    observer.observe(element);
    return () => observer.disconnect();
  }, [hasClips]);

  const locate = useCallback(
    (seconds: number) => {
      let index = clips.length - 1;
      for (let i = 0; i < clips.length; i += 1) {
        if (seconds < starts[i] + clips[i].duration) {
          index = i;
          break;
        }
      }
      return { index: Math.max(0, index), local: Math.max(0, seconds - (starts[index] ?? 0)) };
    },
    [clips, starts],
  );

  const seek = useCallback(
    (seconds: number) => {
      const target = Math.min(Math.max(0, seconds), Math.max(0, total - 0.01));
      setTime(target);
      const element = video.current;
      if (!element || clips.length === 0) return;
      const { index, local } = locate(target);
      if (index !== clipIndex.current) {
        clipIndex.current = index;
        pendingSeek.current = local;
        element.src = clips[index].url;
      } else {
        element.currentTime = local;
      }
    },
    [clips, locate, total],
  );

  // Kaynak listesi değişince ilk videoya dön.
  const clipKey = clips.map((clip) => clip.url).join("|");
  const firstUrl = clips[0]?.url;
  useEffect(() => {
    const element = video.current;
    clipIndex.current = 0;
    if (element && firstUrl) element.src = firstUrl;
  }, [clipKey, firstUrl]);

  function onTimeUpdate() {
    const element = video.current;
    if (!element) return;
    setTime((starts[clipIndex.current] ?? 0) + element.currentTime);
  }

  function onLoaded() {
    const element = video.current;
    if (!element) return;
    if (pendingSeek.current !== null) {
      element.currentTime = pendingSeek.current;
      pendingSeek.current = null;
    }
    if (playing) void element.play().catch(() => setPlaying(false));
  }

  function onEnded() {
    const next = clipIndex.current + 1;
    if (next < clips.length) {
      seek(starts[next]);
    } else {
      setPlaying(false);
    }
  }

  function togglePlay() {
    const element = video.current;
    if (!element) return;
    if (element.paused) {
      setPlaying(true);
      void element.play().catch(() => setPlaying(false));
    } else {
      element.pause();
      setPlaying(false);
    }
  }

  // Oynatma kafası görünür alanın dışına çıkınca zaman çizelgesini kaydır.
  useEffect(() => {
    const element = scroller.current;
    if (!element || !playing) return;
    const x = time * pxPerSecond;
    if (x < element.scrollLeft || x > element.scrollLeft + element.clientWidth - 40) {
      element.scrollLeft = Math.max(0, x - 40);
    }
  }, [playing, pxPerSecond, time]);

  const ranges = useCallback(
    (track: Track): TimeRange[] => (track === "animation" ? animationRanges : assetRanges),
    [animationRanges, assetRanges],
  );

  const update = useCallback(
    (track: Track, id: string, patch: Partial<AssetRange>) => {
      const apply = <T extends TimeRange>(list: T[]) => list.map((item) => (item.id === id ? { ...item, ...patch } : item));
      onChange(
        track === "animation"
          ? { animationRanges: apply(animationRanges), assetRanges }
          : { animationRanges, assetRanges: apply(assetRanges) },
      );
    },
    [animationRanges, assetRanges, onChange],
  );

  function remove(track: Track, id: string) {
    onChange(
      track === "animation"
        ? { animationRanges: animationRanges.filter((item) => item.id !== id), assetRanges }
        : { animationRanges, assetRanges: assetRanges.filter((item) => item.id !== id) },
    );
    setSelected(null);
  }

  function add(track: Track, from: number, to: number): string | null {
    const id = newId();
    const range = { id, from: round(from), to: round(to), note: "" };
    if (track === "animation") {
      onChange({ animationRanges: [...animationRanges, range], assetRanges });
    } else {
      if (!chosenAsset) return null;
      onChange({ animationRanges, assetRanges: [...assetRanges, { ...range, asset: chosenAsset }] });
    }
    setSelected({ track, id });
    return id;
  }

  function addAtPlayhead(track: Track) {
    const from = Math.min(time, Math.max(0, total - DEFAULT_LENGTH));
    add(track, from, Math.min(total, from + DEFAULT_LENGTH));
  }

  function secondsAt(clientX: number): number {
    const element = scroller.current;
    if (!element) return 0;
    const rect = element.getBoundingClientRect();
    return Math.min(total, Math.max(0, (clientX - rect.left + element.scrollLeft) / pxPerSecond));
  }

  function moveDrag(event: PointerEvent) {
    const drag = dragRef.current;
    if (!drag) return;
    const at = secondsAt(event.clientX);
    const delta = at - drag.origin;
    let { from, to } = drag;
    if (drag.mode === "move") {
      const length = to - from;
      from = Math.min(Math.max(0, from + delta), total - length);
      to = from + length;
    } else if (drag.mode === "start") {
      from = Math.min(Math.max(0, from + delta), to - MIN_LENGTH);
    } else if (drag.mode === "end") {
      to = Math.max(Math.min(total, to + delta), from + MIN_LENGTH);
    } else {
      const next = { track: drag.track, from: Math.min(drag.origin, at), to: Math.max(drag.origin, at) };
      draftRef.current = next;
      setDraft(next);
      return;
    }
    update(drag.track, drag.id, { from: round(from), to: round(Math.min(total, to)) });
  }

  function endDrag() {
    const drag = dragRef.current;
    dragRef.current = null;
    if (drag?.mode !== "create") return;
    const drawn = draftRef.current;
    // Sürüklemeden tıklanırsa varsayılan uzunlukta aralık açılır.
    if (drawn && drawn.to - drawn.from >= MIN_LENGTH) add(drag.track, drawn.from, drawn.to);
    else {
      const from = Math.min(drag.origin, Math.max(0, total - DEFAULT_LENGTH));
      add(drag.track, from, Math.min(total, from + DEFAULT_LENGTH));
    }
    draftRef.current = null;
    setDraft(null);
  }

  // Pencere dinleyicileri her zaman son render'daki işleyicileri çağırır.
  useEffect(() => {
    handlers.current = {
      move: moveDrag,
      up: endDrag,
      scrub: (clientX) => seek(secondsAt(clientX)),
      remove: () => {
        if (selected) remove(selected.track, selected.id);
      },
    };
  });

  // Cetvelde basılı tutup sürükleyince oynatma kafası fareyi izler.
  function startScrub(event: React.PointerEvent) {
    event.preventDefault();
    const element = video.current;
    if (element && !element.paused) element.pause();
    handlers.current?.scrub(event.clientX);
    const onMove = (moveEvent: PointerEvent) => handlers.current?.scrub(moveEvent.clientX);
    const onUp = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  }

  // Seçili aralık Delete / Backspace ile silinir (bir yazı alanındayken değil).
  useEffect(() => {
    if (!selected) return;
    function onKey(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      if (target && (target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName))) return;
      if (event.key !== "Delete" && event.key !== "Backspace") return;
      event.preventDefault();
      handlers.current?.remove();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selected]);

  function startDrag(event: React.PointerEvent, track: Track, range: TimeRange | null, mode: Drag["mode"]) {
    event.stopPropagation();
    event.preventDefault();
    const origin = secondsAt(event.clientX);
    if (mode === "create") {
      if (track === "asset" && !chosenAsset) return;
      draftRef.current = null;
      setDraft(null);
      dragRef.current = { track, id: "", mode, origin, from: origin, to: origin };
    } else if (range) {
      setSelected({ track, id: range.id });
      dragRef.current = { track, id: range.id, mode, origin, from: range.from, to: range.to };
    } else {
      return;
    }
    // Dinleyiciler basma anında bağlanır: hızlı bir sürüklemede bırakma olayı kaçmaz.
    const onMove = (moveEvent: PointerEvent) => handlers.current?.move(moveEvent);
    const onUp = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      handlers.current?.up();
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  }

  const step = tickStep(pxPerSecond);
  const ticks = total > 0 ? Array.from({ length: Math.floor(total / step) + 1 }, (_, index) => index * step) : [];
  const selectedRange = selected ? ranges(selected.track).find((item) => item.id === selected.id) ?? null : null;
  const assetName = (path: string) => assets.find((item) => item.path === path)?.name ?? path.split("/").pop();

  if (clips.length === 0 || total <= 0) {
    return (
      <Text size="sm" c="dimmed">
        Zaman çizelgesi için önce kaynak video seç.
      </Text>
    );
  }

  function renderTrack(track: Track, label: string) {
    const list = ranges(track);
    return (
      <div style={{ position: "relative", height: TRACK_HEIGHT, marginTop: 6 }}>
        <div
          onPointerDown={(event) => startDrag(event, track, null, "create")}
          style={{
            position: "absolute",
            inset: 0,
            background: "var(--mantine-color-default-hover)",
            borderRadius: 6,
            cursor: track === "asset" && !chosenAsset ? "not-allowed" : "crosshair",
          }}
          title={`${label}: sürükleyerek aralık çiz`}
        />
        {draft && draft.track === track ? (
          <div
            style={{
              position: "absolute",
              top: 3,
              bottom: 3,
              left: draft.from * pxPerSecond,
              width: Math.max(2, (draft.to - draft.from) * pxPerSecond),
              border: `2px dashed ${COLORS[track].border}`,
              background: COLORS[track].fill,
              borderRadius: 4,
              pointerEvents: "none",
            }}
          />
        ) : null}
        {list.map((range) => {
          const active = selected?.track === track && selected.id === range.id;
          const colors = COLORS[track];
          return (
            <div
              key={range.id}
              onPointerDown={(event) => startDrag(event, track, range, "move")}
              onDoubleClick={() => seek(range.from)}
              style={{
                position: "absolute",
                top: 3,
                bottom: 3,
                left: range.from * pxPerSecond,
                width: Math.max(6, (range.to - range.from) * pxPerSecond),
                background: colors.fill,
                border: `2px solid ${colors.border}`,
                outline: active ? "2px solid var(--mantine-color-text)" : "none",
                borderRadius: 4,
                cursor: "grab",
                overflow: "hidden",
                fontSize: 11,
                lineHeight: "34px",
                paddingLeft: 8,
                paddingRight: 32,
                whiteSpace: "nowrap",
                userSelect: "none",
              }}
            >
              {track === "asset" ? assetName((range as AssetRange).asset) : range.note || `${(range.to - range.from).toFixed(1)} sn`}
              <span
                onPointerDown={(event) => startDrag(event, track, range, "start")}
                style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: 8, cursor: "ew-resize" }}
              />
              <span
                onPointerDown={(event) => startDrag(event, track, range, "end")}
                style={{ position: "absolute", right: 0, top: 0, bottom: 0, width: 8, cursor: "ew-resize" }}
              />
              {(range.to - range.from) * pxPerSecond >= 26 ? (
                <span
                  role="button"
                  aria-label="Aralığı sil"
                  title="Aralığı sil"
                  onPointerDown={(event) => {
                    event.stopPropagation();
                    event.preventDefault();
                  }}
                  onClick={(event) => {
                    event.stopPropagation();
                    remove(track, range.id);
                  }}
                  style={{
                    position: "absolute",
                    right: 10,
                    top: 9,
                    width: 18,
                    height: 18,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    borderRadius: 4,
                    background: "rgba(0,0,0,0.55)",
                    color: "#fff",
                    cursor: "pointer",
                  }}
                >
                  <IconX size={12} />
                </span>
              ) : null}
            </div>
          );
        })}
      </div>
    );
  }

  return (
    <Stack gap="sm">
      <video
        ref={video}
        onTimeUpdate={onTimeUpdate}
        onLoadedMetadata={onLoaded}
        onEnded={onEnded}
        onPause={() => setPlaying(false)}
        playsInline
        style={{ display: "block", width: "100%", maxHeight: 360, background: "#000", borderRadius: 8 }}
      />
      <Group justify="space-between" gap="xs">
        <Group gap="xs">
          <ActionIcon variant="light" onClick={togglePlay} aria-label={playing ? "Duraklat" : "Oynat"}>
            {playing ? <IconPlayerPause size={16} /> : <IconPlayerPlay size={16} />}
          </ActionIcon>
          <Text size="sm" ff="monospace">
            {formatTime(time)} / {formatTime(total)}
          </Text>
        </Group>
        <Group gap="xs" style={{ flex: 1, maxWidth: 220 }}>
          <Text size="xs" c="dimmed">
            Yakınlaştır
          </Text>
          <Slider style={{ flex: 1 }} min={1} max={30} step={0.5} value={zoom} onChange={setZoom} label={(value) => `${value}x`} />
        </Group>
      </Group>

      <div
        ref={scroller}
        onWheel={(event) => {
          if (!event.ctrlKey) return;
          event.preventDefault();
          setZoom((current) => Math.min(30, Math.max(1, current * (event.deltaY < 0 ? 1.2 : 1 / 1.2))));
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
                {formatTime(tick)}
              </span>
            ))}
            {starts.slice(1).map((start) => (
              <span key={`clip-${start}`} style={{ position: "absolute", left: start * pxPerSecond, top: 0, bottom: -2 * TRACK_HEIGHT - 20, borderLeft: "2px dashed var(--mantine-color-dimmed)" }} />
            ))}
          </div>
          {renderTrack("animation", "Animasyon")}
          {renderTrack("asset", "Görsel")}
          <div
            style={{ position: "absolute", top: 0, bottom: 0, left: time * pxPerSecond, width: 2, background: "var(--mantine-color-red-6)", pointerEvents: "none" }}
          />
          <div
            onPointerDown={startScrub}
            title="Sürükleyerek videoda gez"
            style={{
              position: "absolute",
              top: 0,
              left: time * pxPerSecond - 7,
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
        <Group gap={6}>
          <span style={{ width: 12, height: 12, background: COLORS.animation.border, borderRadius: 2 }} />
          <Text size="xs">Üst şerit: animasyon</Text>
        </Group>
        <Group gap={6}>
          <span style={{ width: 12, height: 12, background: COLORS.asset.border, borderRadius: 2 }} />
          <Text size="xs">Alt şerit: görsel</Text>
        </Group>
      </Group>
      <Text size="xs" c="dimmed">
        Şeridin üstünde sürükleyerek aralık çiz; aralığı tutup taşı, kenarlarından uzat/kısalt. Silmek için aralıktaki ✕ işaretine, listedeki çöp kutusuna bas ya da aralığı seçip Delete tuşuna bas. Cetvelde (en üstteki saniyeler) basılı tutup sürükleyerek videoda gez; aralığa çift tıklayınca başına gider. Ctrl + tekerlek ile yakınlaş.
      </Text>

      <Group gap="xs" align="flex-end">
        <Button size="xs" variant="light" leftSection={<IconSparkles size={14} />} onClick={() => addAtPlayhead("animation")}>
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
            <Button size="xs" variant="light" color="teal" leftSection={<IconPhoto size={14} />} onClick={() => addAtPlayhead("asset")}>
              Buraya görsel aralığı ekle
            </Button>
          </>
        ) : (
          <Text size="xs" c="dimmed">
            Görsel şeridini kullanmak için önce kaynak görsel yükle.
          </Text>
        )}
      </Group>

      {selectedRange && selected ? (
        <Paper withBorder p="sm" radius="md">
          <Group justify="space-between" mb={6}>
            <Badge color={selected.track === "animation" ? "orange" : "teal"} variant="light">
              {selected.track === "animation" ? "Animasyon aralığı" : "Görsel aralığı"}
            </Badge>
            <Button size="xs" color="red" variant="light" leftSection={<IconTrash size={14} />} onClick={() => remove(selected.track, selected.id)}>
              Aralığı sil
            </Button>
          </Group>
          <Group grow gap="xs">
            <NumberInput
              size="xs"
              label="Başlangıç (sn)"
              decimalScale={2}
              step={0.1}
              min={0}
              max={selectedRange.to - MIN_LENGTH}
              value={selectedRange.from}
              onChange={(value) => update(selected.track, selected.id, { from: round(Math.min(Number(value) || 0, selectedRange.to - MIN_LENGTH)) })}
            />
            <NumberInput
              size="xs"
              label="Bitiş (sn)"
              decimalScale={2}
              step={0.1}
              min={selectedRange.from + MIN_LENGTH}
              max={total}
              value={selectedRange.to}
              onChange={(value) => update(selected.track, selected.id, { to: round(Math.max(Number(value) || 0, selectedRange.from + MIN_LENGTH)) })}
            />
          </Group>
          {selected.track === "asset" ? (
            <Select
              size="xs"
              mt={6}
              label="Görsel"
              data={assets.map((item) => ({ value: item.path, label: item.name }))}
              value={(selectedRange as AssetRange).asset}
              onChange={(value) => value && update(selected.track, selected.id, { asset: value })}
              allowDeselect={false}
            />
          ) : null}
          <TextInput
            size="xs"
            mt={6}
            label="Not (isteğe bağlı)"
            placeholder={selected.track === "animation" ? "Örn: kafamın üstünde ampul yansın" : "Örn: tabloyu sağ üstte göster"}
            value={selectedRange.note}
            onChange={(event) => update(selected.track, selected.id, { note: event.currentTarget.value.slice(0, 300) })}
          />
        </Paper>
      ) : null}

      {animationRanges.length + assetRanges.length > 0 ? (
        <Stack gap={4}>
          {[
            ...animationRanges.map((range) => ({ track: "animation" as Track, range })),
            ...assetRanges.map((range) => ({ track: "asset" as Track, range })),
          ]
            .sort((a, b) => a.range.from - b.range.from)
            .map(({ track, range }) => (
              <Group
                key={range.id}
                gap="xs"
                wrap="nowrap"
                style={{ cursor: "pointer" }}
                onClick={() => {
                  setSelected({ track, id: range.id });
                  seek(range.from);
                }}
              >
                <Badge size="sm" color={track === "animation" ? "orange" : "teal"} variant="light" leftSection={track === "animation" ? <IconPlus size={10} /> : <IconPhoto size={10} />}>
                  {formatTime(range.from)}–{formatTime(range.to)}
                </Badge>
                <Text size="xs" truncate style={{ flex: 1 }}>
                  {track === "asset" ? `${assetName((range as AssetRange).asset)}${range.note ? ` · ${range.note}` : ""}` : range.note || "Animasyon (ajan seçer)"}
                </Text>
                <ActionIcon
                  size="sm"
                  color="red"
                  variant="subtle"
                  aria-label="Aralığı sil"
                  onClick={(event) => {
                    event.stopPropagation();
                    remove(track, range.id);
                  }}
                >
                  <IconTrash size={14} />
                </ActionIcon>
              </Group>
            ))}
          <Button
            size="compact-xs"
            variant="subtle"
            color="red"
            style={{ alignSelf: "flex-start" }}
            onClick={() => {
              onChange({ animationRanges: [], assetRanges: [] });
              setSelected(null);
            }}
          >
            Tüm aralıkları temizle
          </Button>
        </Stack>
      ) : (
        <Text size="xs" c="dimmed">
          Henüz aralık yok. Aralık işaretlemezsen ajan animasyon eklemez (promptta yazdığın aralıklar hariç).
        </Text>
      )}
    </Stack>
  );
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}
