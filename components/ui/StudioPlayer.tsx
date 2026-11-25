"use client";

import { Player } from "@remotion/player";
import { durationInFrames, type StudioInputProps } from "@/lib/studio";
import { VideoStudio } from "@/remotion/VideoStudio";

export function StudioPlayer({ inputProps }: { inputProps: StudioInputProps }) {
  return (
    <Player
      component={VideoStudio}
      inputProps={inputProps}
      durationInFrames={durationInFrames(inputProps.durationInSeconds, inputProps.fps)}
      compositionWidth={inputProps.width}
      compositionHeight={inputProps.height}
      fps={inputProps.fps}
      style={{
        width: "100%",
        aspectRatio: `${inputProps.width} / ${inputProps.height}`,
        borderRadius: 16,
        overflow: "hidden",
      }}
      controls
      loop
      autoPlay
      initiallyMuted={!inputProps.backgroundMusic}
      acknowledgeRemotionLicense
    />
  );
}
