import type { ScoredStructure } from "@paved/chain";
import { JOUST_GAMES, formatInteger, type GameStats } from "@paved/game-core";
import { cn } from "../../lib/utils";
import { GuildEmblem } from "../elements/guild-emblem";
import { UiIcon } from "../elements/ui-icon";
import { EndMark, GameEnd } from "./game-end";
import { ClosedBoxes, ClosingList } from "./training-end";
import type { JoustGameResult, JoustGuild } from "../../data/joust-source";

/** A row's large figure and its line under it, the Puzzle end's. */
const FIGURE = "text-outline text-4xl leading-none font-bold tabular-nums";
const UNDER = "text-outline text-lg leading-tight font-bold text-muted-foreground tabular-nums";

export interface JoustEndProps {
  score: number;
  /** The game's effect on the player's best and their allegiance's total; none while it is read (the rows wait). */
  result: JoustGameResult | null;
  /** The player's allegiance: its emblem beside its total. Null: not read yet. */
  guild: JoustGuild | null;
  stats?: GameStats;
  closings: readonly ScoredStructure[];
  closingsNote?: string;
  /** The trophy in at once (reduced motion, the scores shown again from the board). */
  instant?: boolean;
  /** The window's cross: the scores close on the final board. None: no board to show. */
  onClose?: () => void;
  /** Back to the joust's view. */
  onJoust?: () => void;
  /** The player's next game; shown while they have one left. */
  onPlayAgain?: () => void;
}

/**
 * A Joust game's end (the weekly allegiance event, in the Puzzle end's family, `GameEnd`): the window over the final board, crowned by
 * the trophy, its gold the score's share of the player's best before (lit by a new best); "NEW BEST" when the game beats it (or is
 * their first), else "GAME OVER"; "Joust · game 2 of 3". The carved card's rows: the score (the best before → this score when beaten,
 * else the best that stands) and the allegiance's total, its emblem beside it (before → after when the game lifted it). No reward line:
 * the joust pays in Cobbles at its end. The closed structures and every closing, as Training's; the joust's view and, while a game is
 * left, the gold next game at the foot.
 */
export function JoustEnd({ score, result, guild, stats, closings, closingsNote, instant, onClose, onJoust, onPlayAgain }: JoustEndProps) {
  const late = result?.late ?? false;
  const newBest = !late && result !== null && (result.bestBefore === null || score > result.bestBefore);
  const fill = newBest ? 1 : result?.bestBefore ? Math.min(0.96, score / result.bestBefore) : 0;
  const scoreLine = late ? "Too late to count" : result === null ? "…" : newBest ? (result.bestBefore === null ? "Your first of this joust" : `${formatInteger(result.bestBefore)} → ${formatInteger(score)}`) : `Best ${formatInteger(result.bestAfter ?? score)}`;
  const lifted = result !== null && result.totalAfter > result.totalBefore;
  const totalLine = result === null ? "…" : lifted ? `+${formatInteger(result.totalAfter - result.totalBefore)} for ${guild?.name ?? "your allegiance"}` : "Unchanged";
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
    <section key="total" aria-label="Allegiance total" className="flex min-w-0 flex-1 items-center gap-3">
      <span className="grid size-20 shrink-0 place-items-center">{guild ? <GuildEmblem emblem={guild.emblem} size="lg" /> : <UiIcon name="guild" px={72} className="drawer-icon size-18" />}</span>
      <span className="flex min-w-0 flex-1 flex-col gap-1.5">
        <span data-testid="total-value" className={cn(FIGURE, lifted ? "text-primary" : "text-foreground")}>
          {result === null ? "—" : formatInteger(result.totalAfter)}
        </span>
        <span className={UNDER}>{totalLine}</span>
      </span>
    </section>,
  ];
  return (
    <GameEnd
      mark={<EndMark name="trophy" fill={fill} reached={newBest} instant={instant} label={newBest ? "Trophy: a new best" : result?.bestBefore ? `Trophy: ${Math.round(fill * 100)}% of your best` : "Trophy"} />}
      verdict={newBest ? "NEW BEST" : "GAME OVER"}
      subtitle={result ? `Joust · game ${result.game} of ${JOUST_GAMES}` : "Joust"}
      rows={rows}
      secondary={left > 0 ? { label: "The joust", onClick: onJoust } : undefined}
      primary={left > 0 ? { label: `Play game ${result!.game + 1}`, onClick: onPlayAgain } : { label: "The joust", onClick: onJoust }}
      onClose={onClose}
    >
      <ClosedBoxes stats={stats} closings={closings} />
      <div className="w-full py-1.5">
        <ClosingList closings={closings} stats={stats} note={closingsNote} />
      </div>
    </GameEnd>
  );
}
