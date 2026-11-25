import { IconX } from "@tabler/icons-react";
import type { PointerEvent as ReactPointerEvent } from "react";
import type { TimeRange } from "@/lib/studio";
import { TRACK_COLORS, TRACK_HEIGHT, TRACK_LABELS, type Track } from "./timeline-utils";

export type DragMode = "move" | "start" | "end" | "create";

type TimelineTrackProps = {
  track: Track;
  ranges: TimeRange[];
  draft: { from: number; to: number } | null;
  selectedId: string | null;
  pxPerSecond: number;
  /** Görsel şeridinde seçili görsel yoksa yeni aralık çizilemez. */
  disabled: boolean;
  rangeLabel: (track: Track, range: TimeRange) => string;
  onPointerDown: (event: ReactPointerEvent, track: Track, range: TimeRange | null, mode: DragMode) => void;
  onSeek: (seconds: number) => void;
  onRemove: (track: Track, id: string) => void;
};

/** Delete ✕ butonunun sığması için gereken en küçük aralık genişliği (px). */
const MIN_WIDTH_FOR_DELETE = 26;

const stop = (event: { stopPropagation: () => void; preventDefault?: () => void }) => {
  event.stopPropagation();
  event.preventDefault?.();
};

/** Tek bir şerit (animasyon ya da görsel): boş alana sürükleyerek aralık çizilir, aralıklar taşınır ve uzatılır. */
export function TimelineTrack({ track, ranges, draft, selectedId, pxPerSecond, disabled, rangeLabel, onPointerDown, onSeek, onRemove }: TimelineTrackProps) {
  const colors = TRACK_COLORS[track];

  return (
    <div style={{ position: "relative", height: TRACK_HEIGHT, marginTop: 6 }}>
      <div
        onPointerDown={(event) => onPointerDown(event, track, null, "create")}
        title={`${TRACK_LABELS[track]}: sürükleyerek aralık çiz`}
        style={{
          position: "absolute",
          inset: 0,
          background: "var(--mantine-color-default-hover)",
          borderRadius: 6,
          cursor: disabled ? "not-allowed" : "crosshair",
        }}
      />
      {draft ? (
        <div
          style={{
            position: "absolute",
            top: 3,
            bottom: 3,
            left: draft.from * pxPerSecond,
            width: Math.max(2, (draft.to - draft.from) * pxPerSecond),
            border: `2px dashed ${colors.border}`,
            background: colors.fill,
            borderRadius: 4,
            pointerEvents: "none",
          }}
        />
      ) : null}
      {ranges.map((range) => {
        const width = (range.to - range.from) * pxPerSecond;
        return (
          <div
            key={range.id}
            onPointerDown={(event) => onPointerDown(event, track, range, "move")}
            onDoubleClick={() => onSeek(range.from)}
            style={{
              position: "absolute",
              top: 3,
              bottom: 3,
              left: range.from * pxPerSecond,
              width: Math.max(6, width),
              background: colors.fill,
              border: `2px solid ${colors.border}`,
              outline: selectedId === range.id ? "2px solid var(--mantine-color-text)" : "none",
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
            {rangeLabel(track, range)}
            <span
              onPointerDown={(event) => onPointerDown(event, track, range, "start")}
              style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: 8, cursor: "ew-resize" }}
            />
            <span
              onPointerDown={(event) => onPointerDown(event, track, range, "end")}
              style={{ position: "absolute", right: 0, top: 0, bottom: 0, width: 8, cursor: "ew-resize" }}
            />
            {width >= MIN_WIDTH_FOR_DELETE ? (
              <span
                role="button"
                aria-label="Aralığı sil"
                title="Aralığı sil"
                onPointerDown={stop}
                onClick={(event) => {
                  event.stopPropagation();
                  onRemove(track, range.id);
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
