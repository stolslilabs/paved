import { useState } from "react";
import { FollowResultButton, type FollowResultState } from "../../components/containers/follow-result-button";
import { FriendsScene } from "../../components/scenes/friends-scene";
import { addressKey } from "../../data/keys";
import { useFollowActions, useFollowLists, usePlayerSearch } from "../../data/social";
import { useDataSources } from "../../data/sources";
import { useAccount } from "../../wallet/wallet";
import { errorDetail } from "../error-detail";
import { useOpenPlayer } from "../open-player";
import { useBack, useTabNavigate } from "../ref";
import { FriendsContent } from "../social/friends-content";
import { ProfilesBelowDesktop } from "../social/profiles-below-desktop";

/**
 * `/friends` (#973, PvP v2 step 1 on the mock): the friends page, in place of the Social page's Friends tab. The player search
 * at the top (the sources' `social`, `usePlayerSearch`; the connected player left out), each result opening the player's public
 * profile (`?player=`, `useOpenPlayer`) and with Follow (#954); then the three tabs, Friends, Following and Followers, the
 * suggestions and the blocked players (#954). Any other old `/social` link lands here (`router.tsx`). Its own chunk.
 */
export default function Page() {
  const onNavigate = useTabNavigate();
  const onBack = useBack();
  const wallet = useAccount();
  const me = useDataSources().signer?.address ?? wallet.address ?? null;
  // Follow on each result of the search, as the player stands with them.
  const lists = useFollowLists(me).data;
  const followActions = useFollowActions(me);
  const standing = (address: string): FollowResultState | null => {
    if (!lists) return null;
    const key = addressKey(address);
    const has = (rows: readonly { profile: { address: string } }[]) => rows.some((r) => addressKey(r.profile.address) === key);
    return has(lists.blocked) ? "blocking" : has(lists.following) ? "following" : has(lists.followers) ? "follow-back" : "follow";
  };
  const [query, setQuery] = useState("");
  const search = usePlayerSearch(query, me);
  const openPlayer = useOpenPlayer();
  return (
    <>
      <FriendsScene
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
        onBack={onBack}
        onNavigate={onNavigate}
      >
        <FriendsContent />
      </FriendsScene>
      <ProfilesBelowDesktop />
    </>
  );
}
