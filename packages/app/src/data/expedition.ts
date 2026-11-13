import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { cobbleKeys } from "./cobbles";
import { ExpeditionGame } from "./expedition-game";
import type { ExpeditionBoardRecord, ExpeditionSource, ExpeditionState } from "./expedition-source";
import { addressKey } from "./keys";
import type { PuzzleRead } from "./puzzle";
import { useDataSources } from "./sources";

// The Expedition's hooks (the weekly individual event, game-core's `expedition.ts`), read from the sources' `expedition` (the mock's
// ledger: the whole event runs on the client). Without one (the chain) each answers `unavailable`, with no data and no error.
// Nothing polls: the week is read again on the window's focus and after the player's own writes.

export type * from "./expedition-source";

/** The keys of the Expedition's reads, `[domain, read, ...args]` as `keys.ts`'s (here, so that the first load does not carry them). */
export const expeditionKeys = {
  all: ["expedition"] as const,
  /** The week as `viewer` sees it. */
  state: (viewer: string | null) => ["expedition", "state", viewer === null ? null : addressKey(viewer)] as const,
  /** The player's board of this week. */
  board: (player: string | null) => ["expedition", "board", player === null ? null : addressKey(player)] as const,
};

const UNAVAILABLE = { data: undefined, isPending: false, error: null, unavailable: true, refetch: () => undefined } as const;

/** A query of the Expedition source: disabled without a source or without its argument (`enabled`). */
function useExpeditionQuery<T>(key: readonly unknown[], read: (source: ExpeditionSource) => Promise<T>, enabled: boolean): PuzzleRead<T> {
  const { expedition } = useDataSources();
  const query = useQuery({ queryKey: key, queryFn: () => read(expedition!), enabled: enabled && !!expedition, staleTime: 0 });
  if (!expedition) return UNAVAILABLE;
  return { data: query.data, isPending: enabled && query.isPending && !query.error, error: query.error, unavailable: false, refetch: () => void query.refetch() };
}

/** Whether the sources hold an Expedition (the mock): without one, Play shows no Expedition card. */
export function useExpeditionAvailable(): boolean {
  return !!useDataSources().expedition;
}

/** The week's Expedition as `viewer` sees it (null: no account, the week alone); `enabled` false reads nothing. */
export function useExpeditionState(viewer: string | null, enabled = true): PuzzleRead<ExpeditionState> {
  return useExpeditionQuery(expeditionKeys.state(viewer), (s) => s.state(viewer), enabled);
}

/** The player's board of this week, as stored when read: the board's start (its log played again). Disabled without a player. */
export function useExpeditionBoardRecord(player: string | null): PuzzleRead<ExpeditionBoardRecord> {
  return useExpeditionQuery(expeditionKeys.board(player), (s) => s.board(player!), player !== null);
}

/** One of the player's Expedition writes: every Expedition read is read again once it lands or is refused (and the Cobbles' after a claim). */
function useExpeditionWrite<A, T>(player: string | null, write: (source: ExpeditionSource, player: string, arg: A) => Promise<T>, cobbles = false) {
  const { expedition } = useDataSources();
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (arg: A) => {
      if (!expedition || player === null) throw new Error("The Expedition is not on this network.");
      return write(expedition, player, arg);
    },
    onSettled: async () => {
      await Promise.all([client.invalidateQueries({ queryKey: expeditionKeys.all }), ...(cobbles ? [client.invalidateQueries({ queryKey: cobbleKeys.all })] : [])]);
    },
  });
}

/** Opens the player's board of this week and draws the rations due today: its record. */
export const useOpenExpedition = (player: string | null) => useExpeditionWrite<void, ExpeditionBoardRecord>(player, (s, p) => s.open(p));

/** The Cobbles of a finished week's tier (`week`). */
export const useClaimExpedition = (player: string | null) => useExpeditionWrite<number, { cobbles: number }>(player, (s, p, week) => s.claim(p, week), true);

/**
 * The board of `viewer`'s Expedition this week: read once from the source, then played on the device, each move sent in order as
 * theirs (`ExpeditionGame`). A refetch of the record never resets the board; `reload` reads it again (a refused move, the day's
 * draw). Once the moves sent are taken, the week's read is refreshed (the card, the journal).
 */
export function useExpeditionSession(viewer: string | null) {
  const { expedition } = useDataSources();
  const client = useQueryClient();
  const record = useExpeditionBoardRecord(viewer);
  const viewerKey = viewer === null ? null : addressKey(viewer);
  const [opened, setOpened] = useState(0);
  const [built, setBuilt] = useState<{ key: string; game: ExpeditionGame } | null>(null);
  const key = `${opened}:${viewerKey}`;
  useEffect(() => {
    const data = record.data;
    if (!data || !expedition || viewerKey === null || built?.key === key || addressKey(data.player) !== viewerKey) return;
    setBuilt({ key, game: ExpeditionGame.open(data, (move) => expedition.play(viewerKey, data.week, move)) });
  }, [record.data, expedition, built, key, viewerKey]);
  const game = built && built.key.endsWith(`:${viewerKey}`) ? built.game : null;

  const subscribe = useCallback((listener: () => void) => (game ? game.subscribe(listener) : () => {}), [game]);
  const snapshot = useSyncExternalStore(subscribe, () => game?.snapshot ?? null);

  // The week's read (Play's card, the journal) once the source has taken the moves sent.
  const sending = snapshot?.sending ?? 0;
  const moved = snapshot !== null && snapshot.delta !== null;
  useEffect(() => {
    if (moved && sending === 0) void client.invalidateQueries({ queryKey: expeditionKeys.state(viewerKey) });
  }, [moved, sending, client, viewerKey]);

  const reload = useCallback(() => {
    void client.invalidateQueries({ queryKey: expeditionKeys.board(viewerKey) }).then(() => setOpened((n) => n + 1));
  }, [client, viewerKey]);

  return { game, snapshot, record, reload };
}
