import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useRef } from "react";
import { FairDraft, fairRandomOf } from "@paved/game-core";
import { cobbleKeys } from "./cobbles";
import type { FairRanking, FairSource, FairState, FairTryRecord, FairTryResult } from "./fair-source";
import { addressKey } from "./keys";
import type { PuzzleRead } from "./puzzle";
import { useSeededSession } from "./puzzle-game";
import { useDataSources } from "./sources";

// The Fair's hooks (the weekly individual event, game-core's `fair.ts`), read from the sources' `fair` (the mock's ledger: the whole
// event runs on the client). Without one (the chain) each answers `unavailable`, with no data and no error. Nothing polls: the week is
// read again on the window's focus, after the player's own writes, and at each UTC midnight while it is shown (the day's tries come
// back at one, Monday's result and new week start at one).

export type * from "./fair-source";

/** The keys of the Fair's reads, `[domain, read, ...args]` as `keys.ts`'s (here, so that the first load does not carry them). */
export const fairKeys = {
  all: ["fair"] as const,
  /** The week as `viewer` sees it. */
  state: (viewer: string | null) => ["fair", "state", viewer === null ? null : addressKey(viewer)] as const,
  ranking: (viewer: string | null) => ["fair", "ranking", viewer === null ? null : addressKey(viewer)] as const,
  game: (tryId: number) => ["fair", "game", tryId] as const,
  result: (tryId: number) => ["fair", "result", tryId] as const,
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

/** A query of the Fair source: disabled without a source or without its argument (`enabled`); `daily`, read again at each UTC midnight. */
function useFairQuery<T>(key: readonly unknown[], read: (source: FairSource) => Promise<T>, enabled: boolean, daily = false): PuzzleRead<T> {
  const { fair } = useDataSources();
  const query = useQuery({ queryKey: key, queryFn: () => read(fair!), enabled: enabled && !!fair, staleTime: 0 });
  useAtEachUtcMidnight(daily && enabled && !!fair, () => void query.refetch());
  if (!fair) return UNAVAILABLE;
  return { data: query.data, isPending: enabled && query.isPending && !query.error, error: query.error, unavailable: false, refetch: () => void query.refetch() };
}

/** Whether the sources hold a Fair (the mock): without one, Play shows no Fair card. */
export function useFairAvailable(): boolean {
  return !!useDataSources().fair;
}

/** The week's Fair as `viewer` sees it (null: no account, the week alone); `enabled` false reads nothing. */
export function useFairState(viewer: string | null, enabled = true): PuzzleRead<FairState> {
  return useFairQuery(fairKeys.state(viewer), (s) => s.state(viewer), enabled, true);
}

/** The week's ranking so far; `enabled` false reads nothing (the ranking's view closed). */
export function useFairRanking(viewer: string | null, enabled = true): PuzzleRead<FairRanking> {
  return useFairQuery(fairKeys.ranking(viewer), (s) => s.ranking(viewer), enabled, true);
}

/** A try by its id, as stored when read: its draft's picks, its game's moves. */
export function useFairTry(tryId: number | null): PuzzleRead<FairTryRecord> {
  return useFairQuery(fairKeys.game(tryId ?? 0), (s) => s.game(tryId!), tryId !== null);
}

/** A finished try's effect on its player's best. */
export function useFairResult(tryId: number | null): PuzzleRead<FairTryResult> {
  return useFairQuery(fairKeys.result(tryId ?? 0), (s) => s.result(tryId!), tryId !== null);
}

/** A try's draft, its picks played again from its seed (`FairDraft.replay`): the offer on the table, the next one, the deck so far. */
export const draftOfTry = (record: Pick<FairTryRecord, "seed" | "season" | "picks">): FairDraft => FairDraft.replay(record.season, fairRandomOf(BigInt(record.seed)), record.picks);

/** `record` once tile `choice` of its offer is taken, as the source will answer it. */
export function pickedTry(record: FairTryRecord, choice: number): FairTryRecord {
  const draft = draftOfTry(record);
  draft.pick(choice);
  return { ...record, picks: [...draft.picks], cards: [...draft.deck], stage: draft.over ? "game" : "draft" };
}

/** One of the player's Fair writes: every Fair read is read again once it lands or is refused (and the Cobbles' after a claim). */
function useFairWrite<A, T>(player: string | null, write: (source: FairSource, player: string, arg: A) => Promise<T>, cobbles = false) {
  const { fair } = useDataSources();
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (arg: A) => {
      if (!fair || player === null) throw new Error("The Fair is not on this network.");
      return write(fair, player, arg);
    },
    onSettled: async () => {
      await Promise.all([client.invalidateQueries({ queryKey: fairKeys.all }), ...(cobbles ? [client.invalidateQueries({ queryKey: cobbleKeys.all })] : [])]);
    },
  });
}

/** A new try for the player: its record, its first offer drawn. */
export const useStartFair = (player: string | null) => useFairWrite<void, FairTryRecord>(player, (s, p) => s.start(p));

/** Leaves the player's try `tryId` during its draft. */
export const useAbandonFair = (player: string | null) => useFairWrite<number, void>(player, (s, p, tryId) => s.abandon(p, tryId));

/** The Cobbles of a finished week (`week`) the player has a counted try in. */
export const useClaimFair = (player: string | null) => useFairWrite<number, { cobbles: number }>(player, (s, p, week) => s.claim(p, week), true);

/**
 * A pick of the player's draft: the try's read shows it at once (a draft replays from its seed and its picks, so a pick never waits
 * for the source), then the picks are sent one after the other, each naming the offer it answers. A refusal reads the try again.
 */
export function usePickFair(player: string | null) {
  const { fair } = useDataSources();
  const client = useQueryClient();
  const queue = useRef<Promise<unknown>>(Promise.resolve());
  return useMutation({
    mutationFn: ({ record, choice }: { record: FairTryRecord; choice: number }) => {
      if (!fair || player === null) throw new Error("The Fair is not on this network.");
      const offer = draftOfTry(record).offer?.number ?? 0;
      client.setQueryData(fairKeys.game(record.id), pickedTry(record, choice));
      const sent = queue.current.then(() => fair.pick(player, record.id, offer, choice));
      queue.current = sent.catch(() => undefined);
      return sent;
    },
    onError: (_error, { record }) => client.invalidateQueries({ queryKey: fairKeys.game(record.id) }),
    onSettled: () => client.invalidateQueries({ queryKey: fairKeys.state(player) }),
  });
}

/**
 * The board's game of try `tryId` as `viewer` sees it: a Puzzle game's session (`useSeededSession`) on the Fair's source, its engine
 * on the try's drafted deck (the record's `cards`). No game while the draft goes (or once it was left): `record` says which.
 */
export function useFairSession(tryId: number, viewer: string | null) {
  const { fair } = useDataSources();
  const record = useFairTry(tryId);
  // The game's read: the try's once its deck is built.
  const game = useMemo(() => ({ ...record, data: record.data?.stage === "game" ? record.data : undefined }), [record]);
  return { ...useSeededSession(tryId, viewer, game, fair ?? null, fairKeys), record };
}
