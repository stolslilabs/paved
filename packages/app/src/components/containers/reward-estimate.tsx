import type { RewardEstimate } from "@paved/game-core";
import { Amount } from "../elements/amount";
import { InlineError, type ErrorDetail } from "../elements/inline-error";
import { formatPoints } from "../elements/score";
import { Button } from "../ui/button";
import { Skeleton } from "../ui/skeleton";

export interface RewardEstimateProps {
  /** The reward by score of a purchase now (`estimateReward`, #705); null while its quotes are read. */
  estimate: RewardEstimate | null;
  /** A quote it is built on could not be read (the pool's, the guard's rate): why. Retry reads them again. */
  error?: string | null;
  errorDetail?: ErrorDetail;
  onRetry?: () => void;
}

/** The rows a loading estimate keeps the place of: the winning score, three multiples, the cap. */
const PLACEHOLDER_ROWS = 5;

/**
 * The Terms card's estimate of what a score earns at the stake picked (#705): the winning score's reward (the least a winning
 * game earns), a few scores above it, and the score from which the cap is paid. Every figure is an estimate (`≈`): `R` is
 * fixed by the swap at purchase, and the game is settled against its day's mean, not today's threshold.
 */
export function RewardEstimateTable({ estimate, error, errorDetail, onRetry }: RewardEstimateProps) {
  if (error) {
    return (
      <InlineError
        title="The reward cannot be estimated"
        message={error}
        detail={errorDetail}
        action={onRetry && <Button variant="outline" onClick={onRetry}>Retry</Button>}
      />
    );
  }
  return (
    <div className="flex flex-col gap-2" aria-busy={estimate === null}>
      <table className="w-full text-sm">
        <caption className="pb-1 text-left text-xs text-muted-foreground">Estimated reward by score</caption>
        <thead className="sr-only">
          <tr>
            <th scope="col">Score</th>
            <th scope="col">Reward</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {estimate === null
            ? Array.from({ length: PLACEHOLDER_ROWS }, (_, i) => (
                <tr key={i}>
                  <td className="py-1"><Skeleton className="h-4 w-16" /></td>
                  <td className="py-1"><Skeleton className="ml-auto h-4 w-24" /></td>
                </tr>
              ))
            : (
              <>
                {estimate.rows.map((row, i) => (
                  <tr key={row.score}>
                    <th scope="row" className="py-1 text-left font-normal">
                      <span className="numeric">{formatPoints(row.score)}</span>
                      {i === 0 && <span className="text-xs text-muted-foreground"> to win</span>}
                    </th>
                    <td className="py-1 text-right">
                      <span className="text-muted-foreground">≈ </span>
                      <Amount value={row.reward} token="paved" icon={false} />
                    </td>
                  </tr>
                ))}
                <tr>
                  <th scope="row" className="py-1 text-left font-normal">
                    <span className="numeric">{formatPoints(estimate.capScore)}</span>
                    <span className="numeric">+</span>
                    <span className="text-xs text-muted-foreground"> cap</span>
                  </th>
                  <td className="py-1 text-right text-primary">
                    <span className="text-muted-foreground">≈ </span>
                    <Amount value={estimate.capReward} token="paved" icon={false} />
                  </td>
                </tr>
              </>
            )}
        </tbody>
      </table>
      <p className="text-xs text-muted-foreground">
        Estimates: the reward is fixed by the swap when you buy, and your game is settled against its day's mean, not
        today's threshold. No more than the cap, whatever the score.
        {estimate?.guardBinds && " The pool pays more than the price guard's rate now: the reward counts at most 110 % of it."}
      </p>
    </div>
  );
}
