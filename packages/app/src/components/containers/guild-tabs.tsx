import type { ReactNode } from "react";
import { formatInteger } from "@paved/game-core";
import type { GuildTab } from "../../routes/guild-tab";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../ui/tabs";

/** What waits in Announcements (the unread ones) and in Requests (the requests, officers and the leader). */
export type GuildBadges = Readonly<Partial<Record<"announcements" | "requests", number>>>;

/** Each tab, left to right, as the Paved UX Book names them. */
export const GUILD_TABS: readonly { id: GuildTab; label: string }[] = [
  { id: "announcements", label: "Announcements" },
  { id: "members", label: "Members" },
  { id: "requests", label: "Requests" },
  { id: "log", label: "Log" },
];

export interface GuildTabsProps {
  tab: GuildTab;
  onTabChange?: (tab: GuildTab) => void;
  /** The tabs shown: Requests for officers and the leader only. */
  tabs: readonly GuildTab[];
  badges?: GuildBadges;
  /** The tab's content. */
  children: ReactNode;
}

/**
 * The guild page's tabs (#973; GUILD-PAGE, the Paved UX Book's Guild): Announcements, Members, Requests (officers and the leader) and
 * Log, as the Shop's: words outlined, the current one underlined in gold, each column its label's width so the four fit a 320 px phone
 * (12 px words under `mobile`, 14 from it; the drawer keeps the phone's layout at every width). Announcements badges its unread ones, Requests the requests waiting, in the dock's red count at the
 * word's top right (the book's). Only the shown tab's content is drawn.
 */
export function GuildTabs({ tab, onTabChange, tabs, badges, children }: GuildTabsProps) {
  const shown = GUILD_TABS.filter((t) => tabs.includes(t.id));
  return (
    <Tabs value={tab} onValueChange={(v) => shown.some((t) => t.id === v) && onTabChange?.(v as GuildTab)} rememberAs="guild" className="gap-3">
      <TabsList aria-label="Guild" className="h-auto w-full auto-cols-auto justify-between gap-0 bg-transparent p-0" indicatorClassName="top-auto bottom-0 h-1 rounded-full bg-primary">
        {shown.map(({ id, label }) => {
          const count = id === "announcements" || id === "requests" ? (badges?.[id] ?? 0) : 0;
          return (
            <TabsTrigger key={id} value={id} aria-label={`${label}${count > 0 ? `, ${formatInteger(count)} waiting` : ""}`} className="text-outline h-11 px-1 text-xs font-bold mobile:text-sm">
              {label}
              {count > 0 && (
                <span aria-hidden data-slot="guild-tab-badge" className="numeric absolute -top-0.5 right-0 grid h-4 min-w-4 place-items-center rounded-[0.3rem] bg-dock-badge px-0.5 text-xs leading-none font-bold text-foreground ring-2 ring-background">
                  {count > 99 ? "99+" : formatInteger(count)}
                </span>
              )}
            </TabsTrigger>
          );
        })}
      </TabsList>
      {shown.map(({ id }) => (
        <TabsContent key={id} value={id} className="min-w-0">
          {id === tab && children}
        </TabsContent>
      ))}
    </Tabs>
  );
}
