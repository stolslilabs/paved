import { useRef } from "react";
import { cn } from "../../lib/utils";
import { WHEEL_SEASONS, type WheelPoint, type WheelState } from "../../data/season-wheel";
import { Icon } from "../ui/icon";

const SEASON_ICON = { summer: "sun", autumn: "leaf", winter: "snowflake", spring: "seedling" } as const;

export interface SeasonWheelProps {
  state: WheelState;
  /** Where the cycle is (`GameScene.getDayNight`), used in auto; none: the ring rests on the first season. */
  point?: WheelPoint | null;
  /** Click: the next state (auto, summer, autumn, winter, spring, auto). */
  onNext?: () => void;
  /** The ring's turn takes this long between two readings, in ms (the board reads once a second). Default 1000. */
  turnMs?: number;
  className?: string;
}

/** The ring's angle for a state, in degrees: the current season at the top, turning counterclockwise over a cycle. */
function target(state: WheelState, point?: WheelPoint | null): number {
  const index = state === "auto" ? (point ? WHEEL_SEASONS.indexOf(point.season) + point.position : 0) : WHEEL_SEASONS.indexOf(state);
  return -index * 90;
}

/**
 * The season wheel: the four seasons on a ring, the current one at the top. In auto the ring turns with the cycle
 * and a marker sits at its centre; in a fixed state it rests on that season and the centre is a dot. Always turns the
 * same way, never back.
 */
export function SeasonWheel({ state, point, onNext, turnMs = 1000, className }: SeasonWheelProps) {
  const angle = useRef(0);
  const goal = target(state, point);
  // The ring only ever turns one way, counterclockwise (the next season comes up the right side to the top): a reading
  // behind the last angle (the cycle wrapped, spring round to summer) is taken a full turn on, never back.
  const behind = (((angle.current - goal) % 360) + 360) % 360;
  angle.current = behind > 359 ? angle.current : angle.current - behind;
  const current = state === "auto" ? (point?.season ?? "summer") : state;
  const label = state === "auto" ? `Season: automatic, now ${current}. Change` : `Season: ${state} day. Change`;
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      data-state={state}
      data-testid="season-wheel"
      onClick={onNext}
      className={cn("relative grid size-11 shrink-0 place-items-center rounded-full text-muted-foreground outline-none transition-colors hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring", className)}
    >
      <span
        aria-hidden
        className="absolute inset-0 transition-transform ease-linear motion-reduce:transition-none"
        style={{ transform: `rotate(${angle.current}deg)`, transitionDuration: `${turnMs}ms` }}
      >
        {WHEEL_SEASONS.map((s, i) => (
          <span
            key={s}
            data-season={s}
            data-current={s === current || undefined}
            className="absolute inset-0"
            style={{ transform: `rotate(${i * 90}deg)` }}
          >
            {/* Upright: turned back by the ring's angle and its own place. */}
            <span
              className={cn("absolute top-[3px] left-1/2 flex size-4 -translate-x-1/2 items-center justify-center transition-transform ease-linear motion-reduce:transition-none", s === current ? "text-foreground" : "opacity-60")}
              style={{ transform: `translateX(-50%) rotate(${-(angle.current + i * 90)}deg)`, transitionDuration: `${turnMs}ms` }}
            >
              <Icon name={SEASON_ICON[s]} size="xs" />
            </span>
          </span>
        ))}
      </span>
      <span aria-hidden className="relative flex size-4 items-center justify-center text-primary" data-centre={state === "auto" ? "auto" : "fixed"}>
        {state === "auto" ? <Icon name="arrows-rotate" size="xs" /> : <span className="size-1.5 rounded-full bg-current" />}
      </span>
    </button>
  );
}
