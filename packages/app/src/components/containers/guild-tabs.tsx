import type { ReactNode } from "react";
import { formatInteger } from "@paved/game-core";
import type { GuildTab } from "../../routes/guild-tab";
import { Icon } from "../ui/icon";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../ui/tabs";

/** What waits in Announcements (the unread ones) and in Requests (the requests, officers and the leader). */
export type GuildBadges = Readonly<Partial<Record<"announcements" | "requests", number>>>;

/** Each tab, left to right: its label and its icon. */
export const GUILD_TABS: readonly { id: GuildTab; label: string; icon: string }[] = [
  { id: "announcements", label: "Announcements", icon: "scroll" },
  { id: "members", label: "Members", icon: "users" },
  { id: "requests", label: "Requests", icon: "user-group" },
  { id: "log", label: "Log", icon: "book-open" },
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
 * The guild page's tabs (#973): Announcements, Members, Requests (officers and the leader) and Log. Each icon sits above its whole
 * label, and each column takes its label's width, so the four fit on one line at 320 px. Announcements badges its unread ones,
 * Requests the requests waiting. Only the shown tab's content is drawn.
 */
export function GuildTabs({ tab, onTabChange, tabs, badges, children }: GuildTabsProps) {
  const shown = GUILD_TABS.filter((t) => tabs.includes(t.id));
  return (
    <Tabs value={tab} onValueChange={(v) => shown.some((t) => t.id === v) && onTabChange?.(v as GuildTab)} rememberAs="guild">
      <TabsList aria-label="Guild" className="h-auto w-full auto-cols-auto">
        {shown.map(({ id, label, icon }) => {
          const count = id === "announcements" || id === "requests" ? (badges?.[id] ?? 0) : 0;
          return (
            <TabsTrigger key={id} value={id} aria-label={`${label}${count > 0 ? `, ${formatInteger(count)} waiting` : ""}`} className="h-auto flex-col gap-0.5 px-1 py-1 text-xs">
              <Icon name={icon} size="xs" />
              <span>{label}</span>
              {count > 0 && (
                <span aria-hidden className="numeric absolute -top-2 -right-1 z-10 grid h-5 min-w-5 place-items-center rounded-full bg-primary px-1 text-xs leading-none font-semibold text-primary-foreground">
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
