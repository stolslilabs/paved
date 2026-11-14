import type { ScoredStructure } from "@paved/chain";
import { FAIR_FLOOR, FAIR_TIERS, FAIR_TRIES, formatInteger, type GameStats } from "@paved/game-core";
import { cn } from "../../lib/utils";
import { UiIcon } from "../elements/ui-icon";
import { EndMark, GameEnd } from "./game-end";
import { ClosedBoxes, ClosingList } from "./training-end";
import type { FairTryResult } from "../../data/fair-source";

/** A row's large figure and its line under it, the Puzzle end's. */
const FIGURE = "text-outline text-4xl leading-none font-bold tabular-nums";
const UNDER = "text-outline text-lg leading-tight font-bold text-muted-foreground tabular-nums";

export interface FairEndProps {
  score: number;
  /** The try's effect on the player's best of the week and where that stands; none while it is read (the rows wait). */
  result: FairTryResult | null;
  stats?: GameStats;
  closings: readonly ScoredStructure[];
  closingsNote?: string;
  /** The trophy in at once (reduced motion, the scores shown again from the board). */
  instant?: boolean;
  /** The window's cross: the scores close on the final board. None: no board to show. */
  onClose?: () => void;
  /** Back to the Fair's view. */
  onFair?: () => void;
  /** The player's next try; shown while they have one left today. */
  onPlayAgain?: () => void;
}

/**
 * A Fair try's end (the weekly individual event, in the Puzzle end's family, `GameEnd`): the window over the final board, crowned by
 * the trophy, its gold the score's share of the player's best before (lit by a new best); "NEW BEST" when the try beats it (or is
 * their first), else "GAME OVER"; "Fair · try 2 of 3". The carved card's rows: the score (the best before → this score when beaten,
 * else the best that stands) and the best's place among the week's players with its tier (or the floor it has yet to reach). No
 * reward line: the week pays in Cobbles at its end. The closed structures and every closing, as Training's; the Fair's view and,
 * while a try is left today, the gold next try at the foot.
 */
export function FairEnd({ score, result, stats, closings, closingsNote, instant, onClose, onFair, onPlayAgain }: FairEndProps) {
  const late = result?.late ?? false;
  const newBest = !late && result !== null && (result.bestBefore === null || score > result.bestBefore);
  const fill = newBest ? 1 : result?.bestBefore ? Math.min(0.96, score / result.bestBefore) : 0;
  const scoreLine = late ? "Too late to count" : result === null ? "…" : newBest ? (result.bestBefore === null ? "Your first of this week" : `${formatInteger(result.bestBefore)} → ${formatInteger(score)}`) : `Best ${formatInteger(result.bestAfter ?? score)}`;
  const tier = result?.tier == null ? null : FAIR_TIERS[result.tier]!;
  const placeLine = result === null ? "…" : tier ? `${tier.name} · of ${formatInteger(result.players)}` : `Counts from ${formatInteger(FAIR_FLOOR)}`;
  const left = result?.left ?? 0;
  const rows = [
    <section key="score" aria-label="Score" data-new-best={newBest || undefined} className="flex min-w-0 flex-1 items-center gap-3">
      <UiIcon name="star" px={72} className="drawer-icon m-1 size-18 shrink-0" />
      <span className="flex min-w-0 flex-1 flex-col gap-1.5">
        <span data-testid="score-value" className={cn(FIGURE, newBest ? "text-primary" : "text-foreground")}>
          {formatInteger(score)}
        </span>
        <span className={UNDER}>{scoreLine}</span>
      </span>
    </section>,
    <section key="place" aria-label="Week's place" className="flex min-w-0 flex-1 items-center gap-3">
      <UiIcon name="trophy" px={72} className="drawer-icon m-1 size-18 shrink-0" />
      <span className="flex min-w-0 flex-1 flex-col gap-1.5">
        <span data-testid="place-value" className={cn(FIGURE, tier ? "text-primary" : "text-foreground")}>
          {result?.place == null ? "—" : `#${formatInteger(result.place)}`}
        </span>
        <span className={cn(UNDER, "wrap-anywhere")}>{placeLine}</span>
      </span>
    </section>,
  ];
  return (
    <GameEnd
      mark={<EndMark name="trophy" fill={fill} reached={newBest} instant={instant} label={newBest ? "Trophy: a new best" : result?.bestBefore ? `Trophy: ${Math.round(fill * 100)}% of your best` : "Trophy"} />}
      verdict={newBest ? "NEW BEST" : "GAME OVER"}
      subtitle={result ? `Fair · try ${result.try} of ${FAIR_TRIES}` : "Fair"}
      rows={rows}
      notes={left > 0 ? (
        <p data-slot="fair-tries-left" className="text-outline text-center text-sm font-bold text-muted-foreground">
          <span className="numeric text-foreground">{formatInteger(left)}</span> {left === 1 ? "try" : "tries"} left today
        </p>
      ) : undefined}
      secondary={left > 0 ? { label: "The Fair", onClick: onFair } : undefined}
      primary={left > 0 ? { label: "Again", onClick: onPlayAgain } : { label: "The Fair", onClick: onFair }}
      onClose={onClose}
    >
      <ClosedBoxes stats={stats} closings={closings} />
      <div className="w-full py-1.5">
        <ClosingList closings={closings} stats={stats} note={closingsNote} />
      </div>
    </GameEnd>
  );
}
