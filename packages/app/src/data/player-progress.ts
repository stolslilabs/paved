import type { GameViews, LevelViews, PlayerLevel } from "@paved/chain";
import { useQuery } from "@tanstack/react-query";
import type { PlayerProgress } from "../components/elements/xp-ring";
import { queryKeys } from "./keys";
import { useDataSources } from "./sources";

/**
 * The first level of #641's curve (`playerLevelOf(0)` of `@paved/chain`: the next level at `LEVEL_STEP`, 100 XP). What a player
 * with no XP, or a views double without the XP view, shows. A literal: this module is on the first load of `/`, which takes
 * nothing but types from the chain client (FIRST-LOAD).
 */
export const FIRST_LEVEL: PlayerProgress = { level: 1, xp: 0, xpForNext: 100, total: 0 };

/**
 * The ring's share of a level: the XP made in the current level, out of the level's span, and the whole XP, on which a gain
 * across levels is measured (`Setup.player_level`, #641).
 */
export function progressOf({ level, xp, floor, next }: PlayerLevel): PlayerProgress {
  return { level, xp: xp - floor, xpForNext: next - floor, total: xp };
}

/** The XP view of the sources' views, or null for a views double without it. */
export function levelViews(views: GameViews): LevelViews | null {
  const v = views as GameViews & Partial<LevelViews>;
  return typeof v.playerLevel === "function" ? (v as LevelViews) : null;
}

/**
 * The player's level and XP for the ring around their avatar (#625): `Setup.player_level` (#641), the XP the reporters credit
 * (a Challenge game over, Story stars, PvP), mapped to the ring's share of the current level. The mock data source answers
 * it where the network's class lacks the view (XP 0). Undefined while it is read; null without a player (a guest has no ring).
 */
export function usePlayerProgress(playerId: string | null): { data: PlayerProgress | null | undefined; isPending: boolean; error: Error | null } {
  const { views } = useDataSources();
  const level = levelViews(views);
  const query = useQuery({
    queryKey: queryKeys.chain.playerLevel(playerId ?? "0x0"),
    queryFn: async () => (level ? progressOf(await level.playerLevel(playerId as string)) : FIRST_LEVEL),
    enabled: playerId !== null,
  });
  if (playerId === null) return { data: null, isPending: false, error: null };
  return { data: query.data, isPending: query.isPending && !query.error, error: query.error };
}
