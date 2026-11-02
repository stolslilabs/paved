import { formatCompact, formatInteger } from "@paved/game-core";
import { cn } from "../../lib/utils";
import { Countdown } from "../elements/countdown";
import { GameIcon } from "../elements/game-icon";
import { Icon } from "../ui/icon";
import { Progress } from "../ui/progress";
import { Skeleton } from "../ui/skeleton";
import { TRACKER_LINES, type MissionKey, type TrackerLine, type TrackerState } from "./missions-tracker-lines";

export interface MissionsTrackerProps {
  /** What the tracker shows (`trackerState`); null or omitted: not read yet, a skeleton of its size. */
  state?: TrackerState | null;
  /** What waits to be claimed on the Missions page (the Missions button's count, #976, #977): on the panel's corner. */
  badge?: number;
  /** Seconds since the epoch, the scene's clock: "All done"'s countdown. */
  now: number;
  /** A tap on a line: the Missions page with that mission on the card; on "All done" or the plain line, the page as it opens. */
  onOpen?: (mission?: MissionKey) => void;
  className?: string;
}

/** A count as a line shows it: whole below 10,000, compact above ("12.4K"), so the bar keeps its room. */
const figure = (n: number) => (n >= 10_000 ? formatCompact(n) : formatInteger(n));

/** The panel's box: the League control's width at most (#978's point 5: 160 px, 176 from `desktop`, under its 167 and 180 with a
 * crown count), so it never reaches the middle of the village. */
const PANEL = "relative w-40 rounded-xl border border-border bg-card/90 p-1 shadow-lg backdrop-blur desktop:w-44";

/** A line's button: a 44 px touch target, its icon and two rows (the title; the bar or Claim). */
const LINE = "state-layer flex min-h-11 w-full items-center gap-2 rounded-lg px-1.5 py-1 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring";

/**
 * MISSIONS-TRACKER (#978, the owner's decisions of 2026-11-01): the home's preview of the three missions closest to done, the
 * Tutorial's step first, in place of the Missions button (open point 1). A small panel: "Missions" and the button's count on its
 * corner, then a line per mission (its icon and title on one line with an ellipsis, under them a thin bar and "3 / 5", or Claim
 * for a Tutorial step done and not claimed). A tap on a line opens the Missions page with that mission on the card. With nothing
 * left, one line: "All done" and the countdown to the day's reset. No fold (open point 4's default): every line, always
 * (three while three missions are left); short of room the home's left column scrolls, or from `desktop` the social column moves
 * beside it (`home-village-scene.tsx`). Its own chunk, loaded after the home (the scene shows
 * `TRACKER_STAND_IN` meanwhile, its size); the bars fill with a CSS transition that reduced motion turns off (`Progress`).
 */
export function MissionsTracker({ state, badge = 0, now, onOpen, className }: MissionsTrackerProps) {
  return (
    <nav aria-label={badge > 0 ? `Missions, ${badge} waiting` : "Missions"} data-slot="missions-tracker" className={cn(PANEL, className)}>
      <div aria-hidden className="flex h-5 items-center gap-1.5 px-1.5 text-xs font-semibold">
        <GameIcon name="scroll" size="sm" />
        Missions
      </div>
      {badge > 0 && (
        <span aria-hidden className="numeric absolute -top-1.5 -right-1.5 grid min-w-5 place-items-center rounded-full bg-primary px-1 text-xs font-semibold text-primary-foreground">
          {badge}
        </span>
      )}
      {!state ? (
        <div role="status" aria-label="Loading the missions" className="flex flex-col">
          {Array.from({ length: TRACKER_LINES }, (_, i) => (
            <div key={i} className="flex min-h-11 items-center gap-2 px-1.5 py-1">
              <Skeleton className="size-4 rounded-full" />
              <span className="flex flex-1 flex-col gap-1.5">
                <Skeleton className="h-3 w-3/4" />
                <Skeleton className="h-1 w-full" />
              </span>
            </div>
          ))}
        </div>
      ) : state.kind === "lines" ? (
        <ul className="flex flex-col">
          {state.lines.map((line) => (
            <li key={line.key}>
              <Line line={line} onOpen={onOpen} />
            </li>
          ))}
        </ul>
      ) : state.kind === "done" ? (
        <button type="button" onClick={() => onOpen?.()} aria-label="All done: open the missions" className={LINE}>
          <Icon name="circle-check" size="sm" fixedWidth className="text-success" />
          <span className="flex min-w-0 flex-1 flex-col gap-0.5">
            <span className="truncate text-xs leading-4 font-semibold">All done</span>
            <Countdown expiresAt={state.resetsAt} now={now} label="Missions reset in" hideLabel className="leading-4 [&_svg]:size-3" />
          </span>
        </button>
      ) : (
        <button type="button" onClick={() => onOpen?.()} aria-label="Open the missions" className={LINE}>
          <Icon name="scroll" size="sm" fixedWidth className="text-primary" />
          <span className="truncate text-xs leading-4 font-semibold">See your missions</span>
        </button>
      )}
    </nav>
  );
}

/** A mission's line: its icon and title, then its bar and count, or Claim. */
function Line({ line, onOpen }: { line: TrackerLine; onOpen?: (mission?: MissionKey) => void }) {
  const progress = `${figure(line.count)} / ${figure(line.total)}`;
  const value = line.total > 0 ? Math.min(100, (line.count / line.total) * 100) : 0;
  return (
    <button
      type="button"
      onClick={() => onOpen?.(line.key)}
      aria-label={line.claim ? `${line.title}: done, ready to claim` : `${line.title}: ${formatInteger(line.count)} of ${formatInteger(line.total)}`}
      data-mission={line.key}
      className={LINE}
    >
      <Icon name={line.icon} size="sm" fixedWidth className="text-primary" />
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="truncate text-xs leading-4 font-semibold">{line.title}</span>
        {line.claim ? (
          <span className="flex h-4 items-center">
            <span className="rounded-full bg-primary px-2 text-xs leading-4 font-semibold text-primary-foreground">Claim</span>
          </span>
        ) : (
          <span className="flex h-4 items-center gap-1.5">
            <Progress value={value} aria-hidden className="h-1 min-w-6 flex-1" />
            <span className="numeric text-xs leading-4 whitespace-nowrap text-muted-foreground">{progress}</span>
          </span>
        )}
      </span>
    </button>
  );
}

export default MissionsTracker;
