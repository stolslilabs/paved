import { useRef } from "react";
import { cn } from "../../lib/utils";
import { DAY_AT, DAY_SHARE, WHEEL_SEASONS, isNight, type WheelPoint, type WheelState } from "../../data/season-wheel";
import { wheelArtSources, type WheelLayer } from "./wheel-art";

// The dial's art: painted layers on one square canvas each, stacked (`wheel-art.ts`: their copies in `public/wheel-art`, their
// masters in `wheel-sources/`), in the player badge's stone and gold. Two of them turn: the seasons' ring, one little planet
// seen from above (its ground along the inner edge, its sky towards the pavers, everything standing outwards), a season a
// quarter, each blending into the next at its start, so the wheel's centre is the landscape's vanishing point and a turn never
// breaks the perspective; and the day and night disc. Both are toned down to a warm grey, so the gold reads over them. Their
// light is radial, so it holds at any angle. The fixed layers (the shade, the inner gold ring, the pavers and their gold, the
// pointer, the hub) carry the light from the top left. The sun and the moon ride on the disc and stay upright, so their light
// stays put too. Sizes in a 100-unit box, the canvas's.

/** The dial's size: 96 px under 390 px wide, 108 px on other phones, 144 px from tablet up (its placeholder's too). */
export const DIAL_SIZE = "size-24 min-[24.375rem]:size-27 tablet:size-36";
/** The dial's three widths in px. */
export const DIAL_PX = [96, 108, 144] as const;
/** The day and night disc's radius: what shows of it inside the inner gold ring. */
export const TIME_DISC = 16.5;
/** The seasons' ring, between the two gold rings: what shows of it. */
export const RING = [20.5, 40] as const;
/** The sun and the moon: their centres' distance from the centre, and their width. */
export const TIME_ICON_RADIUS = 9.5;
export const TIME_ICON_SIZE = 10;

/**
 * Which way the centre disc turns against the seasons' ring, counterclockwise: the other way, clockwise (the owner's ask, the
 * default), or the same way. The disc is painted to turn clockwise; turning the same way, it is drawn mirrored, so its
 * night still gives way to its day under the pointer.
 */
export const CENTRE_TURNS = ["against", "with"] as const;
export type CentreTurn = (typeof CENTRE_TURNS)[number];

/**
 * The disc as painted (turning clockwise, the pointer reads it counterclockwise): clockwise from the top, its night from 0 to
 * `NIGHT_ENDS`, its day from there round to the top, dawn at the top, dusk at `NIGHT_ENDS`.
 */
export const NIGHT_ENDS = (1 - DAY_SHARE) * 360;

/** A point at `r` from the centre, `deg` clockwise from the top, in % of the dial. */
function at(r: number, deg: number): { x: number; y: number } {
  const a = (deg * Math.PI) / 180;
  return { x: 50 + r * Math.sin(a), y: 50 - r * Math.cos(a) };
}

/** Where the sun and the moon sit on the disc, in % of the dial (the middle of the day and of the night), each way it turns. */
export const TIME_ICON_AT = Object.fromEntries(
  CENTRE_TURNS.map((turn) => {
    const day = at(TIME_ICON_RADIUS, (NIGHT_ENDS + 360) / 2);
    const night = at(TIME_ICON_RADIUS, NIGHT_ENDS / 2);
    const side = (p: { x: number; y: number }) => (turn === "with" ? { x: 100 - p.x, y: p.y } : p);
    return [turn, { day: side(day), night: side(night) }];
  }),
) as Record<CentreTurn, Record<"day" | "night", { x: number; y: number }>>;

/** The fixed layers over the discs, bottom to top: the hub last, over the pointer. */
const FIXED = ["shade", "inner-bezel", "frame", "pointer", "hub"] as const satisfies readonly WheelLayer[];

/** The centre disc turns once per day and night, so four times per turn of the seasons' ring (a season is one day and night). */
export const TIME_TURNS_PER_YEAR = WHEEL_SEASONS.length;

export interface SeasonWheelProps {
  state: WheelState;
  /** Where the cycle is (`GameScene.getDayNight`), used in auto; none: the dial rests on the first season's day. */
  point?: WheelPoint | null;
  /** Click: the next state (issue 909: the season after now, then each following one, now's own last, auto on the fifth tap; `nextWheelRound`). */
  onNext?: () => void;
  /** The discs' turn takes this long between two readings, in ms (the board reads once a second). Default 1000. */
  turnMs?: number;
  /** Which way the centre disc turns: against the seasons' ring (the default), or with it. */
  centreTurn?: CentreTurn;
  className?: string;
}

/** Where the cycle is for a state, in seasons from summer's dawn: auto's point, or a fixed season's day (`DAY_AT`). */
function cyclePoint(state: WheelState, point?: WheelPoint | null): number {
  if (state !== "auto") return WHEEL_SEASONS.indexOf(state) + DAY_AT;
  return point ? WHEEL_SEASONS.indexOf(point.season) + point.position : DAY_AT;
}

/** A layer of the dial: the whole canvas, decorative. */
function Layer({ name, className }: { name: WheelLayer; className?: string }) {
  return <img {...wheelArtSources(name)} alt="" draggable={false} decoding="async" data-layer={name} className={cn("absolute inset-0 size-full", className)} />;
}

/**
 * The season dial (issue 547; painted art since V4-WHEEL-ART): a ring of paving stones set with gold around the four seasons'
 * landscape, a little planet, and at the centre a disc of a day and a night under the sun and the moon. The
 * seasons' ring turns counterclockwise under the gold pointer at the top, once a year (four days and nights); the centre disc
 * once a day and night, clockwise (`centreTurn` "with": counterclockwise, mirrored). What is under the pointer is "now": its
 * outer tip on the season, its inner notch on the day or the night. In auto the discs follow the cycle; in a fixed state they
 * rest on that season's day. Nothing tells auto from fixed, nothing is written (issue 634): the button's name says it. Each
 * disc always turns the same way, never back.
 */
export function SeasonWheel({ state, point, onNext, turnMs = 1000, centreTurn = "against", className }: SeasonWheelProps) {
  const angle = useRef<number | null>(null);
  const goal = -cyclePoint(state, point) * 90;
  // The ring only ever turns one way, counterclockwise (the next season comes up the right side to the top): a reading
  // behind the last angle (the cycle wrapped, spring round to summer) is taken a full turn on, never back.
  const last = angle.current ?? goal;
  const behind = (((last - goal) % 360) + 360) % 360;
  const turned = (angle.current = behind > 359 ? last : last - behind);
  // The centre disc's angle follows from the ring's: four times it, so it too only turns forward, its own way.
  const mirrored = centreTurn === "with";
  const timeTurned = turned * TIME_TURNS_PER_YEAR * (mirrored ? 1 : -1);
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
      <span aria-hidden className={cn("relative block rounded-full", DIAL_SIZE)}>
        {/* The seasons' ring, turning. */}
        <span data-dial-disc className={cn("absolute inset-0", spin)} style={{ transform: `rotate(${turned}deg)`, ...turn }}>
          <Layer name="season-ring" />
        </span>
        {/* The day and night disc, turning four times as fast, mirrored when it turns with the ring. */}
        <span data-time-disc className={cn("absolute inset-0", spin)} style={{ transform: `rotate(${timeTurned}deg)`, ...turn }}>
          <Layer name="time-disc" className={mirrored ? "-scale-x-100" : undefined} />
        </span>
        {/* The sun and the moon ride on the disc and turn back about their own centres, so they stay upright. */}
        <span data-time-icons className={cn("absolute inset-0", spin)} style={{ transform: `rotate(${timeTurned}deg)`, ...turn }}>
          {(["day", "night"] as const).map((t) => (
            <img
              key={t}
              {...wheelArtSources(t === "day" ? "icon-sun" : "icon-moon", TIME_ICON_SIZE / 100)}
              alt=""
              draggable={false}
              decoding="async"
              data-time-icon={t}
              className={cn("absolute max-w-none", spin)}
              style={{
                left: `${TIME_ICON_AT[centreTurn][t].x - TIME_ICON_SIZE / 2}%`,
                top: `${TIME_ICON_AT[centreTurn][t].y - TIME_ICON_SIZE / 2}%`,
                width: `${TIME_ICON_SIZE}%`,
                height: `${TIME_ICON_SIZE}%`,
                transform: `rotate(${-timeTurned}deg)`,
                ...turn,
              }}
            />
          ))}
        </span>
        {/* Fixed: the shade, the inner gold ring, the pavers and their gold, the pointer at the top, the hub. */}
        {FIXED.map((name) => (
          <Layer key={name} name={name} />
        ))}
        <span className="absolute inset-0 rounded-full transition-colors group-hover:bg-state-hover group-active:bg-state-pressed" />
      </span>
    </button>
  );
}
