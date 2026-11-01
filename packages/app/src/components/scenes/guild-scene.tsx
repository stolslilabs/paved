import type { ReactNode } from "react";
import type { Tab } from "../../routes/pages";
import { SocialEmpty } from "../containers/social-empty";
import { TabPage } from "../containers/tab-page";

export interface GuildSceneProps {
  /** The page's content as the app draws it (the finder, or the player's guild, #953). Unset: the empty state, as a guest sees it. */
  children?: ReactNode;
  /** Back, up to the village (BACK-RULE #783); omitted, the bar's Home. */
  onBack?: () => void;
  onNavigate?: (tab: Tab) => void;
}

/**
 * The guild page (`/guild`, #973, in place of the Social page's Guild tab), for running the guild: its header (the title and
 * Back), then for a player in no guild the finder, for a member their guild's header, menu and tabs (Announcements, Members,
 * Requests for officers and the leader, Log). Another guild opens in a sheet over it (`?guild=`): its header and its members.
 * From `desktop` it is in the home's side panel, on the right, as every page.
 */
export function GuildScene({ children, onBack, onNavigate }: GuildSceneProps) {
  return (
    <TabPage tab="guild" title="Guild" onBack={onBack} onNavigate={onNavigate}>
      {children ?? <SocialEmpty page="guild" />}
    </TabPage>
  );
}
