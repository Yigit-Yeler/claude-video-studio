import { OffthreadVideo, staticFile, useRemotionEnvironment, Video } from "remotion";

type AdaptiveVideoProps = {
  src: string;
  objectFit: "cover" | "contain";
};

export const AdaptiveVideo: React.FC<AdaptiveVideoProps> = ({ src, objectFit }) => {
  const { isPlayer } = useRemotionEnvironment();
  const style = {
    width: "100%",
    height: "100%",
    objectFit,
  };
  const resolved = staticFile(src);

  if (isPlayer) {
    return <Video src={resolved} style={style} muted />;
  }

  return <OffthreadVideo src={resolved} style={style} />;
};
