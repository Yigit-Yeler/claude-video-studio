import { AbsoluteFill, Audio, interpolate, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import type { StudioInputProps } from "../lib/studio";
import { AdaptiveVideo } from "./AdaptiveVideo";
import { applySkillLayers } from "./skills/applySkillLayers";

export const VideoStudio: React.FC<StudioInputProps> = (props) => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();
  const objectFit = props.cover ? "cover" : "contain";
  const motion = props.styleSkills[0]?.style.motion ?? "static";
  let transform = "none";

  if (motion === "slow-zoom") {
    const scale = interpolate(frame, [0, Math.max(1, durationInFrames - 1)], [1, 1.08], {
      extrapolateRight: "clamp",
    });
    transform = `scale(${scale})`;
  } else if (motion === "drift") {
    const x = interpolate(frame, [0, Math.max(1, durationInFrames)], [-24, 24]);
    transform = `translateX(${x}px) scale(1.05)`;
  } else if (motion === "shake") {
    transform = `translate(${Math.sin(frame / 2) * 6}px, ${Math.cos(frame / 3) * 4}px)`;
  }

  return (
    <AbsoluteFill style={{ backgroundColor: "#09090b" }}>
      {props.sourceVideos[0] ? (
        <AbsoluteFill style={{ transform }}>
          <AdaptiveVideo src={`media/${props.sourceVideos[0]}`} objectFit={objectFit} />
        </AbsoluteFill>
      ) : (
        <AbsoluteFill
          style={{
            background:
              "linear-gradient(180deg, #2e1065 0%, #172554 48%, #09090b 100%)",
          }}
        />
      )}
      {props.backgroundMusic ? (
        <Audio src={staticFile(`media/${props.backgroundMusic}`)} volume={props.musicVolume} loop />
      ) : null}
      {applySkillLayers(props)}
    </AbsoluteFill>
  );
};
