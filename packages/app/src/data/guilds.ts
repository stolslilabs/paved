import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { GuildRefusal } from "@paved/game-core";
import { addressKey } from "./keys";
import { SEARCH_DELAY_MS, socialKeys, useSettled, type SocialRead } from "./social";
import { GuildRefusedError, guildSource, type GuildBadge, type GuildQuery, type GuildSource, type GuildSummary, type GuildView, type PlayerGuild } from "./social-source";
import { useDataSources } from "./sources";

// The guilds' hooks (#953): the player's guild, a guild's page, a player's guild badge, the search, the suggestions and the
// ranking, read from the social source's guild part (`guildSource`: the mock's ledger today, a service later, #956), and the
// writes. Without a guild part each read answers `unavailable`, with no data and no error. Nothing polls: a write invalidates
// every guild read, and the reads are read again on the window's focus. The Guild tab's chunk carries them, not the home's.

export type * from "./social-source";

/** The keys of the guild reads: under the social domain (`socialKeys.all`), `[social, guild, read, ...args]`. */
export const guildKeys = {
  all: socialKeys.guilds,
  player: (player: string) => ["social", "guild", "player", addressKey(player)] as const,
  /** A guild's page as a viewer sees it ("" : anyone). */
  page: (id: number, viewer: string | null) => ["social", "guild", "page", id, viewer === null ? "" : addressKey(viewer)] as const,
  badge: (address: string) => ["social", "guild", "badge", addressKey(address)] as const,
  /** The guilds of a list's players at once (the Friends tab, #954), by their keys in order. */
  badges: (keys: readonly string[]) => ["social", "guild", "badges", ...keys] as const,
  search: (q: GuildQuery) => ["social", "guild", "search", q.query, q.joinType ?? "", q.meetsFor ? addressKey(q.meetsFor) : "", q.minMembers ?? -1, q.maxMembers ?? -1] as const,
  suggested: (player: string) => ["social", "guild", "suggested", addressKey(player)] as const,
  ranking: () => ["social", "guild", "ranking"] as const,
};

const UNAVAILABLE = { data: undefined, isPending: false, error: null, unavailable: true, refetch: () => undefined } as const;

/** One guild read: disabled while `ready` is false (an id or a player missing), `unavailable` without a guild part. */
function useGuildRead<T>(key: readonly unknown[], ready: boolean, read: (guilds: GuildSource) => Promise<T>, previous = false): SocialRead<T> {
  const { social } = useDataSources();
  const guilds = guildSource(social);
  const query = useQuery({ queryKey: key, queryFn: () => read(guilds!), enabled: ready && guilds !== null, staleTime: 0, ...(previous && { placeholderData: keepPreviousData }) });
  if (!guilds) return UNAVAILABLE;
  return { data: query.data, isPending: ready && query.isPending && !query.error, error: query.error, unavailable: false, refetch: () => void query.refetch() };
}

/** The connected player's guild, request, invitations and the Guild tab's badge; disabled without a player. */
export const usePlayerGuild = (player: string | null): SocialRead<PlayerGuild> => useGuildRead(guildKeys.player(player ?? "0x0"), player !== null, (g) => g.playerGuild(player!));

/** A guild's page as `viewer` sees it (null: no guild of that ID); disabled without an ID. */
export const useGuild = (id: number | null, viewer: string | null): SocialRead<GuildView | null> => useGuildRead(guildKeys.page(id ?? 0, viewer), id !== null, (g) => g.guild(id!, viewer));

/** The guild a player is in, as their profile shows it (null: none); disabled without a player. */
export const useGuildBadge = (address: string | null): SocialRead<GuildBadge | null> => useGuildRead(guildKeys.badge(address ?? "0x0"), address !== null, (g) => g.guildOf(address!));

/**
 * The guilds of several players at once, as a list's rows show them (the Friends tab, #954): one read for the list (not one
 * query each, which would bring `useQueries` into this chunk and move the home's shared chunks into the entry). The answer
 * gives a player's badge, null for none, undefined while read or without a guild part.
 */
export function useGuildBadges(addresses: readonly string[]): (address: string) => GuildBadge | null | undefined {
  const { social } = useDataSources();
  const guilds = guildSource(social);
  const keys = addresses.map(addressKey);
  const read = useQuery({
    queryKey: guildKeys.badges(keys),
    queryFn: async () => new Map(await Promise.all(keys.map(async (k) => [k, await guilds!.guildOf(k)] as const))),
    enabled: guilds !== null && keys.length > 0,
    staleTime: 0,
    placeholderData: keepPreviousData,
  });
  const byKey = read.data;
  return (address) => byKey?.get(addressKey(address));
}

/**
 * The guild search (game-core's `searchGuilds` and `filterGuilds`), read `delayMs` after the last keystroke; the previous
 * results stay shown while the next are read. An empty query lists every guild by score.
 */
export function useGuildSearch(q: GuildQuery, { delayMs = SEARCH_DELAY_MS }: { delayMs?: number } = {}): SocialRead<readonly GuildSummary[]> {
  const query = useSettled(q.query.trim().replace(/\s+/g, " "), delayMs);
  const settled = { ...q, query };
  return useGuildRead(guildKeys.search(settled), true, (g) => g.searchGuilds(settled), true);
}

/** The guilds suggested to the player, the most active first; disabled without a player. */
export const useSuggestedGuilds = (player: string | null): SocialRead<readonly GuildSummary[]> => useGuildRead(guildKeys.suggested(player ?? "0x0"), player !== null, (g) => g.suggestedGuilds(player!));

/** The guilds by score. */
export const useGuildRanking = (): SocialRead<readonly GuildSummary[]> => useGuildRead(guildKeys.ranking(), true, (g) => g.guildRanking());

/** Why a guild write was refused (game-core's reason), or null for another error or none. */
export const guildRefusal = (error: unknown): GuildRefusal | null => (error instanceof GuildRefusedError ? error.reason : null);

/** A guild write for the connected player: one of `GuildSource`'s writes, the player passed for it. */
export type GuildWriteRun = (guilds: GuildSource, player: string) => Promise<unknown>;

/** The guild writes' state: `run` one, its wait, its error and refusal; `unavailable` without a guild part or a player. */
export interface GuildWrites {
  run: (write: GuildWriteRun) => Promise<unknown>;
  isPending: boolean;
  error: Error | null;
  refusal: GuildRefusal | null;
  reset: () => void;
  unavailable: boolean;
}

/**
 * The guild writes of the connected player: `run((g, me) => g.joinGuild(me, id))`. Each one, done or refused, invalidates every
 * guild read (`guildKeys.all`), so the pages read the world the write left; a refusal is also kept as `refusal`.
 */
export function useGuildWrites(player: string | null): GuildWrites {
  const { social } = useDataSources();
  const guilds = guildSource(social);
  const client = useQueryClient();
  const mutation = useMutation({
    mutationFn: (write: GuildWriteRun) => (guilds && player ? write(guilds, player) : Promise.reject(new Error("No guild source or player"))),
    onSettled: () => client.invalidateQueries({ queryKey: guildKeys.all }),
  });
  return { run: mutation.mutateAsync, isPending: mutation.isPending, error: mutation.error, refusal: guildRefusal(mutation.error), reset: mutation.reset, unavailable: !guilds || player === null };
}
