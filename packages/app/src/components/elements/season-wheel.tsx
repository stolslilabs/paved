import { useRef } from "react";
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
// and a band of paving stones; the disc of the four seasons' skies; at the centre, a smaller disc of a day and a night. A red
// needle at the top marks "now" across both discs. The dial is 108 px across on a phone, 96 px on the narrowest (under 390 px,
// so the stack and its coming tiles fit beside it at the board's bottom, issue 682) and 144 px from tablet up (half again the
// first sizes, the owner's ask).

/** The seasons' disc's radius: inside the band of stones. */
const DISC = 40;
/** The band of paving stones, between these radii, cut into `STONES` stones. */
const BAND = [41.5, 48] as const;
const STONES = 24;
/** The day and night disc at the centre: 40 % of the dial's radius (issue 909's open point 1). */
export const TIME_DISC = 20;
/** Where the season icons sit, from the centre, in the middle of their quarter, between the two discs. */
export const ICON_RADIUS = 30;
/** Where the day's and the night's icons sit on the centre disc. */
const TIME_ICON_RADIUS = 10.5;
/** The dial's size: 96 px under 390 px wide, 108 px on other phones, 144 px from tablet up (its placeholder's too). */
export const DIAL_SIZE = "size-24 min-[24.375rem]:size-27 tablet:size-36";
/** The dial's smallest width in px, on the narrowest phones; the icons' size there (`ICON_SIZE`, `TIME_ICON_SIZE`). */
export const DIAL_PX = 96;
export const ICON_PX = 16;
export const TIME_ICON_PX = 12;
/** The season icons: 16 px on the narrowest phones, 18 px on other phones, 24 px from tablet up: a third of the dial's radius,
 * so they fit between the two discs. */
const ICON_SIZE = "text-[1rem] min-[24.375rem]:text-[1.125rem] tablet:text-[1.5rem]";
/** The centre disc's icons: 12 px on a phone (the text floor), 16 px from tablet up. */
const TIME_ICON_SIZE = "text-[0.75rem] tablet:text-[1rem]";

/** A point at `r` from the centre, `deg` clockwise from the top. */
function at(r: number, deg: number): [number, number] {
  const a = (deg * Math.PI) / 180;
  return [50 + r * Math.sin(a), 50 - r * Math.cos(a)];
}

const f = (n: number) => Math.round(n * 100) / 100;

/** A ring sector between two radii and two angles (an annular wedge; `r0` 0 is a pie slice). */
function wedge(r0: number, r1: number, from: number, to: number): string {
  const [ax, ay] = at(r1, from);
  const [bx, by] = at(r1, to);
  const large = to - from > 180 ? 1 : 0;
  if (r0 === 0) return `M50 50L${f(ax)} ${f(ay)}A${r1} ${r1} 0 ${large} 1 ${f(bx)} ${f(by)}Z`;
  const [cx, cy] = at(r0, to);
  const [dx, dy] = at(r0, from);
  return `M${f(ax)} ${f(ay)}A${r1} ${r1} 0 ${large} 1 ${f(bx)} ${f(by)}L${f(cx)} ${f(cy)}A${r0} ${r0} 0 ${large} 0 ${f(dx)} ${f(dy)}Z`;
}

/** A disc's part, filled with a gradient from its rim (the sky's top) to the centre (the horizon), along its middle. */
function part(id: string, r: number, from: number, to: number) {
  const [x1, y1] = at(r, (from + to) / 2);
  return { id, d: wedge(0, r, from, to), x1: f(x1), y1: f(y1) };
}

/** The seasons' disc: a quarter per season, its day's sky, clockwise (issue 909: no night slices). */
const QUARTERS = WHEEL_SEASONS.map((season, i) => ({ season, ...part(season, DISC, i * 90, (i + 1) * 90) }));

/** The centre disc: its day (`DAY_SHARE` of a turn, from its dawn at the top) then its night, clockwise. */
const DUSK = DAY_SHARE * 360;
const HALVES = [
  { time: "day", ...part("day", TIME_DISC, 0, DUSK) },
  { time: "night", ...part("night", TIME_DISC, DUSK, 360) },
] as const;

/** Where the day's and the night's icons sit on the centre disc, in % of the dial (the middle of each half). */
export const TIME_ICON_AT = Object.fromEntries(
  HALVES.map((h, i) => {
    const [x, y] = at(TIME_ICON_RADIUS, i === 0 ? DUSK / 2 : (DUSK + 360) / 2);
    return [h.time, { x, y }];
  }),
) as Record<"day" | "night", { x: number; y: number }>;

/** The night's stars, about the moon: radius, angle, size, and when each starts its twinkle. */
const STARS = [
  { r: 15.5, deg: 240, s: 1.6, delay: 0 },
  { r: 15, deg: 343, s: 1.3, delay: 0.7 },
  { r: 5.5, deg: 255, s: 1.1, delay: 1.2 },
  { r: 17.5, deg: 270, s: 1, delay: 0.4 },
].map(({ r, deg, s, delay }) => {
  const [x, y] = at(r, deg);
  // A four-point sparkle: long arms, a narrow waist.
  const w = s * 0.28;
  return { d: `M${f(x)} ${f(y - s)}L${f(x + w)} ${f(y - w)}L${f(x + s)} ${f(y)}L${f(x + w)} ${f(y + w)}L${f(x)} ${f(y + s)}L${f(x - w)} ${f(y + w)}L${f(x - s)} ${f(y)}L${f(x - w)} ${f(y - w)}Z`, delay };
});

/** The stones' two tones, in an uneven order, as laid paving. */
const STONE_TONES = [0, 1, 0, 0, 1, 1, 0, 1, 0, 0, 0, 1];
/** The stones of the band: a little gap between each, as paving. */
const STONE_PATHS = Array.from({ length: STONES }, (_, i) => wedge(BAND[0], BAND[1], (i * 360) / STONES + 1.6, ((i + 1) * 360) / STONES - 1.6));

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
 * The season dial (issue 547, crafted in issue 607, in three layers since issue 909): a gold rim and a band of paving stones around the
 * disc of the four seasons, each quarter its season's day sky with its season's game icon, and at the centre a smaller disc,
 * its day (a sky, the sun behind a cloud) and its night (a deep sky, the moon, twinkling stars). Both discs turn
 * counterclockwise under a red needle at the top, the seasons' once a year (four days and nights), the centre's once a day and
 * night: the parts under the needle are "now". In auto they follow the cycle; in a fixed state they rest on that season's day.
 * Nothing tells auto from fixed, nothing is written (issue 634): the button's name says it. They always turn the same way,
 * never back.
 */
export function SeasonWheel({ state, point, onNext, turnMs = 1000, className }: SeasonWheelProps) {
  const angle = useRef<number | null>(null);
  const goal = -cyclePoint(state, point) * 90;
  // The discs only ever turn one way, counterclockwise (the next season comes up the right side to the top): a reading
  // behind the last angle (the cycle wrapped, spring round to summer) is taken a full turn on, never back.
  const last = angle.current ?? goal;
  const behind = (((last - goal) % 360) + 360) % 360;
  const turned = (angle.current = behind > 359 ? last : last - behind);
  // The centre disc's angle follows from the seasons': four times it, so it too only turns forward.
  const timeTurned = turned * TIME_TURNS_PER_YEAR;
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
      data-testid="season-wheel"
      onClick={onNext}
      className={cn("group relative flex shrink-0 rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring", className)}
    >
      <span aria-hidden className={cn("relative block rounded-full shadow-lg", DIAL_SIZE)}>
        {/* The stones and the seasons' disc, turning. */}
        <span data-dial-disc className={cn("absolute inset-0", spin)} style={{ transform: `rotate(${turned}deg)`, ...turn }}>
          <svg viewBox="0 0 100 100" className="size-full">
            <defs>
              {QUARTERS.map((q) => (
                <linearGradient key={q.id} id={`dial-${q.id}`} gradientUnits="userSpaceOnUse" x1={q.x1} y1={q.y1} x2={50} y2={50}>
                  <stop offset="0" stopColor={`var(--sky-${q.season}-day-top)`} />
                  <stop offset="1" stopColor={`var(--sky-${q.season}-day-bottom)`} />
                </linearGradient>
              ))}
            </defs>
            <circle cx={50} cy={50} r={49.5} fill="var(--dial-band)" />
            {STONE_PATHS.map((d, i) => (
              <path key={i} d={d} fill={STONE_TONES[i % STONE_TONES.length] ? "var(--dial-stone-alt)" : "var(--dial-stone)"} stroke="var(--dial-stone-edge)" strokeWidth={0.5} />
            ))}
            {QUARTERS.map((q) => (
              <path key={q.id} data-quarter={q.season} d={q.d} fill={`url(#dial-${q.id})`} />
            ))}
            {/* The seams: a fine line at each season's start. */}
            {WHEEL_SEASONS.map((s, i) => {
              const [dx, dy] = at(DISC, i * 90);
              return <line key={s} x1={50} y1={50} x2={f(dx)} y2={f(dy)} stroke="var(--dial-rim)" strokeWidth={0.8} opacity={0.7} />;
            })}
          </svg>
        </span>
        {/* The day and night disc at the centre, turning four times as fast. */}
        <span data-time-disc className={cn("absolute inset-0", spin)} style={{ transform: `rotate(${timeTurned}deg)`, ...turn }}>
          <svg viewBox="0 0 100 100" className="size-full">
            <defs>
              {HALVES.map((h) => (
                <linearGradient key={h.id} id={`dial-time-${h.id}`} gradientUnits="userSpaceOnUse" x1={h.x1} y1={h.y1} x2={50} y2={50}>
                  <stop offset="0" stopColor={`var(--dial-${h.time}-top)`} />
                  <stop offset="1" stopColor={`var(--dial-${h.time}-bottom)`} />
                </linearGradient>
              ))}
            </defs>
            {HALVES.map((h) => (
              <path key={h.id} data-half={h.time} d={h.d} fill={`url(#dial-time-${h.id})`} />
            ))}
            {STARS.map((star, i) => (
              <path key={i} data-star d={star.d} fill="var(--dial-star)" className="dial-twinkle" style={{ animationDelay: `${star.delay}s` }} />
            ))}
          </svg>
        </span>
        {/* Fixed: the three rings, black, and the red needle at the top, down across both discs to the centre. */}
        <svg viewBox="0 0 100 100" className="absolute inset-0 size-full">
          <circle cx={50} cy={50} r={49.25} fill="none" stroke="var(--dial-ring)" strokeWidth={1.5} />
          <circle cx={50} cy={50} r={DISC + 0.5} fill="none" stroke="var(--dial-ring)" strokeWidth={1} />
          <circle cx={50} cy={50} r={TIME_DISC + 0.4} fill="none" stroke="var(--dial-ring)" strokeWidth={1} />
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
          {HALVES.map((h) => (
            <span
              key={h.time}
              data-time-icon={h.time}
              className={cn("absolute flex size-0 items-center justify-center", spin)}
              style={{ left: `${TIME_ICON_AT[h.time].x}%`, top: `${TIME_ICON_AT[h.time].y}%`, transform: `rotate(${-timeTurned}deg)`, ...turn }}
            >
              <span className="flex">
                <WorldIcon name={TIME_GLYPH[h.time]} size="inherit" className={TIME_ICON_SIZE} />
              </span>
            </span>
          ))}
        </span>
        <span className="absolute inset-0 rounded-full transition-colors group-hover:bg-state-hover group-active:bg-state-pressed" />
      </span>
    </button>
  );
}
