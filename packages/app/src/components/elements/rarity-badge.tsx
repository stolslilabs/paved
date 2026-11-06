import type { CSSProperties } from "react";
import { Base, PlanType } from "@paved/game-core";
import { cn } from "../../lib/utils";
import { RARITY_END, SHOP_PARTS, shopPartImage } from "./shop-art";

/** A tile's rarity, from its plan's count among the base deck's 72 (issue 732): 1 or 2 mythic, 3 or 4 uncommon, 5 and up common. */
export type Rarity = "common" | "uncommon" | "mythic";

export const RARITY_NAME: Readonly<Record<Rarity, string>> = { common: "Common", uncommon: "Uncommon", mythic: "Mythic" };

const DECK_COUNTS: ReadonlyMap<number, number> = (() => {
  const counts = new Map<number, number>();
  const types = Object.values(PlanType);
  for (let i = 0; i < Base.total_count(); i++) {
    const plan = types.indexOf(Base.plan(i));
    counts.set(plan, (counts.get(plan) ?? 0) + 1);
  }
  return counts;
})();

/** A plan's count among the base deck's 72 cards (chain plan id). */
export const deckCount = (plan: number): number => DECK_COUNTS.get(plan) ?? 0;

/**
 * A plan's rarity. The mythic plans are 6 of the 72 cards, so one draw is mythic 8 % of the time, the best of two 16 %, of three
 * 23 %: the odds issue 732 gives a chest's choice.
 */
export function rarityOf(plan: number): Rarity {
  const count = deckCount(plan);
  return count <= 2 ? "mythic" : count <= 4 ? "uncommon" : "common";
}

/** The pill's height in CSS px (the book's, about a 12 px word's); its rounded ends follow it, never stretched. */
const PILL_PX = 20;

/** A rarity's pill (`rarity-<rarity>` of `shop-art.ts`) as a 3-slice under the word: its rounded ends whole, its middle stretched. */
function pillOf(rarity: Rarity): CSSProperties {
  const part = `rarity-${rarity}` as const;
  const { width, height } = SHOP_PARTS[part];
  const end = `${((RARITY_END[rarity] * PILL_PX) / height).toFixed(2)}px`;
  return {
    borderStyle: "solid",
    borderColor: "transparent",
    borderWidth: `0 ${end}`,
    borderImageSource: shopPartImage(part),
    borderImageSlice: `0 ${((RARITY_END[rarity] / width) * 100).toFixed(2)}% fill`,
    borderImageWidth: `0 ${end}`,
    borderImageRepeat: "stretch",
  };
}

/**
 * A tile's rarity (issue 739), in the Paved UX Book's pills (SHOP-PAGE, the owner's asks of 2026-11-05, the same everywhere): the
 * common grey, the uncommon green, the mythic purple, each the book's painted pill (`shop-art.ts`) with its name written over it,
 * white and outlined.
 */
export function RarityBadge({ rarity, className }: { rarity: Rarity; className?: string }) {
  return (
    <span data-slot="rarity-badge" data-rarity={rarity} style={pillOf(rarity)} className={cn("text-outline inline-flex h-5 w-fit shrink-0 items-center justify-center px-1 text-xs leading-none font-bold whitespace-nowrap text-foreground", className)}>
      {RARITY_NAME[rarity]}
    </span>
  );
}
