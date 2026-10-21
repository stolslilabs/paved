import type { PlayerProgress } from "../components/elements/xp-ring";

/** The first level and its threshold (#625): a placeholder until the contracts define XP, not a curve. */
export const FIRST_LEVEL: PlayerProgress = { level: 1, xp: 0, xpForNext: 100 };

/**
 * The player's level and XP for the ring around their avatar (#625). THE ONE PLACE THE CONTRACTS' XP PLUGS IN: no contract,
 * indexer or app code defines XP yet (the owner's decision of 2026-10-20), so every player is at the first level with 0 XP.
 * Once XP is defined (league points may feed the same ring), this becomes a read with its key in `keys.ts` and keeps this
 * shape; the ring, the badge and the profile sheet change nothing. Null without a player (a guest has no ring).
 */
export function usePlayerProgress(playerId: string | null): { data: PlayerProgress | null; isPending: boolean; error: Error | null } {
  return { data: playerId ? FIRST_LEVEL : null, isPending: false, error: null };
}
