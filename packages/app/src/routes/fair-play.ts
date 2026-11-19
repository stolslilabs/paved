import { toastError } from "../components/containers/error-toast";
import { useFairState, useStartFair } from "../data/fair";
import { errorDetail } from "./error-detail";
import { useAppNavigate } from "./ref";

/** A Fair try's game's board. */
export const fairGamePath = (tryId: number): string => `/fair/${tryId}`;
/** The open try's draft, a view of the Fair's. */
export const FAIR_DRAFT_PATH = "/play/fair?view=draft";

/**
 * Play (the Fair view's, a try's end's next try): the player's try still open (its draft's view, or its game's board), else a new one
 * (`start`), its draft opened (`replace`: in the current page's place, a game's end). A refusal (no try left today) is a toast.
 */
export function usePlayFair(me: string | null, options: { replace?: boolean } = {}) {
  const go = useAppNavigate();
  const state = useFairState(me, me !== null);
  const start = useStartFair(me);
  const open = state.data?.me?.open ?? null;
  const replace = options.replace ?? false;
  const play = () => {
    if (open) return go(open.stage === "draft" ? FAIR_DRAFT_PATH : fairGamePath(open.id), { replace });
    if (start.isPending) return;
    start.mutate(undefined, {
      onSuccess: () => go(FAIR_DRAFT_PATH, { replace }),
      onError: (error) => toastError({ title: "Fair", message: error instanceof Error ? error.message : String(error), detail: errorDetail(error) }),
    });
  };
  return { play, busy: start.isPending, open };
}
