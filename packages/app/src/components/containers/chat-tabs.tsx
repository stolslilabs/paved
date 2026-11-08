import type { ReactNode } from "react";
import type { ChatTab } from "../../routes/chat-param";
import { Button } from "../ui/button";
import { Tabs, TabsContent } from "../ui/tabs";
import type { UiIconName } from "../elements/ui-art";
import { UiIcon } from "../elements/ui-icon";
import { GOLD_RAISED } from "./chat-conversation";
import { FooterTab, FooterTabsList } from "./footer-tabs";
import { DrawerFooter } from "./hud-drawer";

/** What waits in the Guild and the Private tabs (#973): the guild's unread messages; the private ones and the requests. */
export type ChatBadges = Readonly<Record<"guild" | "private", number>>;

/** Each tab, left to right. The World has no badge. */
export const CHAT_TABS: readonly { id: ChatTab; label: string; art: UiIconName }[] = [
  { id: "world", label: "World", art: "chat" },
  { id: "guild", label: "Guild", art: "guild" },
  // The mailbox (the owner's ask of 2026-11-08): the DMs and the system's mail, a Puzzle prize's; its path stays `/chat/private`.
  { id: "private", label: "Inbox", art: "letter" },
];

export interface ChatTabsProps {
  tab: ChatTab;
  onTabChange?: (tab: ChatTab) => void;
  badges?: ChatBadges;
  /** The tab's content: the World's or the guild's conversation, or the Private tab's list (or a conversation over it). */
  children: ReactNode;
}

/**
 * The chat page's three tabs (#973; CHAT-PAGE, the Paved UX Book's; FOOTER-TABS since #1062, the owner's standard for a page's tabs):
 * World, Guild and Private as the footer's tabs (`FooterTabsList` in the drawer's `DrawerFooter`), each its painted icon, the current
 * one's word under it; Guild badges its unread messages, Private its unread messages and the requests, the dock's red count. Only the
 * shown tab's content is drawn, as tall as the drawer leaves it, the composer at its foot over the tabs; a private conversation opened
 * over the Private list keeps the tabs, Private current (#1062's open point 1).
 */
export function ChatTabs({ tab, onTabChange, badges, children }: ChatTabsProps) {
  return (
    <Tabs value={tab} onValueChange={(v) => v !== tab && CHAT_TABS.some((t) => t.id === v) && onTabChange?.(v as ChatTab)} rememberAs="chat" className="min-h-0 flex-1 gap-3">
      {CHAT_TABS.map(({ id }) => (
        <TabsContent key={id} value={id} className="flex min-h-0 min-w-0 flex-col gap-3">
          {id === tab && children}
        </TabsContent>
      ))}
      <DrawerFooter>
        <FooterTabsList aria-label="Conversations">
          {CHAT_TABS.map(({ id, label, art }) => (
            <FooterTab key={id} value={id} label={label} badge={id === "world" ? 0 : (badges?.[id] ?? 0)} art={<UiIcon name={art} px={36} className="drawer-icon size-9" />} />
          ))}
        </FooterTabsList>
      </DrawerFooter>
    </Tabs>
  );
}

/** The Guild tab of a player in no guild (#973): what the tab will hold, and the way to the guild page, to find or create one. */
export function ChatGuildless({ onFindGuild }: { onFindGuild?: () => void }) {
  return (
    <div data-slot="chat-guildless" className="drawer-carved flex flex-col items-center gap-3 rounded-2xl px-4 py-8 text-center">
      <UiIcon name="guild" size="xl" className="drawer-icon" />
      <p className="text-outline text-lg font-bold">You are in no guild</p>
      <p className="max-w-xs text-sm font-semibold text-muted-foreground">Your guild's conversation shows here once you join one. Find a guild to join, or create your own.</p>
      {onFindGuild && (
        <Button className="text-outline h-11 rounded-xl px-5 text-base font-bold text-foreground" style={GOLD_RAISED} onClick={onFindGuild}>
          Find a guild
        </Button>
      )}
    </div>
  );
}
