import { useLayoutEffect, useRef, useState, type RefObject } from "react";
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

/** A line's height (`min-h-11`), and the panel's frame around its lines: its border, its padding and the header (2 + 8 + 20). */
const LINE_PX = 44;
const FRAME_PX = 30;

/**
 * How many of `total` lines fit (#978, with #973's social column): in the home's left column (the scroll region the panel stands
 * in), the room left by the other controls, the social column counted at its minimum height since it shrinks first (#973); at
 * least one line, every line where there is no such column or nothing is laid out (a story of the panel, the render tests). Read
 * again whenever the column, or one of its controls, changes size (the score unfolded, the shield's plate, a chip).
 */
function useLinesThatFit(ref: RefObject<HTMLElement | null>, total: number): number {
  const [fit, setFit] = useState(total);
  useLayoutEffect(() => {
    const panel = ref.current;
    const column = panel?.closest<HTMLElement>("[data-slot=scroll-region]");
    if (!panel || !column || typeof ResizeObserver !== "function") return setFit(total);
    const measure = () => {
      const style = getComputedStyle(column);
      const inner = column.clientHeight - parseFloat(style.paddingTop) - parseFloat(style.paddingBottom);
      if (inner <= 0) return setFit(total);
      const shown = [...column.children].filter((c): c is HTMLElement => c instanceof HTMLElement && c.getClientRects().length > 0);
      const others = shown
        .filter((c) => c !== panel)
        .reduce((sum, c) => {
          // A control that shrinks before the column scrolls (the social column, #973) counts at its minimum.
          const own = getComputedStyle(c);
          const min = parseFloat(own.minHeight);
          return sum + (own.flexShrink !== "0" && min > 0 ? Math.min(min, c.offsetHeight || min) : c.offsetHeight);
        }, 0);
      const gaps = (parseFloat(style.rowGap) || 0) * Math.max(0, shown.length - 1);
      setFit(Math.max(1, Math.min(total, Math.floor((inner - others - gaps - FRAME_PX) / LINE_PX))));
    };
    measure();
    const resize = new ResizeObserver(measure);
    const watch = () => {
      resize.disconnect();
      resize.observe(column);
      for (const c of column.children) if (c !== panel) resize.observe(c);
    };
    watch();
    const children = new MutationObserver(() => {
      watch();
      measure();
    });
    children.observe(column, { childList: true });
    return () => {
      resize.disconnect();
      children.disconnect();
    };
  }, [ref, total]);
  return Math.min(fit, total);
}

/** A line's button: a 44 px touch target, its icon and two rows (the title; the bar or Claim). */
const LINE = "state-layer flex min-h-11 w-full items-center gap-2 rounded-lg px-1.5 py-1 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring";

/**
 * MISSIONS-TRACKER (#978, the owner's decisions of 2026-11-01): the home's preview of the three missions closest to done, the
 * Tutorial's step first, in place of the Missions button (open point 1). A small panel: "Missions" and the button's count on its
 * corner, then a line per mission (its icon and title on one line with an ellipsis, under them a thin bar and "3 / 5", or Claim
 * for a Tutorial step done and not claimed). A tap on a line opens the Missions page with that mission on the card. With nothing
 * left, one line: "All done" and the countdown to the day's reset. In the home's left column, short of room (a short phone; from
 * `desktop` shielded with the score unfolded, beside the social column, #973), it shows the lines that fit, the first ones, down
 * to one, before the column scrolls (`useLinesThatFit`). Its own chunk, loaded after the home (the scene shows
 * `TRACKER_STAND_IN` meanwhile, its size); the bars fill with a CSS transition that reduced motion turns off (`Progress`).
 */
export function MissionsTracker({ state, badge = 0, now, onOpen, className }: MissionsTrackerProps) {
  const ref = useRef<HTMLElement>(null);
  const lines = !state ? TRACKER_LINES : state.kind === "lines" ? state.lines.length : 1;
  const fit = useLinesThatFit(ref, lines);
  return (
    <nav ref={ref} aria-label={badge > 0 ? `Missions, ${badge} waiting` : "Missions"} data-slot="missions-tracker" data-lines={fit} className={cn(PANEL, className)}>
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
          {Array.from({ length: fit }, (_, i) => (
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
          {state.lines.slice(0, fit).map((line) => (
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
