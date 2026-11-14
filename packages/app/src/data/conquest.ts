import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef } from "react";
import type { ConquestBranch, ConquestPlayPhase } from "@paved/game-core";
import { cobbleKeys } from "./cobbles";
import type { ConquestGiven, ConquestMemberRow, ConquestOptions, ConquestRanking, ConquestSource, ConquestState, ConquestZoneState } from "./conquest-source";
import { addressKey } from "./keys";
import type { PuzzleRead } from "./puzzle";
import { useDataSources } from "./sources";

// The Conquest's hooks (the season's finale, game-core's `conquest.ts`), read from the sources' `conquest` (the mock's ledger: the
// whole event runs on the client). Without one (the chain) each answers `unavailable`, with no data and no error. Nothing polls:
// the Conquest is read again on the window's focus, after the player's own writes, and at each UTC midnight while it is shown (a new
// day's orders and exploration, a phase's end).

export type * from "./conquest-source";

const viewerKey = (viewer: string | null) => (viewer === null ? null : addressKey(viewer));

/** The keys of the Conquest's reads, `[domain, read, ...args]` as `keys.ts`'s (here, so that the first load does not carry them). */
export const conquestKeys = {
  all: ["conquest"] as const,
  state: (viewer: string | null) => ["conquest", "state", viewerKey(viewer)] as const,
  zone: (viewer: string | null, zone: number) => ["conquest", "zone", viewerKey(viewer), zone] as const,
  options: (viewer: string | null, x: number, y: number) => ["conquest", "options", viewerKey(viewer), x, y] as const,
  ranking: (viewer: string | null) => ["conquest", "ranking", viewerKey(viewer)] as const,
  members: (viewer: string | null) => ["conquest", "members", viewerKey(viewer)] as const,
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

/** A query of the Conquest source: disabled without a source or without its argument (`enabled`); read again at each UTC midnight. */
function useConquestQuery<T>(key: readonly unknown[], read: (source: ConquestSource) => Promise<T>, enabled: boolean): PuzzleRead<T> {
  const { conquest } = useDataSources();
  const query = useQuery({ queryKey: key, queryFn: () => read(conquest!), enabled: enabled && !!conquest, staleTime: 0 });
  useAtEachUtcMidnight(enabled && !!conquest, () => void query.refetch());
  if (!conquest) return UNAVAILABLE;
  return { data: query.data, isPending: enabled && query.isPending && !query.error, error: query.error, unavailable: false, refetch: () => void query.refetch() };
}

/** Whether the sources hold a Conquest (the mock): without one, Play shows no Conquest card. */
export function useConquestAvailable(): boolean {
  return !!useDataSources().conquest;
}

/** The Conquest as `viewer` sees it (null: no account, the world alone); `enabled` false reads nothing. */
export function useConquestState(viewer: string | null, enabled = true): PuzzleRead<ConquestState> {
  return useConquestQuery(conquestKeys.state(viewer), (s) => s.state(viewer), enabled);
}

/** A zone of the world; null reads nothing. */
export function useConquestZone(viewer: string | null, zone: number | null): PuzzleRead<ConquestZoneState> {
  return useConquestQuery(conquestKeys.zone(viewer, zone ?? -1), (s) => s.zone(viewer, zone!), zone !== null);
}

/** The plans that fit a cell for the viewer's allegiance; null (no cell picked) reads nothing. */
export function useConquestOptions(viewer: string | null, cell: { x: number; y: number } | null): PuzzleRead<ConquestOptions> {
  return useConquestQuery(conquestKeys.options(viewer, cell?.x ?? -1, cell?.y ?? -1), (s) => s.options(viewer!, cell!.x, cell!.y), viewer !== null && cell !== null);
}

/** The allegiances by points; `enabled` false reads nothing (the ranking's view closed). */
export function useConquestRanking(viewer: string | null, enabled = true): PuzzleRead<ConquestRanking> {
  return useConquestQuery(conquestKeys.ranking(viewer), (s) => s.ranking(viewer), enabled);
}

/** The members of the viewer's allegiance; `enabled` false reads nothing. */
export function useConquestMembers(viewer: string | null, enabled = true): PuzzleRead<ConquestMemberRow[]> {
  return useConquestQuery(conquestKeys.members(viewer), (s) => s.members(viewer!), enabled && viewer !== null);
}

/** One of the player's Conquest writes: every Conquest read is read again once it lands or is refused (and the Cobbles' when it pays). */
function useConquestWrite<A, T>(player: string | null, write: (source: ConquestSource, player: string, arg: A) => Promise<T>, cobbles = false) {
  const { conquest } = useDataSources();
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (arg: A) => {
      if (!conquest || player === null) throw new Error("The Conquest is not on this network.");
      return write(conquest, player, arg);
    },
    onSettled: async () => {
      await Promise.all([client.invalidateQueries({ queryKey: conquestKeys.all }), ...(cobbles ? [client.invalidateQueries({ queryKey: cobbleKeys.all })] : [])]);
    },
  });
}

/** Registers the player's allegiance (an Officer or the Leader, during the registration). */
export const useRegisterConquest = (player: string | null) => useConquestWrite<void, { conquest: number }>(player, (s, p) => s.register(p));
/** Makes the Offerings that wait. */
export const useOfferConquest = (player: string | null) => useConquestWrite<void, { knowledge: number; order: boolean }>(player, (s, p) => s.offer(p));
/** Explores a cell: the day's exploration. */
export const useExploreConquest = (player: string | null) => useConquestWrite<{ x: number; y: number }, { knowledge: number }>(player, (s, p, cell) => s.explore(p, cell));
/** Opens a build request (an Officer or the Leader). */
export const useRequestConquest = (player: string | null) => useConquestWrite<{ x: number; y: number; plan: number; orientation: number }, { id: number }>(player, (s, p, tile) => s.request(p, tile));
/** Gives a request's tile: it is built at once, and pays its Cobbles. */
export const useGiveConquest = (player: string | null) => useConquestWrite<number, ConquestGiven>(player, (s, p, request) => s.give(p, request), true);
/** Buys a branch's next level (an Officer or the Leader). */
export const useResearchConquest = (player: string | null) => useConquestWrite<ConquestBranch, { level: number; cost: number }>(player, (s, p, branch) => s.research(p, branch));
/** The Cobbles of a Conquest the player can claim: its phases over and its final rank. */
export const useClaimConquest = (player: string | null) => useConquestWrite<{ conquest: number; part?: ConquestPlayPhase | "final" }, { cobbles: number }>(player, (s, p, what) => s.claim(p, what.conquest, what.part), true);
