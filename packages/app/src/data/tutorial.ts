import { useCallback, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient, type UseQueryResult } from "@tanstack/react-query";
import type { WriteResult } from "@paved/chain";
import {
  CENTER,
  OrientationType,
  PlanType,
  TutorialRun,
  attempt,
  back as backOne,
  closuresOf,
  loadMoves,
  saveMoves,
  tutorialSteps,
  type BoardTile,
  type TutorialMove,
  type TutorialView,
} from "@paved/game-core";
import { queryKeys } from "./keys";
import { trainingStore, useDataSources } from "./sources";
import type { SessionBoard } from "./training";

const ORIENTATIONS = Object.values(OrientationType);
const PLANS = Object.values(PlanType);

/** The board of a tutorial view, in the chain's coordinates (the starter at `CENTER`), as Training's `boardOf`. */
export function tutorialBoard(view: TutorialView): SessionBoard {
  const g = view.game;
  const tiles: BoardTile[] = g.placed().map((t) => ({
    id: t.id,
    plan: PLANS.indexOf(t.plan),
    orientation: ORIENTATIONS.indexOf(t.orientation),
    x: CENTER + t.x,
    y: CENTER + t.y,
  }));
  const hand = view.over ? null : g.hand;
  return {
    tiles,
    score: g.score,
    // As Training: the starter counts as placed, a discard as spent.
    remaining: Math.max(0, g.tileLimit - (g.built + 1) - g.discarded),
    lastScored: closuresOf(view.last) ?? [],
    hand: hand ? { plan: PLANS.indexOf(hand.plan) } : null,
    over: view.over,
  };
}

/**
 * The tutorial on the board (P6): game-core's `TutorialRun`, one per mounted page (a lazy `useState`, not the module-level
 * `followTutorial`), so its engine is kept between steps and replayed only to resume and on Back. The moves are saved in
 * the tutorial's own entry (`paved.tutorial.v1`) of the sources' store.
 */
export function useTutorialRun(): {
  view: TutorialView;
  board: SessionBoard;
  /** The step being played (0-based) and the number of steps. */
  index: number;
  steps: number;
  /** Plays the move; returns why it was refused, or null. */
  play: (move: TutorialMove) => string | null;
  back: () => void;
  restart: () => void;
  /** The run itself (its `replays`, for the tests). */
  run: TutorialRun;
} {
  const sources = useDataSources();
  const store = trainingStore(sources);
  // A lazy initialiser, not a write to a ref during render: React calls it for the state it keeps, and `TutorialRun`
  // starts an engine as it is built.
  const [run] = useState(() => new TutorialRun());
  const [moves, setMoves] = useState<TutorialMove[]>(() => loadMoves(store));
  const view = useMemo(() => run.sync(moves), [run, moves]);
  const board = useMemo(() => tutorialBoard(view), [view]);

  const commit = useCallback(
    (next: TutorialMove[]) => {
      setMoves(next);
      saveMoves(next, store);
    },
    [store],
  );
  const play = useCallback(
    (move: TutorialMove) => {
      const result = attempt(moves, move);
      if (!result.ok) return result.reason;
      commit(result.moves);
      return null;
    },
    [moves, commit],
  );
  const back = useCallback(() => commit(backOne(moves)), [moves, commit]);
  const restart = useCallback(() => commit([]), [commit]);

  return { view, board, index: moves.length, steps: tutorialSteps().length, play, back, restart, run };
}

/** The task the claim credits: `TUTORIAL_FINISHED` (quests.md), which completes First Stone. */
export const TUTORIAL_TASK = 10;

/**
 * The outcome of one `Setup.claim_tutorial()` (app-web's `TutorialClaim.tsx`). The call is idempotent (D-21, P-49): the
 * first emits `AchievementProgressed { task 10 }`, a later one nothing, so the receipt tells them apart.
 */
export function claimOutcome(result: WriteResult): "claimed" | "already-claimed" {
  const credited = result.events.some((e) => e.name === "AchievementProgressed" && Number(e.fields.taskId) === TUTORIAL_TASK);
  return credited ? "claimed" : "already-claimed";
}

/** `Setup.tutorial_claimed(player)`: a claim made before needs no transaction. Disabled without a player. */
export function useTutorialClaimed(playerId: string | null): UseQueryResult<boolean> {
  const { views } = useDataSources();
  return useQuery({
    queryKey: queryKeys.chain.tutorialClaimed(playerId ?? "0x0"),
    queryFn: () => views.tutorialClaimed(playerId as string),
    enabled: playerId !== null,
  });
}

/**
 * The tutorial's claim (D-21): First Stone, claimed with the signer's `claimTutorial`. Without a signer it is refused
 * before anything is sent (the page offers Connect instead). A claim sets the claimed read.
 */
export function useTutorialClaim() {
  const { signer = null } = useDataSources();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      if (!signer) throw new Error("Connect a wallet to claim First Stone.");
      return { address: signer.address, outcome: claimOutcome(await signer.claimTutorial()) };
    },
    onSuccess: ({ address }) => queryClient.setQueryData(queryKeys.chain.tutorialClaimed(address), true),
  });
}
