import { Composition } from "remotion";
import { COMPOSITION, defaultInputProps, durationInFrames } from "../lib/studio";
import { VideoStudio } from "./VideoStudio";

export const RemotionRoot: React.FC = () => {
  return (
    <Composition
      id={COMPOSITION.id}
      component={VideoStudio}
      durationInFrames={durationInFrames(defaultInputProps.durationInSeconds, defaultInputProps.fps)}
      fps={defaultInputProps.fps}
      width={defaultInputProps.width}
      height={defaultInputProps.height}
      defaultProps={defaultInputProps}
      calculateMetadata={({ props }) => {
        return {
          durationInFrames: durationInFrames(props.durationInSeconds, props.fps),
          fps: props.fps,
          width: props.width,
          height: props.height,
        };
      }}
    />
  );
};
