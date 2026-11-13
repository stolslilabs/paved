import type { ScoredStructure } from "@paved/chain";
import { TOURNAMENT_COBBLES, TOURNAMENT_ROUNDS, formatInteger, tournamentRoundDay, tournamentRoundName, type GameStats } from "@paved/game-core";
import type { TournamentGameResult } from "../../data/tournament-source";
import { cn } from "../../lib/utils";
import { TokenIcon } from "../elements/token-icon";
import { UiIcon } from "../elements/ui-icon";
import { EndMark, GameEnd } from "./game-end";
import { ClosedBoxes, ClosingList } from "./training-end";

/** A row's large figure and its line under it, the Puzzle end's. */
const FIGURE = "text-outline text-4xl leading-none font-bold tabular-nums";
const UNDER = "text-outline text-lg leading-tight font-bold text-muted-foreground tabular-nums wrap-anywhere";

export interface TournamentEndProps {
  score: number;
  /** The game's standing in its duel; none while it is read (the rows wait). */
  result: TournamentGameResult | null;
  stats?: GameStats;
  closings: readonly ScoredStructure[];
  closingsNote?: string;
  /** The trophy in at once (reduced motion, the scores shown again from the board). */
  instant?: boolean;
  /** The window's cross: the scores close on the final board. None: no board to show. */
  onClose?: () => void;
  /** Back to the tournament's view. */
  onTournament?: () => void;
}

/**
 * How a finished game stands, in the verdict's words. The duel is settled before midnight once the opponent's game is over too (one
 * game each): "THROUGH" or "OUT", "CHAMPION" in the final. While their game is open or to come: "AHEAD", "BEHIND", or "PLAYED".
 */
export function tournamentVerdict(result: TournamentGameResult): { verdict: string; through: boolean | null } {
  const settled = result.standing === "won" || result.standing === "lost" || !result.opponent || (result.theirs?.over ?? false);
  const ahead = result.standing === "won" || result.standing === "ahead";
  if (result.standing === "waiting") return { verdict: "PLAYED", through: null };
  if (!settled) return { verdict: ahead ? "AHEAD" : "BEHIND", through: null };
  return { verdict: !ahead ? "OUT" : result.round >= TOURNAMENT_ROUNDS ? "CHAMPION" : "THROUGH", through: ahead };
}

/**
 * A Tournament game's end (the weekly individual event, in the Puzzle end's family, `GameEnd`): the window over the final board,
 * crowned by the trophy, its gold the score's share of the opponent's (lit once through). The verdict (`tournamentVerdict`) and the
 * round under it. The carved card's rows: the score against the opponent's (or that they have not played yet), and the Cobbles: what
 * going through secures, or the round's own once out. The closed structures and every closing, as Training's; the tournament's view
 * at the foot: one game a round, no next game.
 */
export function TournamentEnd({ score, result, stats, closings, closingsNote, instant, onClose, onTournament }: TournamentEndProps) {
  const { verdict, through } = result ? tournamentVerdict(result) : { verdict: "GAME OVER", through: null };
  const theirs = result?.theirs ?? null;
  const fill = through ? 1 : theirs && theirs.score > 0 ? Math.min(0.96, Math.max(0, score / theirs.score)) : 0;
  const name = result?.opponent?.name ?? null;
  const scoreLine = result === null ? "…" : !result.opponent ? "Nobody opposite: through by playing" : theirs ? `${name} · ${formatInteger(theirs.score)}${theirs.over ? "" : " in play"}` : `${name} has not played yet`;
  const cobbles = result === null ? null : through === false ? TOURNAMENT_COBBLES[result.round - 1]! : result.secures;
  const cobblesLine = result === null ? "…" : through === false ? `Cobbles, claimed from ${tournamentRoundDay((result.round + 1) % 7)}` : through ? "Cobbles secured" : "Cobbles if you go through";
  const rows = [
    <section key="score" aria-label="Score" data-through={through ?? undefined} className="flex min-w-0 flex-1 items-center gap-3">
      <UiIcon name="star" px={72} className="drawer-icon m-1 size-18 shrink-0" />
      <span className="flex min-w-0 flex-1 flex-col gap-1.5">
        <span data-testid="score-value" className={cn(FIGURE, through ? "text-primary" : "text-foreground")}>
          {formatInteger(score)}
        </span>
        <span className={UNDER}>{scoreLine}</span>
      </span>
    </section>,
    <section key="cobbles" aria-label="Cobbles" className="flex min-w-0 flex-1 items-center gap-3">
      <span className="grid size-20 shrink-0 place-items-center">
        <TokenIcon kind="cobbles" size="md" className="size-14" px={56} />
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-1.5">
        <span data-testid="cobbles-value" className={cn(FIGURE, through ? "text-primary" : "text-foreground")}>
          {cobbles === null ? "—" : formatInteger(cobbles)}
        </span>
        <span className={UNDER}>{cobblesLine}</span>
      </span>
    </section>,
  ];
  return (
    <GameEnd
      mark={<EndMark name="trophy" fill={fill} reached={through === true} instant={instant} label={through ? "Trophy: through" : theirs ? `Trophy: ${Math.round(fill * 100)}% of your opponent's score` : "Trophy"} />}
      verdict={verdict}
      subtitle={result ? `Tournament · ${tournamentRoundName(result.round)}` : "Tournament"}
      rows={rows}
      primary={{ label: "The tournament", onClick: onTournament }}
      onClose={onClose}
    >
      <ClosedBoxes stats={stats} closings={closings} />
      <div className="w-full py-1.5">
        <ClosingList closings={closings} stats={stats} note={closingsNote} />
      </div>
    </GameEnd>
  );
}
