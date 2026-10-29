import { Base, PlanType } from "@paved/game-core";
import { cn } from "../../lib/utils";
import { Badge } from "../ui/badge";

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

const RARITY_VARIANT = { common: "secondary", uncommon: "info", mythic: "default" } as const;

/** A tile's rarity (issue 739): its name on a badge, the mythic in the primary gold, the uncommon in blue, the common plain. */
export function RarityBadge({ rarity, className }: { rarity: Rarity; className?: string }) {
  return (
    <Badge variant={RARITY_VARIANT[rarity]} data-rarity={rarity} className={cn(className)}>
      {RARITY_NAME[rarity]}
    </Badge>
  );
}
