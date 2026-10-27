import { useQuery } from "@tanstack/react-query";
import type { BoardTile, GameViews } from "@paved/chain";
import { CENTER, STARTER_TILE, type ChestRank, type LayoutTile } from "@paved/game-core";
import { orNone } from "./avatar";
import type { BoardSide } from "./board-side";
import type { AttackMoveV2 } from "./free-attack";
import { queryKeys } from "./keys";
import { useDataSources } from "./sources";

// PvP v2's matches (#786, step 1 of #732): the player's ended attacks and the attacks on their village, newest first, each with
// the snapshot of the attacked village at the attack's start, so a match shows the village as it was whatever its owner changed
// since. Step 1 serves them from the mock ledger; the contracts and the indexer keep the snapshot from step 3 (#735, #743).

/** One match: an attack the player made, or one on their village. */
export interface MatchRecord {
  /** `a<id>`: the player's attack `id`; `d<id>`: the attack `id` on their village. The match page's path (`/pvp/match/:id`). */
  id: string;
  side: "attack" | "defence";
  /**
   * The other player: the defender of an attack, the attacker of a defence. `look`: their avatar where the sources know it
   * (AVATAR-LOOK's value as a decimal string, as the avatar's reads keep it in the cache; the mock's rivals, #834).
   */
  rival: { address: string; name: string | null; level: number; look?: string | null };
  /** The attacked village at the attack's start, the starter left out: the snapshot. */
  village: LayoutTile[];
  /** The snapshot's score: 100 % of it is 3 stars. */
  target: number;
  /** The attack's moves, each with its plan: the build. */
  moves: AttackMoveV2[];
  score: number;
  stars: number;
  surrendered: boolean;
  /** The player's crowns from it: won (positive) or lost (negative). */
  crowns: number;
  /** What the attack gave the player: its XP and chest (null: none). A defence gives neither. */
  xp: number;
  chest: ChestRank | null;
  /** Seconds since the epoch. */
  finishedAt: number;
}

export interface MatchRecordViews {
  /** The player's matches that ended, newest first. */
  matchesV2(playerId: string): Promise<MatchRecord[]>;
}

export function matchV2Views(views: GameViews): MatchRecordViews | null {
  const v = views as GameViews & Partial<MatchRecordViews>;
  return typeof v.matchesV2 === "function" ? (v as MatchRecordViews) : null;
}

/** The player's matches, newest first. Null where they are not served (the chain before step 3); disabled without a player. */
export function useMatchesV2(playerId: string | null): { data: MatchRecord[] | null | undefined; error: Error | null } {
  const { views } = useDataSources();
  const v2 = matchV2Views(views);
  const query = useQuery({
    queryKey: queryKeys.chain.v2.matches(playerId ?? "0x0"),
    queryFn: () => orNone(() => v2!.matchesV2(playerId!)),
    enabled: playerId !== null && v2 !== null,
  });
  if (playerId === null || v2 === null) return { data: null, error: null };
  return { data: query.data, error: query.error };
}

/** A village's layout on the board: the starter, then its tiles, in the board's coordinates (a scout's, a match's snapshot). */
export function layoutBoard(tiles: readonly LayoutTile[]): BoardTile[] {
  return [STARTER_TILE, ...tiles].map((t, i) => ({ id: i + 1, plan: t.plan, orientation: t.orientation, x: CENTER + t.x, y: CENTER + t.y }));
}

/**
 * Whose void a match's view is in (#786, open points 1 and 4): the village a rival's in red, or the player's own in green (a
 * defence); the build the player's own attack in blue, or a rival's attack on the player's village in red.
 */
export function matchBoardSide(side: MatchRecord["side"], view: "village" | "build"): BoardSide {
  if (view === "village") return side === "attack" ? "rival" : "own";
  return side === "attack" ? "attack" : "rival";
}
