import type { ReactNode } from "react";
import type { Tab } from "../../routes/pages";
import { Icon } from "../ui/icon";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../ui/tabs";
import { PlayerSearch, type PlayerSearchProps } from "../containers/player-search";
import { NO_SOCIAL_BADGES, SOCIAL_TABS, SocialEmptyTab, socialTabOf, type SocialBadges, type SocialTab } from "../containers/social-tabs";
import { TabPage } from "../containers/tab-page";

export interface SocialSceneProps {
  /** The tab shown: the last one used on this device (the page keeps it). */
  tab: SocialTab;
  onTabChange?: (tab: SocialTab) => void;
  /** What waits in each tab (#953 to #955 count theirs); none: nothing. */
  badges?: SocialBadges;
  /** The player search (#952), above the tabs: its results open a player's public profile. */
  search: PlayerSearchProps;
  /**
   * A tab's content, as the page draws it (each tab its own chunk, filled by its issue). Unset, or nothing for a tab: the tab's
   * empty state (`SocialEmptyTab`), as in the stories and the render tests.
   */
  renderTab?: (tab: SocialTab) => ReactNode;
  /** Back, up to the village (BACK-RULE #783); omitted, the bar's Home. */
  onBack?: () => void;
  onNavigate?: (tab: Tab) => void;
}

/**
 * The Social page (`/social`, #952): its header (the title and Back), the player search, and three tabs, Guild, Friends and Chat,
 * each with a badge for what waits there. Each tab's content is its issue's (#953, #954, #955); until then it shows its empty
 * state. From `desktop` the page is in the home's side panel, on the right, as the overlay's other pages (DESK-PANELS, #762).
 */
export function SocialScene({ tab, onTabChange, badges = NO_SOCIAL_BADGES, search, renderTab, onBack, onNavigate }: SocialSceneProps) {
  return (
    <TabPage tab="social" title="Social" onBack={onBack} onNavigate={onNavigate}>
      <PlayerSearch {...search} />
      <Tabs value={tab} onValueChange={(value) => onTabChange?.(socialTabOf(value) ?? tab)} rememberAs="social">
        <TabsList aria-label="Social" className="w-full">
          {SOCIAL_TABS.map(({ id, label, icon }) => {
            const waiting = badges[id];
            return (
              <TabsTrigger key={id} value={id} aria-label={waiting > 0 ? `${label}, ${waiting} waiting` : label} className="px-2">
                <Icon name={icon} size="xs" fixedWidth />
                {label}
                {waiting > 0 && (
                  // On the trigger's top right corner, as the home's buttons' counts: it takes no room from the label.
                  <span aria-hidden className="numeric absolute -top-2 -right-1 z-10 grid h-5 min-w-5 place-items-center rounded-full bg-primary px-1 text-xs leading-none font-semibold text-primary-foreground">
                    {waiting > 99 ? "99+" : waiting}
                  </span>
                )}
              </TabsTrigger>
            );
          })}
        </TabsList>
        {SOCIAL_TABS.map(({ id }) => (
          <TabsContent key={id} value={id}>
            {renderTab?.(id) ?? <SocialEmptyTab tab={id} />}
          </TabsContent>
        ))}
      </Tabs>
    </TabPage>
  );
}
