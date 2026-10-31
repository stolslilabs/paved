import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { ConversationId } from "@paved/game-core";
import { useEffect } from "react";
import { addressKey } from "./keys";
import type { SocialRead } from "./social";
import type { ChatOverview, ChatSource } from "./social-source";
import { useDataSources } from "./sources";

// The Chat tab's overview (#955) and the chat's query keys, apart from the conversations' hooks (`chat.ts`): the Social page and
// the home's Social button read the badge from it without the infinite query's code.

/** The keys of the chat reads: under the social domain, `[social, chat, player, read, ...args]`. */
export const chatKeys = {
  /** Everything of the chat as `player` sees it: what a write of theirs makes stale. */
  all: (player: string) => ["social", "chat", addressKey(player)] as const,
  overview: (player: string) => ["social", "chat", addressKey(player), "overview"] as const,
  conversation: (player: string, id: ConversationId) => ["social", "chat", addressKey(player), "conversation", id] as const,
  mutes: (player: string) => ["social", "chat", addressKey(player), "mutes"] as const,
};

const UNAVAILABLE = { data: undefined, isPending: false, error: null, unavailable: true, refetch: () => undefined } as const;

/**
 * The Chat tab (#955): the conversations, the requests, the badge and the notice; disabled without a player. Read again whenever
 * a message comes to any conversation of the player (the source's subscription), so the badge follows.
 */
export function useChatOverview(me: string | null): SocialRead<ChatOverview> {
  const { social } = useDataSources();
  const chat = social?.chat ?? null;
  const client = useQueryClient();
  const query = useQuery({ queryKey: chatKeys.overview(me ?? "0x0"), queryFn: () => chat!.overview(me!), enabled: me !== null && chat !== null, staleTime: 0 });
  useEffect(() => {
    if (!chat || me === null) return;
    return chat.subscribe(me, null, () => void client.invalidateQueries({ queryKey: chatKeys.overview(me) }));
  }, [chat, me, client]);
  if (!chat) return UNAVAILABLE;
  return { data: query.data, isPending: me !== null && query.isPending && !query.error, error: query.error, unavailable: false, refetch: () => void query.refetch() };
}
