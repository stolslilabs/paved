import { useQuery } from "@tanstack/react-query";
import type { LeagueStatus, PvpShield } from "@paved/chain";
import { orNone } from "./avatar";
import { pvpKeys } from "./pvp-keys";
import { useDataSources } from "./sources";

// The player's PvP standing on its own (#753): the home shows the crowns and the league without the PvP's engine (`pvp.ts`).

/**
 * The player's crowns and league (`Matchmaker.league`), the same read and cache as the PvP screens'. Null on a network without
 * PvP; disabled without a player.
 */
export function usePvpLeague(playerId: string | null): { data: LeagueStatus | null | undefined; error: Error | null } {
  const { views } = useDataSources();
  const v = views as Partial<{ pvpLeague: (village: string) => Promise<LeagueStatus> }>;
  const served = typeof v.pvpLeague === "function";
  const id = playerId ?? "0x0";
  const league = useQuery({ queryKey: pvpKeys.league(id), queryFn: () => orNone(() => v.pvpLeague!(id)), enabled: playerId !== null && served });
  if (playerId === null || !served) return { data: null, error: null };
  return { data: league.data, error: league.error };
}

/**
 * The player's shield (`Matchmaker.shield`), the same read and cache as the League page's (`pvpKeys.shield`), so the two never
 * disagree (#806). Null on a network without PvP; disabled without a player.
 */
export function usePvpShield(playerId: string | null): { data: PvpShield | null | undefined; error: Error | null } {
  const { views } = useDataSources();
  const v = views as Partial<{ pvpShield: (village: string) => Promise<PvpShield> }>;
  const served = typeof v.pvpShield === "function";
  const id = playerId ?? "0x0";
  const shield = useQuery({ queryKey: pvpKeys.shield(id), queryFn: () => orNone(() => v.pvpShield!(id)), enabled: playerId !== null && served });
  if (playerId === null || !served) return { data: null, error: null };
  return { data: shield.data, error: shield.error };
}
