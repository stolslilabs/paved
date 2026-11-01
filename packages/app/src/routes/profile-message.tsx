import { privateConversation } from "@paved/game-core";
import { MessageButton } from "../components/containers/message-button";
import type { FollowStatus } from "../data/social";
import { useOpenChat } from "./open-chat";

// The profile's Message (#955), in the profile's chunk: the private conversation with the player, on the chat page (#973).

/**
 * Message, on `address`'s profile: opens the private conversation with them (a friend's or a guildmate's at once; anyone else's
 * waits in their Requests, #955). None without a player, or while the viewer blocks them (the profile shows only Unblock).
 */
export function ProfileMessageAction({ address, name, me, status }: { address: string; name: string | null; me: string | null; status: FollowStatus | undefined }) {
  const openChat = useOpenChat();
  if (me === null || !status || status.blocking) return null;
  return <MessageButton name={name} onMessage={() => openChat(privateConversation(me, address))} />;
}
