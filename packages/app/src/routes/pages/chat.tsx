import { ChatScene } from "../../components/scenes/chat-scene";
import { useBack, useTabNavigate } from "../ref";
import { ChatContent } from "../social/chat-content";
import { ProfilesBelowDesktop } from "../social/profiles-below-desktop";

/**
 * `/chat` (#973, PvP v2 step 1 on the mock): the chat page, in place of the Social page's Chat tab. The conversations and the
 * requests (#955), one conversation open at `?chat=<id>` (the profile's Message and the friends' rows open it); the old
 * `/social?chat=` links land here (`router.tsx`). Its own chunk, its content with it.
 */
export default function Page() {
  const onNavigate = useTabNavigate();
  const onBack = useBack();
  return (
    <>
      <ChatScene onBack={onBack} onNavigate={onNavigate}>
        <ChatContent />
      </ChatScene>
      <ProfilesBelowDesktop />
    </>
  );
}
