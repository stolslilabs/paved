import { useCallback } from "react";
import { privateChatPath, type ChatSheetState } from "./chat-param";
import { useAppNavigate } from "./ref";

/**
 * Opens the private conversation with `player` (#955) from anywhere: the chat page's Private tab at `/chat/private/<player>`
 * (#973), a new history entry, so Back closes it. The profile's Message and the friends' rows use it.
 */
export function useOpenPrivateChat(): (player: string) => void {
  const go = useAppNavigate();
  return useCallback((player: string) => void go(privateChatPath(player), { state: { chatSheet: true } satisfies ChatSheetState }), [go]);
}
