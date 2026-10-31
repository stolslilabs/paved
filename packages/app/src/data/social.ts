import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { normalQuery, parsePlayerId } from "@paved/game-core";
import { useEffect, useMemo, useState } from "react";
import { addressKey } from "./keys";
import type { FollowLists, FollowSource, FollowStatus, PublicProfile } from "./social-source";
import { useDataSources } from "./sources";

// The social features' hooks (#952): another player's public profile and the player search, read from the sources' `social`
// (the mock's ledger today, a service later, #956). Without one (the chain today) each answers `unavailable`, with no data and
// no error. Nothing polls: a profile's last-seen time is read again when the sheet opens and on the window's focus.

export type { FollowLists, FollowRow, FollowSource, FollowStatus, FollowWriteRefusal, PublicProfile, SocialSource } from "./social-source";
export { FollowRefusedError } from "./social-source";

/**
 * The keys of the social reads, `[domain, read, ...args]` as `keys.ts`'s (here, as `avatarKeys` is in `avatar.ts`, so that the
 * first load does not carry them). The domain is `social`: the source the mock answers today, a service later (#956).
 */
export const socialKeys = {
  all: ["social"] as const,
  /** Another player's public profile. */
  profile: (playerId: string) => ["social", "profile", addressKey(playerId)] as const,
  /** The player search, on its query as the search reads it (`normalQuery`): "Wren" and " wren" share an entry. */
  search: (query: string) => ["social", "search", query] as const,
  /** Everything of the follows (#954) as `player` sees it: what a follow write of theirs makes stale. */
  follows: (player: string) => ["social", "follows", addressKey(player)] as const,
  /** The player's own lists. */
  followLists: (player: string) => ["social", "follows", addressKey(player), "lists"] as const,
  /** Another player as `player` sees them. */
  followStatus: (player: string, other: string) => ["social", "follows", addressKey(player), "status", addressKey(other)] as const,
  /** Whom `player` may follow. */
  followSuggestions: (player: string) => ["social", "follows", addressKey(player), "suggestions"] as const,
};

/** A social read: its data (undefined while read), the wait and the error together, and `unavailable` without a social source. */
export interface SocialRead<T> {
  data: T | undefined;
  isPending: boolean;
  error: Error | null;
  /** No social source: nothing is read, and nothing will come. */
  unavailable: boolean;
  refetch: () => void;
}

/**
 * Another player's public profile, by their player ID in any form (`0x05f1` and `0x5f1` share one entry); null when no player
 * has that ID, or when `playerId` is not an ID at all (a typed `/player/:id`). Disabled without one.
 */
export function usePublicProfile(playerId: string | null): SocialRead<PublicProfile | null> {
  const { social } = useDataSources();
  const id = playerId === null ? null : parsePlayerId(playerId);
  const query = useQuery({
    queryKey: socialKeys.profile(id ?? "0x0"),
    queryFn: () => social!.profile(id!),
    enabled: id !== null && !!social,
    staleTime: 0,
  });
  if (!social) return { data: undefined, isPending: false, error: null, unavailable: true, refetch: () => undefined };
  // Not an ID: no player has it, and nothing is read.
  if (playerId !== null && id === null) return { data: null, isPending: false, error: null, unavailable: false, refetch: () => undefined };
  return { data: query.data, isPending: playerId !== null && query.isPending && !query.error, error: query.error, unavailable: false, refetch: () => void query.refetch() };
}

/** How long the search waits after the last keystroke before it reads, in ms. */
export const SEARCH_DELAY_MS = 200;

/** `value`, once it has stayed the same for `delayMs`. */
export function useSettled<T>(value: T, delayMs: number): T {
  const [settled, setSettled] = useState(value);
  useEffect(() => {
    if (delayMs <= 0) return;
    const timer = setTimeout(() => setSettled(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);
  return delayMs <= 0 ? value : settled;
}

/**
 * The player search (#952): the players `query` finds by name or by ID (game-core's `searchPlayers`), `me` (the connected
 * player) left out. Read `delayMs` after the last keystroke; the previous results stay shown while the next are read. An empty
 * query reads nothing and answers `[]`.
 */
export function usePlayerSearch(query: string, me: string | null, { delayMs = SEARCH_DELAY_MS }: { delayMs?: number } = {}): SocialRead<readonly PublicProfile[]> & { query: string } {
  const { social } = useDataSources();
  const settled = normalQuery(useSettled(query, delayMs));
  const read = useQuery({
    queryKey: socialKeys.search(settled),
    queryFn: () => social!.searchPlayers(settled),
    enabled: settled !== "" && !!social,
    placeholderData: keepPreviousData,
    staleTime: 0,
  });
  if (!social) return { data: undefined, isPending: false, error: null, unavailable: true, refetch: () => undefined, query: settled };
  if (settled === "") return { data: [], isPending: false, error: null, unavailable: false, refetch: () => undefined, query: settled };
  const own = me ? addressKey(me) : null;
  const data = read.data && own ? read.data.filter((p) => addressKey(p.address) !== own) : read.data;
  return { data, isPending: read.isPending && !read.error, error: read.error, unavailable: false, refetch: () => void read.refetch(), query: settled };
}

// --- The follows (#954) --------------------------------------------------------------------------------------------------

/** No follow source: the chain today, or a social source without its follows. */
const followsOf = (social: { follows?: FollowSource } | null | undefined): FollowSource | null => social?.follows ?? null;

const UNAVAILABLE = { data: undefined, isPending: false, error: null, unavailable: true, refetch: () => undefined } as const;

/**
 * The connected player's own lists (#954): friends, following, followers, the new followers' count and the blocked players.
 * Disabled without a player. When the source says the lists change by themselves (`nextChangeAt`, the mock's follow back), they
 * are read again then, once: no polling.
 */
export function useFollowLists(me: string | null): SocialRead<FollowLists> {
  const { social } = useDataSources();
  const follows = followsOf(social);
  const client = useQueryClient();
  const query = useQuery({ queryKey: socialKeys.followLists(me ?? "0x0"), queryFn: () => follows!.lists(me!), enabled: me !== null && !!follows, staleTime: 0 });
  const next = query.data?.nextChangeAt ?? null;
  useEffect(() => {
    if (next === null || me === null) return;
    // A second past it, so that the source's clock has passed it too.
    const timer = setTimeout(() => void client.invalidateQueries({ queryKey: socialKeys.follows(me) }), Math.max(0, next * 1000 - Date.now()) + 1000);
    return () => clearTimeout(timer);
  }, [next, me, client]);
  if (!follows) return UNAVAILABLE;
  return { data: query.data, isPending: me !== null && query.isPending && !query.error, error: query.error, unavailable: false, refetch: () => void query.refetch() };
}

/** Another player as the connected player sees them (#954): Following, Follows you, Friend, the block, and their counts. */
export function useFollowStatus(me: string | null, other: string | null): SocialRead<FollowStatus> {
  const { social } = useDataSources();
  const follows = followsOf(social);
  const id = other === null ? null : parsePlayerId(other);
  const query = useQuery({ queryKey: socialKeys.followStatus(me ?? "0x0", id ?? "0x0"), queryFn: () => follows!.status(me!, id!), enabled: me !== null && id !== null && !!follows, staleTime: 0 });
  if (!follows) return UNAVAILABLE;
  return { data: query.data, isPending: me !== null && id !== null && query.isPending && !query.error, error: query.error, unavailable: false, refetch: () => void query.refetch() };
}

/** Whom the connected player may follow (#954): the followers not followed back, the recent PvP opponents, then the community. */
export function useFollowSuggestions(me: string | null): SocialRead<readonly PublicProfile[]> {
  const { social } = useDataSources();
  const follows = followsOf(social);
  const query = useQuery({ queryKey: socialKeys.followSuggestions(me ?? "0x0"), queryFn: () => follows!.suggestions(me!), enabled: me !== null && !!follows, staleTime: 0 });
  if (!follows) return UNAVAILABLE;
  return { data: query.data, isPending: me !== null && query.isPending && !query.error, error: query.error, unavailable: false, refetch: () => void query.refetch() };
}

/** The follow writes the page sends (#954). */
export type FollowAction = "follow" | "unfollow" | "removeFollower" | "block" | "unblock" | "seeFollowers";

/** The connected player's follow writes, or null without a player or a follow source. */
export interface FollowActions {
  /** Sends one write; resolves once kept, rejects with its `FollowRefusedError`. Every follow read of the player is read again after it. */
  run(action: Exclude<FollowAction, "seeFollowers">, target: string): Promise<void>;
  /** The player saw their followers: the new marks and the badge go. */
  seeFollowers(): Promise<void>;
  /** A write is under way. */
  isPending: boolean;
  /** The last write's refusal or failure, until the next write. */
  error: Error | null;
}

/** The connected player's follow writes (#954); null without a player or a follow source. */
export function useFollowActions(me: string | null): FollowActions | null {
  const { social } = useDataSources();
  const follows = followsOf(social);
  const client = useQueryClient();
  const mutation = useMutation({
    mutationFn: ({ action, target }: { action: FollowAction; target: string | null }) => {
      if (action === "seeFollowers") return follows!.seeFollowers(me!);
      return follows![action](me!, target!);
    },
    onSettled: () => client.invalidateQueries({ queryKey: socialKeys.follows(me ?? "0x0") }),
  });
  const { mutateAsync, isPending, error } = mutation;
  return useMemo(() => {
    if (!follows || me === null) return null;
    return {
      run: (action, target) => mutateAsync({ action, target }),
      seeFollowers: () => mutateAsync({ action: "seeFollowers", target: null }),
      isPending,
      error,
    };
  }, [follows, me, mutateAsync, isPending, error]);
}
