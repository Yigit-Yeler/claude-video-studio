import React from "react";
import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { TransitionSeries, linearTiming } from "@remotion/transitions";
import { fade } from "@remotion/transitions/fade";
import { loadFont } from "@remotion/google-fonts/Nunito";

const { fontFamily } = loadFont("normal", { weights: ["800"], subsets: ["latin", "latin-ext"] });

const W = 1080;
const H = 1920;
const FLOOR = 1640;
const S = 1.15;

export const PEOPLE_SCENES = [240, 210, 470];
const TRANSITION = 15;
export const PEOPLE_DURATION = PEOPLE_SCENES.reduce((a, b) => a + b, 0) - TRANSITION * (PEOPLE_SCENES.length - 1);

const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;
const rad = (d: number) => (d * Math.PI) / 180;

/* -------------------------------- Characters ------------------------------- */

type Hair = "ponytail" | "short" | "bun" | "teacher";
type Expr = "smile" | "happy" | "neutral" | "worried" | "shock";
type Spec = {
  kind: "kid" | "adult";
  skin: string;
  hair: Hair;
  hairColor: string;
  shirt: string;
  pants: string;
  legs?: string;
  shoes: string;
  skirt?: boolean;
  glasses?: boolean;
  mustache?: boolean;
  tie?: string;
};

const DIMS = {
  kid: { leg: 150, torso: 170, headR: 92, torsoW: 112, arm: 130 },
  adult: { leg: 240, torso: 230, headR: 84, torsoW: 132, arm: 180 },
};

const ELA: Spec = { kind: "kid", skin: "#F2C7A5", hair: "ponytail", hairColor: "#5A3A22", shirt: "#FF7A8A", pants: "#3E5BA9", shoes: "#FFFFFF" };
const CAN: Spec = { kind: "kid", skin: "#C98E66", hair: "short", hairColor: "#2B1D14", shirt: "#4CB8A0", pants: "#3A3A4A", shoes: "#E54B4B" };
const ANNE: Spec = {
  kind: "adult",
  skin: "#F2C7A5",
  hair: "bun",
  hairColor: "#6B4226",
  shirt: "#8E6CD9",
  pants: "#3D2E66",
  legs: "#E3AE8C",
  shoes: "#3D2E66",
  skirt: true,
};
const OGRETMEN: Spec = {
  kind: "adult",
  skin: "#E8B48F",
  hair: "teacher",
  hairColor: "#9A9A9A",
  shirt: "#EDE7D6",
  pants: "#4A4E5A",
  shoes: "#2B2B2B",
  glasses: true,
  mustache: true,
  tie: "#C0392B",
};

type Pose = {
  x: number;
  y?: number;
  armL?: number;
  armR?: number;
  face?: number;
  expr?: Expr;
  talk?: number;
  blink?: number;
  walk?: number | null;
  jump?: number;
  hold?: "L" | "R" | null;
  backpack?: boolean;
};

const headTop = (spec: Spec, y = FLOOR) => {
  const d = DIMS[spec.kind];
  return y - (d.leg + d.torso + 14 + d.headR * 2.05) * S;
};

const Notebook: React.FC = () => (
  <g transform="rotate(-12)">
    <rect x={-42} y={-62} width={84} height={108} rx={8} fill="#E53950" />
    <rect x={-42} y={-62} width={14} height={108} rx={4} fill="#B82A3E" />
    <rect x={-18} y={-40} width={50} height={22} rx={4} fill="#fff" opacity={0.9} />
  </g>
);

const Arm: React.FC<{ sx: number; sy: number; angle: number; len: number; spec: Spec }> = ({ sx, sy, angle, len, spec }) => (
  <g transform={`translate(${sx} ${sy}) rotate(${angle})`}>
    <rect x={-15} y={0} width={30} height={len} rx={15} fill={spec.skin} />
    <rect x={-17} y={-6} width={34} height={len * 0.5} rx={16} fill={spec.shirt} />
    <circle cx={0} cy={len} r={18} fill={spec.skin} />
  </g>
);

const Person: React.FC<{ spec: Spec } & Pose> = ({
  spec,
  x,
  y = FLOOR,
  armL = 8,
  armR = -8,
  face = 0,
  expr = "smile",
  talk = 0,
  blink = 1,
  walk = null,
  jump = 0,
  hold = null,
  backpack = false,
}) => {
  const frame = useCurrentFrame();
  const d = DIMS[spec.kind];
  const R = d.headR;
  const hipY = -d.leg;
  const shY = hipY - d.torso;
  const cy = shY - 14 - R * 0.92;
  const walking = walk !== null;
  const legA = walking ? Math.sin(walk) * 20 : 0;
  const bob = walking ? -Math.abs(Math.sin(walk)) * 12 : 0;
  const swing = walking ? Math.sin(walk) * 16 : 0;
  const aL = armL - swing;
  const aR = armR - swing;
  const sx = d.torsoW / 2 - 10;
  const sy = shY + 24;
  const handL = { x: -sx - d.arm * Math.sin(rad(aL)), y: sy + d.arm * Math.cos(rad(aL)) };
  const handR = { x: sx - d.arm * Math.sin(rad(aR)), y: sy + d.arm * Math.cos(rad(aR)) };
  const fx = face * R * 0.2;
  const ex = R * 0.36;
  const eyeY = cy + R * 0.05;
  const by = cy - R * 0.24;
  const brow = {
    smile: [0, 0],
    neutral: [0, 0],
    happy: [-5, -5],
    worried: [-13, 4],
    shock: [-16, -14],
  }[expr];
  const tilt = face * 3;
  const tail = Math.sin(frame / 9) * 6 + (walking ? Math.sin(walk) * 10 : 0);

  const mouthY = cy + R * 0.46;
  let mouth: React.ReactNode;
  if (talk > 0.05) {
    mouth = <ellipse cx={fx} cy={mouthY} rx={R * 0.16} ry={R * (0.04 + 0.14 * talk)} fill="#7A2E3A" />;
  } else if (expr === "shock") {
    mouth = <ellipse cx={fx} cy={mouthY} rx={R * 0.1} ry={R * 0.14} fill="#7A2E3A" />;
  } else if (expr === "happy") {
    mouth = (
      <path d={`M ${fx - R * 0.22} ${mouthY - 6} Q ${fx} ${mouthY + R * 0.3} ${fx + R * 0.22} ${mouthY - 6} Z`} fill="#7A2E3A" />
    );
  } else if (expr === "worried") {
    mouth = (
      <path
        d={`M ${fx - R * 0.16} ${mouthY} Q ${fx - R * 0.08} ${mouthY - 7} ${fx} ${mouthY} Q ${fx + R * 0.08} ${mouthY + 7} ${fx + R * 0.16} ${mouthY}`}
        stroke="#7A2E3A"
        strokeWidth={6}
        strokeLinecap="round"
        fill="none"
      />
    );
  } else if (expr === "neutral") {
    mouth = <line x1={fx - R * 0.12} y1={mouthY} x2={fx + R * 0.12} y2={mouthY} stroke="#7A2E3A" strokeWidth={6} strokeLinecap="round" />;
  } else {
    mouth = (
      <path
        d={`M ${fx - R * 0.17} ${mouthY - 4} Q ${fx} ${mouthY + R * 0.16} ${fx + R * 0.17} ${mouthY - 4}`}
        stroke="#7A2E3A"
        strokeWidth={6}
        strokeLinecap="round"
        fill="none"
      />
    );
  }

  return (
    <g transform={`translate(${x} ${y + bob - jump}) scale(${S})`}>
      <ellipse cx={0} cy={4} rx={d.torsoW * 0.75} ry={16} fill="rgba(0,0,0,.18)" transform={`translate(0 ${jump / S})`} />
      {/* ponytail / back hair */}
      <g transform={`rotate(${tilt} 0 ${shY})`}>
        {spec.hair === "ponytail" && (
          <g transform={`rotate(${tail} ${R * 0.85} ${cy - R * 0.35})`}>
            <ellipse cx={R * 0.85 + 26} cy={cy - R * 0.35 + 78} rx={34} ry={82} fill={spec.hairColor} />
          </g>
        )}
        {spec.hair === "bun" && <circle cx={0} cy={cy - R * 1.02} r={R * 0.42} fill={spec.hairColor} />}
        {(spec.hair === "ponytail" || spec.hair === "bun") && (
          <rect x={-R * 1.04} y={cy - R * 0.2} width={R * 2.08} height={R * 0.95} rx={R * 0.4} fill={spec.hairColor} />
        )}
      </g>
      {backpack && <rect x={-d.torsoW / 2 - 20} y={shY + 14} width={d.torsoW + 40} height={d.torso * 0.75} rx={26} fill="#F4A23C" />}
      {/* legs */}
      {[-1, 1].map((s) => (
        <g key={s} transform={`rotate(${legA * s} ${s * 24} ${hipY})`}>
          <rect x={s * 24 - 17} y={hipY} width={34} height={d.leg - 6} rx={14} fill={spec.legs ?? spec.pants} />
          <ellipse cx={s * 24 + s * 8} cy={-8} rx={30} ry={15} fill={spec.shoes} stroke="rgba(0,0,0,.15)" strokeWidth={3} />
        </g>
      ))}
      <Arm sx={-sx} sy={sy} angle={aL} len={d.arm} spec={spec} />
      <Arm sx={sx} sy={sy} angle={aR} len={d.arm} spec={spec} />
      <rect x={-15} y={shY - 22} width={30} height={30} fill={spec.skin} />
      {spec.skirt && (
        <path
          d={`M ${-d.torsoW / 2 - 4} ${hipY - 40} L ${d.torsoW / 2 + 4} ${hipY - 40} L ${d.torsoW / 2 + 34} ${hipY + 100} L ${-d.torsoW / 2 - 34} ${hipY + 100} Z`}
          fill={spec.pants}
        />
      )}
      <rect x={-d.torsoW / 2} y={shY} width={d.torsoW} height={d.torso + 18} rx={34} fill={spec.shirt} />
      <path d={`M -22 ${shY} L 0 ${shY + 26} L 22 ${shY}`} fill="rgba(255,255,255,.35)" />
      {spec.tie && <path d={`M -9 ${shY + 18} L 9 ${shY + 18} L 14 ${shY + 110} L 0 ${shY + 130} L -14 ${shY + 110} Z`} fill={spec.tie} />}
      {backpack && (
        <>
          <rect x={-d.torsoW / 2 + 12} y={shY} width={16} height={d.torso * 0.7} rx={6} fill="#C97C1C" />
          <rect x={d.torsoW / 2 - 28} y={shY} width={16} height={d.torso * 0.7} rx={6} fill="#C97C1C" />
        </>
      )}
      {/* head */}
      <g transform={`rotate(${tilt} 0 ${shY})`}>
        {spec.hair === "short" && <circle cx={0} cy={cy - 6} r={R * 1.04} fill={spec.hairColor} />}
        {spec.hair === "teacher" && <circle cx={0} cy={cy} r={R * 1.0} fill={spec.hairColor} />}
        <circle cx={-R * 0.98} cy={cy + 8} r={16} fill={spec.skin} />
        <circle cx={R * 0.98} cy={cy + 8} r={16} fill={spec.skin} />
        <circle cx={0} cy={cy} r={R} fill={spec.skin} />
        {(spec.hair === "ponytail" || spec.hair === "bun") && (
          <path
            d={`M ${-R * 1.03} ${cy + R * 0.1} C ${-R * 1.12} ${cy - R * 1.32} ${R * 1.12} ${cy - R * 1.32} ${R * 1.03} ${cy + R * 0.1}
                Q ${R * 0.75} ${cy - R * 0.5} ${R * 0.1} ${cy - R * 0.5} Q ${-R * 0.55} ${cy - R * 0.3} ${-R * 1.03} ${cy + R * 0.1} Z`}
            fill={spec.hairColor}
          />
        )}
        {spec.hair === "ponytail" && <circle cx={R * 0.88} cy={cy - R * 0.38} r={14} fill="#FF4F6D" />}
        {spec.hair === "short" && (
          <path
            d={`M ${-R * 1.04} ${cy - R * 0.05} C ${-R * 1.1} ${cy - R * 1.38} ${R * 1.1} ${cy - R * 1.38} ${R * 1.04} ${cy - R * 0.05}
                L ${R * 0.78} ${cy - R * 0.42} L ${R * 0.5} ${cy - R * 0.36} L ${R * 0.28} ${cy - R * 0.56} L ${0} ${cy - R * 0.42}
                L ${-R * 0.3} ${cy - R * 0.58} L ${-R * 0.55} ${cy - R * 0.38} L ${-R * 0.82} ${cy - R * 0.45} Z`}
            fill={spec.hairColor}
          />
        )}
        {spec.hair === "teacher" && (
          <>
            <ellipse cx={-R * 0.2} cy={cy - R * 0.62} rx={R * 0.3} ry={R * 0.12} fill="#fff" opacity={0.3} />
            <ellipse cx={-R * 0.92} cy={cy - R * 0.22} rx={R * 0.18} ry={R * 0.38} fill={spec.hairColor} />
            <ellipse cx={R * 0.92} cy={cy - R * 0.22} rx={R * 0.18} ry={R * 0.38} fill={spec.hairColor} />
          </>
        )}
        <circle cx={fx - R * 0.58} cy={cy + R * 0.3} r={R * 0.14} fill="#FF8FA3" opacity={expr === "happy" ? 0.55 : 0.3} />
        <circle cx={fx + R * 0.58} cy={cy + R * 0.3} r={R * 0.14} fill="#FF8FA3" opacity={expr === "happy" ? 0.55 : 0.3} />
        {[-1, 1].map((s) => {
          const exx = fx + s * ex;
          const shock = expr === "shock" ? 1.25 : 1;
          return (
            <g key={s}>
              <ellipse cx={exx} cy={eyeY} rx={R * 0.1 * shock} ry={Math.max(2, R * 0.13 * blink * shock)} fill="#2B2236" />
              {blink > 0.5 && <circle cx={exx + R * 0.035} cy={eyeY - R * 0.05} r={R * 0.035} fill="#fff" />}
              <line
                x1={exx - s * R * 0.14}
                y1={by + brow[0]}
                x2={exx + s * R * 0.14}
                y2={by + brow[1]}
                stroke={spec.hair === "teacher" ? "#6E6E6E" : spec.hairColor}
                strokeWidth={7}
                strokeLinecap="round"
              />
              {spec.glasses && <circle cx={exx} cy={eyeY} r={R * 0.21} fill="rgba(255,255,255,.15)" stroke="#333" strokeWidth={5} />}
            </g>
          );
        })}
        {spec.glasses && <line x1={fx - ex + R * 0.21} y1={eyeY} x2={fx + ex - R * 0.21} y2={eyeY} stroke="#333" strokeWidth={5} />}
        <path d={`M ${fx - 7} ${cy + R * 0.24} Q ${fx} ${cy + R * 0.32} ${fx + 7} ${cy + R * 0.24}`} stroke="rgba(120,60,40,.5)" strokeWidth={5} fill="none" strokeLinecap="round" />
        {mouth}
        {spec.mustache && (
          <path
            d={`M ${fx - R * 0.26} ${cy + R * 0.4} Q ${fx - R * 0.12} ${cy + R * 0.24} ${fx} ${cy + R * 0.34} Q ${fx + R * 0.12} ${cy + R * 0.24} ${fx + R * 0.26} ${cy + R * 0.4} Q ${fx} ${cy + R * 0.36} ${fx - R * 0.26} ${cy + R * 0.4} Z`}
            fill="#7D7D7D"
          />
        )}
      </g>
      {hold && (
        <g transform={`translate(${hold === "L" ? handL.x : handR.x} ${(hold === "L" ? handL.y : handR.y) - 10})`}>
          <Notebook />
        </g>
      )}
    </g>
  );
};

/* -------------------------------- Dialogue -------------------------------- */

type Who = "ela" | "can" | "anne" | "ogretmen";
type Line = { who: Who; text: string; start: number; dur: number; shout?: boolean };
const NAMES: Record<Who, { name: string; color: string }> = {
  ela: { name: "Ela", color: "#FF5C7A" },
  can: { name: "Can", color: "#2FA88D" },
  anne: { name: "Anne", color: "#7C5CD6" },
  ogretmen: { name: "Ahmet Öğretmen", color: "#B5651D" },
};
const CPS = 1.3;

const talkOpen = (frame: number, lines: Line[], who: Who) => {
  for (const l of lines) {
    if (l.who === who && frame >= l.start && frame < l.start + l.text.length / CPS + 3) {
      return 0.3 + 0.7 * Math.abs(Math.sin((frame - l.start) * 0.55));
    }
  }
  return 0;
};

const blinkOf = (frame: number, offset: number) => {
  const d = (frame + offset) % 95;
  return d < 6 ? Math.abs(d - 3) / 3 : 1;
};

const Bubble: React.FC<{ line: Line; anchorX: number; anchorY: number }> = ({ line, anchorX, anchorY }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const local = frame - line.start;
  if (local < 0 || local > line.dur) return null;
  const pop = spring({ frame: local, fps, config: { damping: 13, stiffness: 200 } });
  const out = interpolate(local, [line.dur - 6, line.dur], [1, 0], clamp);
  const shown = Math.floor(local * CPS);
  const w = Math.min(600, 150 + line.text.length * 25);
  const left = Math.max(36, Math.min(W - 36 - w, anchorX - w / 2));
  const tailX = Math.max(50, Math.min(w - 50, anchorX - left));
  const meta = NAMES[line.who];
  return (
    <div
      style={{
        position: "absolute",
        left,
        width: w,
        bottom: H - anchorY,
        opacity: out,
        transform: `scale(${0.6 + 0.4 * pop})`,
        transformOrigin: `${tailX}px 100%`,
        fontFamily,
      }}
    >
      <div
        style={{
          position: "absolute",
          top: -30,
          left: 28,
          background: meta.color,
          color: "#fff",
          fontSize: 30,
          padding: "6px 20px",
          borderRadius: 999,
          zIndex: 2,
        }}
      >
        {meta.name}
      </div>
      <div
        style={{
          position: "relative",
          background: line.shout ? "#FFE45C" : "#fff",
          border: "6px solid #1E1838",
          borderRadius: 38,
          padding: "30px 30px 24px",
          fontSize: 50,
          lineHeight: 1.18,
          color: "#1E1838",
          textAlign: "center",
          boxShadow: "0 10px 0 rgba(30,24,56,.25)",
        }}
      >
        <span>{line.text.slice(0, shown)}</span>
        <span style={{ opacity: 0 }}>{line.text.slice(shown)}</span>
        <div
          style={{
            position: "absolute",
            left: tailX - 18,
            bottom: -21,
            width: 36,
            height: 36,
            background: line.shout ? "#FFE45C" : "#fff",
            borderRight: "6px solid #1E1838",
            borderBottom: "6px solid #1E1838",
            transform: "rotate(45deg)",
          }}
        />
      </div>
    </div>
  );
};

const Bubbles: React.FC<{ lines: Line[]; pos: Partial<Record<Who, { x: number; top: number }>> }> = ({ lines, pos }) => (
  <>
    {lines.map((l, i) => {
      const p = pos[l.who];
      if (!p) return null;
      return <Bubble key={i} line={l} anchorX={p.x} anchorY={p.top - 36} />;
    })}
  </>
);

const Pop: React.FC<{ text: string; x: number; y: number; start: number; end: number; size?: number; rotate?: number }> = ({
  text,
  x,
  y,
  start,
  end,
  size = 110,
  rotate = -8,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  if (frame < start || frame > end) return null;
  const s = spring({ frame: frame - start, fps, config: { damping: 8, stiffness: 220 } });
  return (
    <div
      style={{
        position: "absolute",
        left: x - 300,
        width: 600,
        top: y,
        textAlign: "center",
        fontFamily,
        fontSize: size,
        color: "#FFE45C",
        WebkitTextStroke: "6px #1E1838",
        paintOrder: "stroke",
        transform: `rotate(${rotate}deg) scale(${s})`,
      }}
    >
      {text}
    </div>
  );
};

/* ------------------------------- Backgrounds ------------------------------- */

const Stage: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <svg viewBox={`0 0 ${W} ${H}`} width="100%" height="100%" style={{ position: "absolute" }}>
    {children}
  </svg>
);

const Kitchen: React.FC<{ glow: number }> = ({ glow }) => {
  const frame = useCurrentFrame();
  return (
    <>
      <rect width={W} height={1380} fill="#FCE6C8" />
      {Array.from({ length: 13 }).map((_, i) => (
        <rect key={i} x={i * 90} y={0} width={40} height={1380} fill="#F7DCB9" />
      ))}
      <defs>
        <clipPath id="win">
          <rect x={110} y={300} width={380} height={440} rx={10} />
        </clipPath>
        <linearGradient id="morning" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#8FD3FF" />
          <stop offset="1" stopColor="#FFE7B3" />
        </linearGradient>
      </defs>
      <g clipPath="url(#win)">
        <rect x={110} y={300} width={380} height={440} fill="url(#morning)" />
        <circle cx={390} cy={420} r={55} fill="#FFD447" />
        <g transform={`translate(${(frame * 0.6) % 500} 0)`}>
          <ellipse cx={60} cy={520} rx={80} ry={30} fill="#fff" opacity={0.9} />
          <ellipse cx={110} cy={500} rx={50} ry={30} fill="#fff" opacity={0.9} />
        </g>
      </g>
      <rect x={110} y={300} width={380} height={440} rx={10} fill="none" stroke="#fff" strokeWidth={18} />
      <line x1={300} y1={300} x2={300} y2={740} stroke="#fff" strokeWidth={12} />
      <path d="M 80 270 L 170 270 Q 150 520 190 780 L 80 780 Z" fill="#E56B5D" />
      <path d="M 520 270 L 430 270 Q 450 520 410 780 L 520 780 Z" fill="#E56B5D" />
      <rect x={60} y={258} width={480} height={20} rx={10} fill="#A0522D" />
      {/* clock */}
      <g transform="translate(820 320)">
        <circle r={74} fill="#fff" stroke="#3D2E66" strokeWidth={10} />
        <line x1={0} y1={0} x2={0} y2={-44} stroke="#3D2E66" strokeWidth={8} strokeLinecap="round" transform={`rotate(${225 + frame * 0.3})`} />
        <line x1={0} y1={0} x2={0} y2={-58} stroke="#E56B5D" strokeWidth={5} strokeLinecap="round" transform={`rotate(${frame * 6})`} />
        <circle r={8} fill="#3D2E66" />
      </g>
      {/* cabinets & counter */}
      <rect x={620} y={520} width={460} height={190} rx={10} fill="#8FC1B5" />
      <line x1={850} y1={520} x2={850} y2={710} stroke="#6FA396" strokeWidth={6} />
      <rect x={620} y={1010} width={460} height={370} fill="#8FC1B5" />
      <rect x={600} y={985} width={480} height={34} rx={8} fill="#F2F2F2" />
      <line x1={850} y1={1019} x2={850} y2={1380} stroke="#6FA396" strokeWidth={6} />
      <rect x={680} y={890} width={70} height={95} rx={10} fill="#D9774C" />
      <ellipse cx={715} cy={865} rx={60} ry={45} fill="#5DAE5D" />
      <ellipse cx={690} cy={835} rx={30} ry={40} fill="#4A9A4A" />
      {/* floor */}
      <rect y={1380} width={W} height={540} fill="#C88A57" />
      <rect y={1370} width={W} height={20} fill="#9E6A3E" />
      {[1470, 1580, 1700, 1830].map((y) => (
        <line key={y} x1={0} y1={y} x2={W} y2={y} stroke="#B87A48" strokeWidth={5} />
      ))}
      {/* table with forgotten notebook */}
      <rect x={410} y={1350} width={22} height={260} fill="#7A4A26" />
      <rect x={648} y={1350} width={22} height={260} fill="#7A4A26" />
      <rect x={380} y={1320} width={320} height={40} rx={12} fill="#9C5F33" />
      <circle cx={540} cy={1290} r={70 + Math.sin(frame / 4) * 6} fill="#FFE45C" opacity={glow * 0.45} />
      <g transform="translate(540 1300) scale(0.8) rotate(80)">
        <Notebook />
      </g>
      <rect x={600} y={1270} width={40} height={50} rx={8} fill="#fff" />
      <rect x={636} y={1282} width={14} height={22} rx={7} fill="none" stroke="#fff" strokeWidth={6} />
    </>
  );
};

const Corridor: React.FC = () => (
  <>
    <rect width={W} height={1450} fill="#E6EEF7" />
    {[200, 540, 880].map((x) => (
      <rect key={x} x={x - 110} y={60} width={220} height={26} rx={13} fill="#FFFBE0" />
    ))}
    <rect x={150} y={380} width={780} height={140} rx={20} fill="#46A36B" />
    <text x={540} y={475} textAnchor="middle" fontFamily={fontFamily} fontWeight={800} fontSize={64} fill="#fff">
      4-B SINIFI →
    </text>
    {Array.from({ length: 9 }).map((_, i) => (
      <g key={i} transform={`translate(${i * 122 - 10} 640)`}>
        <rect width={116} height={810} fill={i % 2 ? "#4A7FC1" : "#5A8FD1"} stroke="#2F5E9A" strokeWidth={5} />
        {[0, 1, 2, 3].map((k) => (
          <rect key={k} x={28} y={40 + k * 22} width={60} height={8} rx={4} fill="#2F5E9A" />
        ))}
        <rect x={86} y={400} width={12} height={60} rx={6} fill="#D6E2F2" />
      </g>
    ))}
    <rect y={1450} width={W} height={470} fill="#DCD3C4" />
    {Array.from({ length: 12 }).map((_, i) =>
      Array.from({ length: 5 }).map((__, j) =>
        (i + j) % 2 ? <rect key={`${i}-${j}`} x={i * 100} y={1450 + j * 100} width={100} height={100} fill="#CFC5B3" /> : null,
      ),
    )}
  </>
);

const Classroom: React.FC<{ doorOpen: number }> = ({ doorOpen }) => (
  <>
    <rect width={W} height={1450} fill="#F3E9D2" />
    <rect x={40} y={360} width={700} height={560} rx={14} fill="#8B5A2B" />
    <rect x={64} y={384} width={652} height={512} rx={8} fill="#2F5D4A" />
    <text x={390} y={500} textAnchor="middle" fontFamily={fontFamily} fontWeight={800} fontSize={66} fill="#F5F5F5">
      Matematik
    </text>
    <text x={390} y={620} textAnchor="middle" fontFamily={fontFamily} fontWeight={800} fontSize={58} fill="#FFE9A8">
      12 + 7 = 19
    </text>
    <text x={390} y={730} textAnchor="middle" fontFamily={fontFamily} fontWeight={800} fontSize={58} fill="#BDE7FF">
      Ödev: Sayfa 42
    </text>
    <rect x={64} y={884} width={652} height={20} fill="#6E4520" />
    <rect x={120} y={872} width={60} height={14} rx={4} fill="#fff" />
    {/* door */}
    <rect x={850} y={620} width={210} height={830} fill="#8B5A2B" />
    <rect x={866} y={636} width={178} height={814} fill="#4E5A6B" />
    <g transform={`translate(866 636) scale(${1 - doorOpen * 0.82} 1)`}>
      <rect width={178} height={814} fill="#B5793F" />
      <rect x={24} y={40} width={130} height={260} rx={8} fill="#A86C33" />
      <rect x={24} y={340} width={130} height={420} rx={8} fill="#A86C33" />
      <circle cx={150} cy={420} r={12} fill="#FFD447" />
    </g>
    {/* back desks */}
    {[230, 700].map((x) => (
      <g key={x}>
        <rect x={x - 12} y={1300} width={14} height={150} fill="#6E4520" />
        <rect x={x + 150} y={1300} width={14} height={150} fill="#6E4520" />
        <rect x={x - 30} y={1280} width={210} height={30} rx={8} fill="#C98B4E" />
      </g>
    ))}
    <rect y={1450} width={W} height={470} fill="#B98A5E" />
    <rect y={1440} width={W} height={18} fill="#8B5A2B" />
    {[1560, 1700, 1850].map((y) => (
      <line key={y} x1={0} y1={y} x2={W} y2={y} stroke="#A87A50" strokeWidth={5} />
    ))}
  </>
);

/* --------------------------------- Scenes --------------------------------- */

const SceneHome: React.FC = () => {
  const frame = useCurrentFrame();
  const lines: Line[] = [
    { who: "anne", text: "Ela, ödevini çantana koydun mu?", start: 15, dur: 72 },
    { who: "ela", text: "Tabii ki anne! Görüşürüz!", start: 95, dur: 62 },
    { who: "anne", text: "Ela... defterin!", start: 203, dur: 37, shout: true },
  ];
  const elaX = interpolate(frame, [160, 225], [810, 1320], clamp);
  const elaWalking = frame >= 160 && frame < 225;
  const noticed = frame >= 188;
  const glow = interpolate(frame, [185, 195], [0, 1], clamp);
  const anneX = 250;
  return (
    <AbsoluteFill>
      <Stage>
        <Kitchen glow={glow} />
        <Person
          spec={ANNE}
          x={anneX}
          face={noticed ? 0.6 : 0.8}
          expr={noticed ? "shock" : "smile"}
          talk={talkOpen(frame, lines, "anne")}
          blink={blinkOf(frame, 10)}
          armL={8}
          armR={noticed ? -60 : -15}
        />
        <Person
          spec={ELA}
          x={elaX}
          face={elaWalking ? 0.9 : -0.8}
          expr={frame > 95 ? "happy" : "smile"}
          talk={talkOpen(frame, lines, "ela")}
          blink={blinkOf(frame, 40)}
          armR={frame > 100 && frame < 158 ? -150 + Math.sin(frame / 3) * 22 : -10}
          walk={elaWalking ? frame * 0.35 : null}
          backpack
        />
      </Stage>
      <Pop text="!" x={anneX} y={headTop(ANNE) - 190} start={188} end={240} size={170} rotate={6} />
      <Bubbles lines={lines} pos={{ anne: { x: anneX, top: headTop(ANNE) }, ela: { x: elaX, top: headTop(ELA) } }} />
    </AbsoluteFill>
  );
};

const SceneCorridor: React.FC = () => {
  const frame = useCurrentFrame();
  const lines: Line[] = [
    { who: "can", text: "Günaydın Ela! Matematik ödevini yaptın mı?", start: 38, dur: 74 },
    { who: "ela", text: "Tabii! Bütün gece uğraştım.", start: 115, dur: 50 },
    { who: "ela", text: "Eyvah... defterim yok!", start: 172, dur: 38, shout: true },
  ];
  const elaX = interpolate(frame, [0, 38], [1250, 760], { ...clamp });
  const walking = frame < 38;
  const searching = frame >= 165;
  return (
    <AbsoluteFill>
      <Stage>
        <Corridor />
        <Person
          spec={CAN}
          x={300}
          face={0.8}
          expr={searching ? "shock" : "smile"}
          talk={talkOpen(frame, lines, "can")}
          blink={blinkOf(frame, 25)}
          armR={frame > 38 && frame < 60 ? -140 + Math.sin(frame / 3) * 20 : -10}
        />
        <Person
          spec={ELA}
          x={elaX}
          face={walking ? -0.9 : searching ? 0.2 : -0.8}
          expr={searching ? "shock" : "happy"}
          talk={talkOpen(frame, lines, "ela")}
          blink={blinkOf(frame, 60)}
          walk={walking ? frame * 0.35 : null}
          armL={searching ? -20 + Math.sin(frame / 2) * 25 : 8}
          armR={searching ? 20 + Math.cos(frame / 2) * 25 : -8}
          backpack
        />
      </Stage>
      <Bubbles lines={lines} pos={{ can: { x: 300, top: headTop(CAN) }, ela: { x: elaX, top: headTop(ELA) } }} />
    </AbsoluteFill>
  );
};

const SceneClass: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const lines: Line[] = [
    { who: "ogretmen", text: "Günaydın çocuklar! Ödevleri toplayalım.", start: 12, dur: 82 },
    { who: "ela", text: "Eyvah eyvah...", start: 100, dur: 42 },
    { who: "anne", text: "Bir şey unutmadın mı, Ela?", start: 222, dur: 72 },
    { who: "ela", text: "Annecim, sen bir tanesin!", start: 300, dur: 62 },
    { who: "ogretmen", text: "Tam zamanında geldiniz!", start: 360, dur: 48 },
  ];
  const doorOpen = interpolate(frame, [168, 188], [0, 1], clamp);
  const anneX = interpolate(frame, [176, 218], [1260, 950], clamp);
  const anneWalking = frame >= 176 && frame < 218;
  const knocked = frame >= 150;
  const handed = frame >= 298;
  const jump = handed && frame < 340 ? Math.abs(Math.sin(((frame - 298) / 42) * Math.PI * 2)) * 60 : 0;
  const title = spring({ frame: frame - 405, fps, config: { damping: 14 } });
  return (
    <AbsoluteFill>
      <Stage>
        <Classroom doorOpen={doorOpen} />
        <Person
          spec={OGRETMEN}
          x={150}
          face={knocked ? 0.9 : 0.7}
          expr={frame > 355 ? "happy" : knocked && frame < 230 ? "neutral" : "smile"}
          talk={talkOpen(frame, lines, "ogretmen")}
          blink={blinkOf(frame, 5)}
          armR={frame > 12 && frame < 80 ? -45 + Math.sin(frame / 6) * 10 : -10}
        />
        <Person
          spec={ELA}
          x={620}
          face={knocked ? 0.8 : -0.6}
          expr={handed ? "happy" : frame > 210 ? "shock" : "worried"}
          talk={talkOpen(frame, lines, "ela")}
          blink={blinkOf(frame, 33)}
          jump={jump}
          armL={handed ? 150 : 8}
          armR={handed ? -150 : -8}
          hold={handed ? "R" : null}
        />
        <Person
          spec={CAN}
          x={380}
          face={knocked ? 0.8 : 0.6}
          expr={handed ? "happy" : knocked ? "shock" : "worried"}
          blink={blinkOf(frame, 70)}
        />
        {frame >= 170 && (
          <Person
            spec={ANNE}
            x={anneX}
            face={-0.8}
            expr="smile"
            talk={talkOpen(frame, lines, "anne")}
            blink={blinkOf(frame, 15)}
            walk={anneWalking ? frame * 0.33 : null}
            armL={handed ? 10 : 52}
            armR={-10}
            hold={handed ? null : "L"}
          />
        )}
      </Stage>
      <Pop text="Tak tak!" x={950} y={500} start={145} end={185} size={96} rotate={8} />
      <Bubbles
        lines={lines}
        pos={{
          ogretmen: { x: 150, top: headTop(OGRETMEN) },
          ela: { x: 620, top: headTop(ELA) - (jump > 0 ? 60 : 0) },
          anne: { x: anneX, top: headTop(ANNE) },
        }}
      />
      {frame >= 405 && (
        <div
          style={{
            position: "absolute",
            left: 60,
            right: 60,
            top: 90,
            padding: "34px 30px",
            borderRadius: 40,
            background: "#1E1838",
            color: "#fff",
            fontFamily,
            fontSize: 70,
            lineHeight: 1.15,
            textAlign: "center",
            opacity: title,
            transform: `translateY(${(1 - title) * 60}px)`,
          }}
        >
          Unutkanlık olur...
          <br />
          <span style={{ color: "#FFE45C" }}>aile hep yanında.</span>
        </div>
      )}
    </AbsoluteFill>
  );
};

export const PeopleDemo: React.FC = () => {
  const scenes = [SceneHome, SceneCorridor, SceneClass];
  return (
    <AbsoluteFill style={{ backgroundColor: "#1E1838" }}>
      <TransitionSeries>
        {scenes.flatMap((Scene, i) => {
          const items = [
            <TransitionSeries.Sequence key={`s${i}`} durationInFrames={PEOPLE_SCENES[i]}>
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
