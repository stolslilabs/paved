import { useEffect } from "react";
import { socialTotal } from "../components/containers/social-tabs";
import { useChatOverview } from "../data/chat-overview";
import { usePlayerGuild } from "../data/guilds";
import { useFollowLists } from "../data/social";

// What waits on the Social page (#952), for the home's Social button: its own chunk, fetched after the home, so that the social
// reads stay out of the home's first load.

/** Reads the Guild tab's badge (#953), the new followers (#954) and the Chat tab's badge (#955) of `me`, and tells their total; draws nothing. */
export default function SocialCount({ me, onCount }: { me: string | null; onCount: (count: number) => void }) {
  const guild = usePlayerGuild(me).data?.badge ?? 0;
  const friends = useFollowLists(me).data?.newFollowers ?? 0;
  const chat = useChatOverview(me).data?.badge ?? 0;
  const total = me === null ? 0 : socialTotal({ guild, friends, chat });
  useEffect(() => onCount(total), [total, onCount]);
  return null;
}
