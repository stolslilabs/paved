import { IndexerError, ViewError, WriteError, type AttackPlay, type BuyAvatarItemRequest, type BuyParcelRequest, type EconomyViews, type GameKey, type GameView, type GameViews, type IndexerClient } from "@paved/chain";
import { poseidon } from "@paved/game-core";
import type { GameSigner, Purchases, VaultWrites } from "../sources";
import { dailiesDone, gamesUpTo, needsMockDailies, surrenderedOnDay, withMockDailies, withMockDailyProgress } from "./dailies";
import type { MockLedger, MockedReads } from "./ledger";

// The overlays of the mock (#549): each takes a chain path (`RpcGameViews`, `RpcEconomyViews`, the indexer client, the
// account's `PavedWriter`, its purchases and Vault writes) and answers the entry points the deployed classes lack from the
// mock ledger, every other one from the chain, unchanged. The app applies them when the data source is `mock`
// (`data-source.ts`): `chain-client.ts`, `economy-client.ts`, `wallet/connector.ts`, `routes/sources.ts`.

/** `GameViews`' reads (and the Cobbles', packs', skins', avatar's, village's and PvP's views beside them on `RpcGameViews`) the mock answers. */
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

/** `EconomyViews`' reads the mock answers; `pavedBalance` and `usdcBalance` are the chain's, adjusted by the mock's moves. */
export const MOCKED_ECONOMY_READS = ["split", "seller", "vault", "maxRedeem", "previewDeposit", "previewWithdraw", "previewRedeem", "delegateOf"] as const satisfies readonly (keyof MockedReads)[];

/** The signer's writes the mock answers. */
export const MOCKED_WRITES = ["claim", "claimQuest", "claimAchievement", "claimDailyCredit", "claimWeeklyCredit", "claimDailyMilestone", "buySkin", "setSkins", "buyAvatarItem", "setAvatar", "foundVillage", "buyParcel", "openReward", "claimReward", "drawOpponent", "startAttack", "playAttack", "surrenderAttack", "foundFreeVillage", "saveLayout", "saveLayoutTo", "activateLayout", "buyLayoutSlot", "openChest", "claimChest", "buyTile", "reportStory", "drawOpponentV2", "startAttackV2", "playAttackV2", "surrenderAttackV2", "spawnFree"] as const;

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

/**
 * What the game views' overlay reads of the chain beside its views, for the two game reads an older Challenge class answers
 * differently: its address (the seed's), and `game(id)`'s felts undecoded, with the decoder of the client's ABI.
 */
export interface ChallengeAccess {
  challenge: string;
  gameFelts(gameId: number): Promise<string[]>;
  decodeGame(felts: string[]): GameView;
}

/** The felts of `GameView` before `expires_at` was appended (S1): the layout of Sepolia's Challenge class. */
export const GAME_FELTS_BEFORE_EXPIRY = 16;
/** `start_time`'s felt in that layout. */
const START_TIME_FELT = 13;
/** A Challenge game expires 24 h after it starts (`views.cairo`, `expires_at`). */
const GAME_VALIDITY_S = 86_400n;

/**
 * `Challenge.initial_seed(game_id)` as the contract computes it (`views.cairo`, `TokenSeed` of `seed.cairo`): the Poseidon of
 * the new game's salt 0, the Challenge's address and the id. The same formula seeded every game of Sepolia's class, which
 * has no view for it: the value is the chain's, not a mock's.
 */
export function initialSeedOf(challenge: string, gameId: number): string {
  return `0x${poseidon(0n, BigInt(challenge), gameId).toString(16)}`;
}

/**
 * `game(id)` in the layout before `expires_at` (Sepolia's class): its felts with `expires_at` appended as the contract
 * derives it, `start_time` + 24 h, then decoded as the client's ABI reads it. Any other length is the chain's mismatch.
 */
export function decodeGameBeforeExpiry(felts: readonly string[], decode: (felts: string[]) => GameView): GameView {
  if (felts.length !== GAME_FELTS_BEFORE_EXPIRY) throw new ViewError("abi-mismatch", `game: ${felts.length} felts, neither layout of GameView`);
  const expiresAt = BigInt(felts[START_TIME_FELT]!) + GAME_VALIDITY_S;
  return decode([...felts, `0x${expiresAt.toString(16)}`]);
}

/** A `ViewError`'s kind, read by shape (as `over.ts`'s `isGameNotFound`): an error of another copy of the chain package counts too. */
const kindOf = (error: unknown): unknown => (error as { kind?: unknown } | null)?.kind ?? null;

/**
 * The game views with the Cobbles, packs, skins and pause views of the ledger; the games and their tiles stay the chain's.
 * With `access`, the two game reads an older Challenge class answers differently are read from the chain another way, each
 * only once the chain refused it: `initialSeed` (`not-available`) is computed (`initialSeedOf`), and `game` (`abi-mismatch`,
 * no `expires_at`) is decoded from its felts (`decodeGameBeforeExpiry`). After the first refusal the other way is taken at once.
 */
export function mockGameViews<T extends GameViews>(chain: T, ledger: MockLedger, access?: ChallengeAccess): T & MockedReads {
  if (!access) return overlay(chain, MOCKED_GAME_READS, bound(ledger, MOCKED_GAME_READS)) as T & MockedReads;
  let seedView = true;
  let gameLayout = true;
  const game = async (key: GameKey): Promise<GameView> => {
    if (key.mode !== "challenge" || gameLayout) {
      try {
        return await chain.game(key);
      } catch (error) {
        if (key.mode !== "challenge" || kindOf(error) !== "abi-mismatch") throw error;
        gameLayout = false;
      }
    }
    return decodeGameBeforeExpiry(await access.gameFelts(key.gameId), access.decodeGame);
  };
  return overlay(chain, [...MOCKED_GAME_READS, "initialSeed", "game"], {
    ...bound(ledger, MOCKED_GAME_READS),
    game,
    initialSeed: async (key: GameKey) => {
      if (key.mode !== "challenge" || seedView) {
        try {
          return await chain.initialSeed(key);
        } catch (error) {
          if (key.mode !== "challenge" || kindOf(error) !== "not-available") throw error;
          seedView = false;
        }
      }
      // The view refuses an id with no game (`existing_game`): so does the game's read.
      await game(key);
      return initialSeedOf(access.challenge, key.gameId);
    },
  }) as T & MockedReads;
}

/** The economy's views with the Vault, the split and the seller of the ledger, and the token balances adjusted by its moves. */
export function mockEconomyViews(chain: EconomyViews, ledger: MockLedger): EconomyViews {
  return overlay(chain, [...MOCKED_ECONOMY_READS, "pavedBalance", "usdcBalance"], {
    ...bound(ledger, MOCKED_ECONOMY_READS),
    pavedBalance: async (account: string) => ledger.pavedBalance(account, await chain.pavedBalance(account)),
    usdcBalance: async (account: string) => ledger.usdcBalance(account, await chain.usdcBalance(account)),
  });
}

/**
 * The indexer with the ledger's Cobbles in the definitions, its referrals and its attacks (an indexer that predates them has no
 * route), and the fifth daily of #869 in the definitions and each day's progress (`dailies.ts`). The ledger counts a day's
 * dailies done through it for the milestones' claims.
 */
export function mockIndexer(chain: IndexerClient, ledger: MockLedger): IndexerClient {
  const definitions = async () => {
    const answer = await chain.definitions();
    return { ...answer, data: ledger.definitions(withMockDailies(answer.data)) };
  };
  const playerQuests = async (playerId: string | bigint, params: { day?: number } = {}) => {
    const [answer, defined] = await Promise.all([chain.playerQuests(playerId, params), chain.definitions()]);
    if (!needsMockDailies(defined.data, answer.data)) return answer;
    const day = answer.data.day;
    const games = await gamesUpTo(day, async (before) => (await chain.playerGames(playerId, { contract: "challenge", limit: 100, ...(before ? { before } : {}) })).data);
    // The games surrendered that day long after their start (#869): past the pages read, each read by its id.
    const surrenders = ledger.surrenders(String(playerId));
    const older = await Promise.all(
      surrenderedOnDay(day, games, surrenders).map((id) =>
        chain.game("challenge", id).then(
          (a) => a.data,
          () => null,
        ),
      ),
    );
    return { ...answer, data: withMockDailyProgress(defined.data, answer.data, [...games, ...older.filter((g) => g !== null)], surrenders) };
  };
  ledger.countDailiesWith(async (playerId, day) => {
    const [defined, progress] = await Promise.all([definitions(), playerQuests(playerId, { day })]);
    return dailiesDone(defined.data, progress.data);
  });
  return overlay(chain, ["definitions", "playerQuests", "playerReferrals", "playerAttacks", "playerAttack", "player"], {
    playerQuests,
    playerAttack: async (attacker: string | bigint, id: number) => {
      const row = ledger.attacksOf(String(attacker), "attacker").find((a) => a.id === id);
      if (!row) throw new IndexerError("not-found", "attack not found", { httpStatus: 404 });
      return { ...(await chain.head()), data: row };
    },
    // A rival village of the mock (`mock/pvp.ts`) is on no indexer: its name is the mock's.
    player: async (playerId: string | bigint) => {
      const rival = ledger.rivalName(String(playerId));
      if (rival === null) return chain.player(playerId);
      const head = await chain.head();
      return { ...head, data: { player: { playerId: `0x${BigInt(playerId).toString(16).padStart(64, "0")}`, name: rival, created: null }, stats: null } };
    },
    playerAttacks: async (playerId: string | bigint, side: "attacker" | "defender", params: { limit?: number } = {}) => {
      const head = await chain.head();
      return { ...head, data: ledger.attacksOf(String(playerId), side).slice(0, params.limit ?? 50) };
    },
    definitions,
    playerReferrals: async (playerId: string | bigint) => {
      const head = await chain.head();
      return { ...head, data: ledger.referrals(String(playerId)) };
    },
  });
}

/**
 * The account's writer with the ledger's claims, skin, avatar and village writes, and the free spawn refused (`FREE_SPAWN_MOCKED`). The board's
 * moves, the faucet and every other write are the writer's: it stays the `PavedWriter` the purchases and the Vault check for.
 */
export function mockSigner<T extends GameSigner>(writer: T, ledger: MockLedger): T {
  const writes = ledger.writesFor(writer.address);
  return overlay(writer, [...MOCKED_WRITES, "surrender"], {
    // The chain's surrender, its time recorded once taken (#869): the indexer has none for a game over on a later day than its
    // start, and the fifth daily counts the game on it.
    surrender: async (key: GameKey) => {
      const result = await writer.surrender(key);
      if (key.mode === "challenge") await ledger.recordSurrender(writer.address, key.gameId);
      return result;
    },
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
