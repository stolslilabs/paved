import { lazy, Suspense, useState, type ComponentType } from "react";
import { Skeleton } from "../../components/ui/skeleton";
import type { SocialTab } from "../../components/containers/social-tabs";
import { SocialScene } from "../../components/scenes/social-scene";
import { usePlayerSearch } from "../../data/social";
import { useDataSources } from "../../data/sources";
import { useSidePanel } from "../../lib/side-panel";
import { useAccount } from "../../wallet/wallet";
import { errorDetail } from "../error-detail";
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
 * one used on this device (`social-tab.ts`). Nothing waits in the tabs yet: #953 to #955 count their badges.
 */
export default function Page() {
  const onNavigate = useTabNavigate();
  const onBack = useBack();
  const wallet = useAccount();
  const me = useDataSources().signer?.address ?? wallet.address ?? null;
  const [tab, setTab] = useState(socialTabStored);
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
        search={{
          query,
          onQueryChange: setQuery,
          results: search.data ?? null,
          error: search.error?.message ?? null,
          errorDetail: search.error ? errorDetail(search.error) : undefined,
          onRetry: search.refetch,
          onOpen: openPlayer,
          unavailable: search.unavailable,
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
