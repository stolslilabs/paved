import {
  AvatarPriceChangedError,
  AvatarRefusedError,
  ClaimRefusedError,
  PackNotOnSaleError,
  PackPriceChangedError,
  SKIN_PLANS,
  SkinPriceChangedError,
  SkinRefusedError,
  VaultAmountChangedError,
  VaultBalanceError,
  VaultExitFeeChangedError,
  VaultOverMaxWithdrawError,
  VaultZeroSharesError,
  REWARD_COBBLES,
  VillageRefusedError,
  PvpRefusedError,
  costOf,
  offerOf,
  WriteError,
  redeemFee,
  tierOf,
  withdrawFee,
  type AchievementCobbles,
  type AvatarItem,
  type AvatarViews,
  type BuyAvatarItemRequest,
  type BuyParcelRequest,
  type BuySkinRequest,
  type CobbleAccount,
  type CobbleClaim,
  type CobbleViews,
  type DecodedEvent,
  type Definitions,
  type EconomyViews,
  type GameViews,
  type LevelViews,
  type PackBought,
  type PackPurchaseRequest,
  type PackView,
  type PackViews,
  type PavedWriter,
  type PeriodProgress,
  type PlayerLevel,
  type PlayerReferrals,
  type QuestCobbles,
  type RewardClaim,
  type RewardGrants,
  type RewardOffer,
  type SkinChange,
  type SkinViews,
  type VaultPosition,
  type VaultViews,
  type VillageCell,
  type VillageInfo,
  type VillageRefusal,
  type VillageTile,
  type VillageViews,
  type WriteResult,
  type Attack,
  type AttackDeck,
  type AttackMove,
  type AttackPlay,
  type IndexedAttack,
  type LeagueStatus,
  type MatchmakerVillage,
  type NpcLevel,
  type PvpMatch,
  type PvpShield,
  type PvpViews,
  type PvpRefusal,
} from "@paved/chain";
import {
  AttackRun,
  CAMPAIGNS,
  DAILY_MILESTONES,
  PVP_CHESTS_PER_DAY,
  QUEST_BONUS_COBBLES,
  QueuedAttack,
  addXp,
  attackDeck,
  attackStars,
  dailyMilestoneRefusal,
  dayOf,
  drawChest,
  inventoryOf,
  activateSlotRefusal,
  buySlotRefusal,
  layoutRefusal,
  layoutScore,
  layoutSlotOpen,
  layoutSlotPrice,
  levelStatus,
  offerPlans,
  parcelLevel,
  parcelPrice,
  placeInVillage,
  poseidon,
  pvpChestGranted,
  pvpChestRank,
  pvpXp,
  shopEndsAt,
  shopOffers,
  startTerritory,
  starterLayout,
  storyChestRank,
  storyXp,
  villageGame,
  villageRefusal,
  saveSlotRefusal,
  withSlotActive,
  withSlotBought,
  withSlotSaved,
  type KeyValueStore,
  type LayoutTile,
  type QueuedMove,
} from "@paved/game-core";
import { LEAGUE_FLOORS, NEXT_PRICE, SHIELD_S, stakesOf, starsFor } from "../../lib/pvp-rules";
import { MOCK_SEASON_STARTS, mockRival, mockRivals, mockSeasonOf } from "./pvp";
import { freshV2, mockRivalV2, mockRivalsV2, renameChestsV2, slotsOfV2, storeSlotsV2, type StoredAttackV2, type StoredDefenceV2, type StoredV2 } from "./v2";
import type { BuyLayoutSlotRequest, LayoutSlotViews, LayoutSlotWrites, LayoutSlotsView } from "../layout-slots";
import { V2RefusedError, type BuyTileRequest, type ChestsView, type FreeVillageView, type FreeVillageViews, type FreeVillageWrites, type ShopView, type StoryReport } from "../free-village";
import type { AttackV2, AttackV2State, AttackV2Views, AttackV2Writes } from "../free-attack";
import type { MatchRecord, MatchRecordViews } from "../matches";
import { DailyMilestoneRefusedError, type DailyMilestoneViews, type DailyMilestoneWrites, type DailyMilestonesView } from "../daily-milestones";
import { AVATAR_ITEMS, AVATAR_PARTS_IN_USE, AVATAR_PRICE_BOUNDS, generatedLook } from "../../mocks/avatar";
import { ACHIEVEMENT_COBBLES, PACKS, QUEST_COBBLES, SKIN_PRICES } from "../../mocks/cobbles";
import { questPeriod } from "../../lib/quest-window";
import { addressKey } from "../keys";
import type { AvatarCatalogue } from "../avatar-catalogue";

// The mock ledger (#549, MOCK-FIRST): the reads and writes the deployed classes lack, served on the device, behind the same
// interfaces as the chain path (`MockedReads`: `@paved/chain`'s `CobbleViews`, `PackViews`, `SkinViews`, `VaultViews` and
// the parts of `GameViews` and `EconomyViews` that are missing; `MockedWrites`: the writer's claims, skin writes, the pack
// purchase and the Vault's writes). It holds state and the contracts' rules only: it reads nothing from the chain. The real
// token balances it adjusts (PAVED, USDC) are passed in by the overlays (`overlay.ts`), which wire it in place of the
// missing entry points. Its figures are the specs' (cobbles-v1.md, quests-v2.md, vault-share.md); its state is kept on the
// device (`MOCK_KEY`), so a flow (claim, buy, set, deposit, withdraw) completes and survives a reload.

/** Where the mock ledger keeps its state on the device. A format change is a new key, never an edit in place. */
export const MOCK_KEY = "paved.mock.v1";

/** How long a mocked write takes before its receipt, so the pages show their "on its way" state as on chain. */
export const MOCK_LATENCY_MS = 450;

/**
 * The PAVED a player starts with in the mock, on top of the chain's balance: what a new account needs to try the Vault
 * (the stories' wallet, `mocks/economy.ts` `PAVED_BALANCE`). It never reaches the chain.
 */
export const MOCK_STARTING_PAVED = 142_350_000_000_000_000_000n;

/** The Vault at the mock's start: 542,100 PAVED for 500,000 vPAVED, a rate of about 1.0842 (as `mocks/vault.ts`). */
export const MOCK_VAULT = { assets: 542_100n * 10n ** 18n, supply: 500_000n * 10n ** 18n, exitFeeBps: 500 };

/** `Economy.split_bps()` at the chain's defaults (V1b, P-56; as `mocks/economy.ts` `SPLIT_BPS`). */
export const MOCK_SPLIT = { burn: 7_368, vault: 2_632, referral: 500 };

/** The skins priced in the mock: theme 1 (Forest), the rarity table of the fresh deployment (cobbles-v1.md 5.2). */
export const MOCK_SKIN_THEMES: ReadonlyMap<number, readonly number[]> = new Map([[1, SKIN_PRICES]]);

/** The territory's cap in the mock: the value proposed for the deployment (#640, decision 1). */
export const MOCK_MAX_CELLS = 38;

/**
 * The village rewards a player finds waiting in the mock (#646): the mock hears no game over (its games are the chain's), so a
 * new player starts with these to open. Like the starting PAVED, they never reach the chain.
 */
export const MOCK_STARTING_REWARDS = 3;

/**
 * The skins reserved to a tier in the mock (#642, `Setup.skin_tier`), by theme and plan: none. No deployment sets any, and the
 * tier-gated skins left the client with v2 (#739); the contract's gate goes with #736.
 */
export const MOCK_SKIN_TIERS: ReadonlyMap<number, Readonly<Record<number, number>>> = new Map();

/** The starter `Village.found` writes at (0, 0): `RFFFRFCFR` (plan 9) facing South (orientation 3). */
const STARTER = { id: 1, plan: 9, orientation: 3, x: 0, y: 0 } as const;

/** The kind of the mock's reward draw: its random is `poseidon(REWARD, player, index)`, a stand-in for the VRF's. */
const REWARD_DRAW = 0x524557415244n;

/**
 * The Cobbles of a quest the fresh table does not name (an id of an older deployment): a weekly's. A daily pays none since #869
 * (the day's milestones pay instead), whatever its definition says.
 */
const DEFAULT_QUEST_COBBLES = { daily: 0, weekly: 15 } as const;

/** Every read the deployed classes lack (#549): implemented by the chain (`RpcGameViews`, `RpcEconomyViews`) and by `MockLedger`. */
export interface MockedReads
  extends CobbleViews,
    PackViews,
    SkinViews,
    LevelViews,
    AvatarViews,
    VillageViews,
    PvpViews,
    FreeVillageViews,
    LayoutSlotViews,
    AttackV2Views,
    MatchRecordViews,
    DailyMilestoneViews,
    Pick<GameViews, "spawnPaused" | "guardian">,
    VaultViews,
    Pick<EconomyViews, "split" | "seller" | "usdcBalance"> {}

/** The receipt of a pack bought: the writer's `buyPack` answer. */
export type PackReceipt = WriteResult & { bought: PackBought };

/**
 * Every write the deployed classes lack, for the connected account: the writer's (`PavedWriter`) claims and skin writes, the
 * pack buyer's `buy` and the Vault's writes (`EconomyWriter`), with the same requests, receipts and typed refusals.
 */
export interface MockedWrites extends Pick<PavedWriter, "claim" | "claimQuest" | "claimAchievement" | "claimDailyCredit" | "claimWeeklyCredit" | "setSkins">, FreeVillageWrites, LayoutSlotWrites, AttackV2Writes, DailyMilestoneWrites {
  buySkin(request: BuySkinRequest): Promise<WriteResult>;
  buyAvatarItem(request: BuyAvatarItemRequest): Promise<WriteResult>;
  setAvatar(look: bigint): Promise<WriteResult>;
  /** The player's name (#926): the mock's alone until the integration decides where it lives (on chain, or #918's identities). */
  setName(name: string): Promise<WriteResult>;
  foundVillage(): Promise<WriteResult>;
  buyParcel(request: BuyParcelRequest): Promise<WriteResult>;
  openReward(): Promise<WriteResult>;
  claimReward(claim: RewardClaim): Promise<WriteResult>;
  drawOpponent(kind: "search" | "next"): Promise<WriteResult>;
  startAttack(): Promise<WriteResult>;
  playAttack(play: AttackPlay): Promise<WriteResult>;
  surrenderAttack(): Promise<WriteResult>;
  buyPack(request: PackPurchaseRequest): Promise<PackReceipt>;
  deposit(amount: bigint, options: { confirmedAmount: bigint }): Promise<WriteResult>;
  withdraw(amount: bigint, options: { confirmedAmount: bigint; confirmedExitFeeBps?: number }): Promise<WriteResult>;
  withdrawAll(options: { confirmedShares: bigint; confirmedExitFeeBps?: number }): Promise<WriteResult>;
}

/** `Village.place`'s reverts, as the engine names them, to the writer's refusals. */
const PLACE_REFUSALS: Record<string, VillageRefusal> = {
  "Village: cell not owned": "cell-not-owned",
  "Tile: already exists": "tile-exists",
  "Tile: no neighbors": "no-neighbors",
  "Tile: cannot place": "cannot-place",
};

/** A day's or a week's claims, as stored: the quests' word, the credit, and a day's milestones (#869). */
interface StoredPeriod {
  claimed: string;
  credit: boolean;
  milestones?: number;
}

/** One player's state, as stored: words and amounts as strings (JSON has no bigint). */
interface StoredPlayer {
  cobbles: number;
  credits: number;
  achievementsClaimed: string;
  /** `milestones`: bit `step` per milestone of the day claimed (#869); absent in a state saved before it, read as none. */
  days: Record<string, StoredPeriod>;
  weeks: Record<string, StoredPeriod>;
  /** `skins(player_id, theme)` by theme. */
  owned: Record<string, number>;
  active: number[];
  shares: string;
  /** What the mock moved of the player's PAVED and USDC, added to the chain's balance. */
  paved: string;
  usdc: string;
  /**
   * The Challenge games the player surrendered through the mock's signer (#869): game id to the surrender's time, in seconds.
   * The indexer has no finish time for a game over on a later UTC day than its start, and a surrender can come days later: the
   * fifth daily counts it on this time. Absent: none (a state stored before it).
   */
  surrenders?: Record<string, number>;
  /** `avatar(player_id)`, a decimal string; absent: none set (a state stored before the avatar reads it so). */
  avatar?: string;
  /** The player's name (#926), drawn at their first connection (`nameAtConnection`); absent: none (an account before it). */
  name?: string;
  /** `owned(player_id, part)` by part, decimal strings; absent: nothing bought. */
  avatarOwned?: Record<string, string>;
  /** The village (#640): the parcels in purchase order, the tiles placed after the starter in order; absent: not founded. */
  village?: { parcels: VillageCell[]; tiles: Array<{ plan: number; orientation: number; x: number; y: number }> };
  /** The rewards (#642): pending, opened, the open offer (null: none) and its index, the copies of each plan (plan 1 first); absent: a new player's. */
  rewards?: StoredRewards;
  /** The PvP (#647); absent: a player who never searched. */
  pvp?: StoredPvp;
  /** PvP v2 (#741): the free village, inventory, XP, chests, shop and attacks; absent: a new player's. */
  v2?: StoredV2;
}

/** One attack of the mock's `Arena`: the snapshot (its defender, target, deck), the draws, the moves and the end. */
interface StoredAttack {
  id: number;
  status: number;
  defender: string;
  target: number;
  offer: number;
  cost: number;
  /** The deck's plans, the defender's tiles but the starter, in `Village.tiles` order. */
  plans: number[];
  /** The deck's indexes drawn, in draw order; the last one is in hand while the attack is open. */
  drawn: number[];
  moves: AttackMove[];
  openedAt: number;
  score: number;
  stars: number;
  gained: number;
  lost: number;
  finishedAt: number;
}

/** The player's PvP (#647): crowns, the draws made, the match drawn, the attacks, the shield, the season's record. */
interface StoredPvp {
  crowns: number;
  draws: number;
  match: PvpMatch | null;
  attacks: StoredAttack[];
  shieldUntil: number;
  season: number;
  seasonAttacks: number;
  peak: number;
}

interface StoredRewards {
  pending: number;
  opened: number;
  offer: [number, number, number] | null;
  index: number;
  copies: number[];
}

const freshPvp = (): StoredPvp => ({ crowns: 0, draws: 0, match: null, attacks: [], shieldUntil: 0, season: 0, seasonAttacks: 0, peak: 0 });

/** `Arena`'s attack status codes. */
const MOCK_ATTACK = { open: 1, finished: 2, surrendered: 3 } as const;
/** The matchmaker's address in the mock's receipts. */
const MOCK_MATCHMAKER = "0x6d61746368";
/** The kinds of the mock's draws, as the contracts name them (`'MATCH'`, `'ATTACK'`). */
const MATCH_DRAW = 0x4d41544348n;
const ATTACK_DRAW = 0x41545441434bn;
/** The kinds of PvP v2's draws (`'MATCH2'`, `'ATTACK2'`, `'CHEST'`): Poseidons that stand in for the VRF. */
const MATCH_DRAW_V2 = 0x4d4154434832n;
const ATTACK_DRAW_V2 = 0x41545441434b32n;
/** The kind of a rival's answer's deck (#786): `poseidon(DEFENCE_DRAW_V2, player, defence id)`. */
const DEFENCE_DRAW_V2 = 0x444546454e4345n;
const CHEST_DRAW = 0x4348455354n;

/** `Arena.play`'s reverts, as the engine names them, to the writer's refusals. */
const PLAY_REFUSALS: Record<string, PvpRefusal> = {
  "Village: cell not owned": "outside-territory",
  "Tile: already exists": "tile-exists",
  "Tile: no neighbors": "no-neighbors",
  "Tile: cannot place": "cannot-place",
};

/** The league of a crown count (`league_of`). */
const leagueIndex = (crowns: number): number => LEAGUE_FLOORS.filter((f) => f <= crowns).length;

/** The next tile of an attack: its draw's random (a Poseidon for the VRF) modulo the tiles left, the rank among those not drawn. */
function drawTile(account: string, a: StoredAttack): number {
  const left = a.plans.map((_, i) => i).filter((i) => !a.drawn.includes(i));
  const random = poseidon(ATTACK_DRAW, BigInt(account), BigInt(a.id * 128 + a.drawn.length));
  const index = left[Number(random % BigInt(left.length))]!;
  a.drawn.push(index);
  return a.plans[index]!;
}

const freshRewards = (): StoredRewards => ({ pending: MOCK_STARTING_REWARDS, opened: 0, offer: null, index: 0, copies: new Array<number>(SKIN_PLANS).fill(0) });

interface StoredState {
  version: 1;
  players: Record<string, StoredPlayer>;
  /** The rivals' shields (#647), by address key: until when (seconds). Absent: none up. */
  rivalShields?: Record<string, number>;
  vault: { assets: string; supply: string };
  transactions: number;
}

const fresh = (): StoredState => ({ version: 1, players: {}, vault: { assets: MOCK_VAULT.assets.toString(), supply: MOCK_VAULT.supply.toString() }, transactions: 0 });

/** What a new player's draw reads of the catalogue (#926): the parts in use, their items, what the player owns. */
export type NewPlayerCatalogue = Pick<AvatarCatalogue, "parts" | "items" | "owned">;

/** A name `setName` takes (#926): letters and digits, 3 to 20 characters. */
const MOCK_NAME = /^[A-Za-z0-9]{3,20}$/;

const newPlayer = (): StoredPlayer => ({
  cobbles: 0,
  credits: 0,
  achievementsClaimed: "0",
  days: {},
  weeks: {},
  owned: {},
  active: new Array<number>(SKIN_PLANS).fill(0),
  shares: "0",
  paved: MOCK_STARTING_PAVED.toString(),
  usdc: "0",
});

/** A stored state, or null when it is not one this version wrote (then the mock starts over). */
function parse(raw: string | null): StoredState | null {
  if (!raw) return null;
  try {
    const state = JSON.parse(raw) as StoredState;
    if (!(state && state.version === 1 && typeof state.players === "object" && state.vault)) return null;
    for (const player of Object.values(state.players)) if (player.v2) renameChestsV2(player.v2);
    return state;
  } catch {
    return null;
  }
}

const bit = (id: number): bigint => 1n << BigInt(id);
const ceilDiv = (a: bigint, b: bigint): bigint => (a + b - 1n) / b;
const sleep = (ms: number) => (ms > 0 ? new Promise<void>((resolve) => setTimeout(resolve, ms)) : Promise.resolve());

/** The `active_skins` word of a set, the theme of plan `p` in byte `p - 1` (`activeThemes` reads it back). */
const activeWord = (active: readonly number[]): bigint => active.reduce((word, theme, i) => word | (BigInt(theme) << BigInt(8 * i)), 0n);

export interface MockLedgerOptions {
  /** Where the state is kept: `localStorage` in the app, a memory store in the tests; null keeps it for the visit only. */
  store: () => KeyValueStore | null;
  /** `Economy.seller()`: the deployment's `Setup`, as the fresh deployment sets it. */
  seller: string;
  /** Before each write's receipt; `MOCK_LATENCY_MS` by default, 0 in the tests. */
  latencyMs?: number;
  /**
   * Runs one write's read, change and save alone among every ledger on the same store: `mockLock` (the browser's Web
   * Locks, which hold across the tabs of the origin) by default. A test gives its own.
   */
  lock?: MockLock;
}

/** Runs `section` while no other holder of the lock runs one; resolves with its result. */
export type MockLock = <T>(section: () => T) => Promise<T>;

/** What `mockLock` needs of `navigator.locks` (the Web Locks API). */
interface LockManagerLike {
  request<T>(name: string, callback: () => T | Promise<T>): Promise<T>;
}

/** One queue per page for the browsers without Web Locks: the writes of this page stay one at a time. */
let pageQueue: Promise<unknown> = Promise.resolve();

/**
 * The lock of the mock's writes: the Web Lock named after `MOCK_KEY`, exclusive across every tab and window of the origin
 * that shares the `localStorage`, so two tabs' writes never interleave between a read of the stored state and its save.
 * A browser without Web Locks (none of those the app supports) falls back to this page's queue.
 */
export const mockLock: MockLock = (section) => {
  const locks = (globalThis as { navigator?: { locks?: LockManagerLike } }).navigator?.locks;
  if (locks && typeof locks.request === "function") return locks.request(MOCK_KEY, section);
  const run = pageQueue.then(section, section);
  pageQueue = run.catch(() => undefined);
  return run;
};

/**
 * The mock ledger: the reads of `MockedReads` (the PAVED and USDC balances take the chain's, which the overlay reads) and,
 * for an account, the writes of `MockedWrites` (`writesFor`). Each write checks what the contract checks, refuses with the
 * chain path's typed error, and answers a receipt with the contract's events, so the hooks' `apply*Events` read it as they
 * read the chain's. The claims trust the page for completion: the progress is the indexer's (it works), and the page offers
 * a claim only for a completed quest or achievement.
 */
export class MockLedger {
  private state: StoredState;
  private readonly questRates = new Map<number, QuestCobbles>();
  private readonly achievementRates = new Map<number, AchievementCobbles>();
  private readonly latency: number;
  private readonly lock: MockLock;
  /** A day's dailies done, as the mock's indexer serves them (`countDailiesWith`); unset, none. */
  private dailiesDone: ((playerId: string, day: number) => Promise<number>) | null = null;

  constructor(private readonly options: MockLedgerOptions) {
    this.state = this.load();
    this.latency = options.latencyMs ?? MOCK_LATENCY_MS;
    this.lock = options.lock ?? mockLock;
  }

  // --- The definitions ---------------------------------------------------------------------------------------------

  /**
   * The indexer's definitions with the mock's Cobbles: a definition the indexer gives none (an indexer that predates
   * cobbles v1) takes the fresh deployment's table (`mocks/cobbles.ts`), else a weekly's default for a quest and its points
   * for an achievement; a daily has none (#869). Learned here: they are what the claims pay.
   */
  definitions(definitions: Definitions): Definitions {
    const quests = definitions.quests.map((q) => {
      const kind = questPeriod({ start: q.startTime, interval: q.interval, duration: q.duration });
      // A daily pays nothing on its own since #869, even where its definition gives it Cobbles: the day's milestones pay.
      const cobbles = kind === "daily" ? 0 : q.cobbles > 0 ? q.cobbles : (QUEST_COBBLES.find((r) => r.questId === q.questId && r.kind === kind)?.cobbles ?? DEFAULT_QUEST_COBBLES[kind]);
      const cobblesKind = q.cobbles > 0 && kind !== "daily" ? q.cobblesKind : kind;
      const task = q.tasks[0];
      this.questRates.set(q.questId, { questId: q.questId, cobbles, kind: cobblesKind, task: task?.taskId ?? 0, total: task?.total ?? 0, start: q.startTime, interval: q.interval });
      return { ...q, cobbles, cobblesKind };
    });
    const achievements = definitions.achievements.map((a) => {
      const cobbles = a.cobbles > 0 ? a.cobbles : (ACHIEVEMENT_COBBLES.find((r) => r.achievementId === a.achievementId)?.cobbles ?? a.points);
      const task = a.tasks[0];
      this.achievementRates.set(a.achievementId, { achievementId: a.achievementId, cobbles, task: task?.taskId ?? 0, total: task?.total ?? 0 });
      return { ...a, cobbles };
    });
    return { ...definitions, quests, achievements };
  }

  /**
   * Where the milestones' claims read a day's dailies done: the mock's indexer (`mockIndexer`), with the fifth daily. Without
   * one, no daily counts as done and every milestone is refused `not-reached`.
   */
  countDailiesWith(read: (playerId: string, day: number) => Promise<number>): void {
    this.dailiesDone = read;
  }

  /** The Challenge games `playerId` surrendered through the mock (#869), game id to the surrender's time in seconds. */
  surrenders(playerId: string): Readonly<Record<string, number>> {
    this.sync();
    return { ...this.peek(playerId).surrenders };
  }

  /**
   * A Challenge game's surrender, recorded at `time` (seconds, now by default) by the mock's signer once the chain took it
   * (`mockSigner`'s `surrender`): the finish the fifth daily counts it on (#869).
   */
  async recordSurrender(account: string, gameId: number, time = Math.floor(Date.now() / 1000)): Promise<void> {
    await this.write(account, (p) => {
      p.surrenders = { ...p.surrenders, [gameId]: time };
      return [];
    });
  }

  /** `/v1/players/:id/referrals`: the mock's player referred nobody yet. */
  referrals(playerId: string): PlayerReferrals {
    return { playerId: addressKey(playerId), total: "0", games: { count: 0, total: "0" }, packs: { count: 0, total: "0" } };
  }

  // --- MockedReads -------------------------------------------------------------------------------------------------

  /**
   * `Setup.player_level` (#641) with PvP v2's XP (#741): the XP of the mock's attacks and Story reports, its level capped at 20
   * (game-core's `levelStatus`; at the cap `next` is the level's floor). The Challenge's games are the chain's: no XP here.
   */
  async playerLevel(playerId: string): Promise<PlayerLevel> {
    this.sync();
    const { xp, level, floor, next } = levelStatus(this.peek(playerId).v2?.xp ?? 0);
    return { xp, level, floor, next };
  }

  async account(playerId: string): Promise<CobbleAccount> {
    this.sync();
    const p = this.peek(playerId);
    return { cobbles: p.cobbles, credits: p.credits, games: 0, forests: 0, wonders: 0, big: 0, high: 0, achievementsClaimed: BigInt(p.achievementsClaimed), xp: 0 };
  }

  async dayProgress(playerId: string, day: number): Promise<PeriodProgress> {
    this.sync();
    return this.progress(this.peek(playerId).days[day]);
  }

  async weekProgress(playerId: string, week: number): Promise<PeriodProgress> {
    this.sync();
    return this.progress(this.peek(playerId).weeks[week]);
  }

  /** The milestones of `day` claimed (#869): none for a day not played, so each UTC day starts afresh. */
  async dailyMilestones(playerId: string, day: number): Promise<DailyMilestonesView> {
    this.sync();
    return { day, claimed: this.peek(playerId).days[day]?.milestones ?? 0 };
  }

  async questCobbles(questId: number): Promise<QuestCobbles> {
    return { ...(this.questRates.get(questId) ?? { questId, cobbles: 0, kind: null, task: 0, total: 0, start: 0, interval: 0 }) };
  }

  async achievementCobbles(achievementId: number): Promise<AchievementCobbles> {
    return { ...(this.achievementRates.get(achievementId) ?? { achievementId, cobbles: 0, task: 0, total: 0 }) };
  }

  async pack(packId: number): Promise<PackView> {
    return { ...(PACKS.find((p) => p.packId === packId) ?? { packId, cobbles: 0, price: 0n, active: false }) };
  }

  async skinPrice(theme: number, plan: number): Promise<number> {
    return MOCK_SKIN_THEMES.get(theme)?.[plan - 1] ?? 0;
  }

  async skinPrices(theme: number): Promise<number[]> {
    return Array.from({ length: SKIN_PLANS }, (_, i) => MOCK_SKIN_THEMES.get(theme)?.[i] ?? 0);
  }

  async ownedSkins(playerId: string, theme: number): Promise<number> {
    this.sync();
    return this.peek(playerId).owned[theme] ?? 0;
  }

  async activeSkins(playerId: string): Promise<number[]> {
    this.sync();
    return [...this.peek(playerId).active];
  }

  /** `Avatar.parts()`: the fresh deployment's ten (`mocks/avatar.ts`). */
  async avatarParts(): Promise<number> {
    return AVATAR_PARTS_IN_USE;
  }

  async avatarPriceBounds(): Promise<[number, number]> {
    return [...AVATAR_PRICE_BOUNDS];
  }

  async avatarItem(part: number, id: number): Promise<AvatarItem> {
    return { ...(AVATAR_ITEMS[part]?.[id] ?? { part, id, state: 0, cobbles: 0, sold: 0, supply: 0, until: 0 }) };
  }

  async avatarItems(part: number): Promise<AvatarItem[]> {
    return (AVATAR_ITEMS[part] ?? []).map((item) => ({ ...item }));
  }

  async ownedAvatarItems(playerId: string, part: number): Promise<bigint> {
    this.sync();
    return BigInt(this.peek(playerId).avatarOwned?.[part] ?? "0");
  }

  /** `Avatar.avatar(player_id)`: a rival of the mock saved none, so it wears the face its battle logs show (#834, #926). */
  async avatar(playerId: string): Promise<bigint> {
    if (mockRival(playerId) || mockRivalV2(playerId)) return generatedLook(playerId);
    this.sync();
    return BigInt(this.peek(playerId).avatar ?? "0");
  }

  /** The player's name (#926), null when they have none: a rival's is its own (`rivalName`). */
  async name(playerId: string): Promise<string | null> {
    this.sync();
    return this.peek(playerId).name ?? null;
  }

  /** `Village.village(player_id)`, as the contract computes it: the score is the engine's replay of the tiles (game-core). */
  async village(playerId: string): Promise<VillageInfo> {
    const rival = mockRival(playerId);
    if (rival) return { gameId: 1, cells: rival.cells.length, tiles: rival.tiles.length - 1, score: rival.score, nextParcel: 0, nextPrice: 0, nextLevel: 0 };
    this.sync();
    const v = this.peek(playerId).village;
    if (!v) return { gameId: 0, cells: 0, tiles: 0, score: 0, nextParcel: 1, nextPrice: parcelPrice(1), nextLevel: parcelLevel(1) };
    const cells = startTerritory().length + v.parcels.length;
    const parcel = cells >= MOCK_MAX_CELLS ? 0 : v.parcels.length + 1;
    return {
      gameId: 1,
      cells,
      tiles: v.tiles.length,
      score: this.engine(v).score,
      nextParcel: parcel,
      nextPrice: parcelPrice(parcel),
      nextLevel: parcelLevel(parcel),
    };
  }

  async villageCells(playerId: string): Promise<VillageCell[]> {
    const rival = mockRival(playerId);
    if (rival) return rival.cells.map((c) => ({ ...c }));
    this.sync();
    const v = this.peek(playerId).village;
    return v ? [...startTerritory(), ...v.parcels].map((c) => ({ x: c.x, y: c.y })) : [];
  }

  async villageTiles(playerId: string): Promise<VillageTile[]> {
    const rival = mockRival(playerId);
    if (rival) return rival.tiles.map((t) => ({ ...t }));
    this.sync();
    const v = this.peek(playerId).village;
    return v ? this.tilesOf(v) : [];
  }

  async villageMaxCells(): Promise<number> {
    return MOCK_MAX_CELLS;
  }

  async rewardGrants(playerId: string): Promise<RewardGrants> {
    this.sync();
    const r = this.peek(playerId).rewards ?? freshRewards();
    return { day: Math.floor(Date.now() / 86_400_000), today: 0, pending: r.pending, opened: r.opened };
  }

  async rewardOffer(playerId: string): Promise<RewardOffer> {
    this.sync();
    const r = this.peek(playerId).rewards ?? freshRewards();
    return r.offer ? { index: r.index, plans: [...r.offer] } : { index: 0, plans: [0, 0, 0] };
  }

  async planCopies(playerId: string): Promise<number[]> {
    this.sync();
    return [...(this.peek(playerId).rewards ?? freshRewards()).copies];
  }

  async skinTiers(theme: number): Promise<number[]> {
    const tiers = MOCK_SKIN_TIERS.get(theme) ?? {};
    return Array.from({ length: SKIN_PLANS }, (_, i) => tiers[i + 1] ?? 0);
  }

  /** `Matchmaker.village(v)`: a founded village is joined (an operator joins it, #639); a rival always is. */
  async pvpVillage(village: string): Promise<MatchmakerVillage> {
    if (mockRival(village)) return { status: 1, draws: 0 };
    this.sync();
    const p = this.peek(village);
    return { status: p.village ? 1 : 0, draws: p.pvp?.draws ?? 0 };
  }

  async pvpMatch(attacker: string): Promise<PvpMatch> {
    this.sync();
    const match = this.peek(attacker).pvp?.match;
    return match ? { ...match } : { opponent: "0x0", offer: 0, cost: 0, started: false };
  }

  /** `Matchmaker.league(v)`: the season of the mock's clock, the crowns and their league, the season's peak and attacks. */
  async pvpLeague(village: string): Promise<LeagueStatus> {
    const season = mockSeasonOf(Math.floor(Date.now() / 1000));
    const rival = mockRival(village);
    if (rival) return { season, crowns: rival.crowns, league: leagueIndex(rival.crowns), peak: leagueIndex(rival.crowns), attacks: 0, pending: 0 };
    this.sync();
    const pvp = this.peek(village).pvp;
    const crowns = pvp?.crowns ?? 0;
    const current = pvp?.season === season;
    return { season, crowns, league: leagueIndex(crowns), peak: current ? Math.max(pvp!.peak, leagueIndex(crowns)) : leagueIndex(crowns), attacks: current ? pvp!.seasonAttacks : 0, pending: 0 };
  }

  /** `Matchmaker.shield(v)`: an attacked village's 8 hours (queue 2), dropped when its owner attacks; a rival's (v1 or v2) is the ledger's. */
  async pvpShield(village: string): Promise<PvpShield> {
    this.sync();
    const rival = mockRival(village) ?? mockRivalV2(village);
    const until = rival ? (this.state.rivalShields?.[addressKey(village)] ?? 0) : (this.peek(village).pvp?.shieldUntil ?? 0);
    const up = until > Math.floor(Date.now() / 1000);
    return { queue: up ? 2 : 0, up, seq: 0, until: up ? until : 0 };
  }

  async pvpSeasonStart(season: number): Promise<number> {
    return MOCK_SEASON_STARTS[season - 1] ?? 0;
  }

  async pvpAttack(attacker: string): Promise<Attack> {
    this.sync();
    const a = this.peek(attacker).pvp?.attacks.at(-1);
    if (!a) return { id: 0, status: 0, defender: "0x0", npc: false, parcels: 0, target: 0, board: 0, placed: 0, startedAt: 0, score: 0, stars: 0 };
    const rival = mockRival(a.defender);
    return {
      id: a.id,
      status: a.status,
      defender: a.defender,
      npc: false,
      parcels: (rival?.cells.length ?? 9) - 9,
      target: a.target,
      board: a.id,
      placed: a.moves.filter((m) => !m.discard).length,
      startedAt: a.openedAt,
      score: a.score,
      stars: a.stars,
    };
  }

  async pvpDeck(attacker: string, id: number): Promise<AttackDeck> {
    this.sync();
    const a = this.peek(attacker).pvp?.attacks.find((x) => x.id === id);
    if (!a) return { size: 0, drawn: 0, hand: 0, bitmap: 0n };
    const open = a.status === MOCK_ATTACK.open && a.drawn.length > a.moves.length;
    return { size: a.plans.length, drawn: a.drawn.length, hand: open ? a.plans[a.drawn.at(-1)!]! : 0, bitmap: a.drawn.reduce((b, i) => b | (1n << BigInt(i)), 0n) };
  }

  async pvpMoves(attacker: string, id: number): Promise<AttackMove[]> {
    this.sync();
    return (this.peek(attacker).pvp?.attacks.find((x) => x.id === id)?.moves ?? []).map((m) => (m.discard ? { ...m } : { ...m, cell: { ...m.cell } }));
  }

  async pvpNpcLevel(): Promise<NpcLevel> {
    return { campaign: 0, level: 0 };
  }

  // --- PvP v2 (#741) ------------------------------------------------------------------------------------------------

  /** A village of PvP v2: the saved layout and its score (game-core's `layoutScore`), the level and slots; a rival's too. */
  async freeVillage(playerId: string): Promise<FreeVillageView> {
    const rival = mockRivalV2(playerId);
    if (rival) return { founded: true, xp: 0, level: rival.level, slots: rival.slots, tiles: rival.tiles.map((t) => ({ ...t })), score: rival.score };
    this.sync();
    const v2 = this.peek(playerId).v2 ?? freshV2();
    const { xp, level, slots } = levelStatus(v2.xp);
    const tiles = v2.layout ?? [];
    return { founded: v2.layout !== null, xp, level, slots, tiles: tiles.map((t) => ({ ...t })), score: layoutScore(tiles) };
  }

  /** The saved layouts' slots (#804): each one's layout, score and whether it still fits; not founded, the free slot empty. */
  async layoutSlots(playerId: string): Promise<LayoutSlotsView> {
    this.sync();
    const v2 = this.peek(playerId).v2 ?? freshV2();
    const slots = v2.layout ? slotsOfV2({ ...v2, layout: v2.layout }) : null;
    const limits = { slots: levelStatus(v2.xp).slots, inventory: v2.inventory };
    return {
      active: slots?.active ?? 0,
      slots: [0, 1, 2].map((slot) => {
        const tiles = slots?.layouts[slot] ?? null;
        return {
          slot,
          open: slots ? layoutSlotOpen(slots, slot) : slot === 0,
          price: layoutSlotPrice(slot)!,
          tiles: tiles ? tiles.map((t) => ({ ...t })) : null,
          score: tiles ? layoutScore(tiles) : 0,
          fits: tiles !== null && layoutRefusal(tiles, limits) === null,
        };
      }),
    };
  }

  async inventory(playerId: string): Promise<number[]> {
    const rival = mockRivalV2(playerId);
    if (rival) return inventoryOf(rival.tiles.map((t) => t.plan));
    this.sync();
    return [...(this.peek(playerId).v2 ?? freshV2()).inventory];
  }

  async chests(playerId: string): Promise<ChestsView> {
    this.sync();
    const v2 = this.peek(playerId).v2 ?? freshV2();
    const open = v2.chests.open;
    return {
      pending: v2.chests.pending.map((c) => c.rank),
      origins: v2.chests.pending.map((c) => c.origin ?? null),
      open: open ? { rank: open.rank, plans: [...open.plans], cobbles: open.cobbles } : null,
      openOrigin: open?.origin ?? null,
      pvpToday: v2.pvpChests[dayOf(this.now())] ?? 0,
      pvpCap: PVP_CHESTS_PER_DAY,
    };
  }

  async shop(playerId: string, day: number): Promise<ShopView> {
    this.sync();
    const bought = (this.peek(playerId).v2 ?? freshV2()).bought[day] ?? [];
    return { day, endsAt: shopEndsAt(day), offers: shopOffers(day).map((o) => ({ ...o, bought: bought.includes(o.slot) })) };
  }

  /** The attacker's opponent drawn and their attack, the open one or the last. */
  async attackV2(attacker: string): Promise<AttackV2State> {
    this.sync();
    const v2 = this.peek(attacker).v2 ?? freshV2();
    const rival = v2.match ? mockRivalV2(v2.match.opponent) : null;
    const match = v2.match && rival ? { opponent: rival.address, name: rival.name, level: rival.level, slots: rival.slots, target: rival.score, deck: rival.deck, offer: v2.match.offer, cost: v2.match.cost, crowns: rival.crowns } : null;
    const a = v2.attacks.at(-1);
    return { match, attack: a ? this.attackView(a) : null };
  }

  /** The attacker's v2 attack `id`, open or ended, or null: every attack stays in the record, so a result's link stays good. */
  async attackV2Of(attacker: string, id: number): Promise<AttackV2 | null> {
    this.sync();
    const a = (this.peek(attacker).v2 ?? freshV2()).attacks.find((x) => x.id === id);
    return a ? this.attackView(a) : null;
  }

  /**
   * The player's matches (#786): their attacks that ended and their rivals' attacks on their village, newest first, each with
   * the attacked village's snapshot at its start (a save from before the snapshot shows the rival's layout, which never changes).
   */
  async matchesV2(playerId: string): Promise<MatchRecord[]> {
    this.sync();
    const v2 = this.peek(playerId).v2 ?? freshV2();
    const copy = (moves: StoredAttackV2["moves"]) => moves.map((m) => (m.discard ? { ...m } : { ...m, cell: { ...m.cell } }));
    const rivalOf = (address: string) => {
      const rival = mockRivalV2(address);
      // A rival lives on no device and saved no avatar: a face seeded by its address (#834), not an initial.
      return { address, name: rival?.name ?? null, level: rival?.level ?? 0, look: String(generatedLook(address)) };
    };
    const attacks: MatchRecord[] = v2.attacks
      .filter((a) => a.status !== "open")
      .map((a) => ({
        id: `a${a.id}`,
        side: "attack",
        rival: rivalOf(a.defender),
        village: (a.village ?? mockRivalV2(a.defender)?.tiles ?? []).map((t) => ({ ...t })),
        target: a.target,
        moves: copy(a.moves),
        score: a.score,
        stars: a.stars,
        surrendered: a.status === "surrendered",
        crowns: a.gained - a.lost,
        xp: a.xp,
        chest: a.chest,
        finishedAt: a.finishedAt,
      }));
    const defences: MatchRecord[] = (v2.defences ?? []).map((d) => ({
      id: `d${d.id}`,
      side: "defence",
      rival: rivalOf(d.attacker),
      village: d.village.map((t) => ({ ...t })),
      target: d.target,
      moves: copy(d.moves),
      score: d.score,
      stars: d.stars,
      surrendered: false,
      crowns: d.crowns,
      xp: 0,
      chest: null,
      finishedAt: d.finishedAt,
    }));
    // Oldest first, an answer after the attack it answers within the same second; then newest first.
    return [...attacks, ...defences].sort((x, y) => x.finishedAt - y.finishedAt || (x.side === y.side ? 0 : x.side === "attack" ? -1 : 1)).reverse();
  }

  /** A rival village's name (the mock's opponents, PvP v1's and v2's), or null for any other player. */
  rivalName(playerId: string): string | null {
    return mockRival(playerId)?.name ?? mockRivalV2(playerId)?.name ?? null;
  }

  /** The indexer's attacks that ended (`/players/:id/attacks` and `/defences`): the mock's rivals never attack, so a village has none. */
  attacksOf(playerId: string, side: "attacker" | "defender"): IndexedAttack[] {
    this.sync();
    if (side === "defender") return [];
    return (this.peek(playerId).pvp?.attacks ?? [])
      .filter((a) => a.status === MOCK_ATTACK.finished || a.status === MOCK_ATTACK.surrendered)
      .map((a) => ({
        attacker: addressKey(playerId),
        id: a.id,
        defender: a.defender,
        npc: false,
        target: a.target,
        tiles: a.plans.length,
        score: a.score,
        stars: a.stars,
        surrendered: a.status === MOCK_ATTACK.surrendered,
        gained: a.gained,
        lost: a.lost,
        openedAt: a.openedAt,
        finishedAt: a.finishedAt,
      }))
      .reverse();
  }

  async spawnPaused(): Promise<boolean> {
    return false;
  }

  async guardian(): Promise<string> {
    return "0x0";
  }

  async split() {
    return { ...MOCK_SPLIT };
  }

  async seller(): Promise<string> {
    return this.options.seller;
  }

  async vault(account: string): Promise<VaultPosition> {
    this.sync();
    return this.positionOf(this.peek(account));
  }

  async maxRedeem(account: string): Promise<bigint> {
    this.sync();
    return BigInt(this.peek(account).shares);
  }

  // OpenZeppelin's ERC4626 at offset 0 with the Vault's exit fee (`contracts/src/systems/vault.cairo`), as the chain rounds.
  async previewDeposit(assets: bigint): Promise<bigint> {
    this.sync();
    return this.depositShares(assets);
  }

  async previewWithdraw(assets: bigint): Promise<bigint> {
    this.sync();
    return this.withdrawShares(assets);
  }

  async previewRedeem(shares: bigint): Promise<bigint> {
    this.sync();
    const value = this.toAssets(shares);
    return value - redeemFee(value, MOCK_VAULT.exitFeeBps);
  }

  async delegateOf(): Promise<string | null> {
    return null;
  }

  /** The chain's PAVED (`chain`, read by the overlay) and what the mock moved: the starting PAVED, the deposits and withdraws. */
  async pavedBalance(account: string, chain = 0n): Promise<bigint> {
    this.sync();
    return this.adjusted(chain, this.peek(account).paved);
  }

  /** The chain's USDC (`chain`) less what the mock's packs took. */
  async usdcBalance(account: string, chain = 0n): Promise<bigint> {
    this.sync();
    return this.adjusted(chain, this.peek(account).usdc);
  }

  // --- MockedWrites ------------------------------------------------------------------------------------------------

  /**
   * The writes of `account`. `balances` reads the chain's PAVED and USDC of the account at send (the overlay's), so a deposit
   * or a pack is refused for a balance the player does not have.
   */
  writesFor(account: string, balances: { paved(): Promise<bigint>; usdc(): Promise<bigint> } = { paved: async () => 0n, usdc: async () => 0n }): MockedWrites {
    return {
      claimQuest: (questId, period) => this.claim(account, [{ kind: "quest", questId, period }]),
      claimAchievement: (achievementId) => this.claim(account, [{ kind: "achievement", achievementId }]),
      claimDailyCredit: (day) => this.claim(account, [{ kind: "credit", credit: "daily", period: day }]),
      claimWeeklyCredit: (week) => this.claim(account, [{ kind: "credit", credit: "weekly", period: week }]),
      claimDailyMilestone: (day, step) => this.claimDailyMilestone(account, day, step),
      claim: (claims) => this.claim(account, claims),
      buySkin: (request) => this.buySkin(account, request),
      setSkins: (changes) => this.setSkins(account, changes),
      buyAvatarItem: (request) => this.buyAvatarItem(account, request),
      setAvatar: (look) => this.setAvatar(account, look),
      setName: (name) => this.setName(account, name),
      foundVillage: () => this.foundVillage(account),
      buyParcel: (request) => this.buyParcel(account, request),
      openReward: () => this.openReward(account),
      claimReward: (claim) => this.claimReward(account, claim),
      drawOpponent: (kind) => this.drawOpponent(account, kind),
      startAttack: () => this.startAttack(account),
      playAttack: (play) => this.playAttack(account, play),
      surrenderAttack: () => this.surrenderAttack(account),
      foundFreeVillage: () => this.foundFreeVillage(account),
      saveLayout: (tiles) => this.saveLayout(account, tiles),
      saveLayoutTo: (slot, tiles) => this.saveLayoutTo(account, slot, tiles),
      activateLayout: (slot) => this.activateLayout(account, slot),
      buyLayoutSlot: (request) => this.buyLayoutSlot(account, request),
      openChest: (index) => this.openChest(account, index),
      claimChest: (slot) => this.claimChest(account, slot),
      buyTile: (request) => this.buyTile(account, request),
      reportStory: (report) => this.reportStory(account, report),
      drawOpponentV2: (kind) => this.drawOpponentV2(account, kind),
      startAttackV2: () => this.startAttackV2(account),
      playAttackV2: (move) => this.playAttackV2(account, move),
      surrenderAttackV2: () => this.surrenderAttackV2(account),
      buyPack: async (request) => this.buyPack(account, request, await balances.usdc()),
      deposit: async (amount, options) => this.deposit(account, amount, options, await balances.paved()),
      withdraw: (amount, options) => this.withdraw(account, amount, options),
      withdrawAll: (options) => this.withdrawAll(account, options),
    };
  }

  /** The claims of `setup.cairo` (`claim_*`), atomic as a multicall: one refusal leaves the ledger as it was. */
  async claim(account: string, claims: readonly CobbleClaim[]): Promise<WriteResult> {
    if (claims.length === 0) throw new WriteError("Nothing to claim");
    await sleep(this.latency);
    return this.write(account, (p, hash) => {
      const events: DecodedEvent[] = [];
      for (const c of claims) {
        if (c.kind === "quest") {
          const q = this.questRates.get(c.questId);
          if (!q || q.cobbles === 0 || q.kind === null) throw new ClaimRefusedError("no-cobbles", hash);
          const progress = this.period(p, q.kind === "weekly", c.period);
          if (BigInt(progress.claimed) & bit(c.questId)) throw new ClaimRefusedError("claimed", hash);
          progress.claimed = (BigInt(progress.claimed) | bit(c.questId)).toString();
          p.cobbles += q.cobbles;
          events.push(this.event("CobblesClaimed", { playerId: account, kind: 1, id: c.questId, period: c.period, cobbles: q.cobbles, balance: p.cobbles }));
        } else if (c.kind === "achievement") {
          const a = this.achievementRates.get(c.achievementId);
          if (!a || a.cobbles === 0) throw new ClaimRefusedError("no-cobbles", hash);
          if (BigInt(p.achievementsClaimed) & bit(c.achievementId)) throw new ClaimRefusedError("claimed", hash);
          p.achievementsClaimed = (BigInt(p.achievementsClaimed) | bit(c.achievementId)).toString();
          p.cobbles += a.cobbles;
          events.push(this.event("CobblesClaimed", { playerId: account, kind: 2, id: c.achievementId, period: 0, cobbles: a.cobbles, balance: p.cobbles }));
        } else {
          const weekly = c.credit === "weekly";
          // No bonus for the whole day since #869: its milestones pay instead (`claimDailyMilestone`).
          if (!weekly) throw new ClaimRefusedError("no-live-quest", hash);
          if (![...this.questRates.values()].some((q) => q.cobbles > 0 && (q.kind === "weekly") === weekly)) throw new ClaimRefusedError("no-live-quest", hash);
          const progress = this.period(p, weekly, c.period);
          if (progress.credit) throw new ClaimRefusedError("credit-claimed", hash);
          progress.credit = true;
          // PvP v2 (#741, #738): finishing every weekly quest pays bonus Cobbles instead of a free game
          const bonus = QUEST_BONUS_COBBLES.weekly;
          p.cobbles += bonus;
          events.push(this.event("CreditClaimed", { playerId: account, kind: 2, period: c.period, credits: p.credits, cobbles: bonus, balance: p.cobbles }));
        }
      }
      return events;
    });
  }

  /**
   * A milestone of the day (#869): `DAILY_MILESTONES[step]`'s Cobbles, once for `day`, refused until that day has the
   * milestone's dailies done (read from the indexer, `countDailiesWith`).
   */
  async claimDailyMilestone(account: string, day: number, step: number): Promise<WriteResult> {
    const [done] = await Promise.all([this.dailiesDone ? this.dailiesDone(account, day) : 0, sleep(this.latency)]);
    return this.write(account, (p, hash) => {
      const progress = this.period(p, false, day);
      const claimed = progress.milestones ?? 0;
      const refusal = dailyMilestoneRefusal(step, done, claimed);
      if (refusal) throw new DailyMilestoneRefusedError(refusal, hash);
      const milestone = DAILY_MILESTONES[step]!;
      progress.milestones = claimed | (1 << step);
      p.cobbles += milestone.cobbles;
      return [this.event("DailyMilestoneClaimed", { playerId: account, day, step, cobbles: milestone.cobbles, balance: p.cobbles })];
    });
  }

  /** `Setup.buy_skin(theme, plan)`, after the writer's checks: the confirmed price, then owned, then the balance. */
  async buySkin(account: string, { theme, plan, confirmedPrice }: BuySkinRequest): Promise<WriteResult> {
    if (!Number.isInteger(theme) || theme < 1 || theme > 255 || !Number.isInteger(plan) || plan < 1 || plan > SKIN_PLANS) throw new SkinRefusedError("invalid-skin");
    if (!Number.isInteger(confirmedPrice) || confirmedPrice <= 0) throw new WriteError("No confirmed price for this skin: nothing was sent");
    const price = await this.skinPrice(theme, plan);
    if (price !== confirmedPrice) throw new SkinPriceChangedError(confirmedPrice, price);
    await sleep(this.latency);
    return this.write(account, (p, hash) => {
      const owned = p.owned[theme] ?? 0;
      if ((owned >>> plan) & 1) throw new SkinRefusedError("owned", hash);
      if (p.cobbles < price) throw new SkinRefusedError("not-enough-cobbles", hash);
      const tier = MOCK_SKIN_TIERS.get(theme)?.[plan] ?? 0;
      if (tier > 0 && tierOf((p.rewards ?? freshRewards()).copies[plan - 1] ?? 0) < tier) throw new SkinRefusedError("tier-too-low", hash);
      p.owned[theme] = owned | (1 << plan);
      p.cobbles -= price;
      return [this.event("SkinBought", { playerId: account, theme, plan, price, balance: p.cobbles })];
    });
  }

  /** `Setup.set_skins(changes)`: theme 0 always passes, another only when owned; the whole batch or nothing. */
  async setSkins(account: string, changes: readonly SkinChange[]): Promise<WriteResult> {
    if (changes.length === 0) throw new WriteError("No skin changed");
    if (new Set(changes.map((c) => c.plan)).size !== changes.length) throw new WriteError("A plan is named twice");
    if (changes.some((c) => !Number.isInteger(c.plan) || c.plan < 1 || c.plan > SKIN_PLANS || !Number.isInteger(c.theme) || c.theme < 0 || c.theme > 255)) throw new SkinRefusedError("invalid-skin");
    await sleep(this.latency);
    return this.write(account, (p, hash) => {
      for (const c of changes) if (c.theme !== 0 && !(((p.owned[c.theme] ?? 0) >>> c.plan) & 1)) throw new SkinRefusedError("not-owned", hash);
      for (const c of changes) p.active[c.plan - 1] = c.theme;
      return [this.event("SkinsActivated", { playerId: account, active: activeWord(p.active) })];
    });
  }

  /**
   * `Avatar.buy_avatar_item(part, id, max_cobbles)`, after the writer's checks: the item on sale at the confirmed price (the
   * block time is the device's), then owned, then the balance. Its Cobbles leave the balance as `Setup.spend_cobbles` takes them.
   */
  async buyAvatarItem(account: string, { part, id, confirmedPrice }: BuyAvatarItemRequest): Promise<WriteResult> {
    const item = await this.avatarItem(part, id);
    const listed = item.state === 1;
    if (!listed || item.cobbles === 0) throw new AvatarRefusedError("not-for-sale");
    if (item.cobbles !== confirmedPrice) throw new AvatarPriceChangedError(confirmedPrice, item.cobbles);
    if (item.until !== 0 && Date.now() / 1000 >= item.until) throw new AvatarRefusedError("sale-ended");
    await sleep(this.latency);
    return this.write(account, (p, hash) => {
      const owned = BigInt(p.avatarOwned?.[part] ?? "0");
      if (owned & bit(id)) throw new AvatarRefusedError("owned", hash);
      if (p.cobbles < item.cobbles) throw new AvatarRefusedError("not-enough-cobbles", hash);
      p.cobbles -= item.cobbles;
      p.avatarOwned = { ...p.avatarOwned, [part]: (owned | bit(id)).toString() };
      return [this.event("AvatarItemBought", { playerId: account, part, id, cobbles: item.cobbles, sold: item.sold + 1, balance: p.cobbles })];
    });
  }

  /** `Avatar.set_avatar(look)`: 0 clears it; any other must be of the format with every part listed and free, or owned. */
  async setAvatar(account: string, look: bigint): Promise<WriteResult> {
    if (look < 0n || look >= 2n ** 128n) throw new AvatarRefusedError("invalid-look");
    await sleep(this.latency);
    return this.write(account, (p, hash) => [this.lookSet(account, p, look, hash)]);
  }

  /** `set_avatar`'s checks, then the look stored: its event. */
  private lookSet(account: string, p: StoredPlayer, look: bigint, hash: string): DecodedEvent {
    if (look !== 0n) {
      if ((look & 0xffn) !== 1n || look >> BigInt(8 * (AVATAR_PARTS_IN_USE + 1)) !== 0n) throw new AvatarRefusedError("invalid-look", hash);
      for (let part = 0; part < AVATAR_PARTS_IN_USE; part++) {
        const id = Number((look >> BigInt(8 * (part + 1))) & 0xffn);
        const item = AVATAR_ITEMS[part]?.[id];
        const free = item !== undefined && item.state === 1 && item.cobbles === 0;
        if (!free && !(BigInt(p.avatarOwned?.[part] ?? "0") & bit(id))) throw new AvatarRefusedError("not-owned", hash);
      }
    }
    p.avatar = look.toString();
    return this.event("AvatarSet", { playerId: account, look });
  }

  /** The player's name (#926): letters and digits, 3 to 20 characters (a short string, if it goes on chain). */
  async setName(account: string, name: string): Promise<WriteResult> {
    await sleep(this.latency);
    return this.write(account, (p) => [this.nameSet(account, p, name)]);
  }

  private nameSet(account: string, p: StoredPlayer, name: string): DecodedEvent {
    if (!MOCK_NAME.test(name)) throw new WriteError(`Not a name: ${JSON.stringify(name)} (letters and digits, 3 to 20)`);
    p.name = name;
    return this.event("NameSet", { playerId: account, name });
  }

  /**
   * A new player's name and look at their first connection (#926): `draw` gives them, the look over the catalogue's offers
   * (`avatarOffers`), and both are stored as `setName` and `setAvatar` store them, with their checks, in one step under the
   * lock. Only for an account with no name; a look saved already stays. No latency, as `foundAtConnection`. Resolves true
   * when it named the player.
   */
  async nameAtConnection(account: string, draw: (catalogue: NewPlayerCatalogue) => { name: string; look: bigint }): Promise<boolean> {
    return this.lock(() => {
      this.sync();
      const p = this.peek(account);
      if (p.name !== undefined) return false;
      const owned = AVATAR_ITEMS.map((_, part) => BigInt(p.avatarOwned?.[part] ?? "0"));
      const { name, look } = draw({ parts: AVATAR_PARTS_IN_USE, items: AVATAR_ITEMS, owned });
      this.commit(account, (q, hash) => [this.nameSet(account, q, name), ...(BigInt(q.avatar ?? "0") === 0n ? [this.lookSet(account, q, look, hash)] : [])]);
      return true;
    });
  }

  /** `Village.found()`: the 3 x 3 of the start and the starter, once. */
  async foundVillage(account: string): Promise<WriteResult> {
    await sleep(this.latency);
    return this.write(account, (p, hash) => {
      if (p.village) throw new VillageRefusedError("founded", hash);
      p.village = { parcels: [], tiles: [] };
      return [this.event("VillageFounded", { playerId: account, gameId: 1 })];
    });
  }

  /**
   * `Village.buy_parcel(x, y)`, after the writer's check of the confirmed price: a village, the cell not owned, next to an owned
   * one, under the cap, the level (the mock's, `playerLevel`: no XP, level 1) at least the parcel's, then the Cobbles.
   */
  async buyParcel(account: string, { cell, confirmedPrice }: BuyParcelRequest): Promise<WriteResult> {
    if (!Number.isInteger(confirmedPrice) || confirmedPrice <= 0) throw new WriteError("No confirmed price for this parcel: nothing was sent");
    const price = (await this.village(account)).nextPrice;
    if (price !== confirmedPrice) throw new VillageRefusedError("price-changed");
    const level = (await this.playerLevel(account)).level;
    await sleep(this.latency);
    return this.write(account, (p, hash) => {
      const v = p.village;
      if (!v) throw new VillageRefusedError("no-village", hash);
      const owned = [...startTerritory(), ...v.parcels];
      const has = (x: number, y: number) => owned.some((c) => c.x === x && c.y === y);
      if (has(cell.x, cell.y)) throw new VillageRefusedError("cell-owned", hash);
      if (![[0, 1], [1, 0], [0, -1], [-1, 0]].some(([dx, dy]) => has(cell.x + dx!, cell.y + dy!))) throw new VillageRefusedError("not-adjacent", hash);
      if (owned.length >= MOCK_MAX_CELLS) throw new VillageRefusedError("territory-full", hash);
      const parcel = v.parcels.length + 1;
      if (level < parcelLevel(parcel)) throw new VillageRefusedError("level-too-low", hash);
      const cost = parcelPrice(parcel);
      if (p.cobbles < cost) throw new VillageRefusedError("not-enough-cobbles", hash);
      p.cobbles -= cost;
      v.parcels.push({ x: cell.x, y: cell.y });
      return [this.event("ParcelBought", { playerId: account, parcel, x: cell.x, y: cell.y, cells: owned.length + 1, cobbles: cost, level })];
    });
  }

  /** `Rewards.open_reward()`: the next pending reward's 3 tiles, drawn from the base deck as `offer_plans` (a Poseidon stands in for the VRF). */
  async openReward(account: string): Promise<WriteResult> {
    await sleep(this.latency);
    return this.write(account, (p, hash) => {
      const r = (p.rewards ??= freshRewards());
      if (r.offer) throw new VillageRefusedError("offer-open", hash);
      if (r.pending === 0) throw new VillageRefusedError("no-reward", hash);
      const plans = offerPlans(poseidon(REWARD_DRAW, BigInt(account), BigInt(r.opened)));
      r.pending -= 1;
      r.opened += 1;
      r.index = r.opened;
      r.offer = plans;
      return [this.event("RewardOpened", { playerId: account, index: r.index, plan1: plans[0], plan2: plans[1], plan3: plans[2] })];
    });
  }

  /** `Rewards.claim_reward(...)`: the open offer placed (every rule of `Village.place`, on game-core's engine), merged, or the Cobbles. */
  async claimReward(account: string, claim: RewardClaim): Promise<WriteResult> {
    await sleep(this.latency);
    return this.write(account, (p, hash) => {
      const r = (p.rewards ??= freshRewards());
      if (!r.offer) throw new VillageRefusedError("no-offer", hash);
      const index = r.index;
      if (claim.choice === "cobbles") {
        r.offer = null;
        p.cobbles += REWARD_COBBLES;
        return [this.event("RewardClaimed", { playerId: account, index, choice: 3, plan: 0, copies: 0, tier: 0, cobbles: REWARD_COBBLES })];
      }
      const plan = r.offer[claim.slot];
      if (plan === undefined) throw new WriteError(`Not an offer slot: ${claim.slot}`);
      if (claim.choice === "place") {
        const v = p.village;
        if (!v) throw new VillageRefusedError("no-village", hash);
        const game = this.engine(v);
        const refused = villageRefusal(game, plan, claim.orientation, claim.cell);
        if (refused) throw new VillageRefusedError(PLACE_REFUSALS[refused] ?? "cannot-place", hash);
        placeInVillage(game, plan, claim.orientation, claim.cell);
        v.tiles.push({ plan, orientation: claim.orientation, x: claim.cell.x, y: claim.cell.y });
      }
      r.offer = null;
      r.copies[plan - 1] = (r.copies[plan - 1] ?? 0) + 1;
      const copies = r.copies[plan - 1]!;
      return [this.event("RewardClaimed", { playerId: account, index, choice: claim.choice === "place" ? 1 : 2, plan, copies, tier: tierOf(copies), cobbles: 0 })];
    });
  }

  /**
   * `Matchmaker.search()` (free) or `next()` (a Cobble): a rival drawn among the three nearest the attacker's crowns that are
   * not shielded (a Poseidon of the draw stands in for the VRF), its offer and cost fixed now. `search` refuses while a drawn
   * opponent is still open to attack; `next` needs one drawn and draws another.
   */
  async drawOpponent(account: string, kind: "search" | "next"): Promise<WriteResult> {
    await sleep(this.latency);
    return this.write(account, (p, hash) => {
      if (!p.village) throw new PvpRefusedError("not-joined", hash);
      const pvp = (p.pvp ??= freshPvp());
      const now = Math.floor(Date.now() / 1000);
      if (pvp.attacks.at(-1)?.status === MOCK_ATTACK.open) throw new PvpRefusedError("attack-started", hash);
      const shielded = (address: string) => (this.state.rivalShields?.[addressKey(address)] ?? 0) > now;
      if (kind === "search" && pvp.match && !shielded(pvp.match.opponent)) throw new PvpRefusedError("opponent-drawn", hash);
      if (kind === "next" && !pvp.match) throw new PvpRefusedError("nothing-drawn", hash);
      const events: DecodedEvent[] = [];
      if (kind === "next") {
        if (p.cobbles < NEXT_PRICE) throw new PvpRefusedError("not-enough-cobbles", hash);
        p.cobbles -= NEXT_PRICE;
        events.push(this.event("CobblesSpent", { playerId: account, spender: MOCK_MATCHMAKER, reason: "MATCH_NEXT", cobbles: NEXT_PRICE, balance: p.cobbles }));
      }
      const current = pvp.match ? BigInt(pvp.match.opponent) : -1n;
      const pool = mockRivals()
        .filter((r) => !shielded(r.address) && BigInt(r.address) !== current)
        .sort((a, b) => Math.abs(a.crowns - pvp.crowns) - Math.abs(b.crowns - pvp.crowns))
        .slice(0, 3);
      if (pool.length === 0) throw new PvpRefusedError("no-opponent", hash);
      const rival = pool[Number(poseidon(MATCH_DRAW, BigInt(account), BigInt(pvp.draws)) % BigInt(pool.length))]!;
      const offer = offerOf(pvp.crowns, rival.crowns);
      const cost = costOf(pvp.crowns, rival.crowns);
      events.push(this.event("OpponentDrawn", { attacker: account, opponent: rival.address, offer, cost, drawIndex: pvp.draws, paid: kind === "next" }));
      pvp.draws += 1;
      pvp.match = { opponent: rival.address, offer, cost, started: false };
      return events;
    });
  }

  /** `Arena.start()`: the attack on the drawn rival, its tiles copied (the snapshot), the first one drawn; the attacker's shield dropped, the rival's up for 8 hours. */
  async startAttack(account: string): Promise<WriteResult> {
    await sleep(this.latency);
    return this.write(account, (p, hash) => {
      const pvp = (p.pvp ??= freshPvp());
      if (pvp.attacks.at(-1)?.status === MOCK_ATTACK.open) throw new PvpRefusedError("attack-open", hash);
      if (!pvp.match) throw new PvpRefusedError("nothing-drawn", hash);
      const now = Math.floor(Date.now() / 1000);
      const key = addressKey(pvp.match.opponent);
      if ((this.state.rivalShields?.[key] ?? 0) > now) throw new PvpRefusedError("opponent-shielded", hash);
      const rival = mockRival(pvp.match.opponent)!;
      const id = pvp.attacks.length + 1;
      const plans = rival.tiles.filter((t) => t.id !== 1).map((t) => t.plan);
      const attack: StoredAttack = {
        id,
        status: MOCK_ATTACK.open,
        defender: rival.address,
        target: rival.score,
        offer: pvp.match.offer,
        cost: pvp.match.cost,
        plans,
        drawn: [],
        moves: [],
        openedAt: now,
        score: 0,
        stars: 0,
        gained: 0,
        lost: 0,
        finishedAt: 0,
      };
      const first = drawTile(account, attack);
      pvp.attacks.push(attack);
      pvp.match = { ...pvp.match, started: true };
      pvp.shieldUntil = 0;
      this.state.rivalShields = { ...this.state.rivalShields, [key]: now + SHIELD_S };
      return [
        this.event("AttackOpened", { attacker: account, defender: rival.address, id, npc: false, offer: attack.offer, target: attack.target, tiles: plans.length }),
        this.event("TileDrawn", { attacker: account, id, draw: 0, plan: first }),
      ];
    });
  }

  /**
   * `Arena.play(...)`: the tile in hand built (checked on game-core's engine in the snapshot's territory, as `Arena` checks
   * it) or discarded; the next tile drawn, or the finish: the moves scored, the stars, the crowns settled, a village reward
   * granted (#642, `Setup.report_pvp`).
   */
  async playAttack(account: string, play: AttackPlay): Promise<WriteResult> {
    await sleep(this.latency);
    return this.write(account, (p, hash) => {
      const a = p.pvp?.attacks.at(-1);
      if (!a || a.status !== MOCK_ATTACK.open) throw new PvpRefusedError("no-attack", hash);
      const plan = a.plans[a.drawn.at(-1)!]!;
      const run = this.attackRun(a);
      const move: AttackMove = play.discard ? { plan, discard: true } : { plan, discard: false, orientation: play.orientation, cell: { ...play.cell } };
      if (!play.discard) {
        const refused = run.refusal(plan, play.orientation, play.cell);
        if (refused) throw new PvpRefusedError(PLAY_REFUSALS[refused] ?? "cannot-place", hash);
      }
      run.apply(move.discard ? { plan, discard: true } : { plan, discard: false, orientation: move.orientation, cell: move.cell });
      const index = a.moves.length;
      a.moves.push(move);
      const at = move.discard ? { orientation: 0, x: 0, y: 0 } : { orientation: move.orientation, x: 0x7fffffff + move.cell.x, y: 0x7fffffff + move.cell.y };
      const events = [this.event("AttackPlayed", { attacker: account, id: a.id, index, plan, discard: move.discard, ...at })];
      if (a.drawn.length < a.plans.length) {
        const next = drawTile(account, a);
        events.push(this.event("TileDrawn", { attacker: account, id: a.id, draw: a.drawn.length - 1, plan: next }));
        return events;
      }
      return [...events, ...this.finish(account, p, a, run.score, false)];
    });
  }

  /** `Arena.surrender()`: the open attack ended at 0 stars, its 0-star cost paid. */
  async surrenderAttack(account: string): Promise<WriteResult> {
    await sleep(this.latency);
    return this.write(account, (p, hash) => {
      const a = p.pvp?.attacks.at(-1);
      if (!a || a.status !== MOCK_ATTACK.open) throw new PvpRefusedError("no-attack", hash);
      return this.finish(account, p, a, 0, true);
    });
  }


  // --- PvP v2's writes (#741): the rules are game-core's ----------------------------------------------------------------

  /** Founds the free village: the starter layout the address picks (`starterLayout`), its 8 tiles added to the inventory. */
  async foundFreeVillage(account: string): Promise<WriteResult> {
    await sleep(this.latency);
    return this.writeV2(account, (_p, v2, hash) => {
      if (v2.layout) throw new V2RefusedError("founded", hash);
      return this.foundV2(account, v2);
    });
  }

  /**
   * The account's first connection (#927, #753): its free village founded with it, as `foundFreeVillage` founds it, so the home
   * shows the starter and its 8 tiles and Edit opens. An account whose village is founded already is left as it was, nothing
   * stored. No latency: the connection's own step, not a write the player sends. Resolves true when it founded the village.
   */
  async foundAtConnection(account: string): Promise<boolean> {
    return this.lock(() => {
      this.sync();
      if (this.peek(account).v2?.layout) return false;
      this.commit(account, (p) => this.foundV2(account, (p.v2 ??= freshV2())));
      return true;
    });
  }

  /** Saves the whole layout, checked against the slots of the player's level and their inventory (`layoutRefusal`). */
  async saveLayout(account: string, tiles: readonly LayoutTile[]): Promise<WriteResult> {
    await sleep(this.latency);
    return this.writeV2(account, (_p, v2, hash) => {
      if (!v2.layout) throw new V2RefusedError("no-village", hash);
      const layout = tiles.map((t) => ({ plan: t.plan, orientation: t.orientation, x: t.x, y: t.y }));
      const refused = layoutRefusal(layout, { slots: levelStatus(v2.xp).slots, inventory: v2.inventory });
      if (refused) throw new V2RefusedError(refused, hash);
      const slots = slotsOfV2({ ...v2, layout: v2.layout });
      storeSlotsV2(v2, withSlotSaved(slots, slots.active, layout));
      return [this.event("LayoutSaved", { playerId: account, tiles: layout.length, score: layoutScore(layout) })];
    });
  }

  /** Saves a layout into an open slot (#804), checked as `saveLayout` checks it: into the active one, the village changes. */
  async saveLayoutTo(account: string, slot: number, tiles: readonly LayoutTile[]): Promise<WriteResult> {
    await sleep(this.latency);
    return this.writeV2(account, (_p, v2, hash) => {
      if (!v2.layout) throw new V2RefusedError("no-village", hash);
      const layout = tiles.map((t) => ({ plan: t.plan, orientation: t.orientation, x: t.x, y: t.y }));
      const slots = slotsOfV2({ ...v2, layout: v2.layout });
      const refused = saveSlotRefusal(slots, slot, layout, { slots: levelStatus(v2.xp).slots, inventory: v2.inventory });
      if (refused) throw new V2RefusedError(refused, hash);
      storeSlotsV2(v2, withSlotSaved(slots, slot, layout));
      return [this.event("LayoutSlotSaved", { playerId: account, slot, active: slot === slots.active, tiles: layout.length, score: layoutScore(layout) })];
    });
  }

  /** Makes a saved slot's layout the village (#804): the one attackers face, checked against the stock and the slots. */
  async activateLayout(account: string, slot: number): Promise<WriteResult> {
    await sleep(this.latency);
    return this.writeV2(account, (_p, v2, hash) => {
      if (!v2.layout) throw new V2RefusedError("no-village", hash);
      const slots = slotsOfV2({ ...v2, layout: v2.layout });
      const refused = activateSlotRefusal(slots, slot, { slots: levelStatus(v2.xp).slots, inventory: v2.inventory });
      if (refused) throw new V2RefusedError(refused, hash);
      storeSlotsV2(v2, withSlotActive(slots, slot));
      return [this.event("LayoutActivated", { playerId: account, slot, score: layoutScore(v2.layout) })];
    });
  }

  /** Buys a locked layout slot (#804) at the price the page showed, in Cobbles: it opens empty. */
  async buyLayoutSlot(account: string, { slot, confirmedPrice }: BuyLayoutSlotRequest): Promise<WriteResult> {
    await sleep(this.latency);
    return this.writeV2(account, (p, v2, hash) => {
      if (!v2.layout) throw new V2RefusedError("no-village", hash);
      const slots = slotsOfV2({ ...v2, layout: v2.layout });
      const refused = buySlotRefusal(slots, slot, confirmedPrice, p.cobbles);
      if (refused) throw new V2RefusedError(refused, hash);
      p.cobbles -= confirmedPrice;
      storeSlotsV2(v2, withSlotBought(slots, slot));
      return [
        this.event("CobblesSpent", { playerId: account, spender: this.options.seller, reason: "LAYOUT_SLOT", cobbles: confirmedPrice, balance: p.cobbles }),
        this.event("LayoutSlotBought", { playerId: account, slot, price: confirmedPrice }),
      ];
    });
  }

  /**
   * Opens a chest waiting (`drawChest`, a Poseidon for the VRF): the one at `index` in the pending list, the player's pick (#784),
   * the oldest when unset. Its tiles shown, its Cobbles credited when they drop.
   */
  async openChest(account: string, index = 0): Promise<WriteResult> {
    await sleep(this.latency);
    return this.writeV2(account, (p, v2, hash) => {
      if (v2.chests.open) throw new V2RefusedError("chest-open", hash);
      const chest = Number.isInteger(index) && index >= 0 ? v2.chests.pending.splice(index, 1)[0] : undefined;
      if (!chest) throw new V2RefusedError("no-chest", hash);
      const draw = drawChest(chest.rank, chest.league, poseidon(CHEST_DRAW, BigInt(account), BigInt(v2.chests.opened)));
      v2.chests.opened += 1;
      v2.chests.open = { rank: draw.rank, plans: [...draw.plans], cobbles: draw.cobbles, ...(chest.origin ? { origin: chest.origin } : {}) };
      p.cobbles += draw.cobbles;
      return [this.event("ChestOpened", { playerId: account, rank: draw.rank, plans: draw.plans.join(","), cobbles: draw.cobbles, balance: p.cobbles })];
    });
  }

  /** Takes tile `slot` of the open chest into the inventory. */
  async claimChest(account: string, slot: number): Promise<WriteResult> {
    await sleep(this.latency);
    return this.writeV2(account, (_p, v2, hash) => {
      const open = v2.chests.open;
      if (!open) throw new V2RefusedError("no-open-chest", hash);
      const plan = open.plans[slot];
      if (!Number.isInteger(slot) || plan === undefined) throw new V2RefusedError("not-a-slot", hash);
      v2.inventory[plan - 1] = (v2.inventory[plan - 1] ?? 0) + 1;
      v2.chests.open = null;
      return [this.event("ChestClaimed", { playerId: account, rank: open.rank, plan })];
    });
  }

  /** Buys offer `slot` of today's shop (`shopOffers`) at the price the page showed: once per offer and day, paid in Cobbles. */
  async buyTile(account: string, { day, slot, confirmedPrice }: BuyTileRequest): Promise<WriteResult> {
    await sleep(this.latency);
    return this.writeV2(account, (p, v2, hash) => {
      const today = dayOf(this.now());
      if (day !== today) throw new V2RefusedError("shop-closed", hash);
      const offer = shopOffers(today)[slot];
      if (!Number.isInteger(slot) || !offer) throw new V2RefusedError("not-a-slot", hash);
      if (offer.price !== confirmedPrice) throw new V2RefusedError("price-changed", hash);
      const bought = v2.bought[today] ?? [];
      if (bought.includes(slot)) throw new V2RefusedError("bought", hash);
      if (p.cobbles < offer.price) throw new V2RefusedError("not-enough-cobbles", hash);
      p.cobbles -= offer.price;
      v2.inventory[offer.plan - 1] = (v2.inventory[offer.plan - 1] ?? 0) + 1;
      v2.bought = { [today]: [...bought, slot] };
      return [
        this.event("CobblesSpent", { playerId: account, spender: this.options.seller, reason: "SHOP_TILE", cobbles: offer.price, balance: p.cobbles }),
        this.event("TileBought", { playerId: account, day: today, slot, plan: offer.plan, price: offer.price }),
      ];
    });
  }

  /**
   * A Story level finished (the Story game's report, which the chain's Story will send in step 3): 5 XP per star earned the first
   * time (`storyXp`), a chest on 3 stars the first time, its rank by the level's place in its campaign (`storyChestRank`),
   * outside the daily cap.
   */
  async reportStory(account: string, { campaign, level, stars }: StoryReport): Promise<WriteResult> {
    await sleep(this.latency);
    return this.writeV2(account, (p, v2, hash) => {
      const levels = CAMPAIGNS.find((c) => c.id === campaign)?.levels.length ?? 0;
      if (!Number.isInteger(level) || level < 1 || level > levels || !Number.isInteger(stars) || stars < 0 || stars > 3) throw new V2RefusedError("no-level", hash);
      const key = `${campaign}:${level}`;
      const best = v2.story[key] ?? 0;
      const xp = addXp(v2.xp, storyXp(best, stars));
      v2.xp = xp.xp;
      const chest = storyChestRank(level, levels, best, stars);
      if (chest) v2.chests.pending.push({ rank: chest, league: this.leagueOf(p), origin: { source: "story" } });
      v2.story[key] = Math.max(best, stars);
      return [this.event("StoryReported", { playerId: account, campaign, level, stars, xp: xp.gained, chest: chest ?? "" })];
    });
  }

  /**
   * Draws an opponent among PvP v2's rivals as `Matchmaker` does: `search` (free) or `next` (a Cobble), among the three nearest
   * the attacker's crowns that are not shielded.
   */
  async drawOpponentV2(account: string, kind: "search" | "next"): Promise<WriteResult> {
    await sleep(this.latency);
    return this.writeV2(account, (p, v2, hash) => {
      if (!v2.layout) throw new V2RefusedError("not-joined", hash);
      if (v2.attacks.at(-1)?.status === "open") throw new V2RefusedError("attack-started", hash);
      const now = Math.floor(this.now());
      const shielded = (address: string) => (this.state.rivalShields?.[addressKey(address)] ?? 0) > now;
      if (kind === "search" && v2.match && !shielded(v2.match.opponent)) throw new V2RefusedError("opponent-drawn", hash);
      if (kind === "next" && !v2.match) throw new V2RefusedError("nothing-drawn", hash);
      const events: DecodedEvent[] = kind === "search" ? this.answerV2(account, p, v2) : [];
      if (kind === "next") {
        if (p.cobbles < NEXT_PRICE) throw new V2RefusedError("not-enough-cobbles", hash);
        p.cobbles -= NEXT_PRICE;
        events.push(this.event("CobblesSpent", { playerId: account, spender: MOCK_MATCHMAKER, reason: "MATCH_NEXT", cobbles: NEXT_PRICE, balance: p.cobbles }));
      }
      const crowns = p.pvp?.crowns ?? 0;
      const current = v2.match ? BigInt(v2.match.opponent) : -1n;
      const pool = mockRivalsV2()
        .filter((r) => !shielded(r.address) && BigInt(r.address) !== current)
        .sort((a, b) => Math.abs(a.crowns - crowns) - Math.abs(b.crowns - crowns))
        .slice(0, 3);
      if (pool.length === 0) throw new V2RefusedError("no-opponent", hash);
      const rival = pool[Number(poseidon(MATCH_DRAW_V2, BigInt(account), BigInt(v2.draws)) % BigInt(pool.length))]!;
      const offer = offerOf(crowns, rival.crowns);
      const cost = costOf(crowns, rival.crowns);
      events.push(this.event("OpponentDrawn", { attacker: account, opponent: rival.address, offer, cost, drawIndex: v2.draws, paid: kind === "next" }));
      v2.draws += 1;
      v2.match = { opponent: rival.address, offer, cost };
      return events;
    });
  }

  /** Starts the attack on the opponent drawn: its deck drawn (`attackDeck`, ceil(1.15 x S)); the attacker's shield dropped, the rival's up. */
  async startAttackV2(account: string): Promise<WriteResult> {
    await sleep(this.latency);
    return this.writeV2(account, (p, v2, hash) => {
      if (v2.attacks.at(-1)?.status === "open") throw new V2RefusedError("attack-open", hash);
      const rival = v2.match ? mockRivalV2(v2.match.opponent) : null;
      if (!v2.match || !rival) throw new V2RefusedError("nothing-drawn", hash);
      const now = Math.floor(this.now());
      const key = addressKey(rival.address);
      if ((this.state.rivalShields?.[key] ?? 0) > now) throw new V2RefusedError("opponent-shielded", hash);
      const id = v2.attacks.length + 1;
      const deck = attackDeck(rival.tiles.map((t) => t.plan), rival.slots, poseidon(ATTACK_DRAW_V2, BigInt(account), BigInt(id)));
      v2.attacks.push({
        id,
        status: "open",
        defender: rival.address,
        slots: rival.slots,
        target: rival.score,
        // The snapshot (#786): the defender's layout as the attack found it.
        village: rival.tiles.map((t) => ({ ...t })),
        offer: v2.match.offer,
        cost: v2.match.cost,
        deck,
        moves: [],
        openedAt: now,
        score: 0,
        stars: 0,
        xp: 0,
        chest: null,
        gained: 0,
        lost: 0,
        finishedAt: 0,
      });
      (p.pvp ??= freshPvp()).shieldUntil = 0;
      this.state.rivalShields = { ...this.state.rivalShields, [key]: now + SHIELD_S };
      return [this.event("AttackOpened", { attacker: account, defender: rival.address, id, npc: false, offer: v2.match.offer, target: rival.score, tiles: deck.length, view: deck.slice(0, 3).join(",") })];
    });
  }

  /** Plays the tile in hand (checked on game-core's `QueuedAttack`); the deck's last tile ends the attack. */
  async playAttackV2(account: string, move: QueuedMove): Promise<WriteResult> {
    await sleep(this.latency);
    return this.writeV2(account, (p, v2, hash) => {
      const a = v2.attacks.at(-1);
      if (!a || a.status !== "open") throw new V2RefusedError("no-attack", hash);
      const attack = QueuedAttack.replay(a.deck, a.moves);
      const plan = attack.hand!;
      if (!move.discard && attack.refusal(move.orientation, move.cell) !== null) throw new V2RefusedError("cannot-place", hash);
      const played = move.discard ? { discard: true as const } : { discard: false as const, orientation: move.orientation, cell: { x: move.cell.x, y: move.cell.y } };
      attack.apply(played);
      a.moves.push({ ...played, plan });
      a.score = attack.score;
      const events = [this.event("AttackPlayed", { attacker: account, id: a.id, index: a.moves.length - 1, plan, discard: move.discard, score: attack.score, view: attack.view.join(",") })];
      return attack.over ? [...events, ...this.finishV2(account, p, v2, a, attack.score, false)] : events;
    });
  }

  /** Ends the open attack at 0 stars. */
  async surrenderAttackV2(account: string): Promise<WriteResult> {
    await sleep(this.latency);
    return this.writeV2(account, (p, v2, hash) => {
      const a = v2.attacks.at(-1);
      if (!a || a.status !== "open") throw new V2RefusedError("no-attack", hash);
      return this.finishV2(account, p, v2, a, a.score, true);
    });
  }

  /**
   * `Setup.buy_pack`: the pack on sale at the confirmed price (`PackBuyer`'s checks), paid from the player's USDC (the chain's
   * `usdc`, less what earlier packs took), its Cobbles added. The pool and the referral are not run: no PAVED is burned.
   */
  async buyPack(account: string, request: PackPurchaseRequest, usdc = 0n): Promise<PackReceipt> {
    const pack = await this.pack(request.packId);
    if (!(pack.active && pack.cobbles > 0 && pack.price > 0n)) throw new PackNotOnSaleError(request.packId);
    if (request.confirmedPrice !== pack.price) throw new PackPriceChangedError(request.confirmedPrice, pack.price);
    const short = () => new WriteError("Not enough USDC for this pack: get test USDC first. Nothing was sent.");
    if ((await this.usdcBalance(account, usdc)) < pack.price) throw short();
    await sleep(this.latency);
    let bought: PackBought | null = null;
    const result = await this.write(account, (p) => {
      // Checked again at commit: another purchase may have spent the USDC during the wait.
      if (this.adjusted(usdc, p.usdc) < pack.price) throw short();
      p.cobbles += pack.cobbles;
      p.usdc = (BigInt(p.usdc) - pack.price).toString();
      bought = { playerId: addressKey(account), packId: pack.packId, cobbles: pack.cobbles, price: pack.price, referrer: "0x0", balance: p.cobbles };
      return [this.event("PackBought", { ...bought })];
    });
    return { ...result, bought: bought! };
  }

  /** `Vault.deposit(amount, self)`: the shares `preview_deposit` gives; refused above the wallet's PAVED or for 0 shares. */
  async deposit(account: string, amount: bigint, options: { confirmedAmount: bigint }, paved = 0n): Promise<WriteResult> {
    this.checkAmount(amount, options.confirmedAmount);
    const balance = await this.pavedBalance(account, paved);
    if (balance < amount) throw new VaultBalanceError(balance);
    if ((await this.previewDeposit(amount)) === 0n) throw new VaultZeroSharesError();
    await sleep(this.latency);
    return this.write(account, (p) => {
      // Checked again at commit, on the stored state: another deposit may have taken the PAVED during the wait, or moved the rate.
      const now = this.adjusted(paved, p.paved);
      if (now < amount) throw new VaultBalanceError(now);
      const shares = this.depositShares(amount);
      if (shares === 0n) throw new VaultZeroSharesError();
      this.move(p, shares, amount);
      p.paved = (BigInt(p.paved) - amount).toString();
      return [this.event("Deposit", { sender: account, owner: account, assets: amount, shares })];
    });
  }

  /** `Vault.withdraw(amount, self, self)`: burns the shares of the amount and its fee; the fee stays in the Vault. */
  async withdraw(account: string, amount: bigint, options: { confirmedAmount: bigint; confirmedExitFeeBps?: number }): Promise<WriteResult> {
    this.checkAmount(amount, options.confirmedAmount);
    const position = await this.vault(account);
    this.checkFee(options.confirmedExitFeeBps);
    if (amount > position.maxWithdraw) throw new VaultOverMaxWithdrawError(position.maxWithdraw);
    await sleep(this.latency);
    return this.write(account, (p) => {
      // Checked again at commit: another withdraw may have burned the shares during the wait.
      const max = this.positionOf(p).maxWithdraw;
      if (amount > max) throw new VaultOverMaxWithdrawError(max);
      const shares = this.withdrawShares(amount);
      this.move(p, -shares, -amount);
      p.paved = (BigInt(p.paved) + amount).toString();
      return [this.event("Withdraw", { sender: account, receiver: account, owner: account, assets: amount, shares })];
    });
  }

  /** `Vault.redeem(shares, self, self)` of every vPAVED held, at the shares the player confirmed. */
  async withdrawAll(account: string, options: { confirmedShares: bigint; confirmedExitFeeBps?: number }): Promise<WriteResult> {
    const position = await this.vault(account);
    if (position.shares === 0n) throw new WriteError("No vPAVED to withdraw");
    if (position.shares !== options.confirmedShares) throw new VaultAmountChangedError(options.confirmedShares, position.shares);
    this.checkFee(options.confirmedExitFeeBps);
    await sleep(this.latency);
    return this.write(account, (p) => {
      // The shares held at commit must still be the ones confirmed.
      const now = this.positionOf(p);
      if (now.shares !== options.confirmedShares) throw new VaultAmountChangedError(options.confirmedShares, now.shares);
      this.move(p, -now.shares, -now.maxWithdraw);
      p.paved = (BigInt(p.paved) + now.maxWithdraw).toString();
      return [this.event("Withdraw", { sender: account, receiver: account, owner: account, assets: now.maxWithdraw, shares: now.shares })];
    });
  }

  /** Back to the mock's start: nothing claimed, bought or deposited. */
  reset(): Promise<void> {
    return this.lock(() => {
      this.state = fresh();
      this.save();
    });
  }

  // --- State ---------------------------------------------------------------------------------------------------------

  /**
   * The state as stored now: another tab (or another ledger on the same store) may have written since this one loaded. Every
   * read and every write starts from it, so no write stores a stale copy over another's. Without a store the state is this
   * ledger's own.
   */
  private sync(): void {
    try {
      const stored = parse(this.options.store()?.getItem(MOCK_KEY) ?? null);
      if (stored) this.state = stored;
    } catch {
      // Storage refused: keep the state of the visit.
    }
  }

  private load(): StoredState {
    try {
      return parse(this.options.store()?.getItem(MOCK_KEY) ?? null) ?? fresh();
    } catch {
      return fresh();
    }
  }

  private save(): void {
    try {
      this.options.store()?.setItem(MOCK_KEY, JSON.stringify(this.state));
    } catch {
      // Storage refused (private mode, quota): the state lives for the visit.
    }
  }

  /** A player's state for a read; a player not seen yet reads the start, and is not stored until a write. */
  private peek(playerId: string): StoredPlayer {
    return this.state.players[addressKey(playerId)] ?? newPlayer();
  }

  /**
   * One write: `change` works on a copy of the player and returns the receipt's events; a throw leaves the ledger as it was
   * (a revert), else the copy is kept and stored.
   */
  private write(account: string, change: (player: StoredPlayer, hash: string) => DecodedEvent[]): Promise<WriteResult> {
    return this.lock(() => this.commit(account, change));
  }

  /** Under the lock, synchronous from the read of the stored state to its save: no other write, of any tab, comes between. */
  private commit(account: string, change: (player: StoredPlayer, hash: string) => DecodedEvent[]): WriteResult {
    this.sync();
    const key = addressKey(account);
    const player: StoredPlayer = structuredClone(this.state.players[key] ?? newPlayer());
    const vault = { ...this.state.vault };
    const hash = `0x6d6f636b${(this.state.transactions + 1).toString(16).padStart(8, "0")}`;
    let events: DecodedEvent[];
    try {
      events = change(player, hash);
    } catch (error) {
      this.state.vault = vault;
      throw error;
    }
    this.state = { ...this.state, players: { ...this.state.players, [key]: player }, transactions: this.state.transactions + 1 };
    this.save();
    return { transactionHash: hash, events };
  }

  /** A stored village's tiles as `Village.tiles` lists them: the starter first, then the tiles placed, ids 2 on. */
  private tilesOf(v: NonNullable<StoredPlayer["village"]>): VillageTile[] {
    return [{ ...STARTER }, ...v.tiles.map((t, i) => ({ id: i + 2, ...t }))];
  }

  /** A stored attack's moves on game-core's engine, in its defender's territory. */
  private attackRun(a: StoredAttack): AttackRun {
    const rival = mockRival(a.defender);
    return AttackRun.replay(
      { territory: rival?.cells ?? startTerritory() },
      a.moves.map((m) => (m.discard ? { plan: m.plan, discard: true as const } : { plan: m.plan, discard: false as const, orientation: m.orientation, cell: m.cell })),
    );
  }

  /** An attack's end (`Matchmaker.settle`): the stars of its score, the crowns (a rival's never change, as an NPC's), the season's count, a village reward. */
  private finish(account: string, p: StoredPlayer, a: StoredAttack, score: number, surrendered: boolean): DecodedEvent[] {
    const stars = surrendered ? 0 : starsFor(score, a.target);
    const { gained, lost } = this.settle(p, stars, a.offer, a.cost);
    p.pvp!.match = null;
    Object.assign(a, { status: surrendered ? MOCK_ATTACK.surrendered : MOCK_ATTACK.finished, score, stars, gained, lost, finishedAt: Math.floor(Date.now() / 1000) });
    const rewards = (p.rewards ??= freshRewards());
    rewards.pending += 1;
    return [this.event("AttackFinished", { attacker: account, defender: a.defender, id: a.id, gameId: a.id, score, stars, surrendered, gained, lost })];
  }

  /** The free village founded on `v2` (not founded yet): the address's starter layout, its tiles into the inventory. */
  private foundV2(account: string, v2: StoredV2): DecodedEvent[] {
    const layout = starterLayout(BigInt(account));
    const added = inventoryOf(layout.map((t) => t.plan));
    v2.inventory = v2.inventory.map((n, i) => n + added[i]!);
    v2.layout = layout;
    return [this.event("FreeVillageFounded", { playerId: account, tiles: layout.length, score: layoutScore(layout) })];
  }

  /** A v2 write: `change` works on the player's copy and their v2 state (created on the first write). */
  private writeV2(account: string, change: (player: StoredPlayer, v2: StoredV2, hash: string) => DecodedEvent[]): Promise<WriteResult> {
    return this.write(account, (p, hash) => change(p, (p.v2 ??= freshV2()), hash));
  }

  /** The device's clock, in seconds. */
  private now(): number {
    return Date.now() / 1000;
  }

  /** A player's league, from their crowns. */
  private leagueOf(p: StoredPlayer): number {
    return leagueIndex(p.pvp?.crowns ?? 0);
  }

  /** An attack as `attackV2` shows it: the deck only as far as the tile in hand and the next two. */
  private attackView(a: StoredAttackV2): AttackV2 {
    const open = a.status === "open";
    return {
      id: a.id,
      status: a.status,
      defender: a.defender,
      slots: a.slots,
      target: a.target,
      deck: a.deck.length,
      view: open ? a.deck.slice(a.moves.length, a.moves.length + 3) : [],
      moves: a.moves.map((m) => (m.discard ? { ...m } : { ...m, cell: { ...m.cell } })),
      score: a.score,
      stars: a.stars,
      xp: a.xp,
      chest: a.chest,
      gained: a.gained,
      lost: a.lost,
      openedAt: a.openedAt,
      finishedAt: a.finishedAt,
    };
  }

  /** The crowns of an attack's end, and the season's count (`Matchmaker.settle`), shared by PvP v1 and v2. */
  private settle(p: StoredPlayer, stars: number, offer: number, cost: number): { gained: number; lost: number } {
    const pvp = (p.pvp ??= freshPvp());
    const stakes = stakesOf(offer, cost);
    const gained = stars > 0 ? stakes.win[stars - 1]! : 0;
    const lost = stars > 0 ? 0 : Math.min(cost, pvp.crowns);
    pvp.crowns += gained - lost;
    const season = mockSeasonOf(Math.floor(Date.now() / 1000));
    if (pvp.season !== season) {
      pvp.season = season;
      pvp.seasonAttacks = 0;
      pvp.peak = 0;
    }
    pvp.seasonAttacks += 1;
    pvp.peak = Math.max(pvp.peak, leagueIndex(pvp.crowns));
    return { gained, lost };
  }

  /**
   * A rival's answer (#786): the mock's rivals live on no device, so the rival the player attacked last attacks the player's
   * village at their next search, once per attack. The snapshot is the layout saved then; the deck is drawn from it as an attack
   * on a rival's is (`attackDeck`, ceil(1.15 x S)), played by a plain player (the most points now, else a discard). The player
   * loses the crowns its stars win, or wins its cost when it takes none, and the village is shielded for 8 hours (`SHIELD_S`), as
   * any attacked village is: until the player starts an attack, which drops it, or the shield ends.
   */
  private answerV2(account: string, p: StoredPlayer, v2: StoredV2): DecodedEvent[] {
    const last = v2.attacks.at(-1);
    const rival = last ? mockRivalV2(last.defender) : null;
    if (!last || !rival || last.status === "open" || !v2.layout || (v2.answered ?? 0) >= last.id) return [];
    v2.answered = last.id;
    const village = v2.layout.map((t) => ({ ...t }));
    const target = layoutScore(village);
    const { slots } = levelStatus(v2.xp);
    const id = (v2.defences?.length ?? 0) + 1;
    const deck = attackDeck(village.map((t) => t.plan), slots, poseidon(DEFENCE_DRAW_V2, BigInt(account), BigInt(id)));
    const attack = new QueuedAttack(deck);
    const moves: StoredDefenceV2["moves"] = [];
    while (!attack.over) {
      const plan = attack.hand!;
      const move = plainMove(attack, plan);
      attack.apply(move);
      moves.push({ ...move, plan });
    }
    const stars = attackStars(attack.score, target);
    const pvp = (p.pvp ??= freshPvp());
    const stakes = stakesOf(offerOf(rival.crowns, pvp.crowns), costOf(rival.crowns, pvp.crowns));
    const crowns = stars > 0 ? -Math.min(stakes.win[stars - 1]!, pvp.crowns) : stakes.loss;
    pvp.crowns += crowns;
    const finishedAt = Math.floor(this.now());
    pvp.shieldUntil = finishedAt + SHIELD_S;
    (v2.defences ??= []).push({ id, attacker: rival.address, slots, village, target, deck, moves, score: attack.score, stars, crowns, finishedAt });
    return [this.event("DefenceFinished", { attacker: rival.address, defender: account, id, score: attack.score, stars, crowns })];
  }

  /** A v2 attack's end: its stars (`attackStars`), the crowns, the XP (`pvpXp`, stopped at the cap) and a chest within the day's cap. */
  private finishV2(account: string, p: StoredPlayer, v2: StoredV2, a: StoredAttackV2, score: number, surrendered: boolean): DecodedEvent[] {
    const stars = surrendered ? 0 : attackStars(score, a.target);
    const { gained, lost } = this.settle(p, stars, a.offer, a.cost);
    v2.match = null;
    const xp = addXp(v2.xp, pvpXp(stars));
    v2.xp = xp.xp;
    const today = dayOf(this.now());
    const rank = pvpChestRank(stars);
    const granted = rank !== null && pvpChestGranted(v2.pvpChests[today] ?? 0);
    if (granted) {
      v2.chests.pending.push({ rank, league: this.leagueOf(p), origin: { source: "pvp", day: today, slot: v2.pvpChests[today] ?? 0 } });
      v2.pvpChests = { [today]: (v2.pvpChests[today] ?? 0) + 1 };
    }
    Object.assign(a, { status: surrendered ? "surrendered" : "finished", score, stars, xp: xp.gained, chest: granted ? rank : null, gained, lost, finishedAt: Math.floor(this.now()) });
    return [this.event("AttackFinished", { attacker: account, defender: a.defender, id: a.id, score, stars, surrendered, gained, lost, xp: xp.gained, chest: granted ? rank : "" })];
  }

  /** A stored village on game-core's engine. */
  private engine(v: NonNullable<StoredPlayer["village"]>) {
    return villageGame([...startTerritory(), ...v.parcels], this.tilesOf(v), MOCK_MAX_CELLS);
  }

  private progress(stored: StoredPeriod | undefined): PeriodProgress {
    return { games: 0, structures: 0, forests: 0, points: 0, claimed: BigInt(stored?.claimed ?? "0"), credit: stored?.credit ?? false };
  }

  private period(p: StoredPlayer, weekly: boolean, period: number): StoredPeriod {
    const map = weekly ? p.weeks : p.days;
    map[period] ??= { claimed: "0", credit: false };
    return map[period]!;
  }

  private totals(): { assets: bigint; supply: bigint } {
    return { assets: BigInt(this.state.vault.assets), supply: BigInt(this.state.vault.supply) };
  }

  private positionOf(p: StoredPlayer): VaultPosition {
    const shares = BigInt(p.shares);
    const { assets, supply } = this.totals();
    const value = this.toAssets(shares);
    return { shares, value, maxWithdraw: value - redeemFee(value, MOCK_VAULT.exitFeeBps), exitFeeBps: MOCK_VAULT.exitFeeBps, totalAssets: assets, totalSupply: supply };
  }

  private depositShares(assets: bigint): bigint {
    const t = this.totals();
    return (assets * (t.supply + 1n)) / (t.assets + 1n);
  }

  private withdrawShares(assets: bigint): bigint {
    const t = this.totals();
    return ceilDiv((assets + withdrawFee(assets, MOCK_VAULT.exitFeeBps)) * (t.supply + 1n), t.assets + 1n);
  }

  private toAssets(shares: bigint): bigint {
    const t = this.totals();
    return (shares * (t.assets + 1n)) / (t.supply + 1n);
  }

  /** The player's shares and the Vault's totals move by `shares` vPAVED and `assets` PAVED (negative out). */
  private move(p: StoredPlayer, shares: bigint, assets: bigint): void {
    const t = this.totals();
    this.state.vault = { assets: (t.assets + assets).toString(), supply: (t.supply + shares).toString() };
    p.shares = (BigInt(p.shares) + shares).toString();
  }

  private adjusted(chain: bigint, delta: string): bigint {
    const total = chain + BigInt(delta);
    return total < 0n ? 0n : total;
  }

  private checkAmount(amount: bigint, confirmed: bigint): void {
    if (amount <= 0n) throw new WriteError("An amount must be above 0");
    if (amount !== confirmed) throw new VaultAmountChangedError(confirmed, amount);
  }

  private checkFee(confirmed: number | undefined): void {
    if (confirmed !== undefined && confirmed !== MOCK_VAULT.exitFeeBps) throw new VaultExitFeeChangedError(confirmed, MOCK_VAULT.exitFeeBps);
  }

  private event(name: string, fields: DecodedEvent["fields"]): DecodedEvent {
    return { name, fields, fromAddress: this.options.seller };
  }
}

/** The plain player's move with `plan` in hand (#786, a rival's answer): the most points now, the engine's first cell on a tie; a discard where it fits nowhere. */
function plainMove(attack: QueuedAttack, plan: number): QueuedMove {
  let best: QueuedMove = { discard: true };
  let most = -Infinity;
  for (const cell of attack.slots()) {
    for (const orientation of attack.orientations(cell)) {
      const points = attack.run.preview(plan, orientation, cell) ?? -Infinity;
      if (points > most) {
        most = points;
        best = { discard: false, orientation, cell };
      }
    }
  }
  return best;
}
