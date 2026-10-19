import { formatNumber } from "@paved/game-core";
import { milestoneFill } from "../../lib/milestones";
import { cn } from "../../lib/utils";
import { Icon } from "../ui/icon";
import { Cobbles } from "./cobbles";

/**
 * Where one step stands (issue 595): `claimed` (reached, its Cobbles taken), `claimable` (reached, its Cobbles to take), `done`
 * (reached, no reward), `next` (the first not reached) and `locked` (beyond it).
 */
export type MilestoneState = "claimed" | "claimable" | "done" | "next" | "locked";

export interface Milestone {
  key: string | number;
  /** The step's name ("Public Works"), for a screen reader. */
  label: string;
  /** The count the step is reached at. */
  target: number;
  state: MilestoneState;
  /** The Cobbles drawn at the step; none: a step without reward. */
  cobbles?: number;
}

export interface MilestoneBarProps {
  /** The task's count. */
  count: number;
  /** Lowest target first. */
  milestones: Milestone[];
  /** What a unit is ("points"): the bar's accessible name is "<unit>: <count> of <last target>". */
  unit: string;
  className?: string;
}

const STATE_WORD: Record<MilestoneState, string> = { claimed: "claimed", claimable: "reward to claim", done: "reached", next: "next", locked: "locked" };

/** Half a node (`size-8`): the nodes' centres run from here to the bar's width less it, so the last node stays inside. */
const INSET = "1rem";
/** A point at `f` (0 to 1) of the bar, between the two insets. */
const along = (f: number) => `calc(${f} * (100% - 2 * ${INSET}) + ${INSET})`;
/** Step i of n, evenly spaced: the last sits at the bar's end. */
const at = (i: number, n: number) => along((i + 1) / n);
/**
 * Where a step's label goes: centred on its node, but the last one is anchored to the bar's right edge (as wide as a node
 * at least, so a short label stays centred under it): a wide label grows to the left instead of out of the card.
 */
const labelAt = (i: number, n: number) =>
  i === n - 1 ? { className: "right-0 min-w-8 text-center", style: undefined } : { className: "-translate-x-1/2", style: { left: at(i, n) } };

/**
 * A milestone progress bar (issue 595), as mobile games draw their limited-time events: the count fills the bar, each step is a
 * node on it with its reward drawn above and its target below; reached steps light up, a claimable one glows. Steps are
 * evenly spaced and the fill runs linearly between two (`milestoneFill`), so 1, 10 and 50 do not crowd the start.
 */
export function MilestoneBar({ count, milestones, unit, className }: MilestoneBarProps) {
  const n = milestones.length;
  const total = milestones[n - 1]?.target ?? 0;
  const fill = milestoneFill(count, milestones.map((m) => m.target));
  const rewards = milestones.some((m) => m.cobbles != null);
  return (
    <div data-slot="milestone-bar" className={className}>
      {rewards && (
        <div aria-hidden className="relative h-6">
          {milestones.map((m, i) =>
            m.cobbles == null ? null : (
              <span key={m.key} className={cn("absolute bottom-0.5 flex justify-center", labelAt(i, n).className)} style={labelAt(i, n).style}>
                <Cobbles
                  value={m.cobbles}
                  sign="+"
                  size="sm"
                  tone={m.state === "claimable" ? "default" : "muted"}
                  className={cn("whitespace-nowrap", m.state === "claimable" && "font-semibold text-primary", m.state === "claimed" && "line-through")}
                />
              </span>
            ),
          )}
        </div>
      )}
      <div className="relative flex h-9 items-center">
        <div
          role="progressbar"
          aria-label={`${unit}: ${formatNumber(Math.min(count, total))} of ${formatNumber(total)}`}
          aria-valuemin={0}
          aria-valuemax={total}
          aria-valuenow={Math.min(count, total)}
          className="h-2.5 w-full overflow-hidden rounded-full bg-secondary"
        >
          <div
            data-slot="milestone-fill"
            className={cn("h-full rounded-full transition-[width] duration-700 ease-out motion-reduce:transition-none", fill >= 1 ? "bg-success" : "bg-primary")}
            style={{ width: fill <= 0 ? "0%" : fill >= 1 ? "100%" : along(fill) }}
          />
        </div>
        <ol aria-label="Steps" className="absolute inset-0">
          {milestones.map((m, i) => (
            <li
              key={m.key}
              aria-label={`${m.label}: ${formatNumber(m.target)}, ${STATE_WORD[m.state]}`}
              data-state={m.state}
              className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2"
              style={{ left: at(i, n) }}
            >
              <Node state={m.state} />
            </li>
          ))}
        </ol>
      </div>
      <div aria-hidden className="relative h-4">
        {milestones.map((m, i) => (
          <span
            key={m.key}
            className={cn("numeric absolute top-0 text-xs whitespace-nowrap", labelAt(i, n).className, m.state === "locked" || m.state === "next" ? "text-muted-foreground" : "text-foreground")}
            style={labelAt(i, n).style}
          >
            {formatNumber(m.target)}
          </span>
        ))}
      </div>
    </div>
  );
}

/** A step's node: a check once reached, a glowing gift while its reward waits, a ring for the next, a lock beyond. */
function Node({ state }: { state: MilestoneState }) {
  return (
    <span
      className={cn(
        "relative grid size-8 place-items-center rounded-full border-2 shadow-sm",
        state === "claimed" && "border-success bg-card text-success",
        state === "done" && "border-primary bg-primary text-primary-foreground",
        state === "claimable" && "border-primary bg-primary text-primary-foreground",
        state === "next" && "border-primary bg-card text-primary",
        state === "locked" && "border-border bg-secondary text-muted-foreground",
      )}
    >
      {state === "claimable" && <span aria-hidden className="absolute inset-0 animate-ping rounded-full bg-primary/50 motion-reduce:animate-none" />}
      <Icon
        name={state === "claimable" ? "gift" : state === "locked" ? "lock" : state === "next" ? "flag" : "check"}
        size="xs"
        className="relative"
      />
    </span>
  );
}
