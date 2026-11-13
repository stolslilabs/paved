import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef } from "react";
import { cobbleKeys } from "./cobbles";
import type { ColossusBoardState, ColossusBuilderRow, ColossusOptions, ColossusPlace, ColossusPlaced, ColossusSource, ColossusState } from "./colossus-source";
import { addressKey } from "./keys";
import type { PuzzleRead } from "./puzzle";
import { useDataSources } from "./sources";

// The Colossus's hooks (the weekly collective event, game-core's `colossus.ts`), read from the sources' `colossus` (the mock's
// ledger: the whole event runs on the client). Without one (the chain) each answers `unavailable`, with no data and no error. Nothing
// polls: the site is read again on the window's focus, after the player's own writes, and at each UTC midnight while it is shown
// (three new tiles, and on Monday a new site).

export type * from "./colossus-source";

const viewerKey = (viewer: string | null) => (viewer === null ? null : addressKey(viewer));

/** The keys of the Colossus's reads, `[domain, read, ...args]` as `keys.ts`'s (here, so that the first load does not carry them). */
export const colossusKeys = {
  all: ["colossus"] as const,
  state: (viewer: string | null) => ["colossus", "state", viewerKey(viewer)] as const,
  builders: (viewer: string | null) => ["colossus", "builders", viewerKey(viewer)] as const,
  board: (viewer: string | null, board: number) => ["colossus", "board", viewerKey(viewer), board] as const,
  options: (viewer: string | null, board: number, card: number) => ["colossus", "options", viewerKey(viewer), board, card] as const,
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

/** A query of the Colossus source: disabled without a source or without its argument (`enabled`); read again at each UTC midnight. */
function useColossusQuery<T>(key: readonly unknown[], read: (source: ColossusSource) => Promise<T>, enabled: boolean): PuzzleRead<T> {
  const { colossus } = useDataSources();
  const query = useQuery({ queryKey: key, queryFn: () => read(colossus!), enabled: enabled && !!colossus, staleTime: 0 });
  useAtEachUtcMidnight(enabled && !!colossus, () => void query.refetch());
  if (!colossus) return UNAVAILABLE;
  return { data: query.data, isPending: enabled && query.isPending && !query.error, error: query.error, unavailable: false, refetch: () => void query.refetch() };
}

/** Whether the sources hold a Colossus (the mock): without one, Play shows no Colossus card. */
export function useColossusAvailable(): boolean {
  return !!useDataSources().colossus;
}

/** The week's Colossus as `viewer` sees it (null: no account, the site alone); `enabled` false reads nothing. */
export function useColossusState(viewer: string | null, enabled = true): PuzzleRead<ColossusState> {
  return useColossusQuery(colossusKeys.state(viewer), (s) => s.state(viewer), enabled);
}

/** Every builder of the week by stones set; `enabled` false reads nothing (the builders' view closed). */
export function useColossusBuilders(viewer: string | null, enabled = true): PuzzleRead<ColossusBuilderRow[]> {
  return useColossusQuery(colossusKeys.builders(viewer), (s) => s.builders(viewer), enabled);
}

/** A board of the week's site (0 the heart); null reads nothing. */
export function useColossusBoard(viewer: string | null, board: number | null): PuzzleRead<ColossusBoardState> {
  return useColossusQuery(colossusKeys.board(viewer, board ?? -1), (s) => s.board(viewer, board!), board !== null);
}

/** Where the viewer's tile `card` may go on `board`, with the stones each placement would set; null (no card picked) reads nothing. */
export function useColossusOptions(viewer: string | null, board: number | null, card: number | null): PuzzleRead<ColossusOptions> {
  return useColossusQuery(colossusKeys.options(viewer, board ?? -1, card ?? -1), (s) => s.options(viewer!, board!, card!), viewer !== null && board !== null && card !== null);
}

/** One of the player's Colossus writes: every Colossus read is read again once it lands or is refused (and the Cobbles' after a claim). */
function useColossusWrite<A, T>(player: string | null, write: (source: ColossusSource, player: string, arg: A) => Promise<T>, cobbles = false) {
  const { colossus } = useDataSources();
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (arg: A) => {
      if (!colossus || player === null) throw new Error("The Colossus is not on this network.");
      return write(colossus, player, arg);
    },
    onSettled: async () => {
      await Promise.all([client.invalidateQueries({ queryKey: colossusKeys.all }), ...(cobbles ? [client.invalidateQueries({ queryKey: cobbleKeys.all })] : [])]);
    },
  });
}

/** Lays a tile of the player's hand. */
export const usePlaceColossus = (player: string | null) => useColossusWrite<ColossusPlace, ColossusPlaced>(player, (s, p, tile) => s.place(p, tile));

/** The Cobbles the player can claim for a week: this week's tiers reached, or last week's tiers and top 10. */
export const useClaimColossus = (player: string | null) => useColossusWrite<number, { cobbles: number }>(player, (s, p, week) => s.claim(p, week), true);
