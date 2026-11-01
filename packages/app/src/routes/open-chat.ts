import { useCallback } from "react";
import { CHAT_PARAM, type ChatSheetState } from "./chat-param";
import { useAppNavigate } from "./ref";

/**
 * Opens a conversation (#955) from anywhere: the chat page at `?chat=<id>` (#973), a new history entry, so Back closes it. The
 * profile's Message and the friends' rows open the private conversation with that player.
 */
export function useOpenChat(): (id: string) => void {
  const go = useAppNavigate();
  return useCallback((id: string) => void go(`/chat?${CHAT_PARAM}=${encodeURIComponent(id)}`, { state: { chatSheet: true } satisfies ChatSheetState }), [go]);
}
