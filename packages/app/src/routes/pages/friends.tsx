import { useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router";
import { FollowPlayerRow } from "../../components/containers/friends-panel";
import { FollowResultButton, type FollowResultState } from "../../components/containers/follow-result-button";
import { FriendsScene } from "../../components/scenes/friends-scene";
import { addressKey } from "../../data/keys";
import { useFollowActions, useFollowLists, usePlayerSearch } from "../../data/social";
import { useDataSources } from "../../data/sources";
import { useAccount } from "../../wallet/wallet";
import { useDrawerRoute } from "../drawer-route";
import { errorDetail } from "../error-detail";
import { useOpenPlayer } from "../open-player";
import { PLAYER_PARAM } from "../player-param";
import { useBack } from "../ref";
import { FriendsContent } from "../social/friends-content";
import { ProfilesBelowDesktop } from "../social/profiles-below-desktop";

/**
 * A profile the URL names on arrival (`/friends?player=`, an old `/social?player=` link, a reload) opens over the drawer: both are
 * dialogs, and the one that mounts last is on top, so a profile that came first would be under the drawer. The parameter is dropped
 * as the page arrives and put back a frame later, once the drawer is on screen: the profile's host opens it then, over the drawer.
 */
function useProfileOverDrawer() {
  const navigate = useNavigate();
  const location = useLocation();
  const [arrival] = useState(() => new URLSearchParams(location.search).get(PLAYER_PARAM));
  const here = useRef(location);
  useEffect(() => {
    here.current = location;
  });
  useEffect(() => {
    if (arrival === null) return;
    const to = (id: string | null) => {
      const { pathname, search, hash } = here.current;
      const params = new URLSearchParams(search);
      if (id === null) params.delete(PLAYER_PARAM);
      else params.set(PLAYER_PARAM, id);
      const query = params.toString();
      void navigate({ pathname, search: query ? `?${query}` : "", hash }, { replace: true, preventScrollReset: true });
    };
    to(null);
    // Two frames: the drawer painted once, its own effects (the dialog's focus and its hiding of the rest) run before the profile's.
    let frame = requestAnimationFrame(() => {
      frame = requestAnimationFrame(() => to(arrival));
    });
    return () => cancelAnimationFrame(frame);
  }, [arrival, navigate]);
}

/**
 * Alone (a story's or a test's route: no home, so no home's profile host), the page mounts its own host once its drawer is on screen
 * (two frames after it mounts), so a profile, a dialog too, always comes over the drawer, never under it.
 */
function useHostAfterDrawer(alone: boolean): boolean {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    if (!alone) return;
    let frame = requestAnimationFrame(() => {
      frame = requestAnimationFrame(() => setReady(true));
    });
    return () => cancelAnimationFrame(frame);
  }, [alone]);
  return alone && ready;
}

/**
 * `/friends` (#973, PvP v2 step 1 on the mock): the friends page, in place of the Social page's Friends tab. The player search
 * at the top (the sources' `social`, `usePlayerSearch`; the connected player left out), each result opening the player's public
 * profile (`?player=`, `useOpenPlayer`) and with Follow (#954); then the three tabs, Friends, Following and Followers, the
 * suggestions and the blocked players (#954). Any other old `/social` link lands here (`router.tsx`). Its own chunk.
 * FRIENDS-PAGE: drawn in the HUD's drawer over the home at every width (`PageDef.drawer`, `home-hosts.tsx`), so the home's profile
 * host serves its `?player=`; alone (a story's or a test's route, no home under it) it mounts its own.
 */
export default function Page() {
  // The HUD's drawer over the home (`home-hosts.tsx`), shown while its route is the current one; alone, open, its Back up to the village.
  const drawer = useDrawerRoute();
  const back = useBack();
  const onBack = drawer?.onClose ?? back;
  useProfileOverDrawer();
  const ownHost = useHostAfterDrawer(drawer === null);
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
  const followOf = (player: { address: string; name: string | null }) => {
    if (!followActions) return null;
    const state = standing(player.address);
    return state ? <FollowResultButton state={state} name={player.name} onFollow={() => followActions.run("follow", player.address)} /> : null;
  };
  return (
    <>
      <FriendsScene
        open={drawer?.open ?? true}
        returnFocus={drawer?.returnFocus}
        search={{
          query,
          onQueryChange: setQuery,
          results: search.data ?? null,
          error: search.error?.message ?? null,
          errorDetail: search.error ? errorDetail(search.error) : undefined,
          onRetry: search.refetch,
          onOpen: openPlayer,
          unavailable: search.unavailable,
          // The book's rows: each player found as the lists draw them, Follow at its end.
          renderResult: (player) => (
            <FollowPlayerRow profile={player} onOpen={openPlayer}>
              {followOf(player)}
            </FollowPlayerRow>
          ),
        }}
        onBack={onBack}
      >
        <FriendsContent />
      </FriendsScene>
      {ownHost && <ProfilesBelowDesktop />}
    </>
  );
}
