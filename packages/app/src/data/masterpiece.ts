import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { MASTERPIECE_DAYS, masterpieceDayOf, masterpieceWeekOf } from "@paved/game-core";
import { cobbleKeys } from "./cobbles";
import { addressKey } from "./keys";
import { MasterpieceGame } from "./masterpiece-game";
import type { MasterpieceBoardRecord, MasterpieceRanking, MasterpieceSource, MasterpieceState } from "./masterpiece-source";
import type { PuzzleRead } from "./puzzle";
import { useDataSources } from "./sources";

// The Masterpiece's hooks (the weekly individual event, game-core's `masterpiece.ts`), read from the sources' `masterpiece` (the mock's
// ledger: the whole event runs on the client). Without one (the chain) each answers `unavailable`, with no data and no error.
// Nothing polls: the week is read again on the window's focus, after the player's own writes, and at each UTC midnight while it is
// shown (a new day's tiles, and on Monday a new week).

export type * from "./masterpiece-source";

/** The keys of the Masterpiece's reads, `[domain, read, ...args]` as `keys.ts`'s (here, so that the first load does not carry them). */
export const masterpieceKeys = {
  all: ["masterpiece"] as const,
  /** The week as `viewer` sees it. */
  state: (viewer: string | null) => ["masterpiece", "state", viewer === null ? null : addressKey(viewer)] as const,
  ranking: (viewer: string | null) => ["masterpiece", "ranking", viewer === null ? null : addressKey(viewer)] as const,
  /** The player's board of this week. */
  board: (player: string | null) => ["masterpiece", "board", player === null ? null : addressKey(player)] as const,
};

const UNAVAILABLE = { data: undefined, isPending: false, error: null, unavailable: true, refetch: () => undefined } as const;

const DAY_MS = 86_400_000;

/** Calls `read` at each UTC midnight while `on`: one timer to the next midnight, armed again once it fires (no polling; the Colossus's). */
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

/** A query of the Masterpiece source: disabled without a source or without its argument (`enabled`); read again at each UTC midnight. */
function useMasterpieceQuery<T>(key: readonly unknown[], read: (source: MasterpieceSource) => Promise<T>, enabled: boolean): PuzzleRead<T> {
  const { masterpiece } = useDataSources();
  const query = useQuery({ queryKey: key, queryFn: () => read(masterpiece!), enabled: enabled && !!masterpiece, staleTime: 0 });
  useAtEachUtcMidnight(enabled && !!masterpiece, () => void query.refetch());
  if (!masterpiece) return UNAVAILABLE;
  return { data: query.data, isPending: enabled && query.isPending && !query.error, error: query.error, unavailable: false, refetch: () => void query.refetch() };
}

/** Whether the sources hold a Masterpiece (the mock): without one, Play shows no Masterpiece card. */
export function useMasterpieceAvailable(): boolean {
  return !!useDataSources().masterpiece;
}

/** The week's Masterpiece as `viewer` sees it (null: no account, the week alone); `enabled` false reads nothing. */
export function useMasterpieceState(viewer: string | null, enabled = true): PuzzleRead<MasterpieceState> {
  return useMasterpieceQuery(masterpieceKeys.state(viewer), (s) => s.state(viewer), enabled);
}

/** The week's live ranking, its bars and the Hall's records; `enabled` false reads nothing. */
export function useMasterpieceRanking(viewer: string | null, enabled = true): PuzzleRead<MasterpieceRanking> {
  return useMasterpieceQuery(masterpieceKeys.ranking(viewer), (s) => s.ranking(viewer), enabled);
}

/** The player's board of this week, as stored when read: the board's start (its log played again). Disabled without a player. */
export function useMasterpieceBoardRecord(player: string | null): PuzzleRead<MasterpieceBoardRecord> {
  return useMasterpieceQuery(masterpieceKeys.board(player), (s) => s.board(player!), player !== null);
}

/** One of the player's Masterpiece writes: every Masterpiece read is read again once it lands or is refused (and the Cobbles' after a claim). */
function useMasterpieceWrite<A, T>(player: string | null, write: (source: MasterpieceSource, player: string, arg: A) => Promise<T>, cobbles = false) {
  const { masterpiece } = useDataSources();
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (arg: A) => {
      if (!masterpiece || player === null) throw new Error("The Masterpiece is not on this network.");
      return write(masterpiece, player, arg);
    },
    onSettled: async () => {
      await Promise.all([client.invalidateQueries({ queryKey: masterpieceKeys.all }), ...(cobbles ? [client.invalidateQueries({ queryKey: cobbleKeys.all })] : [])]);
    },
  });
}

/** Opens the player's board of this week (the first visit creates it): its record. */
export const useOpenMasterpiece = (player: string | null) => useMasterpieceWrite<void, MasterpieceBoardRecord>(player, (s, p) => s.open(p));

/** The Cobbles of a finished week's tier (`week`). */
export const useClaimMasterpiece = (player: string | null) => useMasterpieceWrite<number, { cobbles: number }>(player, (s, p, week) => s.claim(p, week), true);

/** The day a board of `week` is on at `now`: 0 Monday to 6 Sunday, `MASTERPIECE_DAYS` once its week is over, -1 before it. */
export const masterpieceBoardDay = (week: number, now: number): number => {
  const current = masterpieceWeekOf(now);
  return current === week ? masterpieceDayOf(now) : current > week ? MASTERPIECE_DAYS : -1;
};

/**
 * The board of `viewer`'s Masterpiece this week at `now`: read once from the source, then played on the device, each move sent in
 * order as theirs (`MasterpieceGame`). A refetch of the record never resets the board; `reload` reads it again (a refused move). A
 * new day opens its tiles on the board by itself. Once the moves sent are taken, the week's reads are refreshed (the card, the ranking).
 */
export function useMasterpieceSession(viewer: string | null, now: number) {
  const { masterpiece } = useDataSources();
  const client = useQueryClient();
  const record = useMasterpieceBoardRecord(viewer);
  const viewerKey = viewer === null ? null : addressKey(viewer);
  const [opened, setOpened] = useState(0);
  const [built, setBuilt] = useState<{ key: string; game: MasterpieceGame } | null>(null);
  const key = `${opened}:${viewerKey}`;
  useEffect(() => {
    const data = record.data;
    if (!data || !masterpiece || viewerKey === null || built?.key === key || addressKey(data.player) !== viewerKey) return;
    setBuilt({ key, game: MasterpieceGame.open(data, masterpieceBoardDay(data.week, Math.floor(Date.now() / 1000)), (move) => masterpiece.play(viewerKey, data.week, move)) });
  }, [record.data, masterpiece, built, key, viewerKey]);
  const game = built && built.key.endsWith(`:${viewerKey}`) ? built.game : null;

  const day = game ? masterpieceBoardDay(game.record.week, now) : null;
  useEffect(() => {
    if (game && day !== null) game.setDay(day);
  }, [game, day]);

  const subscribe = useCallback((listener: () => void) => (game ? game.subscribe(listener) : () => {}), [game]);
  const snapshot = useSyncExternalStore(subscribe, () => game?.snapshot ?? null);

  // The week's reads (Play's card, the ranking) once the source has taken the moves sent.
  const sending = snapshot?.sending ?? 0;
  const moved = snapshot !== null && snapshot.delta !== null;
  useEffect(() => {
    if (moved && sending === 0) {
      void client.invalidateQueries({ queryKey: masterpieceKeys.state(viewerKey) });
      void client.invalidateQueries({ queryKey: masterpieceKeys.ranking(viewerKey) });
    }
  }, [moved, sending, client, viewerKey]);

  const reload = useCallback(() => {
    void client.invalidateQueries({ queryKey: masterpieceKeys.board(viewerKey) }).then(() => setOpened((n) => n + 1));
  }, [client, viewerKey]);

  return { game, snapshot, record, reload };
}
