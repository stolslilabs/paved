import { useBack, useTabNavigate } from "../ref";
import { ChatContent } from "../social/chat-content";
import { ProfilesBelowDesktop } from "../social/profiles-below-desktop";

/**
 * `/chat` (#973, PvP v2 step 1 on the mock): the chat page, in place of the Social page's Chat tab. Three tabs, World, Guild and
 * Private (`/chat/<tab>`), a private conversation over the Private tab's list at `/chat/private/<player>` (the profile's Message
 * and the friends' rows open it), and New message (#973); the old `/chat?chat=` and `/social?chat=` links land on their tab
 * (`router.tsx`, `chat-content.tsx`). Its own chunk, its content with it.
 */
export default function Page() {
  const onNavigate = useTabNavigate();
  const onBack = useBack();
  return (
    <>
      <ChatContent onBack={onBack} onNavigate={onNavigate} />
      <ProfilesBelowDesktop />
    </>
  );
}
