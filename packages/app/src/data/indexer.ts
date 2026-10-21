import { useQueries, useQuery, type UseQueryResult } from "@tanstack/react-query";
import type { Definitions, IndexedGame, PlayerAchievements, PlayerProfile, PlayerQuests } from "@paved/chain";
import type { PlayerStatusData } from "../components/containers/profile-sheet";
import type { ScheduledQuests } from "../lib/quest-window";
import { queryKeys } from "./keys";
import { useDataSources } from "./sources";

// The indexer's reads (section 6.4), one hook each, returning the type the scene's prop takes. The cache holds the
// answer's `data` (the scenes take it); the answer's freshness is not kept yet. A hook whose input is missing is disabled.

/** `/v1/players/:id` (the over page's best). */
export function usePlayerProfile(playerId: string | null): UseQueryResult<PlayerProfile> {
  const { indexer } = useDataSources();
  return useQuery({
    queryKey: queryKeys.indexer.player(playerId ?? "0x0"),
    queryFn: async () => (await indexer.player(playerId as string)).data,
    enabled: playerId !== null,
  });
}

/** The first page of `/v1/players/:id/games`, newest first (the over page's best). */
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
 * The home scene's `player`: the profile; null for a guest. Mapped here: the indexer answers `player` and `stats` null for
 * an address it has not seen yet (a new player), and the scene takes both non-null, so a new player is
 * `{ playerId, name: null, created: null }` with zero stats.
 */
export function usePlayerStatus(playerId: string | null): { data: PlayerStatusData | null | undefined; isPending: boolean; error: Error | null } {
  const profile = usePlayerProfile(playerId);
  if (playerId === null) return { data: null, isPending: false, error: null };
  return {
    data: profile.data ? { player: profile.data.player ?? { playerId, name: null, created: null }, stats: profile.data.stats ?? NO_STATS } : undefined,
    isPending: profile.data === undefined && !profile.error,
    error: profile.error,
  };
}

const NO_STATS: PlayerStatusData["stats"] = { challengeGames: 0, challengeFinished: 0, bestScore: 0, paidGames: 0, settledGames: 0, rewards: "0" };
