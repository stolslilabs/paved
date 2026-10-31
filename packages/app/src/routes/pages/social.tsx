import { lazy, Suspense, useState, type ComponentType } from "react";
import { useSearchParams } from "react-router";
import { Skeleton } from "../../components/ui/skeleton";
import type { SocialTab } from "../../components/containers/social-tabs";
import { SocialScene } from "../../components/scenes/social-scene";
import { usePlayerGuild } from "../../data/guilds";
import { useFollowActions, useFollowLists, usePlayerSearch } from "../../data/social";
import { addressKey } from "../../data/keys";
import { FollowResultButton, type FollowResultState } from "../../components/containers/follow-result-button";
import { useDataSources } from "../../data/sources";
import { useSidePanel } from "../../lib/side-panel";
import { useAccount } from "../../wallet/wallet";
import { errorDetail } from "../error-detail";
import { GUILD_PARAM } from "../guild-param";
import { DESKTOP_QUERY } from "../home-layout";
import { useOpenPlayer } from "../open-player";
import { useBack, useTabNavigate } from "../ref";
import { socialTabStored, storeSocialTab } from "../social-tab";

/** Each tab's content, its own chunk (#952), filled by #953, #954 and #955. */
const TAB_LOADERS: Record<SocialTab, () => Promise<{ default: ComponentType }>> = {
  guild: () => import("../social/guild-tab"),
  friends: () => import("../social/friends-tab"),
  chat: () => import("../social/chat-tab"),
};
const TABS: Record<SocialTab, ComponentType> = { guild: lazy(TAB_LOADERS.guild), friends: lazy(TAB_LOADERS.friends), chat: lazy(TAB_LOADERS.chat) };

/** The public profile's host (#952), shown with the page below `desktop`: from it the home's host, under this panel, serves. */
const loadHost = () => import("../player-profile-host");
const PlayerProfileHost = lazy(loadHost);

// With the page's code (its prefetch included), the tab it opens on and the host: fetched beside it, not one after the other
// as the page renders.
void TAB_LOADERS[socialTabStored()]().catch(() => {});
void loadHost().catch(() => {});

/**
 * `/social` (#952, PvP v2 step 1 on the mock): the player search (the sources' `social`, `usePlayerSearch`; the connected player
 * left out), each result opening the player's public profile (`?player=`, `useOpenPlayer`), and the three tabs, opened on the last
 * one used on this device (`social-tab.ts`), or on Guild for a guild's page (`?guild=`, #953). The Guild tab counts its badge
 * (#953); #954 and #955 count theirs.
 */
export default function Page() {
  const onNavigate = useTabNavigate();
  const onBack = useBack();
  const wallet = useAccount();
  const me = useDataSources().signer?.address ?? wallet.address ?? null;
  // A guild's page (`?guild=`, #953) is the Guild tab's: the page turns to it whenever the parameter comes.
  const guildAsked = useSearchParams()[0].get(GUILD_PARAM);
  const [tab, setTab] = useState<SocialTab>(() => (guildAsked !== null ? "guild" : socialTabStored()));
  const [seenAsk, setSeenAsk] = useState(guildAsked);
  if (guildAsked !== seenAsk) {
    setSeenAsk(guildAsked);
    if (guildAsked !== null) setTab("guild");
  }
  // What waits in the Guild tab (#953): the invitations, the unread announcements, and for officers the requests.
  const guildWaiting = usePlayerGuild(me).data?.badge ?? 0;
  // The follows (#954): the new followers on the Friends tab's badge, and Follow on each result of the search.
  const follows = useFollowLists(me);
  const followActions = useFollowActions(me);
  const lists = follows.data;
  const standing = (address: string): FollowResultState | null => {
    if (!lists) return null;
    const key = addressKey(address);
    const has = (rows: readonly { profile: { address: string } }[]) => rows.some((r) => addressKey(r.profile.address) === key);
    return has(lists.blocked) ? "blocking" : has(lists.following) ? "following" : has(lists.followers) ? "follow-back" : "follow";
  };
  const [query, setQuery] = useState("");
  const search = usePlayerSearch(query, me);
  const openPlayer = useOpenPlayer();
  const desktop = useSidePanel(DESKTOP_QUERY);
  const changeTab = (next: SocialTab) => {
    setTab(next);
    storeSocialTab(next);
  };
  return (
    <>
      <SocialScene
        tab={tab}
        onTabChange={changeTab}
        badges={{ guild: guildWaiting, friends: lists?.newFollowers ?? 0, chat: 0 }}
        search={{
          query,
          onQueryChange: setQuery,
          results: search.data ?? null,
          error: search.error?.message ?? null,
          errorDetail: search.error ? errorDetail(search.error) : undefined,
          onRetry: search.refetch,
          onOpen: openPlayer,
          unavailable: search.unavailable,
          renderAction: followActions
            ? (player) => {
                const state = standing(player.address);
                return state && <FollowResultButton state={state} name={player.name} onFollow={() => followActions.run("follow", player.address)} />;
              }
            : undefined,
        }}
        renderTab={(id) => {
          const Content = TABS[id];
          return (
            <Suspense fallback={<Skeleton className="h-40 rounded-xl" />}>
              <Content />
            </Suspense>
          );
        }}
        onBack={onBack}
        onNavigate={onNavigate}
      />
      {/* The players' profiles (#952), from the search's results; from `desktop` the home's host, under this panel, serves. */}
      {!desktop && (
        <Suspense fallback={null}>
          <PlayerProfileHost />
        </Suspense>
      )}
    </>
  );
}
