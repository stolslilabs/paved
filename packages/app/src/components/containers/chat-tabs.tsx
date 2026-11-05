import type { ReactNode } from "react";
import { formatInteger } from "@paved/game-core";
import type { ChatTab } from "../../routes/chat-param";
import { Button } from "../ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../ui/tabs";
import { UiIcon } from "../elements/ui-icon";
import { GOLD_RAISED } from "./chat-conversation";
import { CountBadge } from "./chat-list";

/** What waits in the Guild and the Private tabs (#973): the guild's unread messages; the private ones and the requests. */
export type ChatBadges = Readonly<Record<"guild" | "private", number>>;

/** Each tab, left to right. The World has no badge. */
export const CHAT_TABS: readonly { id: ChatTab; label: string }[] = [
  { id: "world", label: "World" },
  { id: "guild", label: "Guild" },
  { id: "private", label: "Private" },
];

export interface ChatTabsProps {
  tab: ChatTab;
  onTabChange?: (tab: ChatTab) => void;
  badges?: ChatBadges;
  /** The tab's content: the World's or the guild's conversation, or the Private tab's list (or a conversation over it). */
  children: ReactNode;
}

/**
 * The chat page's three tabs (#973; CHAT-PAGE, the Paved UX Book's): World, Guild and Private as words, the shown one white and
 * underlined in gold (the Shop's tabs), each on one line at 320 px; Guild badges its unread messages, Private its unread messages and
 * the requests, in the book's red square. Only the shown tab's content is drawn, as tall as the drawer leaves it.
 */
export function ChatTabs({ tab, onTabChange, badges, children }: ChatTabsProps) {
  return (
    <Tabs value={tab} onValueChange={(v) => CHAT_TABS.some((t) => t.id === v) && onTabChange?.(v as ChatTab)} rememberAs="chat" className="min-h-0 flex-1 gap-3">
      <TabsList aria-label="Conversations" className="h-auto w-full shrink-0 bg-transparent p-0" indicatorClassName="top-auto bottom-0 h-1 rounded-full bg-primary">
        {CHAT_TABS.map(({ id, label }) => {
          const count = id === "world" ? 0 : (badges?.[id] ?? 0);
          return (
            <TabsTrigger key={id} value={id} aria-label={`${label}${count > 0 ? `, ${formatInteger(count)} waiting` : ""}`} className="text-outline h-11 gap-1 px-1 text-lg font-bold">
              <span>{label}</span>
              <CountBadge count={count} className="-translate-y-1.5" />
            </TabsTrigger>
          );
        })}
      </TabsList>
      {CHAT_TABS.map(({ id }) => (
        <TabsContent key={id} value={id} className="flex min-h-0 min-w-0 flex-col gap-3">
          {id === tab && children}
        </TabsContent>
      ))}
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
