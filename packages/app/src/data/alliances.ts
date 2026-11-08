import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { AllianceRefusal } from "@paved/game-core";
import { addressKey } from "./keys";
import { SEARCH_DELAY_MS, socialKeys, useSettled, type SocialRead } from "./social";
import { AllianceRefusedError, allianceSource, type AllianceBadge, type AlliancePlace, type AllianceSource, type AllianceSummary, type AllianceView, type PlayerAlliance } from "./social-source";
import { useDataSources } from "./sources";

// The alliances' hooks (ALLIANCES): the player's alliance (through their guild), an alliance's page, a guild's alliance, the search,
// the ranking and an alliance's place, read from the social source's alliance part (`allianceSource`: the mock's ledger today, the
// contract and a service later), and the writes. Without an alliance part each read answers `unavailable`, with no data and no error.
// Nothing polls. The keys sit under the guilds' (`socialKeys.guilds`): a guild write (a member joins, a guild disbands) changes the
// alliances' scores and guilds, so it makes them stale too; an alliance write invalidates every guild and alliance read (the guild
// pages show their alliance). The Guild page's and the Leaderboard's chunks carry them, not the home's.

/** The keys of the alliance reads: `[social, guild, alliance, read, ...args]`, under the guilds' (`socialKeys.guilds`). */
export const allianceKeys = {
  all: [...socialKeys.guilds, "alliance"] as const,
  player: (player: string) => ["social", "guild", "alliance", "player", addressKey(player)] as const,
  /** An alliance's page as a viewer sees it ("": anyone). */
  page: (id: number, viewer: string | null) => ["social", "guild", "alliance", "page", id, viewer === null ? "" : addressKey(viewer)] as const,
  /** A guild's alliance. */
  ofGuild: (guild: number) => ["social", "guild", "alliance", "of-guild", guild] as const,
  search: (query: string) => ["social", "guild", "alliance", "search", query] as const,
  ranking: () => ["social", "guild", "alliance", "ranking"] as const,
  place: (id: number) => ["social", "guild", "alliance", "place", id] as const,
};

const UNAVAILABLE = { data: undefined, isPending: false, error: null, unavailable: true, refetch: () => undefined } as const;

/** One alliance read: disabled while `ready` is false (an id or a player missing), `unavailable` without an alliance part. */
function useAllianceRead<T>(key: readonly unknown[], ready: boolean, read: (alliances: AllianceSource) => Promise<T>, previous = false): SocialRead<T> {
  const { social } = useDataSources();
  const alliances = allianceSource(social);
  const query = useQuery({ queryKey: key, queryFn: () => read(alliances!), enabled: ready && alliances !== null, staleTime: 0, ...(previous && { placeholderData: keepPreviousData }) });
  if (!alliances) return UNAVAILABLE;
  return { data: query.data, isPending: ready && query.isPending && !query.error, error: query.error, unavailable: false, refetch: () => void query.refetch() };
}

/** The connected player's alliance, through their guild: its page, their guild's request and invitations, the badge; disabled without a player. */
export const usePlayerAlliance = (player: string | null): SocialRead<PlayerAlliance> => useAllianceRead(allianceKeys.player(player ?? "0x0"), player !== null, (a) => a.playerAlliance(player!));

/** An alliance's page as `viewer` sees it (null: no alliance of that ID); disabled without an ID. */
export const useAlliance = (id: number | null, viewer: string | null): SocialRead<AllianceView | null> => useAllianceRead(allianceKeys.page(id ?? 0, viewer), id !== null, (a) => a.alliance(id!, viewer));

/** The alliance a guild is in (null: none), as the guild's page shows it; disabled without a guild. */
export const useGuildAlliance = (guild: number | null): SocialRead<AllianceBadge | null> => useAllianceRead(allianceKeys.ofGuild(guild ?? 0), guild !== null, (a) => a.allianceOfGuild(guild!));

/** The alliance search by name (game-core's `searchAlliances`), read `delayMs` after the last keystroke; "" lists them by score. */
export function useAllianceSearch(query: string, { delayMs = SEARCH_DELAY_MS }: { delayMs?: number } = {}): SocialRead<readonly AllianceSummary[]> {
  const settled = useSettled(query.trim().replace(/\s+/g, " "), delayMs);
  return useAllianceRead(allianceKeys.search(settled), true, (a) => a.searchAlliances(settled), true);
}

/** The alliances by score: the sum of their guilds' scores. */
export const useAllianceRanking = (): SocialRead<readonly AllianceSummary[]> => useAllianceRead(allianceKeys.ranking(), true, (a) => a.allianceRanking());

/** An alliance's place in the whole ranking, past the list's end too (null: no alliance of that ID); disabled without an ID. */
export const useAlliancePlace = (id: number | null): SocialRead<AlliancePlace | null> => useAllianceRead(allianceKeys.place(id ?? 0), id !== null, (a) => a.alliancePlace(id!));

/** Why an alliance write was refused (game-core's reason), or null for another error or none. */
export const allianceRefusal = (error: unknown): AllianceRefusal | null => (error instanceof AllianceRefusedError ? error.reason : null);

/** An alliance write for the connected player: one of `AllianceSource`'s writes, the player passed for it. */
export type AllianceWriteRun = (alliances: AllianceSource, player: string) => Promise<unknown>;

/** The alliance writes' state: `run` one, its wait, its error and refusal; `unavailable` without an alliance part or a player. */
export interface AllianceWrites {
  run: (write: AllianceWriteRun) => Promise<unknown>;
  isPending: boolean;
  error: Error | null;
  refusal: AllianceRefusal | null;
  reset: () => void;
  unavailable: boolean;
}

/**
 * The alliance writes of the connected player: `run((a, me) => a.requestAlliance(me, id))`. Each one, done or refused, invalidates every
 * guild and alliance read (`socialKeys.guilds`), so the pages read the world the write left; a refusal is also kept as `refusal`.
 */
export function useAllianceWrites(player: string | null): AllianceWrites {
  const { social } = useDataSources();
  const alliances = allianceSource(social);
  const client = useQueryClient();
  const mutation = useMutation({
    mutationFn: (write: AllianceWriteRun) => (alliances && player ? write(alliances, player) : Promise.reject(new Error("No alliance source or player"))),
    onSettled: () => client.invalidateQueries({ queryKey: socialKeys.guilds }),
  });
  return { run: mutation.mutateAsync, isPending: mutation.isPending, error: mutation.error, refusal: allianceRefusal(mutation.error), reset: mutation.reset, unavailable: !alliances || player === null };
}
