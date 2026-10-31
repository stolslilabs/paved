import { useQuery } from "@tanstack/react-query";
import type { Attack, LeagueStatus } from "@paved/chain";
import type { AttackV2State } from "./free-attack";
import { queryKeys } from "./keys";
import { pvpKeys } from "./pvp-keys";
import type { DataSources } from "./sources";

// Unranked (#917): a player who has not entered the leagues, a client state, the same on the home, the League page and the profile.
// Read in the lazy chunks that show it (the League control, the profile sheet), so this module imports nothing the first load
// splits on: the reads share the home's and the PvP screens' cache keys (`pvpKeys.league`, `pvpKeys.attack`) and answers.

/**
 * Unranked: no crowns, no attack settled this season, and no attack ever made, open or ended (the last attack's id 0, in PvP v1's
 * `Arena.attack` and in v2's attacks alike: `lastAttack`).
 */
export const isUnranked = (league: Pick<LeagueStatus, "crowns" | "attacks">, attack: Pick<Attack, "id">): boolean =>
  league.crowns === 0 && league.attacks === 0 && attack.id === 0;

/** A read that answers null where the deployment has no such contract (`orNone` of `avatar.ts`, which this module keeps apart from). */
async function orNone<T>(read: () => Promise<T>): Promise<T | null> {
  try {
    return await read();
  } catch (error) {
    if ((error as { kind?: unknown } | null)?.kind === "not-configured") return null;
    throw error;
  }
}

type StandingViews = Partial<{
  pvpLeague: (village: string) => Promise<LeagueStatus>;
  pvpAttack: (village: string) => Promise<Attack>;
  attackV2: (attacker: string) => Promise<AttackV2State>;
}>;

/**
 * The player's last attack over both flows, as the Unranked rule reads it: v1's (`Arena.attack`, id 0 for none) or else v2's (the
 * open or last one, none: null). Its id 0: none ever made. Null where neither is served; undefined while either is read.
 */
export function lastAttack(v1: Pick<Attack, "id"> | null | undefined, v2: Pick<AttackV2State, "attack"> | null | undefined): Pick<Attack, "id"> | null | undefined {
  if (v1 === undefined || v2 === undefined) return undefined;
  if (v1 === null && v2 === null) return null;
  return { id: v1?.id || v2?.attack?.id || 0 };
}

/** One of the two reads, under its shared key; null where the sources do not serve it, undefined while read. */
function useRead<T>(key: readonly unknown[], read: ((id: string) => Promise<T>) | undefined, id: string): T | null | undefined {
  const query = useQuery({ queryKey: key, queryFn: () => orNone(() => read!(id)), enabled: read !== undefined });
  return read ? query.data : null;
}

/**
 * The player's last attack over both flows (`lastAttack`): v1's `Arena.attack` and v2's attack, the PvP screens' reads and cache
 * keys: the Unranked rule's last term. Takes the sources (the caller reads `DataContext`: none in a story or a test, no read).
 */
export function usePvpLastAttack(sources: Pick<DataSources, "views">, playerId: string): Pick<Attack, "id"> | null | undefined {
  const v = sources.views as StandingViews;
  const v1 = useRead(pvpKeys.attack(playerId), v.pvpAttack?.bind(v), playerId);
  const v2 = useRead(queryKeys.chain.v2.attack(playerId), v.attackV2?.bind(v), playerId);
  return lastAttack(v1, v2);
}

/** The player's crowns and league (`Matchmaker.league`), the home's read and cache. Null on a network without PvP; undefined while read. */
export function usePvpLeagueOf(sources: Pick<DataSources, "views">, playerId: string): LeagueStatus | null | undefined {
  const v = sources.views as StandingViews;
  return useRead(pvpKeys.league(playerId), v.pvpLeague?.bind(v), playerId);
}
