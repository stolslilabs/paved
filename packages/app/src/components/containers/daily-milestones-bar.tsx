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
  /** False: the Cobbles are not read here (the ledger unreadable, or before Cobbles): the steps alone, no marker. */
  rewards?: boolean;
  className?: string;
}

const plural = (n: number) => (n === 1 ? "daily" : "dailies");

/**
 * The day's progress bar (#869, the owner's decisions of 2026-10-28): one step per daily done, `DAILY_QUESTS` in all, and a
 * reward marker under each milestone's step (3: +10 Cobbles, 5: +15, `DAILY_MILESTONES`). A milestone reached is claimed with a
 * tap on its marker, then shows a check; its Cobbles burst into the balance's plate (`CobblesBurst`, nothing moves under reduced
 * motion). The steps are still: only the claim moves.
 */
export function DailyMilestonesBar({ done, claimed, claiming = null, canClaim = true, onClaim, rewards = true, className }: DailyMilestonesBarProps) {
  const states = dailyMilestoneStates(done, claimed ?? 0);
  const count = Math.min(Math.max(done, 0), DAILY_QUESTS);
  const markers = useRef<(HTMLElement | null)[]>([]);
  // A claim seen landing here (its bit set while this bar is shown) bursts once; a day read already claimed does not.
  const [seen, setSeen] = useState(claimed);
  const [burst, setBurst] = useState<number | null>(null);
  if (claimed !== seen) {
    setSeen(claimed);
    const landed = DAILY_MILESTONES.findIndex((_, step) => states[step] === "claimed" && ((seen ?? 0) & (1 << step)) === 0);
    if (seen !== null && landed >= 0) setBurst(landed);
  }
  const ended = useCallback(() => setBurst(null), []);
  const from = useCallback(() => (burst === null ? null : (markers.current[burst] ?? null)), [burst]);

  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <div
        role="progressbar"
        aria-label="Dailies done today"
        aria-valuemin={0}
        aria-valuemax={DAILY_QUESTS}
        aria-valuenow={count}
        aria-valuetext={`${count} of ${DAILY_QUESTS} ${plural(DAILY_QUESTS)} done`}
        className="grid gap-1"
        style={{ gridTemplateColumns: `repeat(${DAILY_QUESTS}, minmax(0, 1fr))` }}
      >
        {Array.from({ length: DAILY_QUESTS }, (_, i) => (
          <span key={i} data-step={i + 1} data-done={i < count || undefined} className={cn("h-2 rounded-full", i < count ? "bg-primary" : "bg-input")} />
        ))}
      </div>
      {rewards && (
        <ol className="grid gap-1" style={{ gridTemplateColumns: `repeat(${DAILY_QUESTS}, minmax(0, 1fr))` }}>
          {DAILY_MILESTONES.map((milestone, step) => (
            <li
              key={milestone.done}
              ref={(el) => {
                markers.current[step] = el;
              }}
              className="flex justify-end"
              style={{ gridColumn: milestone.done }}
            >
              <Marker
                cobbles={milestone.cobbles}
                at={milestone.done}
                state={states[step]!}
                claiming={claiming === step}
                disabled={claimed === null || !canClaim || (claiming !== null && claiming !== step)}
                onClaim={() => onClaim?.(step)}
              />
            </li>
          ))}
        </ol>
      )}
      {burst !== null && <CobblesBurst key={burst} from={from} onDone={ended} />}
    </div>
  );
}

interface MarkerProps {
  cobbles: number;
  /** The dailies done that reach it. */
  at: number;
  state: DailyMilestoneState;
  claiming: boolean;
  disabled: boolean;
  onClaim: () => void;
}

/** A milestone's reward under its step: its Cobbles, then a tap to claim once reached, then a check. */
function Marker({ cobbles, at, state, claiming, disabled, onClaim }: MarkerProps) {
  const reach = `${at} ${plural(at)} done`;
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
        className="flex min-h-11 cursor-pointer flex-col items-end justify-center rounded-lg border border-primary bg-primary/15 px-2 shadow-lg outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-default disabled:opacity-60"
      >
        <span className="inline-flex items-center gap-1">
          {claiming && <SpinnerIcon aria-hidden className="size-3 animate-spin" />}
          <Cobbles value={cobbles} sign="+" size="sm" />
        </span>
        <span aria-hidden className="text-xs leading-tight font-semibold text-primary">
          Claim
        </span>
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
      className="flex min-h-11 flex-col items-end justify-center px-2"
    >
      <span aria-hidden className="inline-flex items-center gap-1">
        {claimed && (
          <span className="grid size-4 place-items-center rounded-full bg-success text-background">
            <Icon name="check" size="xs" />
          </span>
        )}
        <Cobbles value={cobbles} sign="+" size="sm" tone={claimed ? "default" : "muted"} />
      </span>
      <span aria-hidden className="numeric text-xs leading-tight text-muted-foreground">
        {at}/{DAILY_QUESTS}
      </span>
    </span>
  );
}
