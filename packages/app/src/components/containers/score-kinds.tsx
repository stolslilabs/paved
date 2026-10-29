import { useMemo } from "react";
import { CategoryType, byCategory, formatInteger } from "@paved/game-core";
import { cn } from "../../lib/utils";
import { CategoryIcon, categoryInfo } from "../elements/category";
import { layoutPoints, type VillageLayout } from "./layout-rules";
import { KIND_ICON, KIND_ICON_BOX, KIND_ROW } from "./score-kinds-layout";

// The village score's kinds (#831), apart from the accordion: the sums come from the layout's lines (the engine), so they load
// in their own chunk as the accordion first unfolds, and the home's first load keeps the total alone.

const CATEGORIES = Object.values(CategoryType);

/**
 * The village's score by kind of structure (#831): roads, cities, forests and wonders, each its structures' points added up (0
 * with none), the most points first (the fixed order on a tie). They add up to the layout's score; points no structure holds
 * (none in a valid layout) take a row of their own, so the rows always do.
 */
export function ScoreKinds({ tiles, className }: { tiles: VillageLayout["tiles"]; className?: string }) {
  const breakdown = useMemo(() => layoutPoints(tiles), [tiles]);
  const sums = useMemo(() => byCategory(breakdown), [breakdown]);
  return (
    <ul aria-label="Score by kind" className={cn("flex flex-col", className)}>
      {sums.map(({ category, points }) => {
        const index = CATEGORIES.indexOf(category);
        return (
          <li key={category} data-kind={category} className={KIND_ROW}>
            <CategoryIcon category={index} size="sm" className={KIND_ICON} />
            <span className="flex-1 text-muted-foreground">{categoryInfo(index).plural}</span>
            <span className={cn("numeric font-semibold", points === 0 && "text-muted-foreground")}>{formatInteger(points)}</span>
          </li>
        );
      })}
      {breakdown.other !== 0 && (
        <li data-kind="other" className={KIND_ROW}>
          <span className={KIND_ICON_BOX} />
          <span className="flex-1 text-muted-foreground">Other</span>
          <span className="numeric font-semibold">{formatInteger(breakdown.other)}</span>
        </li>
      )}
    </ul>
  );
}
