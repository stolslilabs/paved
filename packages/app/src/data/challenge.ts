import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { GameKey, WriteResult } from "@paved/chain";
import { PredictedSession, type MoveSenders, type PredictedState } from "@paved/game-core";
import { refreshPlayerProgress } from "./indexer";
import { addressKey, queryKeys } from "./keys";
import { useDataSources } from "./sources";

export type ChallengeSession = PredictedSession<GameKey, WriteResult>;

/**
 * The board's session of a Challenge game (P5): a `PredictedSession` on the sources' views, the game read and replayed
 * once on open, then each move predicted by the engine and confirmed by the chain. `senders` are the signer's writes
 * for this game; null without a signer (the board is read only, P6 connects the wallet). Each confirmed move refreshes the
 * `game(id)` and active-game reads of the other pages (`queryKeys`), and the player's progress (`refreshPlayerProgress`).
 *
 * `@paved/chain` is loaded with the session (a dynamic import, for the writer's `GameExpiredError`): the board's module is
 * shared with Training, which must not bring starknet.js.
 */
export function useChallengeSession(gameId: number): {
  session: ChallengeSession | null;
  state: PredictedState | null;
  senders: MoveSenders<WriteResult> | null;
} {
  const { views, signer = null } = useDataSources();
  const queryClient = useQueryClient();
  const [session, setSession] = useState<ChallengeSession | null>(null);

  useEffect(() => {
    let live = true;
    void import("@paved/chain").then(({ GameExpiredError }) => {
      if (!live) return;
      const next: ChallengeSession = new PredictedSession(views, { mode: "challenge", gameId }, signer?.address ?? null, {
        expiredError: () => new GameExpiredError(),
      });
      setSession(next);
      void next.open();
    });
    return () => {
      live = false;
      setSession(null);
    };
  }, [views, signer, gameId]);

  const subscribe = useCallback((listener: () => void) => (session ? session.subscribe(listener) : () => {}), [session]);
  const state = useSyncExternalStore(subscribe, () => session?.state ?? null);

  // A confirmed move (no move unconfirmed any more) changed the game: the other pages' reads of it are stale.
  const settled = state?.status === "ready" && state.unconfirmed === 0 ? `${state.game?.score}:${state.game?.placedCount}:${state.game?.discardedCount}:${state.game?.over}` : null;
  useEffect(() => {
    if (settled === null) return;
    void queryClient.invalidateQueries({ queryKey: queryKeys.chain.game(gameId) });
    if (signer) void queryClient.invalidateQueries({ queryKey: queryKeys.chain.activeGame(signer.address) });
  }, [settled, queryClient, gameId, signer]);

  // ... and the player's own progress, which the app's completion toasts follow (#595): a mission completed in this game
  // toasts on the board. The game over's own read is the over page's (`useGameCompletions`), with its retries.
  const player = state?.status === "ready" ? (state.game?.playerId ?? null) : null;
  const mine = signer !== null && player !== null && addressKey(player) === addressKey(signer.address);
  useEffect(() => {
    if (settled !== null && mine && signer) refreshPlayerProgress(queryClient, signer.address);
  }, [settled, mine, queryClient, signer]);

  const senders = useMemo<MoveSenders<WriteResult> | null>(() => {
    if (!signer) return null;
    const key: GameKey = { mode: "challenge", gameId };
    return { build: (move) => signer.build(key, move), discard: () => signer.discard(key), surrender: () => signer.surrender(key) };
  }, [signer, gameId]);

  return { session, state, senders };
}
