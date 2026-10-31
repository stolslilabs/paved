import { useCallback } from "react";
import { CHAT_PARAM, type ChatSheetState } from "./chat-param";
import { useAppNavigate } from "./ref";

/**
 * Opens a conversation (#955) from anywhere: the Social page's Chat tab at `?chat=<id>`, a new history entry, so Back closes it.
 * The profile's Message and the Friends tab's rows open the private conversation with that player.
 */
export function useOpenChat(): (id: string) => void {
  const go = useAppNavigate();
  return useCallback((id: string) => void go(`/social?${CHAT_PARAM}=${encodeURIComponent(id)}`, { state: { chatSheet: true } satisfies ChatSheetState }), [go]);
}
