import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import type { PlayerReferrals } from "@paved/chain";
import type { ReferralEarnings } from "../components/scenes/referral-scene";
import { addressKey } from "./keys";
import { useDataSources } from "./sources";

// The referral page (P10, section 6.4): the player's link, and what it earned from the indexer's
// `/v1/players/:id/referrals` (IX-COBBLES2), games and packs. The id is the player's address (D-25 (E): a player is the
// wallet's address, with no registration), the signer's. `@paved/chain` is a type-only import here.

/** The referrals' key, beside `keys.ts`'s indexer reads. */
export const referralKey = (playerId: string) => ["indexer", "referrals", addressKey(playerId)] as const;

/**
 * The player's link: the app's origin with `?ref=` and the address, `0x` and the hex without padding (as the legacy client's
 * `referralLink` and the purchase's referrer read it; `withRef` keeps it on every link of the app).
 */
export function referralLink(origin: string, address: string): string {
  return `${origin.replace(/\/+$/, "")}/?ref=${addressKey(address)}`;
}

/** The indexer's answer as the scene's earnings: its decimal strings read as exact bigints of USDC base units. */
export function earningsOf(answer: PlayerReferrals): ReferralEarnings {
  return {
    total: BigInt(answer.total),
    games: { count: answer.games.count, total: BigInt(answer.games.total) },
    packs: { count: answer.packs.count, total: BigInt(answer.packs.total) },
  };
}

/** What the player's link earned; disabled without a player. A failed read is the query's error: the page keeps the link. */
export function useReferralEarnings(playerId: string | null): UseQueryResult<ReferralEarnings> {
  const { indexer } = useDataSources();
  return useQuery({
    queryKey: referralKey(playerId ?? "0x0"),
    queryFn: async () => earningsOf((await indexer.playerReferrals(playerId as string)).data),
    enabled: playerId !== null,
  });
}
