import type { ReactNode } from "react";
import type { ChatTab } from "../../routes/chat-param";
import type { Tab } from "../../routes/pages";
import { ChatTabs, type ChatBadges } from "../containers/chat-tabs";
import { SocialEmpty } from "../containers/social-empty";
import { Skeleton } from "../ui/skeleton";
import { TabPage } from "../containers/tab-page";

export interface ChatSceneProps {
  /**
   * The tab shown (#973); null while the page finds which one it opens on (a member's first visit opens on Guild); omitted, no
   * tabs: a guest's empty state, or the chat not on this network.
   */
  tab?: ChatTab | null;
  onTabChange?: (tab: ChatTab) => void;
  badges?: ChatBadges;
  /** The page's menu at the header's top right (`ChatMenu`: the muted players). */
  menu?: ReactNode;
  /** The tab's content as the app draws it (a conversation, or the Private tab's list). Unset: the empty state, as a guest sees it. */
  children?: ReactNode;
  /** Back, up to the village (BACK-RULE #783); omitted, the bar's Home. */
  onBack?: () => void;
  onNavigate?: (tab: Tab) => void;
}

/**
 * The chat page (`/chat`, #973, in place of the Social page's Chat tab): its header (the title, Back and the page's menu), then
 * three tabs, World, Guild and Private, so that every conversation is one tap away (#955's conversations). Below `desktop` it has
 * no bottom bar, so the conversation gets the height; from `desktop` it is in the home's side panel, on the right, as every page
 * (open point 2's default).
 */
export function ChatScene({ tab, onTabChange, badges, menu, children, onBack, onNavigate }: ChatSceneProps) {
  let body: ReactNode = children ?? <SocialEmpty page="chat" />;
  if (tab === null) body = <Skeleton aria-busy className="h-10 rounded-lg" />;
  else if (tab !== undefined)
    body = (
      <ChatTabs tab={tab} onTabChange={onTabChange} badges={badges}>
        {children}
      </ChatTabs>
    );
  return (
    <TabPage tab="chat" title="Chat" onBack={onBack} onNavigate={onNavigate} end={menu} bar={false}>
      {body}
    </TabPage>
  );
}
