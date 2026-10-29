import { useId } from "react";
import { useReducedMotionConfig } from "motion/react";
import * as m from "motion/react-m";
import { cn } from "../../lib/utils";
import { CHEST_NAME, type ChestRank } from "./chest-badge";
import { chestParts, HINGE, RANK_LIGHT, type ChestDirection } from "./chest-designs";
import { ReliefDefs, ReliefParts, ReliefShadow, type ReliefScale } from "./chest-icon";

/**
 * A chest's state (issue 874's proposal 4): `rest` idles (a slow shine; epic glows), `ready` shakes as issue 784's, `opening` swings the lid
 * and bursts the light, `open` holds the opened chest in its light, `spent` is an opened chest, empty and grey (the slots' opened
 * chest, issue 874's open point 2).
 */
export type ChestArtState = "rest" | "ready" | "opening" | "open" | "spent";

/** The art's relief, thinner than the icon's: the art is drawn three to six times larger. */
const ART_RELIEF: ReliefScale = { outline: 22, rim: 10, drop: 16 };

/** The art's box: the chest's 576 by 512 grid with room above for the lid and the light, square. */
const VIEW = { x: -96, y: -224, size: 768 } as const;

/** The lid, closed and swung open: lifted, tipped back on its hinge. */
const LID_SHUT = { y: 0, rotate: 0, scaleY: 1 };
const LID_OPEN = { y: -132, rotate: -9, scaleY: 0.82 };

/** The opening's beats (s): the lid swings, then the light bursts, then the sparks fly. */
export const LID_S = 0.45;
export const BURST_DELAY_S = 0.15;
/** The opening's light under reduced motion: a short fade, nothing else. */
const FADE = { duration: 0.4, ease: "easeOut" } as const;

/** The shake of issue 784 (s): a few short shakes, then a pause. */
const SHAKE_S = 0.7;
const SHAKE_PAUSE_S = 1.4;

/** The sparks: their directions (degrees from straight up) and their reach, on the grid. */
const SPARKS: readonly { a: number; r: number; s: number }[] = [
  { a: -62, r: 300, s: 12 },
  { a: -40, r: 360, s: 9 },
  { a: -22, r: 280, s: 14 },
  { a: -6, r: 380, s: 10 },
  { a: 8, r: 320, s: 13 },
  { a: 26, r: 360, s: 9 },
  { a: 44, r: 290, s: 12 },
  { a: 64, r: 340, s: 10 },
  { a: -80, r: 220, s: 8 },
  { a: 82, r: 230, s: 8 },
];

/** The rays: a fan of thin wedges around the hinge's middle, symmetric, so its box's centre is the fan's (it turns about it). */
function rays(cx: number, cy: number): string {
  const n = 16;
  const reach = 560;
  return Array.from({ length: n }, (_, i) => {
    const a = (i / n) * Math.PI * 2;
    const w = Math.PI / n / 2.6;
    const p = (t: number) => `${Math.round(cx + reach * Math.cos(t))} ${Math.round(cy + reach * Math.sin(t))}`;
    return `M${cx} ${cy}L${p(a - w)}L${p(a + w)}z`;
  }).join("");
}

/** The opened chest, grey and dimmed: inline, so the stylesheet gains nothing. */
const SPENT = { filter: "grayscale(1)", opacity: 0.6 } as const;

/** The sizes, as the em of the square SVG: the slots' chest (`md`), the modal's (`lg`, `xl`). */
const SIZE_REM = { sm: 5, md: 8, lg: 12, xl: 16 } as const;
export type ChestArtSize = keyof typeof SIZE_REM;

export interface ChestArtProps {
  direction: ChestDirection;
  rank: ChestRank;
  state?: ChestArtState;
  size?: ChestArtSize;
  /** The accessible name: the chest's ("Epic chest") by default; `null` makes the art decorative. */
  label?: string | null;
  className?: string;
}

/**
 * A chest's detailed version (issue 874's proposal 4), for the chest slots and the opening's modal: an SVG in layers (the body, the lid
 * on its hinge, the bands, the lock, the gems) in the game icons' relief, animated with Motion. At rest a slow shine crosses it, and a
 * epic chest glows; ready, it shakes as issue 784's; opening, the lid swings open and light bursts from inside, rays and a glow in the
 * rank's colour and a few sparks (voxels of light for the voxel chests). Under reduced motion the frames are still and the light only
 * fades in. Pure SVG and Motion, no image: the study of issue 874's first pull request (Storybook); the second draws the slots and the
 * modal with the direction the owner picks, in its own lazy chunk.
 */
export function ChestArt({ direction, rank, state = "rest", size = "md", label, className }: ChestArtProps) {
  const reduced = useReducedMotionConfig() ?? false;
  const id = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const parts = chestParts(direction, rank, "art");
  const body = parts.filter((p) => p.layer === "body");
  const lid = parts.filter((p) => p.layer === "lid");
  const hinge = HINGE[direction];
  const light = RANK_LIGHT[rank];
  const name = label === undefined ? CHEST_NAME[rank] : label;
  const opened = state === "opening" || state === "open" || state === "spent";
  const lit = state === "opening" || state === "open";
  // Motion when the state brings it in: the opening's beats; `open` shows its end at once.
  const animateIn = state === "opening" && !reduced;
  // Under reduced motion the opening's light only fades in: no scale, no delay, no flight.
  const fadeIn = state === "opening" && reduced;
  const idle = !reduced && (state === "rest" || state === "ready");
  const voxels = direction === "voxel";
  return (
    <svg
      {...(name ? { role: "img", "aria-label": name } : { "aria-hidden": true })}
      viewBox={`${VIEW.x} ${VIEW.y} ${VIEW.size} ${VIEW.size}`}
      width="1em"
      height="1em"
      overflow="visible"
      focusable="false"
      data-slot="chest-art"
      data-direction={direction}
      data-rank={rank}
      data-state={state}
      className={cn("inline-block shrink-0", className)}
      style={{ fontSize: `${SIZE_REM[size]}rem`, ...(state === "spent" && SPENT) }}
    >
      <defs>
        <ReliefDefs id={id} parts={parts} rim={ART_RELIEF.rim} />
        <radialGradient id={`${id}glow`} cx="0.5" cy="0.5" r="0.5">
          <stop offset="0" style={{ stopColor: "var(--foreground)", stopOpacity: 0.95 }} />
          <stop offset="0.25" style={{ stopColor: light, stopOpacity: 0.85 }} />
          <stop offset="1" style={{ stopColor: light, stopOpacity: 0 }} />
        </radialGradient>
        <radialGradient id={`${id}rays`} gradientUnits="userSpaceOnUse" cx={288} cy={hinge} r={560}>
          <stop offset="0.1" style={{ stopColor: light, stopOpacity: 0.9 }} />
          <stop offset="1" style={{ stopColor: light, stopOpacity: 0 }} />
        </radialGradient>
        <linearGradient id={`${id}beam`} x1="0" y1="1" x2="0" y2="0">
          <stop offset="0" style={{ stopColor: "var(--foreground)", stopOpacity: 0.9 }} />
          <stop offset="0.3" style={{ stopColor: light, stopOpacity: 0.7 }} />
          <stop offset="1" style={{ stopColor: light, stopOpacity: 0 }} />
        </linearGradient>
        <mask id={`${id}shape`} maskUnits="userSpaceOnUse" x={VIEW.x} y={VIEW.y} width={VIEW.size} height={VIEW.size}>
          {parts.map((p, i) => (p.line || p.flat ? null : <path key={i} d={p.d} transform={p.t} fill="white" />))}
        </mask>
      </defs>

      {/* An epic chest's glow at rest (and every chest's, ready): a soft halo that breathes. */}
      {!opened && (rank === "epic" || state === "ready") && (
        <m.ellipse
          data-part="glow"
          cx={288}
          cy={300}
          rx={380}
          ry={320}
          fill={`url(#${id}glow)`}
          initial={false}
          animate={idle ? { opacity: [0.28, 0.5, 0.28] } : { opacity: 0.38 }}
          transition={idle ? { duration: 2.8, repeat: Infinity, ease: "easeInOut" } : { duration: 0 }}
        />
      )}

      {/* The light from inside: the rays turning slowly, the glow, the beam out of the chest's mouth. */}
      {lit && (
        <g data-part="burst">
          <m.g
            initial={animateIn ? { opacity: 0, scale: 0.3 } : fadeIn ? { opacity: 0, scale: 1 } : false}
            animate={{ opacity: 0.75, scale: 1 }}
            transition={fadeIn ? FADE : { duration: 0.5, delay: animateIn ? BURST_DELAY_S : 0, ease: "easeOut" }}
            style={{ transformBox: "fill-box", originX: 0.5, originY: 0.5 }}
          >
            <m.path
              d={rays(288, hinge)}
              fill={`url(#${id}rays)`}
              animate={reduced ? { rotate: 0 } : { rotate: 360 }}
              transition={{ duration: 24, repeat: Infinity, ease: "linear" }}
              style={{ transformBox: "fill-box", originX: 0.5, originY: 0.5 }}
            />
          </m.g>
          <m.circle
            cx={288}
            cy={hinge}
            r={300}
            fill={`url(#${id}glow)`}
            initial={animateIn ? { opacity: 1, scale: 0.2 } : fadeIn ? { opacity: 0, scale: 1 } : false}
            animate={{ opacity: 0.75, scale: 1 }}
            transition={fadeIn ? FADE : { duration: 0.7, delay: animateIn ? BURST_DELAY_S : 0, ease: "easeOut" }}
            style={{ transformBox: "fill-box", originX: 0.5, originY: 0.5 }}
          />
        </g>
      )}

      <m.g
        data-part="chest"
        initial={false}
        animate={
          state === "ready" && !reduced
            ? { rotate: [0, -6, 6, -5, 5, -2, 2, 0], y: [0, -10, 0, -6, 0, -3, 0, 0] }
            : animateIn
              ? { rotate: [0, -4, 4, 0], y: 0 }
              : { rotate: 0, y: 0 }
        }
        transition={
          state === "ready" && !reduced
            ? { duration: SHAKE_S, repeat: Infinity, repeatDelay: SHAKE_PAUSE_S, ease: "easeInOut" }
            : { duration: animateIn ? 0.25 : 0 }
        }
        style={{ transformBox: "fill-box", originX: 0.5, originY: 1 }}
      >
        <ReliefShadow parts={body} scale={ART_RELIEF} />
        {/* The inside, seen once the lid is up: dark, lit from below when the light bursts. */}
        {opened && (
          <m.g data-part="inside" initial={animateIn ? { opacity: 0 } : false} animate={{ opacity: 1 }} transition={{ duration: 0.2, delay: animateIn ? 0.1 : 0 }}>
            <path d={`M24 ${hinge - 96}h528v96H24z`} style={{ fill: "var(--background)" }} />
            {lit && (
              <m.path
                d={`M40 ${hinge}L-60 ${hinge - 420}H636L536 ${hinge}z`}
                fill={`url(#${id}beam)`}
                initial={fadeIn ? { opacity: 0 } : false}
                animate={{ opacity: 0.85 }}
                transition={fadeIn ? FADE : { duration: 0 }}
              />
            )}
          </m.g>
        )}
        <ReliefParts id={id} parts={body} scale={ART_RELIEF} />
        <m.g
          data-part="lid"
          initial={animateIn ? LID_SHUT : false}
          animate={opened ? LID_OPEN : LID_SHUT}
          transition={animateIn ? { type: "spring", stiffness: 260, damping: 13, delay: 0.2 } : { duration: reduced ? 0 : 0.3 }}
          style={{ transformBox: "fill-box", originX: 0.5, originY: 1 }}
        >
          <ReliefShadow parts={lid} scale={ART_RELIEF} />
          <ReliefParts id={id} parts={lid} scale={ART_RELIEF} index={body.length} />
        </m.g>
        {/* The idle shine: a band of light across the closed chest, now and then. */}
        {idle && (
          <g mask={`url(#${id}shape)`} data-part="shine">
            <m.path
              d="M-40 -40h90l-200 640h-90z"
              style={{ fill: "var(--foreground)" }}
              opacity={0.28}
              initial={{ x: -120 }}
              animate={{ x: 900 }}
              transition={{ duration: 1.4, repeat: Infinity, repeatDelay: 3.6, ease: "easeInOut", delay: 0.8 }}
            />
          </g>
        )}
      </m.g>

      {/* The sparks (voxels of light for the voxel chests): out of the mouth, again and again while the chest is lit. */}
      {lit && (
        <m.g
          data-part="sparks"
          style={{ fill: "var(--foreground)" }}
          initial={fadeIn ? { opacity: 0 } : false}
          animate={{ opacity: 1 }}
          transition={fadeIn ? FADE : { duration: 0 }}
        >
          {SPARKS.map((s, i) => {
            const rad = (s.a * Math.PI) / 180;
            const dx = Math.round(s.r * Math.sin(rad));
            const dy = Math.round(-s.r * Math.cos(rad));
            const shape = voxels ? (
              <rect x={288 - s.s} y={hinge - s.s} width={2 * s.s} height={2 * s.s} style={{ fill: light }} />
            ) : (
              <circle cx={288} cy={hinge} r={s.s} />
            );
            return reduced ? (
              <g key={i} transform={`translate(${dx * 0.6} ${dy * 0.6})`} opacity={0.8}>
                {shape}
              </g>
            ) : (
              <m.g
                key={i}
                initial={{ x: 0, y: 0, opacity: 0 }}
                animate={{ x: dx, y: dy, opacity: [0, 1, 0] }}
                transition={{ duration: 1.2, delay: (animateIn ? BURST_DELAY_S + 0.15 : 0) + i * 0.07, repeat: Infinity, repeatDelay: 0.5, ease: "easeOut" }}
              >
                {shape}
              </m.g>
            );
          })}
        </m.g>
      )}
    </svg>
  );
}
