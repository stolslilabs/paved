import { useEffect } from "react";
import { useChatOverview } from "../data/chat-overview";
import { usePlayerGuild } from "../data/guilds";
import { useFollowLists } from "../data/social";
import type { SocialCounts } from "../components/scenes/home-village-scene";

// What waits on the Chat, Guild and Friends pages (#973), for the home's three buttons: its own chunk, fetched after the home,
// so that the social reads stay out of the home's first load.

/** Reads the guild's badge (#953), the new followers (#954) and the chat's badge (#955) of `me`, and tells them; draws nothing. */
export default function SocialCount({ me, onCount }: { me: string | null; onCount: (counts: SocialCounts) => void }) {
  const guild = usePlayerGuild(me).data?.badge ?? 0;
  const friends = useFollowLists(me).data?.newFollowers ?? 0;
  const chat = useChatOverview(me).data?.badge ?? 0;
  const guest = me === null;
  useEffect(() => onCount(guest ? { chat: 0, guild: 0, friends: 0 } : { chat, guild, friends }), [guest, chat, guild, friends, onCount]);
  return null;
}
