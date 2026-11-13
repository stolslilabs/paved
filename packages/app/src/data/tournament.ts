import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef } from "react";
import { cobbleKeys } from "./cobbles";
import { addressKey } from "./keys";
import type { PuzzleRead } from "./puzzle";
import { useSeededSession } from "./puzzle-game";
import { useDataSources } from "./sources";
import type { TournamentGameRecord, TournamentGameResult, TournamentSource, TournamentState } from "./tournament-source";

// The Tournament's hooks (the weekly individual event, game-core's `tournament.ts`), read from the sources' `tournament` (the mock's
// ledger: the whole event runs on the client). Without one (the chain) each answers `unavailable`, with no data and no error. Nothing
// polls: the week is read again on the window's focus, after the player's own writes, and at each UTC midnight while it is shown (the
// draw, each round's end and the next week's registration all start at one).

export type * from "./tournament-source";

/** The keys of the Tournament's reads, `[domain, read, ...args]` as `keys.ts`'s (here, so that the first load does not carry them). */
export const tournamentKeys = {
  all: ["tournament"] as const,
  /** The week as `viewer` sees it. */
  state: (viewer: string | null) => ["tournament", "state", viewer === null ? null : addressKey(viewer)] as const,
  game: (gameId: number) => ["tournament", "game", gameId] as const,
  result: (gameId: number) => ["tournament", "result", gameId] as const,
};

const UNAVAILABLE = { data: undefined, isPending: false, error: null, unavailable: true, refetch: () => undefined } as const;

const DAY_MS = 86_400_000;

/** Calls `read` at each UTC midnight while `on`: one timer to the next midnight, armed again once it fires (no polling). */
function useAtEachUtcMidnight(on: boolean, read: () => void): void {
  const latest = useRef(read);
  latest.current = read;
  useEffect(() => {
    if (!on) return;
    let timer: ReturnType<typeof setTimeout>;
    const arm = () => {
      timer = setTimeout(() => {
        latest.current();
        arm();
      }, DAY_MS - (Date.now() % DAY_MS));
    };
    arm();
    return () => clearTimeout(timer);
  }, [on]);
}

/** A query of the Tournament source: disabled without a source or without its argument (`enabled`); `daily`, read again at each UTC midnight. */
function useTournamentQuery<T>(key: readonly unknown[], read: (source: TournamentSource) => Promise<T>, enabled: boolean, daily = false): PuzzleRead<T> {
  const { tournament } = useDataSources();
  const query = useQuery({ queryKey: key, queryFn: () => read(tournament!), enabled: enabled && !!tournament, staleTime: 0 });
  useAtEachUtcMidnight(daily && enabled && !!tournament, () => void query.refetch());
  if (!tournament) return UNAVAILABLE;
  return { data: query.data, isPending: enabled && query.isPending && !query.error, error: query.error, unavailable: false, refetch: () => void query.refetch() };
}

/** Whether the sources hold a Tournament (the mock): without one, Play shows no Tournament card. */
export function useTournamentAvailable(): boolean {
  return !!useDataSources().tournament;
}

/** The week's Tournament as `viewer` sees it (null: no account, the week alone); `enabled` false reads nothing. */
export function useTournamentState(viewer: string | null, enabled = true): PuzzleRead<TournamentState> {
  return useTournamentQuery(tournamentKeys.state(viewer), (s) => s.state(viewer), enabled, true);
}

/** A game by its id, as stored when read: the board's start (its moves played again). */
export function useTournamentGameRecord(gameId: number | null): PuzzleRead<TournamentGameRecord> {
  return useTournamentQuery(tournamentKeys.game(gameId ?? 0), (s) => s.game(gameId!), gameId !== null);
}

/** A finished game's standing in its duel; read again at midnight, when the day decides it. */
export function useTournamentResult(gameId: number | null): PuzzleRead<TournamentGameResult> {
  return useTournamentQuery(tournamentKeys.result(gameId ?? 0), (s) => s.result(gameId!), gameId !== null, true);
}

/** One of the player's Tournament writes: every Tournament read is read again once it lands or is refused (and the Cobbles' after a claim). */
function useTournamentWrite<A, T>(player: string | null, write: (source: TournamentSource, player: string, arg: A) => Promise<T>, cobbles = false) {
  const { tournament } = useDataSources();
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (arg: A) => {
      if (!tournament || player === null) throw new Error("The Tournament is not on this network.");
      return write(tournament, player, arg);
    },
    onSettled: async () => {
      await Promise.all([client.invalidateQueries({ queryKey: tournamentKeys.all }), ...(cobbles ? [client.invalidateQueries({ queryKey: cobbleKeys.all })] : [])]);
    },
  });
}

/** Registers the player in their league's group for this week's tournament. */
export const useRegisterTournament = (player: string | null) => useTournamentWrite<void, void>(player, (s, p) => s.register(p));

/** The player's game of today's round: its record. */
export const useStartTournament = (player: string | null) => useTournamentWrite<void, TournamentGameRecord>(player, (s, p) => s.start(p));

/** The Cobbles of a run (`week`) that is over. */
export const useClaimTournament = (player: string | null) => useTournamentWrite<number, { cobbles: number }>(player, (s, p, week) => s.claim(p, week), true);

/** The board's Tournament game `gameId` as `viewer` sees it: a Puzzle game's session (`useSeededSession`) on the Tournament's source. */
export function useTournamentSession(gameId: number, viewer: string | null) {
  const { tournament } = useDataSources();
  const record = useTournamentGameRecord(gameId);
  return { ...useSeededSession(gameId, viewer, record, tournament ?? null, tournamentKeys), record };
}
