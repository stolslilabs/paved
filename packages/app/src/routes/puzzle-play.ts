import { useCallback } from "react";
import { toastError } from "../components/containers/error-toast";
import { usePuzzleActiveGame, useStartPuzzle } from "../data/puzzle";
import { useDataSources } from "../data/sources";
import { useAccount } from "../wallet/wallet";
import { errorDetail } from "./error-detail";
import { useAppNavigate } from "./ref";

/** A Puzzle game's board. */
export const puzzleGamePath = (gameId: number): string => `/puzzle/${gameId}`;

/** The current account: the signer's, else the wallet's; null for none. The Puzzle's writes are this account's. */
export function usePuzzleViewer(): string | null {
  const wallet = useAccount();
  return useDataSources().signer?.address ?? wallet.address ?? null;
}

/**
 * Play (the Puzzle view's, a game end's Play again): the player's game of today still open, else a new one (`start`), its board
 * opened. A refused start (a game opened meanwhile, in another tab) reads the open game again and says why.
 */
export function usePlayPuzzle(me: string | null, options: { replace?: boolean } = {}) {
  const go = useAppNavigate();
  const active = usePuzzleActiveGame(me);
  const start = useStartPuzzle(me);
  const { replace = false } = options;
  const open = active.data ?? null;
  const play = useCallback(() => {
    if (open) return go(puzzleGamePath(open.id), { replace });
    if (start.isPending) return;
    start.mutate(undefined, {
      onSuccess: (record) => go(puzzleGamePath(record.id), { replace }),
      onError: (error) => {
        active.refetch();
        toastError({ title: "Puzzle", message: error instanceof Error ? error.message : String(error), detail: errorDetail(error) });
      },
    });
  }, [open, start, go, replace, active]);
  return { play, busy: start.isPending, open };
}
