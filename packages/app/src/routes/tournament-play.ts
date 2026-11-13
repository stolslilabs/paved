import { tournamentRoundName } from "@paved/game-core";
import { toastError } from "../components/containers/error-toast";
import type { TournamentCard } from "../components/containers/play-modes";
import { useStartTournament, useTournamentAvailable, useTournamentState } from "../data/tournament";
import { errorDetail } from "./error-detail";
import { useAppNavigate } from "./ref";

/** A Tournament game's board. */
export const tournamentGamePath = (gameId: number): string => `/tournament/${gameId}`;

/**
 * Play (the Tournament view's): the player's tournament game still open, else today's (`start`), its board opened. A refusal (no
 * duel today, the game already played, out) is a toast.
 */
export function usePlayTournament(me: string | null) {
  const go = useAppNavigate();
  const state = useTournamentState(me, me !== null);
  const start = useStartTournament(me);
  const open = state.data?.run?.open ?? null;
  const play = () => {
    if (open) return go(tournamentGamePath(open.id));
    if (start.isPending) return;
    start.mutate(undefined, {
      onSuccess: (record) => go(tournamentGamePath(record.id)),
      onError: (error) => toastError({ title: "Tournament", message: error instanceof Error ? error.message : String(error), detail: errorDetail(error) }),
    });
  };
  return { play, busy: start.isPending, open };
}

/**
 * The Tournament's card of Play (Limited): the day's phase, the player's registration and where their run stands, their game still
 * open (a tap then opens it); null without a Tournament (the chain) or while the week is read: no card.
 */
export function useTournamentCard(me: string | null): { card: TournamentCard | null; on: boolean; path: string } {
  const on = useTournamentAvailable();
  const state = useTournamentState(me, on).data ?? null;
  if (!state) return { card: null, on, path: "/play/tournament" };
  const run = state.run;
  const today = run?.path[run.path.length - 1] ?? null;
  const card: TournamentCard = {
    phase: state.phase,
    endsAt: state.endsAt,
    registered: state.registered,
    round: state.round > 0 ? tournamentRoundName(state.round) : null,
    run: run && { status: run.status, opponent: today?.opponent?.name ?? null, out: run.status === "out" ? tournamentRoundName(run.reached) : null, claimable: run.claimable },
    playing: run?.open ? { score: run.open.score } : null,
  };
  return { card, on, path: run?.open ? tournamentGamePath(run.open.id) : "/play/tournament" };
}
