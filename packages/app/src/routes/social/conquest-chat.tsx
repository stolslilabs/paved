import { toastError } from "../../components/containers/error-toast";
import { ConquestChatCards } from "../../components/containers/conquest-chat-cards";
import { useConquestAvailable, useConquestState, useGiveConquest } from "../../data/conquest";
import { RENDERER_ASSETS } from "../../data/renderer-manifest";
import { useTileArt } from "../../data/tile-art";
import { errorDetail } from "../error-detail";
import { useAppNavigate } from "../ref";

/**
 * The Conquest's cards of the guild's chat: the allegiance's open build requests and its last tile built, read from the Conquest
 * (`useConquestState`), with Give. Nothing without a Conquest (the chain), before day 1, or for an allegiance that is not in it.
 */
export function ConquestChat({ player }: { player: string | null }) {
  const on = useConquestAvailable();
  const state = useConquestState(player, on && player !== null).data ?? null;
  const give = useGiveConquest(player);
  const go = useAppNavigate();
  const tileArt = useTileArt(RENDERER_ASSETS);
  if (!state?.allegiance) return null;
  return (
    <ConquestChatCards
      requests={state.requests}
      built={state.built}
      orders={state.allegiance.orders.left}
      busy={give.isPending}
      tileArt={tileArt}
      onGive={(id) => give.mutate(id, { onError: (error) => toastError({ title: "Conquest", message: error instanceof Error ? error.message : String(error), detail: errorDetail(error) }) })}
      onOpen={(zone) => go(`/conquest?zone=${zone}`)}
      onAll={() => go("/play/conquest?view=requests")}
    />
  );
}
