import type { CSSProperties } from "react";
import type { ScoredStructure } from "@paved/chain";
import { CategoryType, formatInteger, type GameStats } from "@paved/game-core";
import { cn } from "../../lib/utils";
import { CLOSING_CATEGORIES, categoryInfo } from "../elements/category";
import { SectionTitle } from "../elements/section-title";
import { ScrollRegion } from "../ui/scroll-region";
import { ClosingArt } from "./closing-feed";

const CATEGORY_CODES = Object.values(CategoryType);

/** The soft rule between two parts of a carved box (the end's rows'), across or down. */
const RULE = "1px solid color-mix(in oklab, var(--drawer-bevel) 45%, transparent)";
const RULE_TOP: CSSProperties = { borderTop: RULE };
const RULE_LEFT: CSSProperties = { borderLeft: RULE };

// The closings of a game's end (the Puzzle's, the Joust's, the Tournament's, in `GameEnd`): the boxes by category, then the list.

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
    <section aria-labelledby="end-closings" className="flex w-full flex-col gap-1 text-left">
      <SectionTitle id="end-closings">Closings</SectionTitle>
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
