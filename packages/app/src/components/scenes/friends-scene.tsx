import type { ReactNode } from "react";
import type { Tab } from "../../routes/pages";
import { PlayerSearch, type PlayerSearchProps } from "../containers/player-search";
import { SocialEmpty } from "../containers/social-empty";
import { TabPage } from "../containers/tab-page";

export interface FriendsSceneProps {
  /** The player search (#952), at the top: its results open a player's public profile, each with Follow. */
  search: PlayerSearchProps;
  /** The lists as the app draws them (`FriendsPanel`: the three tabs, the suggestions, the blocked players). Unset: the empty state. */
  children?: ReactNode;
  /** Back, up to the village (BACK-RULE #783); omitted, the bar's Home. */
  onBack?: () => void;
  onNavigate?: (tab: Tab) => void;
}

/**
 * The friends page (`/friends`, #973, in place of the Social page's Friends tab): its header (the title and Back), the player
 * search at the top (the Social page's, #952), then the three tabs, Friends, Following and Followers, each with its count, the
 * suggestions under the list and the blocked players (#954). From `desktop` it is in the home's side panel, on the right.
 */
export function FriendsScene({ search, children, onBack, onNavigate }: FriendsSceneProps) {
  return (
    <TabPage tab="friends" title="Friends" onBack={onBack} onNavigate={onNavigate}>
      <PlayerSearch {...search} />
      {children ?? <SocialEmpty page="friends" />}
    </TabPage>
  );
}
