import type { AttackPlay, BuyAvatarItemRequest, BuyParcelRequest, EconomyViews, EventReader, GameViews, PoolQuoter } from "@paved/chain";
import type { WalletConnector } from "../../wallet/wallet";
import type { GameSigner, Purchases, Settlements, VaultWrites } from "../sources";
import type { MockLedger, MockedReads } from "./ledger";

// The overlays of the mock (#549): each takes a chain path (`RpcGameViews`, `RpcEconomyViews`, the events, the pool, the
// account's `PavedWriter`, its purchases, settlement and Vault writes) and answers the entry points the deployed classes lack
// from the mock ledger, every other one from the chain, unchanged. Since #927 the Challenge's games, their purchase, moves and
// settlement are the ledger's too, and the indexer is the ledger's alone (`indexer.ts`, no overlay: no indexer is asked). The
// app applies them when the data source is `mock` (`data-source.ts`): `chain-client.ts`, `economy-client.ts`,
// `settle-client.ts`, `wallet/connector.ts`, `routes/sources.ts`.

/** `GameViews`' reads (and the Cobbles', packs', skins', avatar's, village's and PvP's views beside them on `RpcGameViews`) the mock answers. */
export const MOCKED_GAME_READS = [
  // The Challenge's games (#927)
  "game",
  "tiles",
  "builder",
  "initialSeed",
  "draw",
  "spawnSalt",
  "currentDay",
  "entryPrice",
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
  "playerLevel",
  "avatarParts",
  "avatarPriceBounds",
  "avatarItem",
  "avatarItems",
  "ownedAvatarItems",
  "avatar",
  "village",
  "villageCells",
  "villageTiles",
  "villageMaxCells",
  "rewardGrants",
  "rewardOffer",
  "planCopies",
  "skinTiers",
  "pvpVillage",
  "pvpMatch",
  "pvpLeague",
  "pvpShield",
  "pvpSeasonStart",
  "pvpAttack",
  "pvpDeck",
  "pvpMoves",
  "pvpNpcLevel",
  "freeVillage",
  "layoutSlots",
  "inventory",
  "chests",
  "shop",
  "attackV2",
  "attackV2Of",
  "matchesV2",
  "dailyMilestones",
] as const satisfies readonly (keyof MockedReads)[];

/** `EconomyViews`' reads the mock answers: the Vault's, the split, the seller, the tokens' balances (USDC, PAVED) and the games' quote, days and terms (#927). */
export const MOCKED_ECONOMY_READS = ["split", "seller", "vault", "maxRedeem", "previewDeposit", "previewWithdraw", "previewRedeem", "delegateOf", "pavedBalance", "usdcBalance", "quote", "guardRate", "router", "day", "terms"] as const satisfies readonly (keyof MockedReads)[];

/** The signer's writes the mock answers (`mint`: the faucet; `build`, `discard`, `surrender`, `spawnFree`: the games, #927). */
export const MOCKED_WRITES = ["build", "discard", "surrender", "mint", "claim", "claimQuest", "claimAchievement", "claimDailyCredit", "claimWeeklyCredit", "claimDailyMilestone", "buySkin", "setSkins", "buyAvatarItem", "setAvatar", "foundVillage", "buyParcel", "openReward", "claimReward", "drawOpponent", "startAttack", "playAttack", "surrenderAttack", "foundFreeVillage", "saveLayout", "saveLayoutTo", "activateLayout", "buyLayoutSlot", "openChest", "claimChest", "buyTile", "reportStory", "drawOpponentV2", "startAttackV2", "playAttackV2", "surrenderAttackV2", "spawnFree"] as const;

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

/** The game views with the ledger's Cobbles, packs, skins, village, PvP and the Challenge's games (#927); the rest stays the chain's. */
export function mockGameViews<T extends GameViews>(chain: T, ledger: MockLedger): T & MockedReads {
  return overlay(chain, MOCKED_GAME_READS, bound(ledger, MOCKED_GAME_READS)) as T & MockedReads;
}

/** The chain's events with the player's games of the ledger (#927): the mock's games are on no node. */
export function mockEvents<T extends Pick<EventReader, "playerGames">>(chain: T, ledger: MockLedger): T {
  return overlay(chain, ["playerGames"], { playerGames: (playerId: string) => ledger.playerGames(playerId) });
}

/** The pool's quote of the ledger (#927): the mock's rate, no pool read. */
export function mockPool(ledger: MockLedger): PoolQuoter {
  return { quoteSwap: (usdcIn) => ledger.quoteSwap(usdcIn) };
}

/** The economy's views with the Vault, the split, the seller and the tokens' balances of the ledger: no balance is the chain's. */
export function mockEconomyViews(chain: EconomyViews, ledger: MockLedger): EconomyViews {
  return overlay(chain, MOCKED_ECONOMY_READS, bound(ledger, MOCKED_ECONOMY_READS));
}

/**
 * The account's writer with the ledger's faucet, a game's moves and the free spawn (#927), the claims, skin, avatar and village
 * writes. Every other write is the writer's: it stays the `PavedWriter` the purchases and the Vault check for.
 */
export function mockSigner<T extends GameSigner>(writer: T, ledger: MockLedger): T {
  const writes = ledger.writesFor(writer.address);
  return overlay(writer, MOCKED_WRITES, {
    // The faucet (#927): the ledger's USDC, with no cap, so "Get test USDC" is always there.
    mint: writes.mint,
    // A game's moves (#927), by game-core's rules on the ledger's game.
    build: writes.build,
    discard: writes.discard,
    surrender: writes.surrender,
    claim: writes.claim,
    claimQuest: writes.claimQuest,
    claimAchievement: writes.claimAchievement,
    claimDailyCredit: writes.claimDailyCredit,
    claimWeeklyCredit: writes.claimWeeklyCredit,
    // The day's milestones (#869): the ledger's until the contracts have them (#738)
    claimDailyMilestone: writes.claimDailyMilestone,
    // The writer's signature (`buySkin(request, views)`): the price is the ledger's, read inside its own send.
    buySkin: (request: Parameters<GameSigner["buySkin"]>[0]) => writes.buySkin(request),
    setSkins: writes.setSkins,
    // The writer's signature (`buyAvatarItem(request, views)`): the item is the ledger's, read inside its own send.
    buyAvatarItem: (request: BuyAvatarItemRequest) => writes.buyAvatarItem(request),
    setAvatar: writes.setAvatar,
    foundVillage: writes.foundVillage,
    // The writer's signatures (`buyParcel(request, views)`, `openReward(views)`): the ledger reads its own village.
    buyParcel: (request: BuyParcelRequest) => writes.buyParcel(request),
    openReward: () => writes.openReward(),
    claimReward: writes.claimReward,
    // The writer's signatures (`drawOpponent(kind, views)`, `startAttack(views)`, `playAttack(play, views)`): the ledger reads its own attack.
    drawOpponent: (kind: "search" | "next") => writes.drawOpponent(kind),
    startAttack: () => writes.startAttack(),
    playAttack: (play: AttackPlay) => writes.playAttack(play),
    surrenderAttack: writes.surrenderAttack,
    // PvP v2 (#741): the free village, chests, shop, Story report and the attack, all the ledger's
    foundFreeVillage: writes.foundFreeVillage,
    saveLayout: writes.saveLayout,
    saveLayoutTo: writes.saveLayoutTo,
    activateLayout: writes.activateLayout,
    buyLayoutSlot: writes.buyLayoutSlot,
    openChest: writes.openChest,
    claimChest: writes.claimChest,
    buyTile: writes.buyTile,
    reportStory: writes.reportStory,
    drawOpponentV2: writes.drawOpponentV2,
    startAttackV2: writes.startAttackV2,
    playAttackV2: writes.playAttackV2,
    surrenderAttackV2: writes.surrenderAttackV2,
    spawnFree: writes.spawnFree,
  });
}

/**
 * The wallet's connector on the mock (#927, #926): each account it connects (a connect, a restore, a Reset's new key) has its free
 * village founded by the ledger before the connection resolves (`foundAtConnection`, once per account), so the home's first read
 * is the starter village with its 8 tiles and Edit opens (#753); an account with no name is given one and a look of free items
 * (`welcomeNewPlayer`, its own chunk), so no screen names it by its address. Its username is that name, else the connector's.
 * The signer is `mockSigner`'s. Found stays for the `chain` source. `random`: the draw's (the device's cryptographic one by default).
 */
export function mockConnector(connector: WalletConnector, ledger: MockLedger, options: { random?: () => number } = {}): WalletConnector {
  let current: string | null = null;
  const welcomed = async <T extends { address: string } | null>(account: T): Promise<T> => {
    current = account?.address ?? null;
    if (account) {
      await ledger.foundAtConnection(account.address);
      if ((await ledger.name(account.address)) === null) await (await import("./new-player")).welcomeNewPlayer(ledger, account.address, options.random);
    }
    return account;
  };
  return {
    ...connector,
    probe: async () => welcomed(await connector.probe()),
    connect: async () => welcomed(await connector.connect()),
    reset: async () => welcomed(await connector.reset()),
    disconnect: async () => {
      current = null;
      await connector.disconnect();
    },
    username: async () => (current && (await ledger.name(current))) ?? connector.username(),
    signer: (account) => mockSigner(connector.signer(account), ledger),
  };
}

/** The purchases with the ledger's pack and Challenge game (#927), paid from the ledger's USDC; its receipts are the ledger's. */
export function mockPurchases(chain: Purchases, ledger: MockLedger, account: string): Purchases {
  const writes = ledger.writesFor(account);
  return {
    ...chain,
    purchase: writes.purchase,
    buyPack: writes.buyPack,
    receipt: (hash) => (hash.startsWith(MOCK_HASH) ? Promise.resolve("succeeded") : chain.receipt(hash)),
  };
}

/** The settlement of the ledger (#927): the reward minted in the ledger's PAVED. */
export function mockSettlements(ledger: MockLedger, account: string): Settlements {
  return { settle: ledger.writesFor(account).settle };
}

/** The Vault's writes of the ledger (the Vault's class has none of them), on the ledger's PAVED and vPAVED. */
export function mockVaultWrites(ledger: MockLedger, account: string): VaultWrites {
  const writes = ledger.writesFor(account);
  return { deposit: writes.deposit, withdraw: writes.withdraw, withdrawAll: writes.withdrawAll };
}
