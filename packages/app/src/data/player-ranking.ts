import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { rankAmongFriends } from "@paved/game-core";
import { addressKey } from "./keys";
import { useFollowLists, type SocialRead } from "./social";
import type { PlayerRanking } from "./social-source";
import { useDataSources } from "./sources";

// The players' ranking (LEADERBOARD-PAGE, the dock's Ranking): the players by crowns and the viewer's place, read from the social
// source (the mock's ledger today, a service later, #956). Without one, or a source without the ranking, the hook answers
// `unavailable`, with no data and no error. Nothing polls: it is read as the page opens and on the window's focus. The guilds' ranking
// is `useGuildRanking` (`guilds.ts`): by score, the sum of the members' crowns, the same points. The friends' (`useFriendsRanking`):
// the viewer among their friends, the mutual follows of their own lists (#954), by the same crowns.

export type { PlayerRanking } from "./social-source";

/** The keys of the ranking's reads: under the social domain, `[social, ranking, read, ...args]`. */
export const rankingKeys = {
  all: ["social", "ranking"] as const,
  /** The players by crowns as `viewer` reads them ("": no viewer). */
  players: (viewer: string | null) => ["social", "ranking", "players", viewer === null ? "" : addressKey(viewer)] as const,
};

const UNAVAILABLE = { data: undefined, isPending: false, error: null, unavailable: true, refetch: () => undefined } as const;

/** The players by crowns, and `viewer`'s place (null: no viewer); `unavailable` without a ranking on the social source. */
export function usePlayerRanking(viewer: string | null): SocialRead<PlayerRanking> {
  const { social } = useDataSources();
  const source = social?.playerRanking ? social : null;
  const query = useQuery({ queryKey: rankingKeys.players(viewer), queryFn: () => source!.playerRanking!(viewer), enabled: source !== null, staleTime: 0 });
  if (!source) return UNAVAILABLE;
  return { data: query.data, isPending: query.isPending && !query.error, error: query.error, unavailable: false, refetch: () => void query.refetch() };
}

/**
 * The viewer's friends by crowns, the viewer among them (game-core's `rankAmongFriends`: no friend, an empty ranking): their follow lists (`useFollowLists`) joined to their own
 * profile, read from the players' ranking (its `me`). Pending until both answer, ended by either one's error; `unavailable` without the
 * follows. No viewer: an empty ranking.
 */
export function useFriendsRanking(viewer: string | null): SocialRead<PlayerRanking> {
  const lists = useFollowLists(viewer);
  const players = usePlayerRanking(viewer);
  const friends = lists.data?.friends;
  const ready = viewer === null || (friends !== undefined && (players.unavailable || players.data !== undefined));
  const meProfile = players.data?.me?.profile ?? null;
  const data = useMemo(() => (viewer === null ? { players: [], me: null } : ready ? rankAmongFriends(friends!.map((r) => r.profile), meProfile) : undefined), [viewer, ready, friends, meProfile]);
  if (lists.unavailable) return UNAVAILABLE;
  const error = lists.error ?? players.error;
  return {
    data,
    isPending: !ready && !error,
    error,
    unavailable: false,
    refetch: () => {
      lists.refetch();
      players.refetch();
    },
  };
}
