import { capScore, rewardOf, winningScore } from "@paved/game-core";
import { cn } from "../../lib/utils";
import { Amount } from "../elements/amount";
import { formatPoints } from "../elements/score";

export interface RewardEstimateProps {
  /** `R`, PAVED base units, as a purchase of this stake would store it now; null while it is read (the figures wait). */
  reference: bigint | null;
  /** `R` cannot be read (a failed quote, `PurchaseScene` says why): the figures show "—", not busy. */
  unavailable?: boolean;
  /** Points x 1,000 (`QuoteView.threshold`). */
  threshold: number;
  /** `c`, bps (`QuoteView.slope`). */
  slopeBps: number;
  /** `H` (`QuoteView.cap`). */
  cap: number;
  className?: string;
}

/** The scores shown between the threshold and the cap, as multiples of the threshold. */
const STEPS = [1, 1.25, 1.5, 2] as const;
/** A unit `R` for the bars: each row's reward over the cap's, whatever the real `R`. */
const UNIT = 10n ** 18n;

/**
 * The rows of the table: the winning score, a few scores above it, then the score from which the cap is paid. A step at or
 * past the cap's score is left out, so the cap is the last row whatever `c` and `H`.
 */
export function rewardMarks(threshold: number, slopeBps: number, cap: number): { score: number; capped: boolean }[] {
  const least = winningScore(threshold);
  const top = capScore(threshold, slopeBps, cap);
  const steps = [...new Set(STEPS.map((step) => Math.ceil(least * step)))].filter((score) => score < top);
  return [...steps.map((score) => ({ score, capped: false })), { score: top, capped: true }];
}

/**
 * The reward a game of this stake would earn by score (#705), from `curve::payout`: nothing under the threshold, `R x c` at
 * it, growing with the score, capped at `R x H`. Estimates: the swap at purchase fixes `R`, and the day's mean fixes the
 * threshold when the day closes. Each bar is the row's share of the cap, which does not depend on `R`: the bars stand while
 * the figures wait.
 *
 * A table by its roles on `StatRow`'s grid: the score and reward columns take their content's width while it fits, the bar
 * the rest (2.5rem at least); in a narrow column "max" goes under its score and the symbol under its figure (WRAP360). The
 * bars are decorative: the table reads as score and reward.
 */
export function RewardEstimate({ reference, unavailable = false, threshold, slopeBps, cap, className }: RewardEstimateProps) {
  const marks = rewardMarks(threshold, slopeBps, cap);
  const ceiling = UNIT * BigInt(cap);
  return (
    <div
      role="table"
      aria-label="Estimated reward by score"
      aria-busy={reference === null && !unavailable}
      className={cn("grid grid-cols-[auto_minmax(2.5rem,1fr)_auto] items-center gap-x-3 gap-y-2 text-sm", className)}
    >
      <div role="row" className="contents text-xs text-muted-foreground">
        <span role="columnheader">Score</span>
        <span aria-hidden />
        <span role="columnheader" className="text-right">
          Reward ≈
        </span>
      </div>
      {marks.map(({ score, capped }) => {
        const share = rewardOf(UNIT, score, threshold, slopeBps, cap);
        const width = ceiling === 0n ? 0 : Number((share * 1_000n) / ceiling) / 10;
        return (
          <div key={score} role="row" data-capped={capped || undefined} className="contents">
            <span role="cell" className="flex flex-wrap items-baseline gap-x-1.5">
              <span className="numeric">
                {formatPoints(score)}
                {capped && "+"}
              </span>
              {capped && <span className="text-xs text-primary">max</span>}
            </span>
            <span aria-hidden className="block h-1.5 overflow-hidden rounded-full bg-secondary">
              <span className="block h-full rounded-full bg-primary" style={{ width: `${width}%` }} />
            </span>
            <span role="cell" className="text-right">
              {reference === null ? (
                <span className="numeric text-muted-foreground">{unavailable ? "—" : "…"}</span>
              ) : (
                <Amount value={rewardOf(reference, score, threshold, slopeBps, cap)} token="paved" icon={false} className="justify-end" />
              )}
            </span>
          </div>
        );
      })}
    </div>
  );
}
