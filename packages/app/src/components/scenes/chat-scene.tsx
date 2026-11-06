import type { ReactNode } from "react";
import type { ChatTab } from "../../routes/chat-param";
import { ChatTabs, type ChatBadges } from "../containers/chat-tabs";
import { HudDrawer } from "../containers/hud-drawer";
import { SocialEmpty } from "../containers/social-empty";
import { Skeleton } from "../ui/skeleton";

export interface ChatSceneProps {
  /**
   * The tab shown (#973); null while the page finds which one it opens on (a member's first visit opens on Guild); omitted, no
   * tabs: a guest's empty state, or the chat not on this network.
   */
  tab?: ChatTab | null;
  onTabChange?: (tab: ChatTab) => void;
  badges?: ChatBadges;
  /** The page's menu at the header's end (`ChatMenu`: the muted players). */
  menu?: ReactNode;
  /** The tab's content as the app draws it (a conversation, or the Private tab's list). Unset: the empty state, as a guest sees it. */
  children?: ReactNode;
  /** Back, up to the village (BACK-RULE #783): the drawer's Back on a phone, its close from `tablet`. */
  onBack?: () => void;
  /** Whether the drawer is shown (CHAT-PAGE): its route is the current one; false while it slides out. Omitted, shown. */
  open?: boolean;
  /** Where the focus goes back as the drawer closes (the home's Chat tab, which opened it); omitted, Radix's own. */
  returnFocus?: () => HTMLElement | null;
}

/** A press outside the drawer that is no tap on the village: on a dialog drawn over it (a player's profile, New message, a report). */
function keepForDialogs(event: Event) {
  if (event.target instanceof Element && event.target.closest('[role="dialog"], [role="alertdialog"], [role="menu"]')) event.preventDefault();
}

/**
 * The chat page (`/chat`, #973). CHAT-PAGE (the Paved UX Book's "Chat" flow, the owner's approved mockups): the HUD's drawer, as the
 * profile, the Missions and the League (`HudDrawer`): a full page with Back on a phone, a side panel docked at the left from `tablet`,
 * the side of the home's Chat tab that opens it (the book draws it centred, so the League's rule decides), its close the red cross.
 * The header's end holds the page's menu (the muted players). Under it the book's three tabs, World, Guild and Private, as words
 * underlined in gold, then the tab's content as tall as the drawer leaves it: the World's and the guild's conversation in a carved
 * panel, the composer at its foot, every avatar in its league's rim with the level and the guild's tag; the Private tab's requests and
 * conversations, one opened over them.
 */
export function ChatScene({ tab, onTabChange, badges, menu, children, onBack, open, returnFocus }: ChatSceneProps) {
  let body: ReactNode = children ?? <SocialEmpty page="chat" className="drawer-carved border-0" />;
  if (tab === null)
    body = (
      <div aria-busy className="flex min-h-0 flex-1 flex-col gap-3">
        <Skeleton className="h-11 shrink-0 rounded-lg" />
        <Skeleton className="min-h-80 flex-1 rounded-2xl" />
      </div>
    );
  else if (tab !== undefined)
    body = (
      <ChatTabs tab={tab} onTabChange={onTabChange} badges={badges}>
        {children}
      </ChatTabs>
    );
  return (
    <HudDrawer
      open={open ?? true}
      onOpenChange={(next) => {
        if (!next) onBack?.();
      }}
      title="Chat"
      side="left"
      slot="chat"
      returnFocus={returnFocus}
      end={menu}
      // A press on a dialog over it (a player's profile, New message) is no tap on the village.
      onInteractOutside={keepForDialogs}
    >
      {body}
    </HudDrawer>
  );
}
