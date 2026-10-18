import { WriteError, type EconomyViews, type GameViews, type IndexerClient } from "@paved/chain";
import type { GameSigner, Purchases, VaultWrites } from "../sources";
import type { MockLedger, MockedReads } from "./ledger";

// The overlays of the mock (#549): each takes a chain path (`RpcGameViews`, `RpcEconomyViews`, the indexer client, the
// account's `PavedWriter`, its purchases and Vault writes) and answers the entry points the deployed classes lack from the
// mock ledger, every other one from the chain, unchanged. The app applies them when the data source is `mock`
// (`data-source.ts`): `chain-client.ts`, `economy-client.ts`, `wallet/connector.ts`, `routes/sources.ts`.

/** `GameViews`' reads (and the Cobbles', packs' and skins' views beside them on `RpcGameViews`) the mock answers. */
export const MOCKED_GAME_READS = [
  "spawnPaused",
  "guardian",
  "account",
  "dayProgress",
  "weekProgress",
  "questCobbles",
  "achievementCobbles",
  "pack",
  "skinPrice",
  "skinPrices",
  "ownedSkins",
  "activeSkins",
] as const satisfies readonly (keyof MockedReads)[];

/** `EconomyViews`' reads the mock answers; `pavedBalance` and `usdcBalance` are the chain's, adjusted by the mock's moves. */
export const MOCKED_ECONOMY_READS = ["split", "seller", "vault", "maxRedeem", "previewDeposit", "previewWithdraw", "previewRedeem", "delegateOf"] as const satisfies readonly (keyof MockedReads)[];

/** The signer's writes the mock answers. */
export const MOCKED_WRITES = ["claim", "claimQuest", "claimAchievement", "claimDailyCredit", "claimWeeklyCredit", "buySkin", "setSkins", "spawnFree"] as const;

/**
 * The free spawn (`Challenge.spawn_free`) is not on the network's class, and the mock cannot spawn a game: the credit stays.
 * A refusal the page shows as it shows the chain's, never a raw RPC error.
 */
export const FREE_SPAWN_MOCKED = "Free games are not on this network yet: your free game stays for later. Nothing was sent.";

/** The hash prefix of the mock's receipts ("mock"): `receipt` answers them, never the node. */
const MOCK_HASH = "0x6d6f636b";

/** An object whose `keys` are the ledger's and every other property the target's (methods bound to it, so its state stays its own). */
function overlay<T extends object>(target: T, keys: readonly string[], own: Record<string, unknown>): T {
  const mocked = new Set(keys);
  return new Proxy(target, {
    get(t, key) {
      if (typeof key === "string" && mocked.has(key)) return own[key];
      const value = Reflect.get(t, key, t);
      return typeof value === "function" ? value.bind(t) : value;
    },
    has: (t, key) => (typeof key === "string" && mocked.has(key)) || Reflect.has(t, key),
  });
}

const bound = (ledger: MockLedger, keys: readonly string[]): Record<string, unknown> =>
  Object.fromEntries(keys.map((k) => [k, (ledger as unknown as Record<string, (...a: unknown[]) => unknown>)[k]!.bind(ledger)]));

/** The game views with the Cobbles, packs, skins and pause views of the ledger; the games, tiles and seeds stay the chain's. */
export function mockGameViews<T extends GameViews>(chain: T, ledger: MockLedger): T & MockedReads {
  return overlay(chain, MOCKED_GAME_READS, bound(ledger, MOCKED_GAME_READS)) as T & MockedReads;
}

/** The economy's views with the Vault, the split and the seller of the ledger, and the token balances adjusted by its moves. */
export function mockEconomyViews(chain: EconomyViews, ledger: MockLedger): EconomyViews {
  return overlay(chain, [...MOCKED_ECONOMY_READS, "pavedBalance", "usdcBalance"], {
    ...bound(ledger, MOCKED_ECONOMY_READS),
    pavedBalance: async (account: string) => ledger.pavedBalance(account, await chain.pavedBalance(account)),
    usdcBalance: async (account: string) => ledger.usdcBalance(account, await chain.usdcBalance(account)),
  });
}

/** The indexer with the ledger's Cobbles in the definitions, and its referrals (an indexer that predates them has no route). */
export function mockIndexer(chain: IndexerClient, ledger: MockLedger): IndexerClient {
  return overlay(chain, ["definitions", "playerReferrals"], {
    definitions: async () => {
      const answer = await chain.definitions();
      return { ...answer, data: ledger.definitions(answer.data) };
    },
    playerReferrals: async (playerId: string | bigint) => {
      const head = await chain.head();
      return { ...head, data: ledger.referrals(String(playerId)) };
    },
  });
}

/**
 * The account's writer with the ledger's claims and skin writes, and the free spawn refused (`FREE_SPAWN_MOCKED`). The board's
 * moves, the faucet and every other write are the writer's: it stays the `PavedWriter` the purchases and the Vault check for.
 */
export function mockSigner<T extends GameSigner>(writer: T, ledger: MockLedger): T {
  const writes = ledger.writesFor(writer.address);
  return overlay(writer, MOCKED_WRITES, {
    claim: writes.claim,
    claimQuest: writes.claimQuest,
    claimAchievement: writes.claimAchievement,
    claimDailyCredit: writes.claimDailyCredit,
    claimWeeklyCredit: writes.claimWeeklyCredit,
    // The writer's signature (`buySkin(request, views)`): the price is the ledger's, read inside its own send.
    buySkin: (request: Parameters<GameSigner["buySkin"]>[0]) => writes.buySkin(request),
    setSkins: writes.setSkins,
    spawnFree: () => Promise.reject(new WriteError(FREE_SPAWN_MOCKED)),
  });
}

/** The chain's PAVED and USDC of an account, read at a mocked write's send. */
export interface ChainBalances {
  paved(): Promise<bigint>;
  usdc(): Promise<bigint>;
}

/** The purchases with the ledger's pack (`buy_pack` is not on the class); a game's purchase stays the chain's. */
export function mockPurchases(chain: Purchases, ledger: MockLedger, account: string, balances: ChainBalances): Purchases {
  const writes = ledger.writesFor(account, balances);
  return {
    ...chain,
    buyPack: writes.buyPack,
    receipt: (hash) => (hash.startsWith(MOCK_HASH) ? Promise.resolve("succeeded") : chain.receipt(hash)),
  };
}

/** The Vault's writes of the ledger (the Vault's class has none of them). */
export function mockVaultWrites(ledger: MockLedger, account: string, balances: ChainBalances): VaultWrites {
  const writes = ledger.writesFor(account, balances);
  return { deposit: writes.deposit, withdraw: writes.withdraw, withdrawAll: writes.withdrawAll };
}
