import { useCallback } from "react";
import { useSearchParams } from "react-router";
import { LeaderboardScene, type LeaderboardTab, type RankingRead } from "../../components/scenes/leaderboard-scene";
import type { PlayerRanking } from "../../data/player-ranking";
import { useGuildBadge, useGuildPlace, useGuildRanking } from "../../data/guilds";
import { useFriendsRanking, usePlayerRanking } from "../../data/player-ranking";
import type { SocialRead } from "../../data/social";
import { useDataSources } from "../../data/sources";
import { useAccount } from "../../wallet/wallet";
import { useDrawerRoute } from "../drawer-route";
import { errorDetail } from "../error-detail";
import { useOpenGuild } from "../open-guild";
import { useOpenPlayer } from "../open-player";
import { useBack } from "../ref";

/** The tab of the URL (`?tab=`): Players when it names none or another (Alliances has no tab yet). */
const tabOf = (value: string | null): LeaderboardTab => (value === "guilds" || value === "friends" ? value : "players");

/** No follows on the social source: no friend to rank (the Friends tab's empty words), not a read that never ends. */
const NO_FRIENDS: RankingRead<PlayerRanking> = { data: { players: [], me: null } };

/** A read as the scene shows it: its data (null while read), its error's words and detail, Retry. */
const rankingOf = <T,>(read: SocialRead<T>): RankingRead<T> => ({
  data: read.data ?? null,
  error: read.error?.message ?? null,
  errorDetail: read.error ? errorDetail(read.error) : undefined,
  onRetry: read.refetch,
});

/**
 * `/ranking` (LEADERBOARD-PAGE, the dock's Ranking): the Leaderboard, the HUD's drawer over the home (`PageDef.drawer`,
 * `home-hosts.tsx`). Players by crowns and the viewer's place (`usePlayerRanking`), Guilds by score, the sum of their members' crowns
 * (`useGuildRanking`), Friends, the viewer among their friends by the same crowns (`useFriendsRanking`), all read from the social source
 * as the page opens, so a tab change shows its list at once; the viewer's guild from their badge (`useGuildBadge`), its place in the
 * whole ranking (`useGuildPlace`) for its row past the list's end. The tab is the URL's
 * (`?tab=guilds`, `?tab=friends`; Players without one), a change replacing the entry, so the drawer's close still lands where it was
 * opened from. A player's row opens their profile over the drawer (`?player=`, the home's profile host); a guild's, its page
 * (`/guild?guild=`), as the guild cards do. Its own chunk.
 */
export default function Page() {
  // The HUD's drawer over the home (`home-hosts.tsx`), shown while its route is the current one; alone (a story's or a test's route),
  // open, its Back up to the village.
  const drawer = useDrawerRoute();
  const back = useBack();
  const wallet = useAccount();
  const me = useDataSources().signer?.address ?? wallet.address ?? null;
  const [params, setParams] = useSearchParams();
  const tab = tabOf(params.get("tab"));
  const setTab = useCallback(
    (next: LeaderboardTab) =>
      setParams(
        (p) => {
          const q = new URLSearchParams(p);
          if (next === "players") q.delete("tab");
          else q.set("tab", next);
          return q;
        },
        { replace: true, preventScrollReset: true },
      ),
    [setParams],
  );
  const players = usePlayerRanking(me);
  const guilds = useGuildRanking();
  const friends = useFriendsRanking(me);
  const myGuild = useGuildBadge(me).data?.id ?? null;
  // The viewer's guild's place in the whole ranking: its row pinned when it ranks past the list's end.
  const myGuildPlace = useGuildPlace(myGuild).data ?? null;
  const openPlayer = useOpenPlayer();
  const openGuild = useOpenGuild();
  return (
    <LeaderboardScene
      open={drawer?.open ?? true}
      onBack={drawer?.onClose ?? back}
      returnFocus={drawer?.returnFocus}
      tab={tab}
      onTabChange={setTab}
      players={rankingOf(players)}
      guilds={rankingOf(guilds)}
      friends={friends.unavailable ? NO_FRIENDS : rankingOf(friends)}
      myGuild={myGuild}
      myGuildPlace={myGuildPlace}
      unavailable={players.unavailable && guilds.unavailable}
      onOpenPlayer={openPlayer}
      onOpenGuild={openGuild}
    />
  );
}
