import type { ReactNode } from "react";
import type { GuildTab } from "../../routes/guild-tab";
import { Tabs, TabsContent } from "../ui/tabs";
import type { UiIconName } from "../elements/ui-art";
import { UiIcon } from "../elements/ui-icon";
import { FooterTab, FooterTabsList } from "./footer-tabs";
import { DrawerFooter } from "./hud-drawer";

/** What waits in Announcements (the unread ones) and in Requests (the requests, officers and the leader). */
export type GuildBadges = Readonly<Partial<Record<"announcements" | "requests", number>>>;

/** Each tab, left to right, as the Paved UX Book names them, with its footer tab's painted icon (FOOTER-TABS, #1062). */
export const GUILD_TABS: readonly { id: GuildTab; label: string; art: UiIconName; word?: string }[] = [
  // Its soft hyphen: a column of four on a 320 px phone breaks it as "Announce-ments".
  { id: "announcements", label: "Announcements", art: "pin", word: "Announce\u00ADments" },
  { id: "members", label: "Members", art: "members" },
  { id: "requests", label: "Requests", art: "letter" },
  { id: "log", label: "Log", art: "missions" },
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
 * The guild page's tabs (#973; GUILD-PAGE, the Paved UX Book's Guild; FOOTER-TABS since #1062, the owner's standard for a page's tabs):
 * Announcements, Members, Requests (officers and the leader: three or four columns) and Log as the footer's tabs (`FooterTabsList` in
 * the drawer's `DrawerFooter`), each its painted icon, the current one's word under it. Announcements badges its unread ones, Requests
 * the requests waiting, the dock's red count. The guild's header stays over each tab; only the shown tab's content is drawn.
 */
export function GuildTabs({ tab, onTabChange, tabs, badges, children }: GuildTabsProps) {
  const shown = GUILD_TABS.filter((t) => tabs.includes(t.id));
  return (
    <Tabs value={tab} onValueChange={(v) => v !== tab && shown.some((t) => t.id === v) && onTabChange?.(v as GuildTab)} rememberAs="guild" className="gap-3">
      {shown.map(({ id }) => (
        <TabsContent key={id} value={id} className="min-w-0">
          {id === tab && children}
        </TabsContent>
      ))}
      <DrawerFooter>
        <FooterTabsList aria-label="Allegiance">
          {shown.map(({ id, label, art, word }) => (
            // 12 px words under `mobile` (360), 14 from it: four columns of a 320 px phone.
            <FooterTab key={id} value={id} label={label} word={word} className="text-xs mobile:text-sm" badge={id === "announcements" || id === "requests" ? (badges?.[id] ?? 0) : 0} art={<UiIcon name={art} px={36} className="drawer-icon size-9" />} />
          ))}
        </FooterTabsList>
      </DrawerFooter>
    </Tabs>
  );
}
