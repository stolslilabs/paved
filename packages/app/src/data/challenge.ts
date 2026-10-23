import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { GameKey, WriteResult } from "@paved/chain";
import { PredictedSession, type MoveSenders, type PredictedState } from "@paved/game-core";
import type { RewardCurve } from "../components/containers/reward-estimate";
import { useEconomyDay, useTerms } from "./chain";
import { queryKeys } from "./keys";
import { curveOf } from "./reward-curve";
import { useDataSources } from "./sources";

export type ChallengeSession = PredictedSession<GameKey, WriteResult>;

/**
 * The board's session of a Challenge game (P5): a `PredictedSession` on the sources' views, the game read and replayed
 * once on open, then each move predicted by the engine and confirmed by the chain. `senders` are the signer's writes
 * for this game; null without a signer (the board is read only, P6 connects the wallet). Each confirmed move refreshes the
 * `game(id)` and active-game reads of the other pages (`queryKeys`).
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

  const senders = useMemo<MoveSenders<WriteResult> | null>(() => {
    if (!signer) return null;
    const key: GameKey = { mode: "challenge", gameId };
    return { build: (move) => signer.build(key, move), discard: () => signer.discard(key), surrender: () => signer.surrender(key) };
  }, [signer, gameId]);

  return { session, state, senders };
}

/**
 * The hand panel's queue of a Challenge game (#645): the tile to place and the tiles known after it. While a move on the
 * VRF is on its way the session holds no hand, but the next tile is known: it shows as the one to place, waiting with the
 * move, and the chain's draw takes the last slot.
 */
export function challengeQueue(state: Pick<PredictedState, "hand" | "coming" | "pending" | "drawing">): {
  tile: { plan: number } | null;
  coming: { plan: number }[];
  drawing: boolean;
} {
  const coming = state.coming ?? [];
  if (state.hand) return { tile: state.hand, coming, drawing: false };
  if (state.pending && coming.length > 0) return { tile: coming[0]!, coming: coming.slice(1), drawing: state.drawing ?? false };
  return { tile: null, coming: [], drawing: false };
}

/**
 * The reward curve of a Challenge game for its HUD (#705): its terms (`Economy.terms`) against its day's threshold
 * (`Economy.day`), as `curveOf` reads them. Null while they are read, without an economy, or for a game with no reward to
 * come (free, expired, settled).
 */
export function useChallengeCurve(gameId: number): RewardCurve | null {
  const terms = useTerms(gameId);
  const day = useEconomyDay(terms.data && terms.data.stake > 0 ? terms.data.day : null);
  return curveOf(terms.data, day.data);
}
