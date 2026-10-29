import { useRef } from "react";
import { cn } from "../../lib/utils";
import { DAY_AT, DAY_SHARE, WHEEL_SEASONS, isNight, type WheelPoint, type WheelState } from "../../data/season-wheel";
import { Icon } from "../ui/icon";
import { WorldIcon, type WorldIconName as Glyph } from "./world-icon";

/**
 * Each season's game icon (issue 870), in its tone: summer's sun gold, autumn's leaf orange, winter's snowflake ice, spring's
 * seedling green; and the now badge's, by the time of day: a sun behind a cloud by day (not summer's sun, so the two are told
 * apart at a glance), the moon by night. Named glyphs, not icons, so the Font Awesome subset does not take
 * these names: a game icon draws its own paths.
 */
export const SEASON_GLYPH = { summer: "sun", autumn: "leaf", winter: "snowflake", spring: "seedling" } as const satisfies Record<string, Glyph>;
const NOW_GLYPH = { day: "cloud-sun", night: "moon" } as const satisfies Record<string, Glyph>;

// The dial's drawing, in a 100-unit box (`viewBox="0 0 100 100"`): a soft gold rim (issue 634), a band of paving stones, the disc of the four
// seasons' skies, a hub at the centre. The dial is 108 px across on a phone, 96 px on the narrowest (under 390 px, so the
// stack and its coming tiles fit beside it at the board's bottom, issue 682) and 144 px from tablet up (half again the
// first sizes, the owner's ask).

/** The disc's radius: inside the band of stones. */
const DISC = 40;
/** The band of paving stones, between these radii, cut into `STONES` stones. */
const BAND = [41.5, 48] as const;
const STONES = 24;
/** The hub at the centre (auto or a fixed season). */
const HUB = 12;
/** Where the season icons sit, from the centre, in the middle of their season's day. */
export const ICON_RADIUS = 26.5;
/** The dial's size: 96 px under 390 px wide, 108 px on other phones, 144 px from tablet up (its placeholder's too). */
export const DIAL_SIZE = "size-24 min-[24.375rem]:size-27 tablet:size-36";
/** The dial's smallest width in px, on the narrowest phones; the icons' size there (`ICON_SIZE`). */
export const DIAL_PX = 96;
export const ICON_PX = 18;
/** The season icons: 18 px on a phone, 24 px from tablet up; the centre's mark 18 px. */
const ICON_SIZE = "text-[1.125rem] tablet:text-[1.5rem]";

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

/** Each season's quarter of the disc: its day (`DAY_SHARE` of it, from its dawn) then its night, clockwise. */
const SECTORS = WHEEL_SEASONS.flatMap((season, i) => {
  const dawn = i * 90;
  const dusk = dawn + DAY_SHARE * 90;
  return (["day", "night"] as const).map((phase) => {
    const [from, to] = phase === "day" ? [dawn, dusk] : [dusk, dawn + 90];
    // The sky's top at the rim, its bottom (the horizon) towards the centre, along the middle of the part.
    const [x1, y1] = at(DISC, (from + to) / 2);
    return { season, phase, id: `${season}-${phase}`, d: wedge(0, DISC, from, to), x1: f(x1), y1: f(y1) };
  });
});

/** The stones' two tones, in an uneven order, as laid paving. */
const STONE_TONES = [0, 1, 0, 0, 1, 1, 0, 1, 0, 0, 0, 1];
/** The stones of the band: a little gap between each, as paving. */
const STONE_PATHS = Array.from({ length: STONES }, (_, i) => wedge(BAND[0], BAND[1], (i * 360) / STONES + 1.6, ((i + 1) * 360) / STONES - 1.6));

/** Where each season's icon sits on the disc, in % of the dial (the middle of its day). */
export const ICON_AT = Object.fromEntries(
  WHEEL_SEASONS.map((s, i) => {
    const [x, y] = at(ICON_RADIUS, i * 90 + (DAY_SHARE * 90) / 2);
    return [s, { x, y }];
  }),
) as Record<(typeof WHEEL_SEASONS)[number], { x: number; y: number }>;

export interface SeasonWheelProps {
  state: WheelState;
  /** Where the cycle is (`GameScene.getDayNight`), used in auto; none: the dial rests on the first season's day. */
  point?: WheelPoint | null;
  /** Click: the next state (issue 634: the next season not yet started, then forward, auto on the fourth tap; `nextWheelRound`). */
  onNext?: () => void;
  /** The disc's turn takes this long between two readings, in ms (the board reads once a second). Default 1000. */
  turnMs?: number;
  className?: string;
}

/** The disc's angle for a state, in degrees: "now" under the pointer at the top, turning counterclockwise over a cycle. */
function target(state: WheelState, point?: WheelPoint | null): number {
  const at = state === "auto" ? (point ? WHEEL_SEASONS.indexOf(point.season) + point.position : DAY_AT) : WHEEL_SEASONS.indexOf(state) + DAY_AT;
  return -at * 90;
}

/**
 * The season dial (issue 547, crafted in issue 607): a gold rim and a band of paving stones around a disc of the four seasons, each
 * quarter its season's sky, day then night, with its season's game icon. The disc turns under a pointer at the top,
 * whose badge is a sun behind a cloud by day and a moon by night; nothing is written under it (issue 634), the button's name says it. In auto the disc
 * follows the cycle and the hub carries the auto marker; in a fixed state it rests on that season's day and the hub is a
 * pin. It always turns the same way, never back.
 */
export function SeasonWheel({ state, point, onNext, turnMs = 1000, className }: SeasonWheelProps) {
  const angle = useRef<number | null>(null);
  const goal = target(state, point);
  // The disc only ever turns one way, counterclockwise (the next season comes up the right side to the top): a reading
  // behind the last angle (the cycle wrapped, spring round to summer) is taken a full turn on, never back.
  const last = angle.current ?? goal;
  const behind = (((last - goal) % 360) + 360) % 360;
  const turned = (angle.current = behind > 359 ? last : last - behind);
  const current = state === "auto" ? (point?.season ?? "summer") : state;
  const night = state === "auto" && isNight(point);
  const time = night ? "night" : "day";
  const label = state === "auto" ? `Season: automatic, now ${current} ${time}. Change` : `Season: ${state} day. Change`;
  const turn = { transitionDuration: `${turnMs}ms` };
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
        {/* The disc and the stones, turning; the icons ride on it and stay upright. */}
        <span data-dial-disc className="absolute inset-0 transition-transform ease-linear motion-reduce:transition-none" style={{ transform: `rotate(${turned}deg)`, ...turn }}>
          <svg viewBox="0 0 100 100" className="size-full">
            <defs>
              {SECTORS.map((s) => (
                <linearGradient key={s.id} id={`dial-${s.id}`} gradientUnits="userSpaceOnUse" x1={s.x1} y1={s.y1} x2={50} y2={50}>
                  <stop offset="0" stopColor={`var(--sky-${s.season}-${s.phase}-top)`} />
                  <stop offset="1" stopColor={`var(--sky-${s.season}-${s.phase}-bottom)`} />
                </linearGradient>
              ))}
            </defs>
            <circle cx={50} cy={50} r={49.5} fill="var(--dial-band)" />
            {STONE_PATHS.map((d, i) => (
              <path key={i} d={d} fill={STONE_TONES[i % STONE_TONES.length] ? "var(--dial-stone-alt)" : "var(--dial-stone)"} stroke="var(--dial-stone-edge)" strokeWidth={0.5} />
            ))}
            {SECTORS.map((s) => (
              <path key={s.id} data-sector={s.id} d={s.d} fill={`url(#dial-${s.id})`} />
            ))}
            {/* The seams: a fine line at each dawn, a dashed one at each dusk. */}
            {WHEEL_SEASONS.map((s, i) => {
              const [dx, dy] = at(DISC, i * 90);
              const [nx, ny] = at(DISC, i * 90 + DAY_SHARE * 90);
              return (
                <g key={s} stroke="var(--dial-rim)" strokeWidth={0.8} opacity={0.7}>
                  <line x1={50} y1={50} x2={f(dx)} y2={f(dy)} />
                  <line x1={50} y1={50} x2={f(nx)} y2={f(ny)} strokeDasharray="1.5 1.5" opacity={0.6} />
                </g>
              );
            })}
          </svg>
          {WHEEL_SEASONS.map((s) => (
            <span
              key={s}
              data-season={s}
              data-current={s === current || undefined}
              className="absolute flex size-0 items-center justify-center transition-transform ease-linear motion-reduce:transition-none"
              style={{ left: `${ICON_AT[s].x}%`, top: `${ICON_AT[s].y}%`, transform: `rotate(${-turned}deg)`, ...turn }}
            >
              {/* A game icon carries its own outline and shadow. */}
              <span className={cn("flex", s !== current && "opacity-80")}>
                <WorldIcon name={SEASON_GLYPH[s]} size="inherit" className={ICON_SIZE} />
              </span>
            </span>
          ))}
        </span>
        {/* Fixed: the rim, the pointer at the top, the hub; the three rings black, the pointer gold. */}
        <svg viewBox="0 0 100 100" className="absolute inset-0 size-full">
          <circle cx={50} cy={50} r={49.25} fill="none" stroke="var(--dial-ring)" strokeWidth={1.5} />
          <circle cx={50} cy={50} r={DISC + 0.5} fill="none" stroke="var(--dial-ring)" strokeWidth={1} />
          <path d={`M46 ${50 - DISC - 1}L54 ${50 - DISC - 1}L50 ${50 - DISC + 7}Z`} fill="var(--dial-rim)" stroke="var(--dial-band)" strokeWidth={0.8} />
          <circle cx={50} cy={50} r={HUB} fill="var(--dial-band)" stroke="var(--dial-ring)" strokeWidth={1.5} />
          <circle cx={50} cy={50} r={HUB - 3} fill="none" stroke="var(--dial-stone)" strokeWidth={0.8} />
        </svg>
        <span className="absolute inset-0 rounded-full transition-colors group-hover:bg-state-hover group-active:bg-state-pressed" />
        <span className="absolute inset-0 flex items-center justify-center" style={{ color: "var(--dial-mark)" }} data-centre={state === "auto" ? "auto" : "fixed"}>
          {state === "auto" ? <Icon name="arrows-rotate" size="xs" className="text-[1.125rem]" /> : <span className="size-2.5 rounded-full bg-current tablet:size-3" />}
        </span>
        {/* "Now": a badge on the rim, over the pointer: the sun behind a cloud by day, the moon by night. */}
        <span
          data-now={time}
          className="absolute top-0 left-1/2 flex size-7.5 -translate-x-1/2 -translate-y-1/3 items-center justify-center rounded-full border border-card tablet:size-9"
          style={{ background: night ? "var(--dial-night)" : "var(--primary)", color: night ? "var(--dial-night-foreground)" : "var(--primary-foreground)" }}
        >
          <WorldIcon name={NOW_GLYPH[time]} size="inherit" className="text-[1.125rem]" />
        </span>
      </span>
    </button>
  );
}
