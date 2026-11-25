import { AbsoluteFill, interpolate, useCurrentFrame } from "remotion";
import type { StyleSkillSpec } from "../../lib/style-skill";

const GRADE: Record<StyleSkillSpec["style"]["grade"], string | null> = {
  neutral: null,
  warm: "rgba(255, 140, 50, 0.22)",
  cool: "rgba(56, 130, 246, 0.2)",
  cinematic: "rgba(15, 23, 42, 0.28)",
  vhs: "rgba(236, 72, 153, 0.16)",
};

export const StyleSkill: React.FC<{ spec: StyleSkillSpec }> = ({ spec }) => {
  const frame = useCurrentFrame();
  const { style } = spec;
  const grade = GRADE[style.grade];
  const justifyContent =
    style.subtitlePosition === "top"
      ? "flex-start"
      : style.subtitlePosition === "center"
        ? "center"
        : "flex-end";
  const padding =
    style.subtitlePosition === "top" ? "180px 72px 0" : style.subtitlePosition === "center" ? "0 72px" : "0 72px 220px";

  const appear = interpolate(frame, [0, 14], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  let transform = "none";
  const opacity = appear;
  let visibleText = style.sampleText;

  if (style.textAnimation === "fade-up") {
    const y = interpolate(frame, [0, 16], [36, 0], { extrapolateRight: "clamp" });
    transform = `translateY(${y}px)`;
  } else if (style.textAnimation === "pop") {
    const scale = interpolate(frame, [0, 12], [0.72, 1], { extrapolateRight: "clamp" });
    transform = `scale(${scale})`;
  } else if (style.textAnimation === "slide") {
    const x = interpolate(frame, [0, 14], [-80, 0], { extrapolateRight: "clamp" });
    transform = `translateX(${x}px)`;
  } else {
    const count = Math.max(1, Math.floor(interpolate(frame, [0, 28], [1, style.sampleText.length], {
      extrapolateRight: "clamp",
    })));
    visibleText = style.sampleText.slice(0, count);
  }

  const flash =
    style.transition === "flash"
      ? interpolate(frame, [0, 2, 8], [0.85, 0.85, 0], { extrapolateRight: "clamp" })
      : 0;
  const dip =
    style.transition === "dip"
      ? interpolate(frame, [0, 10], [0.8, 0], { extrapolateRight: "clamp" })
      : 0;
  const zoom =
    style.transition === "zoom"
      ? interpolate(frame, [0, 12], [1.18, 1], { extrapolateRight: "clamp" })
      : 1;

  return (
    <AbsoluteFill style={{ pointerEvents: "none", transform: `scale(${zoom})` }}>
      {grade ? (
        <AbsoluteFill
          style={{
            background: grade,
            mixBlendMode: style.grade === "cinematic" ? "multiply" : "overlay",
          }}
        />
      ) : null}
      {style.grade === "vhs" ? (
        <AbsoluteFill
          style={{
            backgroundImage:
              "repeating-linear-gradient(to bottom, rgba(255,255,255,0.14) 0px, rgba(255,255,255,0.14) 1px, transparent 3px, transparent 6px)",
            opacity: 0.35,
          }}
        />
      ) : null}
      {flash > 0 ? <AbsoluteFill style={{ background: "#fff", opacity: flash }} /> : null}
      {dip > 0 ? <AbsoluteFill style={{ background: "#000", opacity: dip }} /> : null}
      <AbsoluteFill style={{ justifyContent, alignItems: "center", padding }}>
        <div
          style={{
            opacity,
            transform,
            maxWidth: 920,
            color: style.primaryText,
            fontFamily: style.fontFamily,
            fontSize: 68,
            fontWeight: 700,
            lineHeight: 1.12,
            textAlign: "center",
            textShadow: `0 10px 28px ${style.accent}`,
          }}
        >
          {visibleText}
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
