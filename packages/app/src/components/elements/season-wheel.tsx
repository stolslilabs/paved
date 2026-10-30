import { useEffect, useRef } from "react";
import { cn } from "../../lib/utils";
import { DAY_AT, DAY_SHARE, WHEEL_SEASONS, isNight, type WheelPoint, type WheelState } from "../../data/season-wheel";
import { WorldIcon, type WorldIconName as Glyph } from "./world-icon";

/**
 * Each season's game icon (issue 870), in its tone: summer's sun gold, autumn's leaf orange, winter's snowflake ice, spring's
 * seedling green; and the centre disc's halves (issue 909): a sun behind a cloud by day (not summer's sun, so the two are told
 * apart at a glance), the moon by night. Named glyphs, not icons, so the Font Awesome subset does not take
 * these names: a game icon draws its own paths.
 */
export const SEASON_GLYPH = { summer: "sun", autumn: "leaf", winter: "snowflake", spring: "seedling" } as const satisfies Record<string, Glyph>;
export const TIME_GLYPH = { day: "cloud-sun", night: "moon" } as const satisfies Record<string, Glyph>;


// The dial's drawing, in a 100-unit box (`viewBox="0 0 100 100"`), in three layers (issue 909): outside, a soft gold rim (issue 634)
// and a band of paving stones; the disc of the four seasons' skies, a ring of small stones at its inner edge (issue 930); at the
// centre, a smaller disc of a day and a night. A red needle at the top marks "now" across both discs. The dial is 108 px across
// on a phone, 96 px on the narrowest (under 390 px, so the stack and its coming tiles fit beside it at the board's bottom, issue
// 682) and 144 px from tablet up (half again the first sizes, the owner's ask).

/** The seasons' disc's radius: inside the band of stones. */
export const DISC = 40;
/** The band of paving stones, between these radii, cut into `STONES` stones. */
const BAND = [41.5, 48] as const;
const STONES = 24;
/** The day and night disc at the centre (issue 930: 17 units, down from 20, so the seasons' ring is 23 units wide). */
export const TIME_DISC = 17;
/** The ring of small stones between the two discs (issue 930), between these radii, cut into `PEBBLES` stones. */
export const PEBBLE_BAND = [TIME_DISC, 19.5] as const;
const PEBBLES = 16;
/** Where the season icons sit, from the centre, in the middle of their quarter, between the two discs. */
export const ICON_RADIUS = 29;
/** Where the day's and the night's icons sit on the centre disc. */
const TIME_ICON_RADIUS = 8.2;
/** The dial's size: 96 px under 390 px wide, 108 px on other phones, 144 px from tablet up (its placeholder's too). */
export const DIAL_SIZE = "size-24 min-[24.375rem]:size-27 tablet:size-36";
/** The dial's three widths in px, and the icons' sizes on each (`ICON_SIZE`, `TIME_ICON_SIZE`). */
export const DIAL_PX = [96, 108, 144] as const;
export const ICON_PX = { 96: 14, 108: 16, 144: 20 } as const;
export const TIME_ICON_PX = { 96: 12, 108: 12, 144: 16 } as const;
/** The season icons: 14 px on the narrowest phones, 16 px on other phones, 20 px from tablet up (issue 930: room from the borders). */
const ICON_SIZE = "text-sm min-[24.375rem]:text-[1rem] tablet:text-xl";
/** The centre disc's icons: 12 px on a phone (the text floor), 16 px from tablet up. */
const TIME_ICON_SIZE = "text-[0.75rem] tablet:text-[1rem]";

/** The blends (issue 930): 20° across each season's start, 30° at dusk and at dawn, through the dusk tones. */
export const SEASON_BLEND = 20;
export const DUSK_BLEND = 30;

/** Which way the centre disc turns: with the seasons' disc, counterclockwise (today's), or against it (issue 930, to try). */
export const CENTRE_TURNS = ["with", "against"] as const;
export type CentreTurn = (typeof CENTRE_TURNS)[number];

/** A point at `r` from the centre, `deg` clockwise from the top. */
function at(r: number, deg: number): [number, number] {
  const a = (deg * Math.PI) / 180;
  return [50 + r * Math.sin(a), 50 - r * Math.cos(a)];
}

const f = (n: number) => Math.round(n * 100) / 100;

/** A ring sector between two radii and two angles (an annular wedge). */
function wedge(r0: number, r1: number, from: number, to: number): string {
  const [ax, ay] = at(r1, from);
  const [bx, by] = at(r1, to);
  const [cx, cy] = at(r0, to);
  const [dx, dy] = at(r0, from);
  return `M${f(ax)} ${f(ay)}A${r1} ${r1} 0 0 1 ${f(bx)} ${f(by)}L${f(cx)} ${f(cy)}A${r0} ${r0} 0 0 0 ${f(dx)} ${f(dy)}Z`;
}

/**
 * The skies (issue 930): SVG has no conic gradient, so each disc is a CSS one, its top (at the rim) under its bottom (the
 * horizon, at the centre), the bottom faded out towards the rim by a radial mask: the gradient from the rim to the centre of
 * issue 607, and the blends around the disc. Two elements a disc, against some 80 wedges and their gradients drawn in SVG.
 */
const HORIZON = "radial-gradient(closest-side, black, transparent)";

/** The seasons' disc's sky, clockwise from summer at the top: each quarter its day sky, blended over `SEASON_BLEND` at each start. */
export const seasonsSky = (part: "top" | "bottom") =>
  `conic-gradient(from ${SEASON_BLEND / 2}deg, ${WHEEL_SEASONS.map((s, i) => `var(--sky-${s}-day-${part}) ${i * 90}deg ${(i + 1) * 90 - SEASON_BLEND}deg`).join(", ")}, var(--sky-summer-day-${part}))`;

/** The centre disc: its day (`DAY_SHARE` of a turn, from its dawn at the top) then its night, clockwise. */
const DUSK = DAY_SHARE * 360;

/**
 * The dusk tones (issue 930), from the dial's own: at the horizon autumn's warm sky, above it the day's and the night's skies
 * mixed. No token of their own: the stylesheet's budget has no room.
 */
export const DUSK_TONE = { top: "color-mix(in oklab, var(--dial-day-top), var(--dial-night-top))", bottom: "var(--sky-autumn-day-bottom)" } as const;

/** The centre disc's sky: its day, then its night, through the dusk tones at dusk and at dawn, over `DUSK_BLEND` each. */
export const timeSky = (part: "top" | "bottom") => {
  const dusk = DUSK_TONE[part];
  const b = DUSK_BLEND / 2;
  return `conic-gradient(${dusk}, var(--dial-day-${part}) ${b}deg ${DUSK - b}deg, ${dusk} ${DUSK}deg, var(--dial-night-${part}) ${DUSK + b}deg ${360 - b}deg, ${dusk})`;
};

/** A sky's two layers on a disc of radius `r`, in % of the dial. */
function Sky({ sky, r, name }: { sky: (part: "top" | "bottom") => string; r: number; name: string }) {
  return (
    <span data-sky={name} className="absolute rounded-full" style={{ inset: `${50 - r}%`, background: sky("top") }}>
      <span className="absolute inset-0 rounded-full" style={{ background: sky("bottom"), maskImage: HORIZON }} />
    </span>
  );
}

/** Where the day's and the night's icons sit on the centre disc, in % of the dial (the middle of each half), each way it turns. */
export const TIME_ICON_AT = Object.fromEntries(
  CENTRE_TURNS.map((turn) => [
    turn,
    {
      day: mirrored(turn, at(TIME_ICON_RADIUS, DUSK / 2)),
      night: mirrored(turn, at(TIME_ICON_RADIUS, (DUSK + 360) / 2)),
    },
  ]),
) as Record<CentreTurn, Record<"day" | "night", { x: number; y: number }>>;

/** Turning against the seasons, the centre disc is drawn mirrored, so its night still gives way to its day under the needle. */
function mirrored(turn: CentreTurn, [x, y]: [number, number]) {
  return { x: turn === "against" ? 100 - x : x, y };
}

/** A night's star: a four-point sparkle, long arms, a narrow waist. */
function sparkle(x: number, y: number, s: number): string {
  const w = s * 0.28;
  return `M${f(x)} ${f(y - s)}L${f(x + w)} ${f(y - w)}L${f(x + s)} ${f(y)}L${f(x + w)} ${f(y + w)}L${f(x)} ${f(y + s)}L${f(x - w)} ${f(y + w)}L${f(x - s)} ${f(y)}L${f(x - w)} ${f(y - w)}Z`;
}

/** A day's cloud, its flat base at `y`: three puffs, the middle one the tallest. */
function cloud(x: number, y: number, s: number): string {
  const p = (n: number) => f(n * s);
  return `M${f(x - 2 * s)} ${f(y)}a${p(0.8)} ${p(0.8)} 0 0 1 ${p(1.4)} ${p(-0.9)}a${p(0.8)} ${p(0.8)} 0 0 1 ${p(1.5)} ${p(0.3)}a${p(0.7)} ${p(0.7)} 0 0 1 ${p(1.1)} ${p(0.6)}Z`;
}

/** A day's bird: two curved wings, a stroke. */
function bird(x: number, y: number, s: number): string {
  return `M${f(x - s)} ${f(y - 0.3 * s)}Q${f(x - s / 2)} ${f(y - 0.6 * s)} ${f(x)} ${f(y)}Q${f(x + s / 2)} ${f(y - 0.6 * s)} ${f(x + s)} ${f(y - 0.3 * s)}`;
}

/**
 * How the clouds drift and the birds glide, back and forth, all the clouds as one and all the birds as one: a translate of their
 * box (the centre disc's), so the compositor runs it, by the Web Animations API, so the stylesheet's budget pays nothing. Two
 * animations in all: each one costs the main thread a little at every frame. `DRIFT` is how far, in dial units, on the disc:
 * 4.4% and -1.5% of the box, `TIME_DISC` twice. The geometry test sweeps it.
 */
export const DRIFT_KEYFRAMES = [{ translate: "0 0" }, { translate: "4.4% -1.5%" }];
export const DRIFT = { x: 0.044 * 2 * TIME_DISC, y: -0.015 * 2 * TIME_DISC } as const;
/** The clouds' drift and the birds' glide, one way, in ms. */
export const DRIFT_MS = { cloud: 7000, bird: 3000 } as const;

/** A decoration's box about its anchor, in its own frame (up is out, towards the rim). */
const BOX = {
  star: (s: number) => ({ x0: -s, x1: s, y0: -s, y1: s }),
  cloud: (s: number) => ({ x0: -2.2 * s, x1: 2.2 * s, y0: -1.5 * s, y1: 0.3 }),
  bird: (s: number) => ({ x0: -s - 0.3, x1: s + 0.3, y0: -0.6 * s - 0.3, y1: 0.3 }),
};
const SHAPE = { star: sparkle, cloud, bird };

/**
 * The centre disc's decorations, about its icons (issue 930): the night's stars twinkle, the day's clouds drift slowly and its
 * birds glide. The disc is a sky seen from its centre, the horizon there and the sky's top at the rim (issue 607), so each cloud
 * and bird stands on its own line from the centre (`rot`), its base towards the horizon.
 */
export const DECOR = (
  [
    { kind: "star", r: 14, deg: 245, s: 1.4, delay: 0 },
    { kind: "star", r: 14.5, deg: 340, s: 1.2, delay: 0.7 },
    { kind: "star", r: 15.8, deg: 275, s: 0.8, delay: 1.2 },
    { kind: "star", r: 15.5, deg: 320, s: 0.9, delay: 0.4 },
    { kind: "cloud", r: 12, deg: 35, s: 1.3, delay: 0 },
    { kind: "cloud", r: 12.5, deg: 180, s: 1.1, delay: 0 },
    { kind: "cloud", r: 13.5, deg: 62, s: 0.8, delay: 0 },
    { kind: "bird", r: 14, deg: 12, s: 1.2, delay: 0 },
    { kind: "bird", r: 14.5, deg: 155, s: 1.1, delay: 0 },
    { kind: "bird", r: 12, deg: 205, s: 1, delay: 0 },
  ] as const
).map(({ kind, r, deg, s, delay }) => {
  const [x, y] = at(r, deg);
  return { kind, x, y, rot: kind === "star" ? 0 : deg, d: SHAPE[kind](x, y, s), delay, box: BOX[kind](s) };
});
/** The centre disc's box, in % of the dial, and its view box in dial units: each group of decorations is drawn in one. */
const TIME_BOX = { inset: `${50 - TIME_DISC}%` };
const TIME_VIEW = `${50 - TIME_DISC} ${50 - TIME_DISC} ${2 * TIME_DISC} ${2 * TIME_DISC}`;

/** A group of the centre disc's decorations, each turned to its line from the centre. */
function Decor({ kind }: { kind: "star" | "cloud" | "bird" }) {
  return DECOR.filter((p) => p.kind === kind).map((p, i) => (
    <path
      key={i}
      data-decor={kind}
      d={p.d}
      transform={p.rot ? `rotate(${p.rot} ${f(p.x)} ${f(p.y)})` : undefined}
      fill={kind === "bird" ? "none" : kind === "star" ? "var(--dial-star)" : "var(--foreground)"}
      stroke={kind === "bird" ? "var(--dial-ring)" : undefined}
      strokeWidth={0.6}
      strokeLinecap="round"
      className={kind === "star" ? "dial-twinkle" : undefined}
      style={kind === "star" ? { animationDelay: `${p.delay}s` } : undefined}
    />
  ));
}

/** The stones' two tones, in an uneven order, as laid paving. */
const STONE_TONES = [0, 1, 0, 0, 1, 1, 0, 1, 0, 0, 0, 1];
/** The stones of the band, and the small ones between the discs: a little gap between each, as paving. */
const paving = (band: readonly [number, number], n: number, gap: number) => Array.from({ length: n }, (_, i) => wedge(band[0], band[1], (i * 360) / n + gap, ((i + 1) * 360) / n - gap));
const STONE_PATHS = paving(BAND, STONES, 1.6);
const PEBBLE_PATHS = paving(PEBBLE_BAND, PEBBLES, 1.8);
const stoneTone = (i: number) => (STONE_TONES[i % STONE_TONES.length] ? "var(--dial-stone-alt)" : "var(--dial-stone)");

/** Where each season's icon sits on the disc, in % of the dial (the middle of its quarter). */
export const ICON_AT = Object.fromEntries(
  WHEEL_SEASONS.map((s, i) => {
    const [x, y] = at(ICON_RADIUS, i * 90 + 45);
    return [s, { x, y }];
  }),
) as Record<(typeof WHEEL_SEASONS)[number], { x: number; y: number }>;

export interface SeasonWheelProps {
  state: WheelState;
  /** Where the cycle is (`GameScene.getDayNight`), used in auto; none: the dial rests on the first season's day. */
  point?: WheelPoint | null;
  /** Click: the next state (issue 909: the season after now, then each following one, now's own last, auto on the fifth tap; `nextWheelRound`). */
  onNext?: () => void;
  /** The discs' turn takes this long between two readings, in ms (the board reads once a second). Default 1000. */
  turnMs?: number;
  /** Which way the centre disc turns (issue 930): with the seasons' disc, the default until the owner picks, or against it. */
  centreTurn?: CentreTurn;
  className?: string;
}

/** Where the cycle is for a state, in seasons from summer's dawn: auto's point, or a fixed season's day (`DAY_AT`). */
function cyclePoint(state: WheelState, point?: WheelPoint | null): number {
  if (state !== "auto") return WHEEL_SEASONS.indexOf(state) + DAY_AT;
  return point ? WHEEL_SEASONS.indexOf(point.season) + point.position : DAY_AT;
}

/** The centre disc turns once per day and night, so four times per turn of the seasons' disc (a season is one day and night). */
export const TIME_TURNS_PER_YEAR = WHEEL_SEASONS.length;

/**
 * The season dial (issue 547, crafted in issue 607, in three layers since issue 909, blended in issue 930): a gold rim and a band
 * of paving stones around the disc of the four seasons, each quarter its season's day sky with its season's game icon, the
 * skies blending into each other, a ring of small stones inside; at the centre a smaller disc, its day (a sky, the sun behind
 * a cloud, clouds and birds) and its night (a deep sky, the moon, twinkling stars), blending through dusk and dawn. The seasons'
 * disc turns counterclockwise under a red needle at the top, once a year (four days and nights); the centre's once a day and
 * night, the same way or, `centreTurn` "against", the other: the parts under the needle are "now". In auto they follow the
 * cycle; in a fixed state they rest on that season's day. Nothing tells auto from fixed, nothing is written (issue 634): the
 * button's name says it. Each disc always turns the same way, never back.
 */
export function SeasonWheel({ state, point, onNext, turnMs = 1000, centreTurn = "with", className }: SeasonWheelProps) {
  const angle = useRef<number | null>(null);
  const timeDisc = useRef<HTMLSpanElement>(null);
  // The clouds drift and the birds glide; all still under reduced motion.
  useEffect(() => {
    // Started and stopped as the setting changes, not only read at mount.
    const reduced = matchMedia("(prefers-reduced-motion: reduce)");
    let runs: (Animation | undefined)[] = [];
    const stop = () => {
      runs.forEach((run) => run?.cancel());
      runs = [];
    };
    const sync = () => {
      stop();
      if (reduced.matches) return;
      runs = [...(timeDisc.current?.querySelectorAll<SVGElement>("[data-drift]") ?? [])].map((el) =>
        el.animate?.(DRIFT_KEYFRAMES, { duration: DRIFT_MS[el.dataset.drift as "cloud" | "bird"], iterations: Infinity, direction: "alternate", easing: "ease" }),
      );
    };
    sync();
    reduced.addEventListener("change", sync);
    return () => {
      reduced.removeEventListener("change", sync);
      stop();
    };
  }, []);
  const goal = -cyclePoint(state, point) * 90;
  // The discs only ever turn one way, counterclockwise (the next season comes up the right side to the top): a reading
  // behind the last angle (the cycle wrapped, spring round to summer) is taken a full turn on, never back.
  const last = angle.current ?? goal;
  const behind = (((last - goal) % 360) + 360) % 360;
  const turned = (angle.current = behind > 359 ? last : last - behind);
  // The centre disc's angle follows from the seasons': four times it, so it too only turns forward, its own way.
  const against = centreTurn === "against";
  const timeTurned = turned * TIME_TURNS_PER_YEAR * (against ? -1 : 1);
  const current = state === "auto" ? (point?.season ?? "summer") : state;
  const night = state === "auto" && isNight(point);
  const time = night ? "night" : "day";
  const label = state === "auto" ? `Season: automatic, now ${current} ${time}. Change` : `Season: ${state} day. Change`;
  const turn = { transitionDuration: `${turnMs}ms` };
  const spin = "transition-transform ease-linear motion-reduce:transition-none";
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      data-state={state}
      data-time={time}
      data-centre-turn={centreTurn}
      data-testid="season-wheel"
      onClick={onNext}
      className={cn("group relative flex shrink-0 rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring", className)}
    >
      <span aria-hidden className={cn("relative block rounded-full shadow-lg", DIAL_SIZE)}>
        {/* The seasons' disc, its stones and its small stones, turning. */}
        <span data-dial-disc className={cn("absolute inset-0", spin)} style={{ transform: `rotate(${turned}deg)`, ...turn }}>
          <Sky name="seasons" sky={seasonsSky} r={DISC} />
          <svg viewBox="0 0 100 100" className="absolute inset-0 size-full">
            <circle cx={50} cy={50} r={(DISC + 49.5) / 2} fill="none" stroke="var(--dial-band)" strokeWidth={49.5 - DISC} />
            {STONE_PATHS.map((d, i) => (
              <path key={i} d={d} fill={stoneTone(i)} stroke="var(--dial-stone-edge)" strokeWidth={0.5} />
            ))}
            <circle cx={50} cy={50} r={(PEBBLE_BAND[1] + 16) / 2} fill="none" stroke="var(--dial-band)" strokeWidth={PEBBLE_BAND[1] - 16} />
            {PEBBLE_PATHS.map((d, i) => (
              <path key={i} data-pebble d={d} fill={stoneTone(i + 5)} stroke="var(--dial-stone-edge)" strokeWidth={0.35} />
            ))}
          </svg>
        </span>
        {/* The day and night disc at the centre, turning four times as fast, mirrored when it turns against the seasons. */}
        <span ref={timeDisc} data-time-disc className={cn("absolute inset-0", spin)} style={{ transform: `rotate(${timeTurned}deg)`, ...turn }}>
          <span className="absolute inset-0" style={against ? { transform: "scaleX(-1)" } : undefined}>
            <Sky name="time" sky={timeSky} r={TIME_DISC} />
            {/* The stars twinkle in a layer of their own, so a twinkle does not paint the skies again. */}
            <span className="absolute" style={{ ...TIME_BOX, willChange: "transform" }}>
              <svg viewBox={TIME_VIEW} className="absolute inset-0 size-full">
                <Decor kind="star" />
              </svg>
            </span>
            {(["cloud", "bird"] as const).map((kind) => (
              <span key={kind} className="absolute" style={TIME_BOX}>
                <svg data-drift={kind} viewBox={TIME_VIEW} className="absolute inset-0 size-full">
                  <Decor kind={kind} />
                </svg>
              </span>
            ))}
          </span>
        </span>
        {/* Fixed: the two rings, black, and the red needle at the top, down across both discs to the centre. */}
        <svg viewBox="0 0 100 100" className="absolute inset-0 size-full">
          <circle cx={50} cy={50} r={49.25} fill="none" stroke="var(--dial-ring)" strokeWidth={1.5} />
          <circle cx={50} cy={50} r={DISC + 0.5} fill="none" stroke="var(--dial-ring)" strokeWidth={1} />
          <g data-needle>
            <line x1={50} y1={4} x2={50} y2={50} stroke="var(--dial-ring)" strokeWidth={2.4} strokeLinecap="round" />
            <line x1={50} y1={4} x2={50} y2={50} stroke="var(--dial-needle)" strokeWidth={1.2} strokeLinecap="round" />
            <path d="M45.5 0.8L54.5 0.8L50 9Z" fill="var(--dial-needle)" stroke="var(--dial-ring)" strokeWidth={0.8} strokeLinejoin="round" />
            <circle cx={50} cy={50} r={2} fill="var(--dial-needle)" stroke="var(--dial-ring)" strokeWidth={0.8} />
          </g>
        </svg>
        {/* The icons ride on their discs and stay upright, over the needle so it never hides one. */}
        <span data-dial-icons className={cn("absolute inset-0", spin)} style={{ transform: `rotate(${turned}deg)`, ...turn }}>
          {WHEEL_SEASONS.map((s) => (
            <span
              key={s}
              data-season={s}
              data-current={s === current || undefined}
              className={cn("absolute flex size-0 items-center justify-center", spin)}
              style={{ left: `${ICON_AT[s].x}%`, top: `${ICON_AT[s].y}%`, transform: `rotate(${-turned}deg)`, ...turn }}
            >
              {/* A game icon carries its own outline and shadow. */}
              <span className={cn("flex", s !== current && "opacity-80")}>
                <WorldIcon name={SEASON_GLYPH[s]} size="inherit" className={ICON_SIZE} />
              </span>
            </span>
          ))}
        </span>
        <span data-time-icons className={cn("absolute inset-0", spin)} style={{ transform: `rotate(${timeTurned}deg)`, ...turn }}>
          {(["day", "night"] as const).map((t) => (
            <span
              key={t}
              data-time-icon={t}
              className={cn("absolute flex size-0 items-center justify-center", spin)}
              style={{ left: `${TIME_ICON_AT[centreTurn][t].x}%`, top: `${TIME_ICON_AT[centreTurn][t].y}%`, transform: `rotate(${-timeTurned}deg)`, ...turn }}
            >
              <span className="flex">
                <WorldIcon name={TIME_GLYPH[t]} size="inherit" className={TIME_ICON_SIZE} />
              </span>
            </span>
          ))}
        </span>
        <span className="absolute inset-0 rounded-full transition-colors group-hover:bg-state-hover group-active:bg-state-pressed" />
      </span>
    </button>
  );
}
