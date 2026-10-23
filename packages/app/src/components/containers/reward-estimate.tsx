import { capScore, rewardOf, winningScore } from "@paved/game-core";
import { cn } from "../../lib/utils";
import { Amount } from "../elements/amount";
import { formatPoints } from "../elements/score";

export interface RewardEstimateProps {
  /** `R`, PAVED base units, as a purchase of this stake would store it now; null while it is read (the figures wait). */
  reference: bigint | null;
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
 */
export function RewardEstimate({ reference, threshold, slopeBps, cap, className }: RewardEstimateProps) {
  const marks = rewardMarks(threshold, slopeBps, cap);
  const ceiling = UNIT * BigInt(cap);
  return (
    <table aria-label="Estimated reward by score" aria-busy={reference === null} className={cn("w-full table-fixed border-collapse text-sm", className)}>
      <thead>
        <tr className="text-xs text-muted-foreground">
          <th scope="col" className="w-[38%] pb-1 text-left font-normal">
            Score
          </th>
          <th scope="col" className="pb-1 font-normal">
            <span className="sr-only">Share of the cap</span>
          </th>
          <th scope="col" className="w-[42%] pb-1 text-right font-normal">
            Reward ≈
          </th>
        </tr>
      </thead>
      <tbody>
        {marks.map(({ score, capped }) => {
          const share = rewardOf(UNIT, score, threshold, slopeBps, cap);
          const width = ceiling === 0n ? 0 : Number((share * 1_000n) / ceiling) / 10;
          return (
            <tr key={score} data-capped={capped || undefined}>
              <td className="py-1">
                {/* "max" goes under a score too wide for both (WRAP360). */}
                <span className="flex flex-wrap items-baseline gap-x-1.5">
                  <span className="numeric">
                    {formatPoints(score)}
                    {capped && "+"}
                  </span>
                  {capped && <span className="text-xs text-primary">max</span>}
                </span>
              </td>
              <td className="px-2 py-1" aria-hidden>
                <span className="block h-1.5 overflow-hidden rounded-full bg-secondary">
                  <span className="block h-full rounded-full bg-primary" style={{ width: `${width}%` }} />
                </span>
              </td>
              <td className="py-1 text-right">
                {reference === null ? (
                  <span className="numeric text-muted-foreground">…</span>
                ) : (
                  <Amount value={rewardOf(reference, score, threshold, slopeBps, cap)} token="paved" icon={false} className="justify-end" />
                )}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
