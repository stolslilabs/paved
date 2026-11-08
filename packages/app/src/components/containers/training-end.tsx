import type { CSSProperties } from "react";
import type { ScoredStructure } from "@paved/chain";
import { CategoryType, formatInteger, type GameStats } from "@paved/game-core";
import { cn } from "../../lib/utils";
import { CLOSING_CATEGORIES, categoryInfo } from "../elements/category";
import { SectionTitle } from "../elements/section-title";
import { UiIcon } from "../elements/ui-icon";
import { ScrollRegion } from "../ui/scroll-region";
import { ClosingArt } from "./closing-feed";
import { EndMark, GameEnd } from "./game-end";

const CATEGORY_CODES = Object.values(CategoryType);

/** A row's large figure and its line under it, the Ranked end's (`CrownsRow`) and Story's: outlined, the figure tabular. */
const FIGURE = "text-outline text-4xl leading-none font-bold tabular-nums";
const UNDER = "text-outline text-lg leading-tight font-bold text-muted-foreground";
/** The soft rule between two parts of a carved box (the end's rows'), across or down. */
const RULE = "1px solid color-mix(in oklab, var(--drawer-bevel) 45%, transparent)";
const RULE_TOP: CSSProperties = { borderTop: RULE };
const RULE_LEFT: CSSProperties = { borderLeft: RULE };

export interface TrainingEndProps {
  score: number;
  /** The device's best before this game (`useTrainingPreviousBest`); none on the device's first game. */
  previousBest?: number | null;
  /** The game's figures (`gameStats`); without them, the closings' alone. */
  stats?: GameStats;
  /** Every closing in move order. */
  closings: readonly ScoredStructure[];
  /** Why the closings are not listed, when they could not be read. */
  closingsNote?: string;
  /** Tiles placed, when there are no figures (the game's own count). */
  placed: number;
  /** Discarded, when there are no figures. */
  discarded: number;
  /** The crown in at once (reduced motion, the scores shown again from the board). */
  instant?: boolean;
  /** The window's cross: the scores close on the final board. None: no board to show. */
  onClose?: () => void;
  onPlayAgain?: () => void;
  onHome?: () => void;
}

/** The share of the best the score reached, for the crown's gold: 1 once beaten or equalled, none without a best (the device's first game). */
export function crownFill(score: number, previousBest: number | null | undefined): number {
  if (previousBest == null) return 0;
  if (score > previousBest) return 1;
  return previousBest > 0 ? score / previousBest : 0;
}

/**
 * A Training game's end (TRAINING-END, in the Ranked end's family, `GameEnd`): the book's window over the final board, crowned by the
 * crown of Training's score meter (the device's best: gold, lit and popping when beaten, its gold stopping at the score's share short
 * of it, grey on the device's first game); "VICTORY" on a new best, else "GAME OVER", the mode, the score; the carved card of rows: the best (the
 * figure, the best before → the score when beaten) and the tiles (placed, discarded and what the discards took); the closed
 * structures by category in carved boxes (the count, the points); every closing; Home and the gold Play again at the foot. The cross
 * shows the final board.
 */
export function TrainingEnd({ score, previousBest, stats, closings, closingsNote, placed, discarded, instant, onClose, onPlayAgain, onHome }: TrainingEndProps) {
  const record = previousBest != null && score > previousBest;
  const best = Math.max(score, previousBest ?? score);
  const fill = crownFill(score, previousBest);
  const penalty = stats?.discardPenalty ?? 0;
  const tiles = stats?.placed ?? placed;
  const burnt = stats?.discarded ?? discarded;
  const rows = [
    <section key="best" aria-label="Best" data-record={record || undefined} className="flex min-w-0 flex-1 items-center gap-3">
      <UiIcon name="crown" px={80} className="drawer-icon size-20 shrink-0" />
      <span className="flex min-w-0 flex-1 flex-col gap-1">
        <span data-testid="best-value" className={cn(FIGURE, record ? "text-primary" : "text-foreground")}>
          {formatInteger(best)}
        </span>
        {record ? (
          <span className={cn(UNDER, "tabular-nums")}>
            {formatInteger(previousBest!)} → {formatInteger(score)}
          </span>
        ) : (
          <span className={UNDER}>Your best</span>
        )}
      </span>
    </section>,
    <section key="tiles" aria-label="Tiles" className="flex min-w-0 flex-1 items-center gap-3">
      <UiIcon name="tile-stack" px={80} className="drawer-icon size-20 shrink-0" />
      <span className="flex min-w-0 flex-1 flex-col gap-1">
        <span className="flex flex-wrap items-baseline gap-x-1.5">
          <span className={cn(FIGURE, "text-foreground")}>{formatInteger(tiles)}</span>{" "}
          <span className="text-outline text-lg leading-tight font-bold text-foreground">placed</span>
        </span>{" "}
        <span className={cn(UNDER, "tabular-nums")}>
          {formatInteger(burnt)} discarded
          {penalty > 0 && <span className="text-warning"> −{formatInteger(penalty)}</span>}
        </span>
      </span>
    </section>,
  ];
  return (
    <GameEnd
      mark={
        <EndMark
          name="crown"
          fill={fill}
          reached={record}
          instant={instant}
          label={record ? "Crown: a new best" : previousBest == null ? "Crown: no best to beat yet" : `Crown: ${Math.round(fill * 100)}% of your best`}
        />
      }
      verdict={record ? "VICTORY" : "GAME OVER"}
      subtitle="Training"
      score={
        <span data-testid="final-score">
          <span data-testid="score-value">{formatInteger(score)}</span>
        </span>
      }
      rows={rows}
      secondary={{ label: "Home", onClick: onHome }}
      primary={{ label: "Play again", onClick: onPlayAgain }}
      onClose={onClose}
    >
      <ClosedBoxes stats={stats} closings={closings} />
      <ClosingList closings={closings} stats={stats} note={closingsNote} />
    </GameEnd>
  );
}

/**
 * The structures closed, by category, in carved boxes side by side (the city, the road, the forest, the wonder): the painting, the
 * count, the points they scored (green, grey at none). A category closed by nothing is dimmed, never left out.
 */
export function ClosedBoxes({ stats, closings }: { stats?: GameStats; closings: readonly ScoredStructure[] }) {
  const cells = CLOSING_CATEGORIES.map((category) => {
    const of = stats?.categories.find((c) => c.category === CATEGORY_CODES[category]);
    if (of) return { category, closed: of.closed, points: of.points };
    const mine = closings.filter((c) => c.category === category);
    return { category, closed: mine.length, points: mine.reduce((s, c) => s + c.points, 0) };
  });
  return (
    <ul aria-label="Closed" className="drawer-carved grid w-full grid-cols-4 rounded-2xl py-2">
      {cells.map((c, i) => {
        const { plural } = categoryInfo(c.category);
        return (
          <li
            key={c.category}
            aria-label={`${plural}: ${formatInteger(c.closed)} closed, ${formatInteger(c.points)} points`}
            data-category={c.category}
            style={i > 0 ? RULE_LEFT : undefined}
            className="flex min-w-0 flex-col items-center gap-1 px-1 py-0.5"
          >
            <ClosingArt category={c.category} px={40} className={cn("size-10", c.closed === 0 && "opacity-45")} />
            <span aria-hidden className={cn("text-outline text-2xl leading-none font-bold tabular-nums", c.closed === 0 ? "text-muted-foreground" : "text-foreground")}>
              {formatInteger(c.closed)}
            </span>
            <span aria-hidden title={`+${formatInteger(c.points)}`} className={cn("text-outline max-w-full truncate pr-0.5 text-sm leading-tight font-bold tabular-nums", c.points > 0 ? "text-success" : "text-muted-foreground")}>
              +{formatInteger(c.points)}
            </span>
          </li>
        );
      })}
    </ul>
  );
}

/**
 * Every closing of the game in move order, in a carved list (the closings feed's look): the category's painting, its name and its
 * size in tiles, the points in green. Long, it scrolls in its box (`ScrollRegion`, three rows and a cut one), so the answers stay on a phone's screen. None: said so.
 */
export function ClosingList({ closings, stats, note }: { closings: readonly ScoredStructure[]; stats?: GameStats; note?: string }) {
  // Their distinct tiles (`gameStats`, D-19) where the figures match the list; the areas they span otherwise.
  const tiles = stats?.closings.length === closings.length ? stats.closings : null;
  return (
    <section aria-labelledby="training-closings" className="flex w-full flex-col gap-1 text-left">
      <SectionTitle id="training-closings">Closings</SectionTitle>
      {closings.length === 0 ? (
        <p className="drawer-carved rounded-2xl px-3 py-3 text-sm font-semibold text-muted-foreground">{note ?? "No structure closed in this game."}</p>
      ) : (
        <ScrollRegion className="drawer-carved max-h-28 overscroll-contain rounded-2xl px-3">
          <ol>
          {closings.map((c, i) => {
            const { label } = categoryInfo(c.category);
            return (
              <li key={i} style={i > 0 ? RULE_TOP : undefined} className="flex items-center gap-2 py-1">
                <ClosingArt category={c.category} px={24} className="size-6" />
                <span className="text-outline flex min-w-0 flex-1 flex-wrap items-baseline gap-x-2 text-sm font-bold">
                  <span>{label}</span>
                  <span className="text-xs text-muted-foreground">{formatInteger(tiles?.[i]?.tiles ?? c.size)} tiles</span>
                </span>
                <span className={cn("text-outline text-sm font-bold tabular-nums", c.points > 0 ? "text-success" : "text-muted-foreground")}>+{formatInteger(c.points)}</span>
              </li>
            );
          })}
          </ol>
        </ScrollRegion>
      )}
    </section>
  );
}
