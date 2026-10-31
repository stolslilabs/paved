import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { normalQuery, parsePlayerId } from "@paved/game-core";
import { useEffect, useState } from "react";
import { addressKey } from "./keys";
import type { PublicProfile } from "./social-source";
import { useDataSources } from "./sources";

// The social features' hooks (#952): another player's public profile and the player search, read from the sources' `social`
// (the mock's ledger today, a service later, #956). Without one (the chain today) each answers `unavailable`, with no data and
// no error. Nothing polls: a profile's last-seen time is read again when the sheet opens and on the window's focus.

export type { PublicProfile, SocialSource } from "./social-source";

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
