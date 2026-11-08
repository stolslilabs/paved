import { useCallback, useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { browserStore, type KeyValueStore } from "@paved/game-core";
import { cobbleKeys } from "./cobbles";
import { addressKey } from "./keys";
import type { PuzzleGameRecord, PuzzleGameResult, PuzzlePrize, PuzzleStanding } from "./puzzle-source";
import { useDataSources } from "./sources";

// The Puzzle's hooks (Play's Limited mode, `docs/architecture/puzzle-mode.md`), read from the sources' `puzzle` (the mock's ledger
// today, the Puzzle's contract and the indexer later). Without one (the chain today) each answers `unavailable`, with no data and no
// error. Nothing polls: a day's leaderboard is read again on the window's focus and after the player's own writes.

export type { PuzzleEntry, PuzzleGameRecord, PuzzleGameResult, PuzzlePrize, PuzzleSource, PuzzleStanding } from "./puzzle-source";
export { PUZZLE_PRIZE_TOP, PUZZLE_STANDING_LIMIT } from "./puzzle-source";

/** The keys of the Puzzle's reads, `[domain, read, ...args]` as `keys.ts`'s (here, so that the first load does not carry them). */
export const puzzleKeys = {
  all: ["puzzle"] as const,
  /** A day's leaderboard as `viewer` sees it. */
  standing: (day: number, viewer: string | null) => ["puzzle", "standing", day, viewer === null ? null : addressKey(viewer)] as const,
  /** The player's game of today still open. */
  active: (player: string) => ["puzzle", "active", addressKey(player)] as const,
  /** A game by its id. */
  game: (gameId: number) => ["puzzle", "game", gameId] as const,
  /** A finished game's result. */
  result: (gameId: number) => ["puzzle", "result", gameId] as const,
  /** The player's prizes. */
  prizes: (player: string) => ["puzzle", "prizes", addressKey(player)] as const,
};

/** A Puzzle read: its data (undefined while read), the wait and the error together, and `unavailable` without a Puzzle source. */
export interface PuzzleRead<T> {
  data: T | undefined;
  isPending: boolean;
  error: Error | null;
  /** No Puzzle source: nothing is read, and nothing will come. */
  unavailable: boolean;
  refetch: () => void;
}

const UNAVAILABLE = { data: undefined, isPending: false, error: null, unavailable: true, refetch: () => undefined } as const;

/** A query of the Puzzle source as a `PuzzleRead`: disabled without a source or without its argument (`enabled`). */
function usePuzzleQuery<T>(key: readonly unknown[], read: (source: NonNullable<ReturnType<typeof useDataSources>["puzzle"]>) => Promise<T>, enabled: boolean): PuzzleRead<T> {
  const { puzzle } = useDataSources();
  const query = useQuery({ queryKey: key, queryFn: () => read(puzzle!), enabled: enabled && !!puzzle, staleTime: 0 });
  if (!puzzle) return UNAVAILABLE;
  return { data: query.data, isPending: enabled && query.isPending && !query.error, error: query.error, unavailable: false, refetch: () => void query.refetch() };
}

/** Whether the sources hold a Puzzle (the mock today): without one, Play's card stays "Coming soon". */
export function usePuzzleAvailable(): boolean {
  return !!useDataSources().puzzle;
}

/** A day's leaderboard as `viewer` sees it; disabled without a day. */
export function usePuzzleStanding(day: number | null, viewer: string | null): PuzzleRead<PuzzleStanding> {
  return usePuzzleQuery(puzzleKeys.standing(day ?? 0, viewer), (s) => s.standing(day, viewer), day !== null);
}

/** The player's game of today still open (null: none); disabled without a player. */
export function usePuzzleActiveGame(player: string | null): PuzzleRead<PuzzleGameRecord | null> {
  return usePuzzleQuery(puzzleKeys.active(player ?? "0x0"), (s) => s.activeGame(player!), player !== null);
}

/** A game by its id, as stored when read: the board's start (its moves played again). */
export function usePuzzleGameRecord(gameId: number | null): PuzzleRead<PuzzleGameRecord> {
  return usePuzzleQuery(puzzleKeys.game(gameId ?? 0), (s) => s.game(gameId!), gameId !== null);
}

/** A finished game's effect on its player's day: its end's figures. */
export function usePuzzleResult(gameId: number | null): PuzzleRead<PuzzleGameResult> {
  return usePuzzleQuery(puzzleKeys.result(gameId ?? 0), (s) => s.result(gameId!), gameId !== null);
}

/** The days the player finished first: the mailbox's prizes. */
export function usePuzzlePrizes(player: string | null): PuzzleRead<PuzzlePrize[]> {
  return usePuzzleQuery(puzzleKeys.prizes(player ?? "0x0"), (s) => s.prizes(player!), player !== null);
}

/** Records the player's visit once per mount (the mock's welcome prize), then reads the prizes and the leaderboards again. */
export function usePuzzleVisit(player: string | null): void {
  const { puzzle } = useDataSources();
  const client = useQueryClient();
  useEffect(() => {
    if (!puzzle || player === null) return;
    let live = true;
    void puzzle
      .visit(player)
      .then(() => {
        if (live) void client.invalidateQueries({ queryKey: puzzleKeys.all });
      })
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [puzzle, player, client]);
}

/** A new game of today for the player (`start`): its record, the open game's read refreshed. Null without a source or a player. */
export function useStartPuzzle(player: string | null) {
  const { puzzle } = useDataSources();
  const client = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      if (!puzzle || player === null) throw new Error("The Puzzle is not on this network.");
      return puzzle.start(player);
    },
    onSuccess: (record) => {
      client.setQueryData(puzzleKeys.game(record.id), record);
      if (player !== null) client.setQueryData(puzzleKeys.active(player), record);
    },
  });
}

/** The Cobbles of the prizes of the days given (`claim`): the prizes and the Cobbles' reads refreshed once it lands. */
export function useClaimPuzzle(player: string | null) {
  const { puzzle } = useDataSources();
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (days: readonly number[]) => {
      if (!puzzle || player === null) throw new Error("The Puzzle is not on this network.");
      return puzzle.claim(player, days);
    },
    onSettled: async () => {
      await Promise.all([client.invalidateQueries({ queryKey: puzzleKeys.all }), client.invalidateQueries({ queryKey: cobbleKeys.all })]);
    },
  });
}

/** Where the mails a player deleted are kept: the device's, as the mailbox's mails are read from the chain and kept nowhere else. */
export const INBOX_HIDDEN_KEY = "paved.inbox.hidden.v1";

/** The deleted mails' ids by player (address key). */
type HiddenMails = Record<string, string[]>;

function readHidden(store: () => KeyValueStore | null): HiddenMails {
  try {
    const value = JSON.parse(store()?.getItem(INBOX_HIDDEN_KEY) ?? "{}") as unknown;
    return value && typeof value === "object" ? (value as HiddenMails) : {};
  } catch {
    return {};
  }
}

/** A Puzzle prize's mail id, as its path names it: `puzzle-<day>`. */
export const puzzleMailId = (day: number): string => `puzzle-${day}`;

/** The day a mail id names, or null for an id that is no Puzzle prize's. */
export const puzzleMailDay = (id: string | null | undefined): number | null => {
  const match = id ? /^puzzle-(\d{1,9})$/.exec(id) : null;
  return match ? Number(match[1]) : null;
};

/**
 * The mails the player deleted from the mailbox, on this device (`INBOX_HIDDEN_KEY`), and the delete. A mail is derived from the
 * chain's state (a prize won, claimed or not), so a delete hides it here; a prize is claimed before its mail is deleted.
 */
export function useHiddenMails(player: string | null, store: () => KeyValueStore | null = browserStore): { hidden: ReadonlySet<string>; hide: (id: string) => void } {
  const [all, setAll] = useState<HiddenMails>(() => readHidden(store));
  const key = player === null ? null : addressKey(player);
  const hidden = useMemo(() => new Set(key === null ? [] : (all[key] ?? [])), [all, key]);
  const hide = useCallback(
    (id: string) => {
      if (key === null) return;
      const next = readHidden(store);
      next[key] = [...new Set([...(next[key] ?? []), id])];
      try {
        store()?.setItem(INBOX_HIDDEN_KEY, JSON.stringify(next));
      } catch {
        // Storage refused: the mail stays hidden for the visit.
      }
      setAll(next);
    },
    [key, store],
  );
  return { hidden, hide };
}
