import { AbsoluteFill, interpolate, useCurrentFrame, useVideoConfig } from "remotion";

type TextOverlayProps = {
  text: string;
  fontSize: number;
};

export const TextOverlay: React.FC<TextOverlayProps> = ({ text, fontSize }) => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();
  const fadeOutStart = Math.max(20, durationInFrames - 12);
  const opacity = interpolate(frame, [0, 12, fadeOutStart, durationInFrames], [0, 1, 1, 0.85], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const translateY = interpolate(frame, [0, 16], [36, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <AbsoluteFill
      style={{
        justifyContent: "flex-end",
        alignItems: "center",
        padding: "0 80px 240px",
      }}
    >
      <div
        style={{
          opacity,
          transform: `translateY(${translateY}px)`,
          maxWidth: 920,
          color: "#f8fafc",
          fontFamily: "Arial, Helvetica, sans-serif",
          fontSize,
          fontWeight: 700,
          lineHeight: 1.12,
          textAlign: "center",
          letterSpacing: -0.5,
          textShadow: "0 10px 28px rgba(0, 0, 0, 0.72)",
        }}
      >
        {text}
      </div>
    </AbsoluteFill>
  );
};
