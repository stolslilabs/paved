import type { ReactNode } from "react";
import { formatInteger } from "@paved/game-core";
import type { ChatTab } from "../../routes/chat-param";
import { Button } from "../ui/button";
import { Icon } from "../ui/icon";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../ui/tabs";
import { countText } from "./chat-list";

/** What waits in the Guild and the Private tabs (#973): the guild's unread messages; the private ones and the requests. */
export type ChatBadges = Readonly<Record<"guild" | "private", number>>;

/** Each tab, left to right: its label and its icon. The World has no badge. */
export const CHAT_TABS: readonly { id: ChatTab; label: string; icon: string }[] = [
  { id: "world", label: "World", icon: "users" },
  { id: "guild", label: "Guild", icon: "shield-halved" },
  { id: "private", label: "Private", icon: "comments" },
];

export interface ChatTabsProps {
  tab: ChatTab;
  onTabChange?: (tab: ChatTab) => void;
  badges?: ChatBadges;
  /** The tab's content: the World's or the guild's conversation, or the Private tab's list (or a conversation over it). */
  children: ReactNode;
}

/**
 * The chat page's three tabs (#973): World, Guild and Private, each with its icon and its whole label on one line at 320 px; Guild
 * badges its unread messages, Private its unread messages and the requests. Only the shown tab's content is drawn.
 */
export function ChatTabs({ tab, onTabChange, badges, children }: ChatTabsProps) {
  return (
    <Tabs value={tab} onValueChange={(v) => CHAT_TABS.some((t) => t.id === v) && onTabChange?.(v as ChatTab)} rememberAs="chat">
      <TabsList aria-label="Conversations" className="w-full">
        {CHAT_TABS.map(({ id, label, icon }) => {
          const count = id === "world" ? 0 : (badges?.[id] ?? 0);
          return (
            <TabsTrigger key={id} value={id} aria-label={`${label}${count > 0 ? `, ${formatInteger(count)} waiting` : ""}`} className="px-2">
              <Icon name={icon} size="xs" />
              <span>{label}</span>
              {count > 0 && (
                <span aria-hidden className="numeric absolute -top-2 -right-1 z-10 grid h-5 min-w-5 place-items-center rounded-full bg-primary px-1 text-xs leading-none font-semibold text-primary-foreground">
                  {countText(count)}
                </span>
              )}
            </TabsTrigger>
          );
        })}
      </TabsList>
      {CHAT_TABS.map(({ id }) => (
        <TabsContent key={id} value={id} className="min-w-0">
          {id === tab && children}
        </TabsContent>
      ))}
    </Tabs>
  );
}

/** The Guild tab of a player in no guild (#973): what the tab will hold, and the way to the guild page, to find or create one. */
export function ChatGuildless({ onFindGuild }: { onFindGuild?: () => void }) {
  return (
    <div data-slot="chat-guildless" className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-border px-4 py-8 text-center">
      <Icon name="shield-halved" size="lg" className="text-muted-foreground" />
      <p className="font-semibold">You are in no guild</p>
      <p className="max-w-xs text-sm text-muted-foreground">Your guild's conversation shows here once you join one. Find a guild to join, or create your own.</p>
      {onFindGuild && (
        <Button onClick={onFindGuild}>
          <Icon name="magnifying-glass" size="xs" />
          Find a guild
        </Button>
      )}
    </div>
  );
}
