import { toastError } from "../components/containers/error-toast";
import { useJoustState, useStartJoust } from "../data/joust";
import { errorDetail } from "./error-detail";
import { useAppNavigate } from "./ref";

/** A Joust game's board. */
export const joustGamePath = (gameId: number): string => `/joust/${gameId}`;

/**
 * Play (the Joust view's, a game end's next game): the player's joust game still open, else a new one (`start`), its board opened
 * (`replace`: in the current page's place, a game's end). A refusal (no game left, the joust over) is a toast.
 */
export function usePlayJoust(me: string | null, options: { replace?: boolean } = {}) {
  const go = useAppNavigate();
  const state = useJoustState(me, me !== null);
  const start = useStartJoust(me);
  const open = state.data?.me?.open ?? null;
  const replace = options.replace ?? false;
  const play = () => {
    if (open) return go(joustGamePath(open.id), { replace });
    if (start.isPending) return;
    start.mutate(undefined, {
      onSuccess: (record) => go(joustGamePath(record.id), { replace }),
      onError: (error) => toastError({ title: "Joust", message: error instanceof Error ? error.message : String(error), detail: errorDetail(error) }),
    });
  };
  return { play, busy: start.isPending, open };
}
