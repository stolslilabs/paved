import { useEffect, useId, useRef } from "react";
import { useReducedMotionConfig } from "motion/react";
import * as m from "motion/react-m";
import { cn } from "../../lib/utils";
import { CHEST_NAME, type ChestRank } from "./chest-badge";
import { CHEST_ART_REM, CHEST_SPENT, CHEST_WOOD, chestParts, HINGE, RANK_LIGHT, TONE_BASE, type ChestArtSize } from "./chest-designs";
import { ReliefDefs, ReliefParts, ReliefShadow, type ReliefScale } from "./chest-icon";
import { mix } from "./game-icon";

/**
 * A chest's state (issue 874's proposal 4): `rest` idles (a slow shine; epic glows), `ready` glows and shakes as issue 784's, `opening`
 * swings the lid and bursts the light, `open` holds the opened chest in its light, `spent` is an opened chest, empty and grey (the
 * slots' opened chest, issue 874's open point 2).
 */
export type ChestArtState = "rest" | "ready" | "opening" | "open" | "spent";

/** The art's relief, thinner than the icon's: the art is drawn three to six times larger. */
const ART_RELIEF: ReliefScale = { outline: 22, rim: 10, drop: 16 };

/** The art's box: the chest's 576 by 512 grid with room above for the lid and the light, square. */
const VIEW = { x: -96, y: -224, size: 768 } as const;

/**
 * The chest in depth (the owner's ask on issue 874, 2026-10-29: the lid opens as a real lid does, on hinges at the back). The art is
 * the chest's front, seen a little from above: a point `z` deep is drawn `SLANT * z` higher and narrowed by `FOCAL / (FOCAL + z)`
 * about the middle. The lid turns about its back edge, `DEPTH` behind the seam.
 */
const DEPTH = 240;
const SLANT = 0.35;
const FOCAL = 1800;
/** The mouth's depth as drawn: the hinges' line, this far above the seam. */
const MOUTH = SLANT * DEPTH;
/** The lid open (degrees, past upright, so its lining faces the player) and the most it swings to before it settles. */
export const LID_OPEN_DEG = 100;
const LID_MAX_DEG = 108;
/** The walls' thickness at the mouth, on the grid. */
const WALL = 22;

const narrow = (z: number) => FOCAL / (FOCAL + z);
const r1 = (n: number) => Math.round(n * 10) / 10;
const quad = (pts: readonly (readonly [number, number])[]) => `M${pts.map(([x, y]) => `${r1(x)} ${r1(y)}`).join("L")}z`;

/** The lid's front at `deg` open, as a matrix on the closed drawing; null once it turns away from the player. */
function lidMatrix(deg: number): string | null {
  const t = (Math.min(deg, LID_MAX_DEG) * Math.PI) / 180;
  const [sin, cos] = [Math.sin(t), Math.cos(t)];
  // A point h above the seam, on the lid's front, is drawn `a * h + b` above it.
  const a = cos + SLANT * sin;
  const b = DEPTH * (sin + SLANT * (1 - cos));
  if (a <= 0.02) return null;
  // Narrowed as its bottom edge, which meets the lining.
  const q = narrow(DEPTH - DEPTH * cos);
  return `matrix(${r1(q * 1000) / 1000} 0 0 ${r1(a * 1000) / 1000} ${r1(288 * (1 - q))} ${r1(HINGE * (1 - a) - b)})`;
}

/** The lid's inside at `deg` open, from its back edge (the hinges) to its front, a trapezoid in depth; null while it faces away. */
function liningOf(deg: number): { frame: string; lining: string; seams: string } | null {
  const t = (Math.min(deg, LID_MAX_DEG) * Math.PI) / 180;
  const [sin, cos] = [Math.sin(t), Math.cos(t)];
  const front = DEPTH * (sin - SLANT * cos);
  if (front <= 1) return null;
  // A point a fraction f of the way from the hinges to the lid's front, `s` from the middle (in the closed drawing's units).
  const at = (f: number, s: number): [number, number] => [288 + s * narrow(DEPTH - DEPTH * cos * f), HINGE - MOUTH - front * f];
  const box = (inset: number) => quad([at(0, -288 + inset), at(0, 288 - inset), at(1 - inset / DEPTH, 288 - inset), at(1 - inset / DEPTH, -288 + inset)]);
  const seams = [1 / 3, 2 / 3].map((f) => `M${at(f, -288 + WALL).map(r1).join(" ")}L${at(f, 288 - WALL).map(r1).join(" ")}`).join("");
  return { frame: box(0), lining: box(WALL), seams };
}

/** The mouth once the lid is up: the walls' top edges (the frame) round the dark inside, from the seam back to the hinges. */
const mouthOf = (inset: number) => {
  const back = narrow(DEPTH);
  return quad([
    [inset, HINGE],
    [576 - inset, HINGE],
    [288 + (288 - inset) * back, HINGE - MOUTH + inset * SLANT],
    [288 - (288 - inset) * back, HINGE - MOUTH + inset * SLANT],
  ]);
};
const MOUTH_FRAME = mouthOf(0);
const MOUTH_INSIDE = mouthOf(WALL);
/** Where the light comes from: the middle of the mouth. */
const LIGHT_Y = HINGE - MOUTH / 2;

/** The opening's beats (s): the lid swings, then the light bursts, then the sparks fly. */
export const LID_DELAY_S = 0.15;
export const BURST_DELAY_S = 0.2;
/**
 * The lid's swing: a spring that carries it a little past open and lets it settle, as a heavy lid on its hinges; shut again, a
 * stiffer one with no bounce. Stepped here on the animation frames (Motion's motion values would add a chunk to the first load).
 */
const LID_SPRING = { stiffness: 170, damping: 15, mass: 1.1 } as const;
const LID_SHUT_SPRING = { stiffness: 320, damping: 38, mass: 1.1 } as const;

/** Swings `from` to `to` on the spring, after `delay` (s), calling `draw` on each frame; returns its stop. */
function swing(from: number, to: number, spring: { stiffness: number; damping: number; mass: number }, delay: number, draw: (deg: number) => void) {
  let x = from;
  let v = 0;
  let last: number | undefined;
  let frame = requestAnimationFrame(function step(now) {
    last ??= now + delay * 1000;
    const dt = Math.min(0.05, Math.max(0, (now - last) / 1000));
    last = Math.max(last, now);
    // Small steps, so a slow frame does not throw the lid.
    for (let t = 0; t < dt; t += 1 / 240) {
      const h = Math.min(1 / 240, dt - t);
      v += ((-spring.stiffness * (x - to) - spring.damping * v) / spring.mass) * h;
      x += v * h;
    }
    const done = Math.abs(x - to) < 0.05 && Math.abs(v) < 0.5;
    draw(done ? to : x);
    if (!done) frame = requestAnimationFrame(step);
  });
  return () => cancelAnimationFrame(frame);
}
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

/** The rays: a fan of thin wedges around the mouth's middle, symmetric, so its box's centre is the fan's (it turns about it). */
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


export interface ChestArtProps {
  rank: ChestRank;
  state?: ChestArtState;
  size?: ChestArtSize;
  /** Ready: shakes as issue 784's (the default); false when a parent shakes it (the modal, faster while its draw comes) or holds it still (the slots). */
  shake?: boolean;
  /** For the stories: the lid held this many degrees open (0 shut, `LID_OPEN_DEG` open), with no swing. */
  lidAngle?: number;
  /** The accessible name: the chest's ("Epic chest") by default; `null` makes the art decorative. */
  label?: string | null;
  className?: string;
}

/**
 * A chest's detailed version (issue 874's proposal 4), for the chest slots and the opening's modal: an SVG in layers (the body, the lid
 * on its hinges, the bands, the lock, the gems) in the game icons' relief, animated with Motion. At rest a slow shine crosses it, and an
 * epic chest glows; ready, it shakes as issue 784's; opening, the lid swings up and back on its hinges at the chest's back, in
 * perspective (its front tips away and its lining comes into view), and light bursts from inside, rays and a glow in the rank's colour
 * and a few sparks. Under reduced motion the frames are still: the lid is open at once and the light only fades in. Pure SVG and
 * Motion, no image; the app loads it in its own chunk (`LazyChestArt`).
 */
export function ChestArt({ rank, state = "rest", size = "md", shake = true, lidAngle, label, className }: ChestArtProps) {
  const reduced = useReducedMotionConfig() ?? false;
  const id = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const parts = chestParts(rank, "art");
  const body = parts.filter((p) => p.layer === "body");
  const lid = parts.filter((p) => p.layer === "lid");
  const light = RANK_LIGHT[rank];
  const wood = CHEST_WOOD[rank];
  const name = label === undefined ? CHEST_NAME[rank] : label;
  const opened = state === "opening" || state === "open" || state === "spent";
  const lit = state === "opening" || state === "open";
  // Motion when the state brings it in: the opening's beats; `open` shows its end at once.
  const animateIn = state === "opening" && !reduced && lidAngle === undefined;
  // Under reduced motion the opening's light only fades in: no scale, no delay, no flight.
  const fadeIn = state === "opening" && reduced;
  // A lid held ajar by a story: the mouth shows, the closed chest's shine does not.
  const ajar = (lidAngle ?? 0) > 0;
  const idle = !reduced && !ajar && (state === "rest" || state === "ready");
  const target = lidAngle ?? (opened ? LID_OPEN_DEG : 0);

  // The lid's angle, redrawn on each frame through refs (the lid's transform, its lining's paths), with no render per frame.
  const angle = useRef(animateIn ? 0 : target);
  const lidRef = useRef<SVGGElement>(null);
  const liningRef = useRef<SVGGElement>(null);
  useEffect(() => {
    const draw = (deg: number) => {
      angle.current = deg;
      const matrix = lidMatrix(deg);
      const g = lidRef.current;
      if (g) {
        if (matrix) g.setAttribute("transform", matrix);
        g.setAttribute("visibility", matrix ? "visible" : "hidden");
      }
      const inside = liningOf(deg);
      const lining = liningRef.current;
      if (lining) {
        lining.setAttribute("visibility", inside ? "visible" : "hidden");
        if (inside) for (const el of lining.querySelectorAll<SVGPathElement>("[data-d]")) el.setAttribute("d", inside[el.dataset.d as keyof typeof inside]);
      }
    };
    if (reduced || lidAngle !== undefined || angle.current === target) {
      draw(target);
      return;
    }
    return swing(angle.current, target, opened ? LID_SPRING : LID_SHUT_SPRING, opened ? LID_DELAY_S : 0, draw);
  }, [target, opened, reduced, lidAngle]);
  const at0 = angle.current;
  const matrix0 = lidMatrix(at0);
  const lining0 = liningOf(at0) ?? { frame: "", lining: "", seams: "" };

  return (
    <svg
      {...(name ? { role: "img", "aria-label": name } : { "aria-hidden": true })}
      viewBox={`${VIEW.x} ${VIEW.y} ${VIEW.size} ${VIEW.size}`}
      width="1em"
      height="1em"
      overflow="visible"
      focusable="false"
      data-slot="chest-art"
      data-rank={rank}
      data-state={state}
      className={cn("inline-block shrink-0", className)}
      style={{ fontSize: `${CHEST_ART_REM[size]}rem`, ...(state === "spent" && CHEST_SPENT) }}
    >
      <defs>
        <ReliefDefs id={id} parts={parts} rim={ART_RELIEF.rim} />
        <radialGradient id={`${id}glow`} cx="0.5" cy="0.5" r="0.5">
          <stop offset="0" style={{ stopColor: "var(--foreground)", stopOpacity: 0.95 }} />
          <stop offset="0.25" style={{ stopColor: light, stopOpacity: 0.85 }} />
          <stop offset="1" style={{ stopColor: light, stopOpacity: 0 }} />
        </radialGradient>
        <radialGradient id={`${id}rays`} gradientUnits="userSpaceOnUse" cx={288} cy={LIGHT_Y} r={560}>
          <stop offset="0.1" style={{ stopColor: light, stopOpacity: 0.9 }} />
          <stop offset="1" style={{ stopColor: light, stopOpacity: 0 }} />
        </radialGradient>
        <linearGradient id={`${id}beam`} x1="0" y1="1" x2="0" y2="0">
          <stop offset="0" style={{ stopColor: "var(--foreground)", stopOpacity: 0.85 }} />
          <stop offset="0.3" style={{ stopColor: light, stopOpacity: 0.55 }} />
          <stop offset="1" style={{ stopColor: light, stopOpacity: 0 }} />
        </linearGradient>
        {/* The lid's lining, lit from the mouth below it once the light bursts, dark toward the lid's front. */}
        <linearGradient id={`${id}lining`} x1="0" y1="1" x2="0" y2="0">
          <stop offset="0" style={{ stopColor: mix(TONE_BASE[wood.lining], "mid") }} />
          <stop offset="1" style={{ stopColor: mix(TONE_BASE[wood.lining], "lo") }} />
        </linearGradient>
        <linearGradient id={`${id}inside`} x1="0" y1="1" x2="0" y2="0">
          <stop offset="0" style={{ stopColor: "var(--background)" }} />
          <stop offset="1" style={{ stopColor: mix(TONE_BASE[wood.timber], "lo") }} />
        </linearGradient>
        <mask id={`${id}shape`} maskUnits="userSpaceOnUse" x={VIEW.x} y={VIEW.y} width={VIEW.size} height={VIEW.size}>
          {parts.map((p, i) => (p.line || p.flat ? null : <path key={i} d={p.d} transform={p.t} fill="white" />))}
        </mask>
      </defs>

      {/* An epic chest's glow at rest (and every chest's, ready): a soft halo that breathes. */}
      {!opened && (rank === "epic" || state === "ready") && (
        <m.circle
          data-part="glow"
          cx={288}
          cy={300}
          r={360}
          fill={`url(#${id}glow)`}
          initial={false}
          animate={idle ? { opacity: [0.28, 0.5, 0.28] } : { opacity: 0.38 }}
          transition={idle ? { duration: 2.8, repeat: Infinity, ease: "easeInOut" } : { duration: 0 }}
        />
      )}

      {/* The light from inside: the rays turning slowly behind the chest, the glow. */}
      {lit && (
        <g data-part="burst">
          <m.g
            initial={animateIn ? { opacity: 0, scale: 0.3 } : fadeIn ? { opacity: 0, scale: 1 } : false}
            animate={{ opacity: 0.75, scale: 1 }}
            transition={fadeIn ? FADE : { duration: 0.5, delay: animateIn ? BURST_DELAY_S : 0, ease: "easeOut" }}
            style={{ transformBox: "fill-box", originX: 0.5, originY: 0.5 }}
          >
            <m.path
              d={rays(288, LIGHT_Y)}
              fill={`url(#${id}rays)`}
              animate={reduced ? { rotate: 0 } : { rotate: 360 }}
              transition={{ duration: 24, repeat: Infinity, ease: "linear" }}
              style={{ transformBox: "fill-box", originX: 0.5, originY: 0.5 }}
            />
          </m.g>
          <m.circle
            cx={288}
            cy={LIGHT_Y}
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
          state === "ready" && shake && !reduced
            ? { rotate: [0, -6, 6, -5, 5, -2, 2, 0], y: [0, -10, 0, -6, 0, -3, 0, 0] }
            : animateIn
              ? { rotate: [0, -3, 3, 0], y: [0, -8, 0, 0] }
              : { rotate: 0, y: 0 }
        }
        transition={
          state === "ready" && shake && !reduced
            ? { duration: SHAKE_S, repeat: Infinity, repeatDelay: SHAKE_PAUSE_S, ease: "easeInOut" }
            : { duration: animateIn ? 0.25 : 0 }
        }
        style={{ transformBox: "fill-box", originX: 0.5, originY: 1 }}
      >
        <ReliefShadow parts={body} scale={ART_RELIEF} />
        <ReliefParts id={id} parts={body} scale={ART_RELIEF} />
        {/* The mouth, seen from above once the lid is up: the walls' top edges round the dark inside. */}
        {(opened || ajar) && (
          <g data-part="inside">
            <path d={MOUTH_FRAME} style={{ fill: mix(TONE_BASE[wood.timber], "mid"), stroke: mix(TONE_BASE[wood.timber], "edge") }} strokeWidth={10} strokeLinejoin="round" />
            <path d={MOUTH_INSIDE} fill={`url(#${id}inside)`} />
          </g>
        )}
        {/* The lid's inside, from its hinges up to its front: its rim, its lining, the planks' seams. */}
        <g ref={liningRef} data-part="lining" visibility={liningOf(at0) ? "visible" : "hidden"}>
          <path data-d="frame" d={lining0.frame} style={{ fill: mix(TONE_BASE[wood.timber], "lo"), stroke: mix(TONE_BASE[wood.timber], "edge") }} strokeWidth={12} strokeLinejoin="round" />
          <path data-d="lining" d={lining0.lining} fill={`url(#${id}lining)`} />
          <path data-d="seams" d={lining0.seams} fill="none" style={{ stroke: "var(--background)" }} opacity={0.4} strokeWidth={5} strokeLinecap="round" />
        </g>
        <g ref={lidRef} data-part="lid" transform={matrix0 ?? undefined} visibility={matrix0 ? "visible" : "hidden"}>
          <ReliefShadow parts={lid} scale={ART_RELIEF} />
          <ReliefParts id={id} parts={lid} scale={ART_RELIEF} index={body.length} />
        </g>
        {/* The beam out of the mouth, over the lid's lining it lights. */}
        {lit && (
          <m.path
            data-part="beam"
            d={`M${WALL} ${HINGE}L-60 ${HINGE - 460}H636L${576 - WALL} ${HINGE}z`}
            fill={`url(#${id}beam)`}
            initial={animateIn ? { opacity: 0 } : fadeIn ? { opacity: 0 } : false}
            animate={{ opacity: 0.8 }}
            transition={fadeIn ? FADE : { duration: 0.3, delay: animateIn ? BURST_DELAY_S : 0 }}
          />
        )}
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

      {/* The sparks: out of the mouth, again and again while the chest is lit. */}
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
            const spark = <circle cx={288} cy={LIGHT_Y} r={s.s} />;
            return reduced ? (
              <g key={i} transform={`translate(${dx * 0.6} ${dy * 0.6})`} opacity={0.8}>
                {spark}
              </g>
            ) : (
              <m.g
                key={i}
                initial={{ x: 0, y: 0, opacity: 0 }}
                animate={{ x: dx, y: dy, opacity: [0, 1, 0] }}
                transition={{ duration: 1.2, delay: (animateIn ? BURST_DELAY_S + 0.15 : 0) + i * 0.07, repeat: Infinity, repeatDelay: 0.5, ease: "easeOut" }}
              >
                {spark}
              </m.g>
            );
          })}
        </m.g>
      )}
    </svg>
  );
}

export default ChestArt;
