import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { cobbleKeys } from "./cobbles";
import type { JoustGameRecord, JoustGameResult, JoustRanking, JoustSource, JoustState } from "./joust-source";
import { addressKey } from "./keys";
import type { PuzzleRead } from "./puzzle";
import { useSeededSession } from "./puzzle-game";
import { useDataSources } from "./sources";

// The Joust's hooks (the weekly allegiance event, game-core's `joust.ts`), read from the sources' `joust` (the mock's ledger: the
// whole event runs on the client). Without one (the chain) each answers `unavailable`, with no data and no error. Nothing polls: the
// week is read again on the window's focus and after the player's own writes.

export type * from "./joust-source";

/** The keys of the Joust's reads, `[domain, read, ...args]` as `keys.ts`'s (here, so that the first load does not carry them). */
export const joustKeys = {
  all: ["joust"] as const,
  /** The week as `viewer` sees it. */
  state: (viewer: string | null) => ["joust", "state", viewer === null ? null : addressKey(viewer)] as const,
  ranking: (viewer: string | null) => ["joust", "ranking", viewer === null ? null : addressKey(viewer)] as const,
  game: (gameId: number) => ["joust", "game", gameId] as const,
  result: (gameId: number) => ["joust", "result", gameId] as const,
};

const UNAVAILABLE = { data: undefined, isPending: false, error: null, unavailable: true, refetch: () => undefined } as const;

/** A query of the Joust source: disabled without a source or without its argument (`enabled`). */
function useJoustQuery<T>(key: readonly unknown[], read: (source: JoustSource) => Promise<T>, enabled: boolean): PuzzleRead<T> {
  const { joust } = useDataSources();
  const query = useQuery({ queryKey: key, queryFn: () => read(joust!), enabled: enabled && !!joust, staleTime: 0 });
  if (!joust) return UNAVAILABLE;
  return { data: query.data, isPending: enabled && query.isPending && !query.error, error: query.error, unavailable: false, refetch: () => void query.refetch() };
}

/** Whether the sources hold a Joust (the mock): without one, Play shows no Joust card. */
export function useJoustAvailable(): boolean {
  return !!useDataSources().joust;
}

/** The week's Joust as `viewer` sees it (null: no account, the week alone); `enabled` false reads nothing. */
export function useJoustState(viewer: string | null, enabled = true): PuzzleRead<JoustState> {
  return useJoustQuery(joustKeys.state(viewer), (s) => s.state(viewer), enabled);
}

/** The allegiances by rating; `enabled` false reads nothing (the ranking's view closed). */
export function useJoustRanking(viewer: string | null, enabled = true): PuzzleRead<JoustRanking> {
  return useJoustQuery(joustKeys.ranking(viewer), (s) => s.ranking(viewer), enabled);
}

/** A game by its id, as stored when read: the board's start (its moves played again). */
export function useJoustGameRecord(gameId: number | null): PuzzleRead<JoustGameRecord> {
  return useJoustQuery(joustKeys.game(gameId ?? 0), (s) => s.game(gameId!), gameId !== null);
}

/** A finished game's effect on its player's best and their allegiance's total. */
export function useJoustResult(gameId: number | null): PuzzleRead<JoustGameResult> {
  return useJoustQuery(joustKeys.result(gameId ?? 0), (s) => s.result(gameId!), gameId !== null);
}

/** One of the player's Joust writes: every Joust read is read again once it lands or is refused (and the Cobbles' after a claim). */
function useJoustWrite<A, T>(player: string | null, write: (source: JoustSource, player: string, arg: A) => Promise<T>, cobbles = false) {
  const { joust } = useDataSources();
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (arg: A) => {
      if (!joust || player === null) throw new Error("The Joust is not on this network.");
      return write(joust, player, arg);
    },
    onSettled: async () => {
      await Promise.all([client.invalidateQueries({ queryKey: joustKeys.all }), ...(cobbles ? [client.invalidateQueries({ queryKey: cobbleKeys.all })] : [])]);
    },
  });
}

/** Registers the player's allegiance for this week's joust (an Officer's or the Leader's). */
export const useRegisterJoust = (player: string | null) => useJoustWrite<void, void>(player, (s, p) => s.register(p));

/** A new joust game for the player: its record. */
export const useStartJoust = (player: string | null) => useJoustWrite<void, JoustGameRecord>(player, (s, p) => s.start(p));

/** The Cobbles of a finished joust (`week`) the player played in. */
export const useClaimJoust = (player: string | null) => useJoustWrite<number, { cobbles: number }>(player, (s, p, week) => s.claim(p, week), true);

/**
 * The board's Joust game `gameId` as `viewer` sees it: a Puzzle game's session (`useSeededSession`) on the Joust's source, its engine
 * doubling the week's structure (the record's `boost`).
 */
export function useJoustSession(gameId: number, viewer: string | null) {
  const { joust } = useDataSources();
  const record = useJoustGameRecord(gameId);
  return { ...useSeededSession(gameId, viewer, record, joust ?? null, joustKeys), record };
}
