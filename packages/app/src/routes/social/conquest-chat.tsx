import { conquestChatCards, type ConquestChatCard } from "../../components/containers/conquest-chat-cards";
import { useConquestAvailable, useConquestState } from "../../data/conquest";
import { RENDERER_ASSETS } from "../../data/renderer-manifest";
import { useTileRenders } from "../../data/tile-renders";
import { conquestCellPath } from "../conquest-play";
import { useAppNavigate } from "../ref";

/**
 * The Conquest's cards of the guild's conversation: the allegiance's open build requests and its last tiles built, each at its time
 * among the messages, read from the Conquest (`useConquestState`). None without a Conquest (the chain), before day 1, for another
 * conversation (`on` false), or for an allegiance that is not in it.
 */
export function useConquestChatCards(player: string | null, on: boolean): ConquestChatCard[] {
  const available = useConquestAvailable();
  const state = useConquestState(player, available && on && player !== null).data ?? null;
  const go = useAppNavigate();
  const renders = useTileRenders(RENDERER_ASSETS);
  if (!on || !state?.allegiance) return [];
  return conquestChatCards({ requests: state.requests, built: state.built, renders, onOpen: (at) => go(conquestCellPath(at)) });
}
