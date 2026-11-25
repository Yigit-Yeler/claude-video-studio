import { AbsoluteFill } from "remotion";

type VignetteFilterProps = {
  intensity: number;
};

export const VignetteFilter: React.FC<VignetteFilterProps> = ({ intensity }) => {
  const alpha = Math.min(0.92, Math.max(0, intensity));

  return (
    <AbsoluteFill
      style={{
        background: `radial-gradient(ellipse at center, rgba(0,0,0,0) 32%, rgba(0,0,0,${alpha}) 100%)`,
        pointerEvents: "none",
      }}
    />
  );
};
