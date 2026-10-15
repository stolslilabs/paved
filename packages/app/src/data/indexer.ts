import { useQueries, useQuery, type UseQueryResult } from "@tanstack/react-query";
import type { Definitions, IndexedGame, Leaderboard, LeaderboardEntry, PlayerAchievements, PlayerProfile, PlayerQuests } from "@paved/chain";
import type { PlayerStatusData } from "../components/containers/player-status";
import type { ScheduledQuests } from "../lib/quest-window";
import { queryKeys } from "./keys";
import { useDataSources } from "./sources";

// The indexer's reads (section 6.4), one hook each, returning the type the scene's prop takes. The cache holds the
// answer's `data` (the scenes take it); the answer's freshness is not kept yet. A hook whose input is missing is disabled.

/** A leaderboard page as the scenes read it: the home's top 3 (`limit` 3), the leaderboard scene's page of 20. */
export function useLeaderboard(day: number | null, limit: number, offset = 0): UseQueryResult<Leaderboard> {
  const { indexer } = useDataSources();
  return useQuery({
    queryKey: queryKeys.indexer.leaderboard(day ?? 0, limit, offset),
    queryFn: async () => (await indexer.leaderboard(day as number, { limit, offset })).data,
    enabled: day !== null,
    // A closed day's ranking is final.
    staleTime: (query) => (query.state.data && query.state.data.endTime * 1000 <= Date.now() ? Infinity : 0),
  });
}

/** The home scene's podium: the first three rows of the day. */
export const useTopThree = (day: number | null): UseQueryResult<Leaderboard> => useLeaderboard(day, 3);

/** The viewer's row of a day (`/v1/tournaments/:day/entry/:player`): null before their first finished game of it. */
export function useLeaderboardEntry(day: number | null, playerId: string | null): UseQueryResult<LeaderboardEntry | null> {
  const { indexer } = useDataSources();
  return useQuery({
    queryKey: queryKeys.indexer.entry(day ?? 0, playerId ?? "0x0"),
    queryFn: async () => (await indexer.playerTournament(playerId as string, day as number)).data,
    enabled: day !== null && playerId !== null,
  });
}

/** `/v1/players/:id` (player scene). */
export function usePlayerProfile(playerId: string | null): UseQueryResult<PlayerProfile> {
  const { indexer } = useDataSources();
  return useQuery({
    queryKey: queryKeys.indexer.player(playerId ?? "0x0"),
    queryFn: async () => (await indexer.player(playerId as string)).data,
    enabled: playerId !== null,
  });
}

/** The first page of `/v1/players/:id/games`, newest first (player scene). */
export function useIndexedPlayerGames(playerId: string | null, limit = 20): UseQueryResult<IndexedGame[]> {
  const { indexer } = useDataSources();
  return useQuery({
    queryKey: queryKeys.indexer.playerGames(playerId ?? "0x0", limit),
    queryFn: async () => (await indexer.playerGames(playerId as string, { contract: "challenge", limit })).data.games,
    enabled: playerId !== null,
  });
}

/** `/v1/games/challenge/:id` (over). */
export function useIndexedGame(gameId: number | null): UseQueryResult<IndexedGame> {
  const { indexer } = useDataSources();
  return useQuery({
    queryKey: queryKeys.indexer.game(gameId ?? 0),
    queryFn: async () => (await indexer.game("challenge", gameId as number)).data,
    enabled: gameId !== null,
  });
}

/** `/v1/definitions`: the quests' and achievements' definitions. */
export function useDefinitions(): UseQueryResult<Definitions> {
  const { indexer } = useDataSources();
  return useQuery({ queryKey: queryKeys.indexer.definitions(), queryFn: async () => (await indexer.definitions()).data });
}

/**
 * The quests scene's `quests`: `/v1/players/:id/quests?day=` with each quest's schedule. Mapped here: the indexer's
 * `PlayerQuest` does not carry the schedule, so `start`, `interval` and `duration` come from the quest's definition
 * (`startTime`, `interval`, `duration`); a quest with no definition is left out (the scene cannot place it in a window).
 */
export function usePlayerQuests(playerId: string | null, day: number | null): { data: ScheduledQuests | undefined; isPending: boolean; error: Error | null } {
  const { indexer } = useDataSources();
  return useQueries({
    queries: [
      { queryKey: queryKeys.indexer.definitions(), queryFn: async () => (await indexer.definitions()).data },
      {
        queryKey: queryKeys.indexer.quests(playerId ?? "0x0", day ?? 0),
        queryFn: async () => (await indexer.playerQuests(playerId as string, { day: day as number })).data,
        enabled: playerId !== null && day !== null,
      },
    ],
    combine: ([definitions, progress]) => {
      const ready = definitions.data !== undefined && progress.data !== undefined;
      const error = definitions.error ?? progress.error;
      // A failed read ends the wait: pending only while nothing failed.
      return { data: ready ? scheduled(definitions.data, progress.data) : undefined, isPending: !ready && !error, error };
    },
  });
}

/** Joins a day's progress with the definitions' schedules. */
export function scheduled(definitions: Definitions, progress: PlayerQuests): ScheduledQuests {
  const byId = new Map(definitions.quests.map((d) => [d.questId, d]));
  return {
    ...progress,
    quests: progress.quests.flatMap((q) => {
      const d = byId.get(q.questId);
      return d ? [{ ...q, start: d.startTime, interval: d.interval, duration: d.duration }] : [];
    }),
  };
}

/** `/v1/players/:id/achievements` (achievements). */
export function usePlayerAchievements(playerId: string | null): UseQueryResult<PlayerAchievements> {
  const { indexer } = useDataSources();
  return useQuery({
    queryKey: queryKeys.indexer.achievements(playerId ?? "0x0"),
    queryFn: async () => (await indexer.playerAchievements(playerId as string)).data,
    enabled: playerId !== null,
  });
}

/**
 * The home scene's `player`: the profile, today's row and the two balances; null for a guest. Mapped here: the
 * indexer answers `player` and `stats` null for an address it has not seen yet (a new player), and the scene takes
 * both non-null, so a new player is `{ playerId, name: null, created: null }` with zero stats. A balance reads 0 without
 * an economy deployment.
 */
export function usePlayerStatus(playerId: string | null, day: number | null): { data: PlayerStatusData | null | undefined; isPending: boolean; error: Error | null } {
  const { indexer, economy } = useDataSources();
  const id = playerId ?? "0x0";
  const enabled = playerId !== null;
  return useQueries({
    queries: [
      { queryKey: queryKeys.indexer.player(id), queryFn: async () => (await indexer.player(id)).data, enabled },
      {
        queryKey: queryKeys.indexer.entry(day ?? 0, id),
        queryFn: async () => (await indexer.playerTournament(id, day as number)).data,
        enabled: enabled && day !== null,
      },
      { queryKey: queryKeys.chain.usdcBalance(id), queryFn: () => (economy ? economy.usdcBalance(id) : null), enabled },
      { queryKey: queryKeys.chain.pavedBalance(id), queryFn: () => (economy ? economy.pavedBalance(id) : null), enabled },
    ],
    combine: ([profile, today, usdc, paved]) => {
      const all = [profile, today, usdc, paved];
      if (playerId === null) return { data: null, isPending: false, error: null };
      // Without a day there is no row of today to wait for.
      const ready = [profile, usdc, paved, ...(day === null ? [] : [today])].every((q) => q.data !== undefined);
      const error = all.find((q) => q.error)?.error ?? null;
      return {
        data: ready
          ? {
              player: profile.data?.player ?? { playerId, name: null, created: null },
              stats: profile.data?.stats ?? NO_STATS,
              today: today.data ?? null,
              usdc: usdc.data ?? 0n,
              paved: paved.data ?? 0n,
            }
          : undefined,
        isPending: !ready && !error,
        error,
      };
    },
  });
}

const NO_STATS: PlayerStatusData["stats"] = { challengeGames: 0, challengeFinished: 0, bestScore: 0, paidGames: 0, settledGames: 0, rewards: "0" };
