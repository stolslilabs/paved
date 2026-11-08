import type { CSSProperties } from "react";
import type { ScoredStructure } from "@paved/chain";
import { formatInteger, type GameStats } from "@paved/game-core";
import { cn } from "../../lib/utils";
import { rankingArtSources } from "../elements/ranking-art";
import { UiIcon } from "../elements/ui-icon";
import { EndMark, GameEnd } from "./game-end";
import { ClosedBoxes, ClosingList } from "./training-end";

/** A row's large figure and its line under it, the Ranked end's League row's (`CrownsRow`): outlined, the figure tabular. */
const FIGURE = "text-outline text-4xl leading-none font-bold tabular-nums";
const UNDER = "text-outline text-lg leading-tight font-bold text-muted-foreground tabular-nums";

/** What a finished game did to its player's day (`PuzzleGameResult`'s figures). */
export interface PuzzleEndResult {
  /** The player's best of the day before this game; null: their first result of the day. */
  bestBefore: number | null;
  bestAfter: number | null;
  placeBefore: number | null;
  placeAfter: number | null;
  players: number;
  /** Ended past its day: it ranks nowhere. */
  late: boolean;
}

export interface PuzzleEndProps {
  score: number;
  /** The game's effect on the day; none while it is read (the rows wait). */
  result: PuzzleEndResult | null;
  /** The day's first place's score before this game, another player's or the player's own: the trophy's goal. Null: none yet. */
  firstPlace: number | null;
  /** The game's day, as the subtitle names it: "Sun, Nov 8". */
  dayLabel: string;
  stats?: GameStats;
  closings: readonly ScoredStructure[];
  closingsNote?: string;
  /** The trophy in at once (reduced motion, the scores shown again from the board). */
  instant?: boolean;
  /** The window's cross: the scores close on the final board. None: no board to show. */
  onClose?: () => void;
  onLeaderboard?: () => void;
  onPlayAgain?: () => void;
}

/** A place's medal, 80 px: the ranking's gold and silver, the HUD's bronze, a grey one past the podium (the bronze without its colour). */
function PlaceMedal({ place }: { place: number | null }) {
  if (place === 1) return <img {...rankingArtSources("medal-gold", 80)} alt="" draggable={false} decoding="async" className="drawer-icon size-20 shrink-0" />;
  if (place === 2) return <img {...rankingArtSources("medal-silver", 80)} alt="" draggable={false} decoding="async" className="drawer-icon size-20 shrink-0" />;
  if (place === 3) return <UiIcon name="medal" px={80} className="drawer-icon size-20 shrink-0" />;
  return (
    <span className="block size-20 shrink-0" style={GREY}>
      <UiIcon name="medal" px={80} className="drawer-icon size-20" />
    </span>
  );
}

/** A medal past the podium: the bronze without its colour, a little lighter. */
const GREY: CSSProperties = { filter: "grayscale(1) brightness(1.1)" };

/** The trophy's share: 1 once this game's score is the day's first, else the score's share of the first place's. */
export function puzzleTrophyFill(score: number, firstPlace: number | null, first: boolean): number {
  if (first) return 1;
  if (firstPlace === null || firstPlace <= 0) return 0;
  return Math.min(0.96, score / firstPlace);
}

/**
 * A Puzzle game's end (Play's Limited mode, in the Ranked end's family, `GameEnd`): the book's window over the final board, crowned by
 * the trophy of the Puzzle's score meter (the day's first place: gold, lit and popping when this game takes it, its gold stopping at the
 * score's share short of it); "VICTORY" when this game's score is the day's first, else "GAME OVER"; "Puzzle · <day>". The carved card's
 * rows, the Ranked end's League row's layout: the score (the star; the best before → this score when beaten, else the best that stands)
 * and the placement (the medal; the place before → after). No prize line (the owner's ask: the mailbox tells it). The closed structures
 * and every closing, as Training's; Leaderboard and the gold Play again at the foot. The cross shows the final board.
 */
export function PuzzleEnd({ score, result, firstPlace, dayLabel, stats, closings, closingsNote, instant, onClose, onLeaderboard, onPlayAgain }: PuzzleEndProps) {
  const late = result?.late ?? false;
  const newBest = !late && result !== null && (result.bestBefore === null || score > result.bestBefore);
  const first = !late && result?.placeAfter === 1 && result.bestAfter === score;
  const fill = puzzleTrophyFill(score, firstPlace, first);
  const scoreLine = late
    ? "Too late to rank"
    : result === null
      ? "…"
      : newBest
        ? result.bestBefore === null
          ? "Your first today"
          : `${formatInteger(result.bestBefore)} → ${formatInteger(score)}`
        : `Best ${formatInteger(result.bestAfter ?? score)}`;
  const place = result?.placeAfter ?? null;
  const placeLine =
    result === null
      ? "…"
      : place === null
        ? "Not ranked"
        : result.placeBefore === null
          ? `${formatInteger(result.players)} ${result.players === 1 ? "player" : "players"}`
          : result.placeBefore === place
            ? "Unchanged"
            : `#${formatInteger(result.placeBefore)} → #${formatInteger(place)}`;
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
    <section key="place" aria-label="Placement" className="flex min-w-0 flex-1 items-center gap-3">
      <PlaceMedal place={place} />
      <span className="flex min-w-0 flex-1 flex-col gap-1.5">
        <span data-testid="place-value" className={cn(FIGURE, place === 1 ? "text-primary" : "text-foreground")}>
          {place === null ? "—" : `#${formatInteger(place)}`}
        </span>
        <span className={UNDER}>{placeLine}</span>
      </span>
    </section>,
  ];
  return (
    <GameEnd
      mark={
        <EndMark
          name="trophy"
          fill={fill}
          reached={first}
          instant={instant}
          label={first ? "Trophy: the day's first place" : firstPlace === null ? "Trophy: no first place to beat yet" : `Trophy: ${Math.round(fill * 100)}% of first place`}
        />
      }
      verdict={first ? "VICTORY" : "GAME OVER"}
      subtitle={`Puzzle · ${dayLabel}`}
      rows={rows}
      secondary={{ label: "Leaderboard", onClick: onLeaderboard }}
      primary={{ label: "Play again", onClick: onPlayAgain }}
      onClose={onClose}
    >
      <ClosedBoxes stats={stats} closings={closings} />
      <div className="w-full py-1.5">
        <ClosingList closings={closings} stats={stats} note={closingsNote} />
      </div>
    </GameEnd>
  );
}
