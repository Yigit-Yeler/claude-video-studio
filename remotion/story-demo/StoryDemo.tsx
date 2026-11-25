import React, { useMemo } from "react";
import {
  AbsoluteFill,
  Easing,
  interpolate,
  random,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { TransitionSeries, linearTiming } from "@remotion/transitions";
import { fade } from "@remotion/transitions/fade";
import { loadFont } from "@remotion/google-fonts/Nunito";

const { fontFamily } = loadFont("normal", { weights: ["800"], subsets: ["latin", "latin-ext"] });

const W = 1080;
const H = 1920;

export const SCENES = [120, 150, 150, 190];
export const TRANSITION = 15;
export const STORY_DURATION = SCENES.reduce((a, b) => a + b, 0) - TRANSITION * (SCENES.length - 1);

const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;
const ease = Easing.bezier(0.45, 0, 0.55, 1);

/* ---------------------------------- Parts ---------------------------------- */

const Sky: React.FC<{ id: string; top: string; bottom: string }> = ({ id, top, bottom }) => (
  <>
    <defs>
      <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor={top} />
        <stop offset="1" stopColor={bottom} />
      </linearGradient>
    </defs>
    <rect width={W} height={H} fill={`url(#${id})`} />
  </>
);

const Stars: React.FC<{ offsetY?: number; count?: number }> = ({ offsetY = 0, count = 110 }) => {
  const frame = useCurrentFrame();
  return (
    <g transform={`translate(0 ${offsetY})`}>
      {Array.from({ length: count }).map((_, i) => {
        const x = random(`sx${i}`) * W;
        const y = random(`sy${i}`) * H * 1.5 - H * 0.5;
        const r = 1.5 + random(`sr${i}`) * 3.5;
        const tw = 0.5 + 0.5 * Math.sin(frame / 10 + i * 1.7);
        return <circle key={i} cx={x} cy={y} r={r} fill="#fff" opacity={0.3 + 0.7 * tw} />;
      })}
    </g>
  );
};

const City: React.FC<{
  seed: string;
  baseY: number;
  fill: string;
  win: string;
  minH: number;
  maxH: number;
  x?: number;
  lit?: number;
}> = ({ seed, baseY, fill, win, minH, maxH, x = 0, lit = 0.35 }) => {
  const frame = useCurrentFrame();
  const buildings = useMemo(() => {
    const out: { x: number; w: number; h: number; i: number }[] = [];
    let cx = -120;
    let i = 0;
    while (cx < W * 1.8) {
      const w = 100 + random(`${seed}w${i}`) * 120;
      const h = minH + random(`${seed}h${i}`) * (maxH - minH);
      out.push({ x: cx, w, h, i });
      cx += w + random(`${seed}g${i}`) * 18;
      i++;
    }
    return out;
  }, [seed, minH, maxH]);

  return (
    <g transform={`translate(${x} 0)`}>
      {buildings.map((b) => {
        const cols = Math.floor((b.w - 24) / 36);
        const rows = Math.floor((b.h - 40) / 52);
        const windows: React.ReactNode[] = [];
        for (let r = 0; r < rows; r++) {
          for (let c = 0; c < cols; c++) {
            const key = `${seed}-${b.i}-${r}-${c}`;
            if (random(key) > lit) continue;
            const flicker = random(`${key}f`) < 0.06 ? (Math.sin(frame / 4 + b.i) > 0.6 ? 0.25 : 1) : 1;
            windows.push(
              <rect
                key={key}
                x={b.x + 16 + c * 36}
                y={baseY - b.h + 28 + r * 52}
                width={20}
                height={28}
                rx={3}
                fill={win}
                opacity={0.85 * flicker}
              />,
            );
          }
        }
        return (
          <g key={b.i}>
            <rect x={b.x} y={baseY - b.h} width={b.w} height={b.h + 2400} fill={fill} />
            {windows}
          </g>
        );
      })}
    </g>
  );
};

const Moon: React.FC<{
  id: string;
  cx: number;
  cy: number;
  r: number;
  eyesOpen?: number;
  smile?: number;
  face?: boolean;
  faceY?: number;
}> = ({ id, cx, cy, r, eyesOpen = 0, smile = 0, face = false, faceY = -0.05 }) => {
  const ey = r * faceY;
  const eyeRy = Math.max(r * 0.008, eyesOpen * r * 0.075);
  return (
    <g transform={`translate(${cx} ${cy})`}>
      <defs>
        <radialGradient id={`${id}-glow`}>
          <stop offset="0.55" stopColor="#FFF1B8" stopOpacity="0.45" />
          <stop offset="1" stopColor="#FFF1B8" stopOpacity="0" />
        </radialGradient>
      </defs>
      <circle r={r * 1.7} fill={`url(#${id}-glow)`} />
      <circle r={r} fill="#FFF1B8" />
      {face ? (
        <>
          <circle cx={r * 0.18} cy={-r * 0.86} r={r * 0.035} fill="#F1DC92" />
          <circle cx={-r * 0.24} cy={-r * 0.9} r={r * 0.025} fill="#F1DC92" />
          <circle cx={-r * 0.62} cy={-r * 0.62} r={r * 0.045} fill="#F1DC92" />
          <circle cx={r * 0.66} cy={-r * 0.6} r={r * 0.03} fill="#F1DC92" />
        </>
      ) : (
        <>
          <circle cx={-r * 0.42} cy={-r * 0.38} r={r * 0.16} fill="#F1DC92" />
          <circle cx={r * 0.48} cy={-r * 0.12} r={r * 0.1} fill="#F1DC92" />
          <circle cx={r * 0.15} cy={r * 0.5} r={r * 0.2} fill="#F1DC92" />
          <circle cx={-r * 0.55} cy={r * 0.3} r={r * 0.08} fill="#F1DC92" />
        </>
      )}
      {face && (
        <g>
          <ellipse cx={-r * 0.3} cy={ey} rx={r * 0.055} ry={eyeRy} fill="#3A2E4F" />
          <ellipse cx={r * 0.3} cy={ey} rx={r * 0.055} ry={eyeRy} fill="#3A2E4F" />
          <circle cx={-r * 0.44} cy={ey + r * 0.14} r={r * 0.07} fill="#FF9BB0" opacity={smile * 0.6} />
          <circle cx={r * 0.44} cy={ey + r * 0.14} r={r * 0.07} fill="#FF9BB0" opacity={smile * 0.6} />
          <path
            d={`M ${-r * 0.13} ${ey + r * 0.17} Q 0 ${ey + r * (0.17 + 0.14 * smile)} ${r * 0.13} ${ey + r * 0.17}`}
            stroke="#3A2E4F"
            strokeWidth={r * 0.025}
            strokeLinecap="round"
            fill="none"
          />
        </g>
      )}
    </g>
  );
};

const ARM_LEN = 95;
const handPos = (shoulderX: number, angleDeg: number) => {
  const a = (angleDeg * Math.PI) / 180;
  return { x: shoulderX - ARM_LEN * Math.sin(a), y: -150 + ARM_LEN * Math.cos(a) };
};

const Arm: React.FC<{ sx: number; angle: number }> = ({ sx, angle }) => (
  <g transform={`translate(${sx} -150) rotate(${angle})`}>
    <rect x={-13} y={0} width={26} height={ARM_LEN} rx={13} fill="#2FB3AF" />
    <circle cx={0} cy={ARM_LEN} r={18} fill="#1F6C6A" />
  </g>
);

const BALLOONS = [
  { dx: -60, dy: -740, c: "#FF5C7A" },
  { dx: 110, dy: -830, c: "#FFC93C" },
  { dx: 240, dy: -700, c: "#7C6CFF" },
];

const Balloons: React.FC<{ hand: { x: number; y: number }; release: number }> = ({ hand, release }) => {
  const frame = useCurrentFrame();
  const lift = release * 1800;
  return (
    <g opacity={1 - release * 0.6}>
      {BALLOONS.map((b, i) => {
        const bx = b.dx + Math.sin(frame / 18 + i * 2) * 14;
        const by = b.dy + Math.cos(frame / 22 + i) * 8 - lift * (1 + i * 0.15);
        const hx = hand.x;
        const hy = hand.y - lift;
        return (
          <g key={i}>
            <path
              d={`M ${hx} ${hy} Q ${(hx + bx) / 2 + Math.sin(frame / 15 + i) * 20} ${(hy + by) / 2} ${bx} ${by + 92}`}
              stroke="#EDE7FF"
              strokeWidth={3}
              fill="none"
              opacity={0.85}
            />
            <path d={`M ${bx - 10} ${by + 96} L ${bx + 10} ${by + 96} L ${bx} ${by + 82} Z`} fill={b.c} />
            <ellipse cx={bx} cy={by} rx={70} ry={86} fill={b.c} />
            <ellipse cx={bx - 24} cy={by - 30} rx={16} ry={26} fill="#fff" opacity={0.35} />
          </g>
        );
      })}
    </g>
  );
};

const Bip: React.FC<{
  x: number;
  y: number;
  scale?: number;
  lookUp?: number;
  blink?: number;
  leftArm?: number;
  rightArm?: number;
  tilt?: number;
  balloons?: boolean;
  release?: number;
  shadow?: boolean;
}> = ({
  x,
  y,
  scale = 1,
  lookUp = 0,
  blink = 1,
  leftArm = 10,
  rightArm = -10,
  tilt = 0,
  balloons = false,
  release = 0,
  shadow = true,
}) => {
  const frame = useCurrentFrame();
  const glow = 0.6 + 0.4 * Math.sin(frame / 6);
  const eyeY = -265 - lookUp * 14;
  return (
    <g transform={`translate(${x} ${y}) scale(${scale}) rotate(${tilt})`}>
      {balloons && <Balloons hand={handPos(70, rightArm)} release={release} />}
      {shadow && <ellipse cx={0} cy={6} rx={95} ry={14} fill="rgba(0,0,0,.3)" />}
      <rect x={-48} y={-42} width={30} height={40} rx={8} fill="#2B8C89" />
      <rect x={18} y={-42} width={30} height={40} rx={8} fill="#2B8C89" />
      <rect x={-62} y={-16} width={52} height={18} rx={9} fill="#1F6C6A" />
      <rect x={10} y={-16} width={52} height={18} rx={9} fill="#1F6C6A" />
      <Arm sx={-70} angle={leftArm} />
      <Arm sx={70} angle={rightArm} />
      <rect x={-75} y={-188} width={150} height={150} rx={36} fill="#3ECFCB" />
      <rect x={-42} y={-155} width={84} height={52} rx={12} fill="#2B8C89" />
      <circle cx={0} cy={-129} r={11} fill="#FF6B8B" opacity={glow} />
      <g transform={`rotate(${-lookUp * 6} 0 -190)`}>
        <rect x={-20} y={-205} width={40} height={22} fill="#2B8C89" />
        <line x1={0} y1={-340} x2={0} y2={-385} stroke="#2B8C89" strokeWidth={8} />
        <circle cy={-398} r={34} fill="#FFD54F" opacity={0.25 * glow} />
        <circle cy={-398} r={15} fill="#FFD54F" />
        <circle cx={-98} cy={-265} r={13} fill="#2B8C89" />
        <circle cx={98} cy={-265} r={13} fill="#2B8C89" />
        <rect x={-96} y={-342} width={192} height={152} rx={44} fill="#7FE6E2" />
        <rect x={-73} y={-320} width={146} height={108} rx={30} fill="#12263A" />
        <ellipse cx={-32} cy={eyeY} rx={15} ry={Math.max(2, 20 * blink)} fill="#6FF7FF" />
        <ellipse cx={32} cy={eyeY} rx={15} ry={Math.max(2, 20 * blink)} fill="#6FF7FF" />
        <path
          d={`M -20 ${eyeY + 32} Q 0 ${eyeY + 44} 20 ${eyeY + 32}`}
          stroke="#6FF7FF"
          strokeWidth={6}
          strokeLinecap="round"
          fill="none"
        />
      </g>
    </g>
  );
};

const blinkAt = (frame: number, times: number[]) => {
  for (const t of times) {
    const d = frame - t;
    if (d >= 0 && d < 7) return Math.abs(d - 3) / 3;
  }
  return 1;
};

const Caption: React.FC<{ text: string; start: number; end?: number; y: number; size?: number }> = ({
  text,
  start,
  end,
  y,
  size = 76,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const out = end === undefined ? 1 : interpolate(frame, [end, end + 12], [1, 0], clamp);
  return (
    <div
      style={{
        position: "absolute",
        left: 70,
        right: 70,
        top: y,
        display: "flex",
        flexWrap: "wrap",
        justifyContent: "center",
        columnGap: 22,
        fontFamily,
        fontWeight: 800,
        fontSize: size,
        lineHeight: 1.18,
        color: "#fff",
        textAlign: "center",
        textShadow: "0 6px 0 rgba(15,10,50,.6), 0 0 34px rgba(0,0,0,.45)",
        opacity: out,
      }}
    >
      {text.split(" ").map((w, i) => {
        const s = spring({ frame: frame - start - i * 5, fps, config: { damping: 12, stiffness: 170 } });
        return (
          <span
            key={i}
            style={{
              display: "inline-block",
              opacity: Math.min(1, s * 1.5),
              transform: `translateY(${(1 - s) * 42}px) scale(${0.7 + 0.3 * s})`,
            }}
          >
            {w}
          </span>
        );
      })}
    </div>
  );
};

const Camera: React.FC<{ zoom: number; children: React.ReactNode }> = ({ zoom, children }) => (
  <g transform={`translate(540 960) scale(${zoom}) translate(-540 -960)`}>{children}</g>
);

const Stage: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <svg viewBox={`0 0 ${W} ${H}`} width="100%" height="100%" style={{ position: "absolute" }}>
    {children}
  </svg>
);

/* --------------------------------- Scenes --------------------------------- */

const SceneCity: React.FC = () => {
  const frame = useCurrentFrame();
  const zoom = interpolate(frame, [0, SCENES[0]], [1, 1.08]);
  return (
    <AbsoluteFill>
      <Stage>
        <Camera zoom={zoom}>
          <Sky id="sky1" top="#0D0B2E" bottom="#4B2A73" />
          <Stars />
          <Moon id="m1" cx={790} cy={380} r={95} />
          <City seed="far" baseY={1380} fill="#2A1F55" win="#8C7BD9" minH={300} maxH={620} x={-frame * 0.4} lit={0.18} />
          <City seed="near" baseY={1560} fill="#160F33" win="#FFD27A" minH={220} maxH={520} x={-frame * 1.1 - 80} />
        </Camera>
      </Stage>
      <Caption text="Büyük şehirde, küçük bir robot yaşardı: Bip." start={18} y={1600} />
    </AbsoluteFill>
  );
};

const SceneRooftop: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const lookUp = interpolate(frame, [15, 40], [0, 1], { ...clamp, easing: ease });
  const reach = spring({ frame: frame - 85, fps, config: { damping: 14 } });
  const zoom = interpolate(frame, [0, SCENES[1]], [1.05, 1]);
  return (
    <AbsoluteFill>
      <Stage>
        <Camera zoom={zoom}>
          <Sky id="sky2" top="#0D0B2E" bottom="#5A2F7A" />
          <Stars />
          <Moon id="m2" cx={770} cy={540} r={175} />
          <City seed="roofbg" baseY={1420} fill="#241A4C" win="#8C7BD9" minH={150} maxH={420} x={-frame * 0.3} lit={0.2} />
          <rect x={0} y={1500} width={W} height={420} fill="#120C2A" />
          <rect x={0} y={1490} width={W} height={18} fill="#2C2160" />
          <Bip
            x={400}
            y={1500}
            scale={1.4}
            lookUp={lookUp}
            blink={blinkAt(frame, [55, 125])}
            rightArm={interpolate(reach, [0, 1], [-10, -145])}
            leftArm={10}
          />
        </Camera>
      </Stage>
      <Caption text="Ama Bip'in bir hayali vardı: Ay'a dokunmak." start={58} y={1640} />
    </AbsoluteFill>
  );
};

const SceneRise: React.FC = () => {
  const frame = useCurrentFrame();
  const p = interpolate(frame, [10, SCENES[2]], [0, 1], { ...clamp, easing: Easing.in(Easing.quad) });
  const cityY = p * 1500;
  return (
    <AbsoluteFill>
      <Stage>
        <Sky id="sky3" top="#0B0A2A" bottom="#3E2468" />
        <Stars offsetY={p * 450} />
        <Moon id="m3" cx={870} cy={interpolate(p, [0, 1], [230, 330])} r={interpolate(p, [0, 1], [130, 210])} />
        <g transform={`translate(0 ${cityY})`}>
          <City seed="roofbg" baseY={1420} fill="#241A4C" win="#8C7BD9" minH={150} maxH={420} lit={0.2} />
          <rect x={0} y={1600} width={W} height={1200} fill="#120C2A" />
          <rect x={0} y={1590} width={W} height={18} fill="#2C2160" />
        </g>
        <Bip
          x={430}
          y={interpolate(p, [0, 1], [1600, 1280]) + Math.sin(frame / 14) * 10}
          scale={1.1}
          tilt={Math.sin(frame / 18) * 3}
          rightArm={-160}
          leftArm={interpolate(p, [0, 0.3], [10, 35], clamp)}
          lookUp={1}
          blink={blinkAt(frame, [70])}
          balloons
          shadow={p < 0.05}
        />
      </Stage>
      <Caption text="Balonlarını topladı... ve yükseldi!" start={20} y={1660} />
    </AbsoluteFill>
  );
};

const SceneMoon: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const land = spring({ frame, fps, config: { damping: 16, stiffness: 60 } });
  const eyes = spring({ frame: frame - 45, fps, config: { damping: 10 } });
  const smile = spring({ frame: frame - 60, fps, config: { damping: 12 } });
  const release = interpolate(frame, [22, 70], [0, 1], { ...clamp, easing: Easing.in(Easing.quad) });
  const wave = interpolate(frame, [90, 100], [0, 1], clamp);
  const rightArm =
    interpolate(release, [0, 1], [-160, -20]) * (1 - wave) + (-135 + Math.sin((frame - 100) / 4) * 28) * wave;
  const zoom = interpolate(frame, [0, SCENES[3]], [1.08, 1]);
  return (
    <AbsoluteFill>
      <Stage>
        <Camera zoom={zoom}>
          <Sky id="sky4" top="#090722" bottom="#2E1B56" />
          <Stars />
          <Moon id="m4" cx={540} cy={2000} r={900} face faceY={-0.55} eyesOpen={eyes} smile={smile} />
          <Bip
            x={540}
            y={interpolate(land, [0, 1], [820, 1100])}
            scale={1.25}
            lookUp={interpolate(eyes, [0, 1], [0.6, -1])}
            blink={blinkAt(frame, [80, 150])}
            rightArm={rightArm}
            leftArm={interpolate(release, [0, 1], [30, 12])}
            balloons
            release={release}
            shadow={land > 0.95}
          />
        </Camera>
      </Stage>
      <Caption text="Ve Ay... gülümsedi." start={70} end={122} y={250} size={88} />
      <Caption text="Hayaller, biraz cesaret ister." start={136} y={250} size={88} />
    </AbsoluteFill>
  );
};

/* ---------------------------------- Story ---------------------------------- */

export const StoryDemo: React.FC = () => {
  const scenes = [SceneCity, SceneRooftop, SceneRise, SceneMoon];
  return (
    <AbsoluteFill style={{ backgroundColor: "#0D0B2E" }}>
      <TransitionSeries>
        {scenes.flatMap((Scene, i) => {
          const items = [
            <TransitionSeries.Sequence key={`s${i}`} durationInFrames={SCENES[i]}>
              <Scene />
            </TransitionSeries.Sequence>,
          ];
          if (i < scenes.length - 1) {
            items.push(
              <TransitionSeries.Transition
                key={`t${i}`}
                presentation={fade()}
                timing={linearTiming({ durationInFrames: TRANSITION })}
              />,
            );
          }
          return items;
        })}
      </TransitionSeries>
    </AbsoluteFill>
  );
};
