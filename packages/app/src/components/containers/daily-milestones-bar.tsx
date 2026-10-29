import { useCallback, useRef, useState } from "react";
import { DAILY_MILESTONES, DAILY_QUESTS, dailyMilestoneStates, type DailyMilestoneState } from "@paved/game-core";
import { cn } from "../../lib/utils";
import { Icon } from "../ui/icon";
import { SpinnerIcon } from "../ui/icons";
import { Cobbles } from "../elements/cobbles";
import { CobblesBurst } from "../elements/cobbles-burst";

export interface DailyMilestonesBarProps {
  /** Today's dailies done, 0 to `DAILY_QUESTS`. */
  done: number;
  /**
   * Bit `step` per milestone claimed today (`DailyMilestonesView.claimed`); null: the milestones are not served here (the chain
   * before #738), so none can be claimed.
   */
  claimed: number | null;
  /** The milestone (its step) whose claim is on its way. */
  claiming?: number | null;
  /** False: no claim now (no wallet to sign, or another claim on its way). */
  canClaim?: boolean;
  onClaim?: (step: number) => void;
  /** False: the Cobbles are not read here (the ledger unreadable, or before Cobbles): the plain nodes alone, no reward. */
  rewards?: boolean;
  className?: string;
}

const plural = (n: number) => (n === 1 ? "daily" : "dailies");

/** The node `at` (dailies done) on the line: the full nodes' half width in from each end, the nodes evenly between. */
const left = (at: number) => `calc(1.75rem + (100% - 3.5rem) * ${at / DAILY_QUESTS})`;

/**
 * The day's milestones as a graph (#869, the owner's rework of 2026-10-29): `DAILY_QUESTS + 1` nodes on a line, one edge per daily
 * between two, lit once that daily is done. A node that carries a reward (3 done: +10 Cobbles, 5 done: +15, `DAILY_MILESTONES`) is
 * the full node, its Cobbles on it; the others are plain and small, filled once reached. A milestone reached is claimed with a tap
 * on its node, then shows a check; its Cobbles burst into the balance's plate (`CobblesBurst`, nothing moves under reduced motion).
 * The graph is still: only the claim moves. The edges are the progress bar (`role="progressbar"`), the nodes a list beside it.
 */
export function DailyMilestonesBar({ done, claimed, claiming = null, canClaim = true, onClaim, rewards = true, className }: DailyMilestonesBarProps) {
  const states = dailyMilestoneStates(done, claimed ?? 0);
  const count = Math.min(Math.max(done, 0), DAILY_QUESTS);
  const nodes = useRef<(HTMLElement | null)[]>([]);
  // A claim seen landing here (its bit set while this graph is shown) bursts once; a day read already claimed does not.
  const [seen, setSeen] = useState(claimed);
  const [burst, setBurst] = useState<number | null>(null);
  if (claimed !== seen) {
    setSeen(claimed);
    const landed = DAILY_MILESTONES.findIndex((_, step) => states[step] === "claimed" && ((seen ?? 0) & (1 << step)) === 0);
    if (seen !== null && landed >= 0) setBurst(landed);
  }
  const ended = useCallback(() => setBurst(null), []);
  const from = useCallback(() => (burst === null ? null : (nodes.current[burst] ?? null)), [burst]);

  return (
    <div data-graph="daily-milestones" className={cn("relative", rewards ? "h-19" : "h-6", className)}>
      <div
        role="progressbar"
        aria-label="Dailies done today"
        aria-valuemin={0}
        aria-valuemax={DAILY_QUESTS}
        aria-valuenow={count}
        aria-valuetext={`${count} of ${DAILY_QUESTS} ${plural(DAILY_QUESTS)} done`}
        className={cn("absolute inset-x-7 grid -translate-y-1/2", rewards ? "top-7" : "top-3")}
        style={{ gridTemplateColumns: `repeat(${DAILY_QUESTS}, minmax(0, 1fr))` }}
      >
        {Array.from({ length: DAILY_QUESTS }, (_, i) => (
          <span key={i} data-step={i + 1} data-done={i < count || undefined} className={cn("h-1", i < count ? "bg-primary" : "bg-input")} />
        ))}
      </div>
      <ol aria-label="Daily milestones">
        {Array.from({ length: DAILY_QUESTS + 1 }, (_, at) => {
          const step = rewards ? DAILY_MILESTONES.findIndex((milestone) => milestone.done === at) : -1;
          const milestone = DAILY_MILESTONES[step];
          return (
            <li
              key={at}
              ref={(el) => {
                if (step >= 0) nodes.current[step] = el;
              }}
              aria-hidden={milestone ? undefined : true}
              className={cn("absolute top-0 flex -translate-x-1/2 justify-center", milestone ? "w-14" : rewards ? "h-14 w-3" : "h-6 w-3")}
              style={{ left: left(at) }}
            >
              {milestone ? (
                <RewardNode
                  cobbles={milestone.cobbles}
                  at={at}
                  state={states[step]!}
                  claiming={claiming === step}
                  disabled={claimed === null || !canClaim || (claiming !== null && claiming !== step)}
                  onClaim={() => onClaim?.(step)}
                />
              ) : (
                <span data-node={at} data-reached={at <= count || undefined} className="flex items-center">
                  <span className={cn("size-3 rounded-full border-2", at <= count ? "border-primary bg-primary" : "border-input bg-background")} />
                </span>
              )}
            </li>
          );
        })}
      </ol>
      {burst !== null && <CobblesBurst key={burst} from={from} onDone={ended} />}
    </div>
  );
}

interface RewardNodeProps {
  cobbles: number;
  /** The dailies done that reach it. */
  at: number;
  state: DailyMilestoneState;
  claiming: boolean;
  disabled: boolean;
  onClaim: () => void;
}

/** A reward's full node: its Cobbles on it, a caption under it (how far, then Claim once reached, then a check once claimed). */
function RewardNode({ cobbles, at, state, claiming, disabled, onClaim }: RewardNodeProps) {
  const reach = `${at} ${plural(at)} done`;
  const disc = (
    <span
      aria-hidden
      className={cn(
        "relative grid size-14 shrink-0 place-items-center rounded-full border-2 bg-card",
        state === "claimable" ? "border-primary bg-linear-to-b from-primary/20 to-primary/10 shadow-lg shadow-glow" : state === "claimed" ? "border-primary" : "border-input",
      )}
    >
      <span className="group-disabled:opacity-60">
        {claiming ? <SpinnerIcon className="size-4 animate-spin" /> : <Cobbles value={cobbles} sign="+" size="sm" tone={state === "locked" ? "muted" : "default"} />}
      </span>
      {state === "claimed" && (
        <span className="absolute -top-0.5 -right-0.5 grid size-5 place-items-center rounded-full bg-success text-background">
          <Icon name="check" size="xs" />
        </span>
      )}
    </span>
  );
  if (state === "claimable") {
    return (
      <button
        type="button"
        data-milestone={at}
        data-state={state}
        disabled={disabled || claiming}
        aria-busy={claiming || undefined}
        aria-label={`Claim ${cobbles} Cobbles: ${reach}`}
        onClick={onClaim}
        className="group flex cursor-pointer flex-col items-center gap-1 rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-default"
      >
        {disc}
        <span className="text-xs leading-4 font-semibold text-primary group-disabled:opacity-60">Claim</span>
      </button>
    );
  }
  const claimed = state === "claimed";
  return (
    <span
      role="img"
      data-milestone={at}
      data-state={state}
      aria-label={claimed ? `${cobbles} Cobbles claimed: ${reach}` : `${cobbles} Cobbles at ${reach}`}
      className="flex flex-col items-center gap-1"
    >
      {disc}
      <span aria-hidden className={cn("text-xs leading-4", claimed ? "font-semibold text-success" : "numeric text-muted-foreground")}>
        {claimed ? "Claimed" : `${at}/${DAILY_QUESTS}`}
      </span>
    </span>
  );
}
