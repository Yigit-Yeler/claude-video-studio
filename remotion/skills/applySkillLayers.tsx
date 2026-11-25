import type { ReactNode } from "react";
import type { StudioInputProps } from "../../lib/studio";
import { StyleSkill } from "./StyleSkill";
import { TextOverlay } from "./TextOverlay";
import { VignetteFilter } from "./VignetteFilter";

export function applySkillLayers(props: StudioInputProps): ReactNode[] {
  const layers: ReactNode[] = [];

  if (props.skills.vignette) {
    layers.push(<VignetteFilter key="vignette" intensity={props.vignette.intensity} />);
  }

  for (const spec of props.styleSkills) {
    layers.push(<StyleSkill key={spec.id} spec={spec} />);
  }

  if (props.skills.textOverlay) {
    layers.push(
      <TextOverlay
        key="textOverlay"
        text={props.textOverlay.text}
        fontSize={props.textOverlay.fontSize}
      />,
    );
  }

  return layers;
}
