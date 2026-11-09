// The mock ledger's stored state, its constants and helpers (`ledger.ts`): shared by the links of `MockLedger`'s chain.

import { FAUCET_USDC_AMOUNT, SKIN_PLANS, type BuildMove, type DrawViews, type GameKey, type PoolQuoter, type PurchaseRequest, type AvatarViews, type BuyAvatarItemRequest, type NameViews, type RenameRequest, type BuyParcelRequest, type BuySkinRequest, type CobbleViews, type EconomyViews, type GameViews, type LevelViews, type PackBought, type PackPurchaseRequest, type PackViews, type PavedWriter, type RewardClaim, type SkinViews, type VaultViews, type VillageCell, type VillageRefusal, type VillageViews, type WriteResult, type AttackMove, type AttackPlay, type PvpMatch, type PvpViews, type PvpRefusal } from "@paved/chain";
import { QueuedAttack, emptyTutorialCounts, levelStatus, poseidon, type KeyValueStore, type QueuedMove, type ConversationId, type TutorialCounts, type TutorialTask } from "@paved/game-core";
import type { StoredFollows } from "./follows";
import type { ChatEvent, ChatSource } from "../social-source";
import { renameChestsV2, type StoredV2 } from "./v2";
import type { LayoutSlotViews, LayoutSlotWrites } from "../layout-slots";
import type { FreeVillageViews, FreeVillageWrites } from "../free-village";
import type { AttackV2Views, AttackV2Writes } from "../free-attack";
import type { MatchRecordViews } from "../matches";
import type { DailyMilestoneViews, DailyMilestoneWrites } from "../daily-milestones";
import type { WeeklyMilestoneViews, WeeklyMilestoneWrites } from "../weekly-milestones";
import type { TutorialViews, TutorialWrites } from "../tutorial";
import { SKIN_PRICES } from "../../mocks/cobbles";
import type { AvatarCatalogue } from "../avatar-catalogue";
import { PLAYER_NAME_MAX } from "../../lib/name-limit";
import type { StoredPuzzle } from "./puzzle";
import type { StoredChallenge } from "./challenge";
import * as guilds from "./guilds";
import * as chat from "./chat";

/** Where the mock ledger keeps its state on the device. A format change is a new key, never an edit in place. */
export const MOCK_KEY = "paved.mock.v1";

/** How long a mocked write takes before its receipt, so the pages show their "on its way" state as on chain. */
export const MOCK_LATENCY_MS = 450;

/**
 * What a new account holds in the mock (#927, open point 1): the faucet's USDC (one `mint`, 100 USDC) and no PAVED, which is
 * won (the Challenge's settlement). "Get test USDC" mints more (`mint`). None of it reaches the chain.
 */
export const MOCK_STARTING_BALANCES: Readonly<TokenBalances> = { usdc: FAUCET_USDC_AMOUNT, paved: 0n };

/** An account's USDC and PAVED, base units (6 and 18 decimals). */
export interface TokenBalances {
  usdc: bigint;
  paved: bigint;
}

/** The Vault at the mock's start: 542,100 PAVED for 500,000 vPAVED, a rate of about 1.0842 (as `mocks/vault.ts`). */
export const MOCK_VAULT = { assets: 542_100n * 10n ** 18n, supply: 500_000n * 10n ** 18n, exitFeeBps: 500 };

/** `Economy.split_bps()` at the chain's defaults (V1b, P-56; as `mocks/economy.ts` `SPLIT_BPS`). */
export const MOCK_SPLIT = { burn: 7_368, vault: 2_632, referral: 500 };

/** The skins priced in the mock: theme 1 (Forest), the rarity table of the fresh deployment (cobbles-v1.md 5.2). */
export const MOCK_SKIN_THEMES: ReadonlyMap<number, readonly number[]> = new Map([[1, SKIN_PRICES]]);

/** The territory's cap in the mock: the value proposed for the deployment (#640, decision 1). */
export const MOCK_MAX_CELLS = 38;

/**
 * The village rewards a player finds waiting in the mock (#646): the mock's game over grants none, so a new player starts with
 * these to open. They never reach the chain.
 */
export const MOCK_STARTING_REWARDS = 3;

/**
 * The skins reserved to a tier in the mock (#642, `Setup.skin_tier`), by theme and plan: none. No deployment sets any, and the
 * tier-gated skins left the client with v2 (#739); the contract's gate goes with #736.
 */
export const MOCK_SKIN_TIERS: ReadonlyMap<number, Readonly<Record<number, number>>> = new Map();

/** The starter `Village.found` writes at (0, 0): `RFFFRFCFR` (plan 9) facing South (orientation 3). */
export const STARTER = { id: 1, plan: 9, orientation: 3, x: 0, y: 0 } as const;

/** The kind of the mock's reward draw: its random is `poseidon(REWARD, player, index)`, a stand-in for the VRF's. */
export const REWARD_DRAW = 0x524557415244n;

/** Every read the deployed classes lack (#549): implemented by the chain (`RpcGameViews`, `RpcEconomyViews`) and by `MockLedger`. */
export interface MockedReads
  extends CobbleViews,
    PackViews,
    SkinViews,
    LevelViews,
    AvatarViews,
    NameViews,
    VillageViews,
    PvpViews,
    FreeVillageViews,
    LayoutSlotViews,
    AttackV2Views,
    MatchRecordViews,
    DailyMilestoneViews,
    WeeklyMilestoneViews,
    TutorialViews,
    Pick<GameViews, "spawnPaused" | "guardian" | "game" | "tiles" | "builder" | "initialSeed" | "draw" | "currentDay" | "entryPrice" | "tutorialClaimed">,
    Pick<DrawViews, "spawnSalt">,
    VaultViews,
    PoolQuoter,
    Pick<EconomyViews, "split" | "seller" | "usdcBalance" | "pavedBalance" | "quote" | "guardRate" | "router" | "day" | "terms"> {}

/** The receipt of a pack bought: the writer's `buyPack` answer. */
export type PackReceipt = WriteResult & { bought: PackBought };

/**
 * Every write the deployed classes lack, for the connected account: the writer's (`PavedWriter`) claims and skin writes, the
 * pack buyer's `buy` and the Vault's writes (`EconomyWriter`), with the same requests, receipts and typed refusals.
 */
export interface MockedWrites extends Pick<PavedWriter, "claim" | "claimQuest" | "claimAchievement" | "claimDailyCredit" | "claimWeeklyCredit" | "claimTutorial" | "setSkins">, FreeVillageWrites, LayoutSlotWrites, AttackV2Writes, DailyMilestoneWrites, WeeklyMilestoneWrites, TutorialWrites {
  buySkin(request: BuySkinRequest): Promise<WriteResult>;
  buyAvatarItem(request: BuyAvatarItemRequest): Promise<WriteResult>;
  setAvatar(look: bigint): Promise<WriteResult>;
  /** The player's name (#926), drawn at the first connection: not a change (`renames` stays), so the first rename is still free. */
  setName(name: string): Promise<WriteResult>;
  /** `Avatar.rename` (PLAYER-RENAME), as the writer's `rename(request, views)`: the ledger reads its own count, price and names. */
  rename(request: RenameRequest): Promise<WriteResult>;
  foundVillage(): Promise<WriteResult>;
  buyParcel(request: BuyParcelRequest): Promise<WriteResult>;
  openReward(): Promise<WriteResult>;
  claimReward(claim: RewardClaim): Promise<WriteResult>;
  drawOpponent(kind: "search" | "next"): Promise<WriteResult>;
  startAttack(): Promise<WriteResult>;
  playAttack(play: AttackPlay): Promise<WriteResult>;
  surrenderAttack(): Promise<WriteResult>;
  buyPack(request: PackPurchaseRequest): Promise<PackReceipt>;
  /** The faucet (`Faucet.mint(self, FAUCET_USDC_AMOUNT)`): always there on the mock, with no cap (#927). */
  mint(): Promise<WriteResult>;
  /** A Challenge game bought (`EconomyWriter.purchase`: the USDC paid, `Challenge.spawn`), paid from the ledger's USDC (#927). */
  purchase(request: PurchaseRequest): Promise<WriteResult & { gameId: number }>;
  /** `Challenge.spawn_free`: a free-game credit spent for a game (#927). */
  spawnFree(): Promise<WriteResult & { gameId: number }>;
  /** A game's moves (`PavedWriter.build`, `discard`, `surrender`), by the engine's rules (#927). */
  build(key: GameKey, move: BuildMove): Promise<WriteResult>;
  discard(key: GameKey): Promise<WriteResult>;
  surrender(key: GameKey): Promise<WriteResult>;
  /** `EconomyWriter.settle`: bought games settled once their day may close, the reward minted in PAVED (#927). */
  settle(gameIds: number[]): Promise<WriteResult & { noReward: number[] }>;
  deposit(amount: bigint, options: { confirmedAmount: bigint }): Promise<WriteResult>;
  withdraw(amount: bigint, options: { confirmedAmount: bigint; confirmedExitFeeBps?: number }): Promise<WriteResult>;
  withdrawAll(options: { confirmedShares: bigint; confirmedExitFeeBps?: number }): Promise<WriteResult>;
  /** `EconomyWriter.mint`: exactly `shares` vPAVED, for the PAVED `preview_mint` asks (VAULT-PAGE). */
  vaultMint(shares: bigint, options: { confirmedShares: bigint }): Promise<WriteResult>;
  /** `EconomyWriter.redeem`: exactly `shares` vPAVED out, for their PAVED less the exit fee (VAULT-PAGE). */
  vaultRedeem(shares: bigint, options: { confirmedShares: bigint; confirmedExitFeeBps?: number }): Promise<WriteResult>;
}

/** `Village.place`'s reverts, as the engine names them, to the writer's refusals. */
export const PLACE_REFUSALS: Record<string, VillageRefusal> = {
  "Village: cell not owned": "cell-not-owned",
  "Tile: already exists": "tile-exists",
  "Tile: no neighbors": "no-neighbors",
  "Tile: cannot place": "cannot-place",
};

/** A day's or a week's claims, as stored: the quests' word, the credit, and the period's milestones (a day's #869, a week's #976). */
export interface StoredPeriod {
  claimed: string;
  credit: boolean;
  milestones?: number;
}

/** One player's state, as stored: words and amounts as strings (JSON has no bigint). */
export interface StoredPlayer {
  cobbles: number;
  credits: number;
  achievementsClaimed: string;
  /** `milestones`: bit `step` per milestone of the day claimed (#869); absent in a state saved before it, read as none. */
  days: Record<string, StoredPeriod>;
  /** `milestones`: bit `step` per milestone of the week claimed (#976); absent in a state saved before it, read as none. */
  weeks: Record<string, StoredPeriod>;
  /** `skins(player_id, theme)` by theme. */
  owned: Record<string, number>;
  active: number[];
  shares: string;
  /**
   * The player's PAVED and USDC (#927). A state saved before it kept the mock's moves on top of the chain's balance here: it is
   * read as the balance, a negative one as 0 (`parse`).
   */
  paved: string;
  usdc: string;
  /** `avatar(player_id)`, a decimal string; absent: none set (a state stored before the avatar reads it so). */
  avatar?: string;
  /** The player's name (#926), drawn at their first connection (`nameAtConnection`) or renamed (`rename`); absent: none (an account before it). */
  name?: string;
  /** The renames the player has made (PLAYER-RENAME); absent: none, the next is free. The drawn name is not one. */
  renames?: number;
  /** When First Stone was claimed (`claimTutorial`, #927), in the ledger's seconds; absent: not claimed. */
  tutorialAt?: number;
  /**
   * The Tutorial's steps (#977): each task's count of actions done since the mock had them (the level is read from the XP), and
   * bit `id - 1` per step claimed. Absent in a state saved before them: nothing counted yet, so the mock counts from then.
   */
  tutorial?: StoredTutorial;
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

/** The Tutorial's counts and claims (#977): the level is no count, the player's XP gives it. */
export interface StoredTutorial {
  counts: Partial<Record<Exclude<TutorialTask, "level">, number>>;
  claimed: number;
}

/** One attack of the mock's `Arena`: the snapshot (its defender, target, deck), the draws, the moves and the end. */
export interface StoredAttack {
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
export interface StoredPvp {
  crowns: number;
  draws: number;
  match: PvpMatch | null;
  attacks: StoredAttack[];
  shieldUntil: number;
  season: number;
  seasonAttacks: number;
  peak: number;
}

export interface StoredRewards {
  pending: number;
  opened: number;
  offer: [number, number, number] | null;
  index: number;
  copies: number[];
}

export const freshPvp = (): StoredPvp => ({ crowns: 0, draws: 0, match: null, attacks: [], shieldUntil: 0, season: 0, seasonAttacks: 0, peak: 0 });

/** `Arena`'s attack status codes. */
export const MOCK_ATTACK = { open: 1, finished: 2, surrendered: 3 } as const;
/** The matchmaker's address in the mock's receipts. */
export const MOCK_MATCHMAKER = "0x6d61746368";
/** The kinds of the mock's draws, as the contracts name them (`'MATCH'`, `'ATTACK'`). */
export const MATCH_DRAW = 0x4d41544348n;
export const ATTACK_DRAW = 0x41545441434bn;
/** The kinds of PvP v2's draws (`'MATCH2'`, `'ATTACK2'`, `'CHEST'`): Poseidons that stand in for the VRF. */
export const MATCH_DRAW_V2 = 0x4d4154434832n;
export const ATTACK_DRAW_V2 = 0x41545441434b32n;
/** The kind of a rival's answer's deck (#786): `poseidon(DEFENCE_DRAW_V2, player, defence id)`. */
export const DEFENCE_DRAW_V2 = 0x444546454e4345n;
export const CHEST_DRAW = 0x4348455354n;

/** `Arena.play`'s reverts, as the engine names them, to the writer's refusals. */
export const PLAY_REFUSALS: Record<string, PvpRefusal> = {
  "Village: cell not owned": "outside-territory",
  "Tile: already exists": "tile-exists",
  "Tile: no neighbors": "no-neighbors",
  "Tile: cannot place": "cannot-place",
};


/** The next tile of an attack: its draw's random (a Poseidon for the VRF) modulo the tiles left, the rank among those not drawn. */
export function drawTile(account: string, a: StoredAttack): number {
  const left = a.plans.map((_, i) => i).filter((i) => !a.drawn.includes(i));
  const random = poseidon(ATTACK_DRAW, BigInt(account), BigInt(a.id * 128 + a.drawn.length));
  const index = left[Number(random % BigInt(left.length))]!;
  a.drawn.push(index);
  return a.plans[index]!;
}

export const freshRewards = (): StoredRewards => ({ pending: MOCK_STARTING_REWARDS, opened: 0, offer: null, index: 0, copies: new Array<number>(SKIN_PLANS).fill(0) });

export interface StoredState {
  version: 1;
  players: Record<string, StoredPlayer>;
  /** The rivals' shields (#647), by address key: until when (seconds). Absent: none up. */
  rivalShields?: Record<string, number>;
  vault: { assets: string; supply: string };
  transactions: number;
  /** The Challenge's games and the Economy's days (#927, `challenge.ts`); absent: none yet (a state stored before them). */
  challenge?: StoredChallenge;
  /** The players' follows and blocks (#954, `follows.ts`); absent: none yet. */
  follows?: StoredFollows;
  /** The guilds (#953, `guilds.ts`); absent: the seeded world, before any guild write. */
  guilds?: guilds.GuildWorld;
  /** The messages (#955, `chat.ts`): the device's own, the mock's answers and requests; absent: none yet. */
  chat?: chat.AnyStoredChat;
  /** The Puzzle (Play's Limited mode, `puzzle.ts`): the accounts' games, their claims and visits; absent: none yet. */
  puzzle?: StoredPuzzle;
}

/** The mock's chat source: `ChatSource`, and `rotateKeys(player)`, a new messaging key, for the tests and the stories (#997). */
export type MockChatSource = ChatSource & { rotateKeys(player: string): Promise<void> };

/** A subscriber of the messages (#955): what it hears, since when, and its timer to the next line due. */
export interface ChatSubscriber {
  player: string;
  conversation: ConversationId | null;
  listener: (event: ChatEvent) => void;
  since: number;
  heard: Set<string>;
  timer: ReturnType<typeof setTimeout> | null;
}

export const fresh = (): StoredState => ({ version: 1, players: {}, vault: { assets: MOCK_VAULT.assets.toString(), supply: MOCK_VAULT.supply.toString() }, transactions: 0 });

/** What a new player's draw reads of the catalogue (#926): the parts in use, their items, what the player owns. */
export type NewPlayerCatalogue = Pick<AvatarCatalogue, "parts" | "items" | "owned">;

/** A name `setName` takes (#926): letters and digits, 3 to 15 characters (`PLAYER_NAME_MAX`). */
export const MOCK_NAME = new RegExp(`^[A-Za-z0-9]{3,${PLAYER_NAME_MAX}}$`);

/** One action of `task` counted for the Tutorial (#977), on the write's copy of the player. */
export function countTutorial(p: StoredPlayer, task: Exclude<TutorialTask, "level">): void {
  const t = (p.tutorial ??= { counts: {}, claimed: 0 });
  t.counts[task] = (t.counts[task] ?? 0) + 1;
}

/** The Tutorial's counts of a stored player: the actions counted, and the level of their XP. */
export function tutorialCountsOf(p: StoredPlayer): TutorialCounts {
  return { ...emptyTutorialCounts(), ...p.tutorial?.counts, level: levelStatus(p.v2?.xp ?? 0).level };
}

export const newPlayer = (starting: Readonly<TokenBalances>): StoredPlayer => ({
  cobbles: 0,
  credits: 0,
  achievementsClaimed: "0",
  days: {},
  weeks: {},
  owned: {},
  active: new Array<number>(SKIN_PLANS).fill(0),
  shares: "0",
  paved: starting.paved.toString(),
  usdc: starting.usdc.toString(),
});

/** A stored amount, or 0 for a negative one (the moves a state kept before #927 on top of the chain's balance). */
export const held = (amount: string): string => (BigInt(amount) < 0n ? "0" : amount);

/** A stored state, or null when it is not one this version wrote (then the mock starts over). */
export function parse(raw: string | null): StoredState | null {
  if (!raw) return null;
  try {
    const state = JSON.parse(raw) as StoredState;
    if (!(state && state.version === 1 && typeof state.players === "object" && state.vault)) return null;
    for (const player of Object.values(state.players)) {
      if (player.v2) renameChestsV2(player.v2);
      player.paved = held(player.paved);
      player.usdc = held(player.usdc);
    }
    return state;
  } catch {
    return null;
  }
}

export const bit = (id: number): bigint => 1n << BigInt(id);
export const ceilDiv = (a: bigint, b: bigint): bigint => (a + b - 1n) / b;
export const sleep = (ms: number) => (ms > 0 ? new Promise<void>((resolve) => setTimeout(resolve, ms)) : Promise.resolve());

/** The `active_skins` word of a set, the theme of plan `p` in byte `p - 1` (`activeThemes` reads it back). */
export const activeWord = (active: readonly number[]): bigint => active.reduce((word, theme, i) => word | (BigInt(theme) << BigInt(8 * i)), 0n);

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
  /** What a new account holds: `MOCK_STARTING_BALANCES` by default. A test or a story gives its own. */
  starting?: Readonly<TokenBalances>;
  /** The time, in seconds (the games' starts, ends and the days' settlement): the device's clock by default. A test gives its own. */
  now?: () => number;
}

/** Runs `section` while no other holder of the lock runs one; resolves with its result. */
export type MockLock = <T>(section: () => T) => Promise<T>;

/** What `mockLock` needs of `navigator.locks` (the Web Locks API). */
export interface LockManagerLike {
  request<T>(name: string, callback: () => T | Promise<T>): Promise<T>;
}

/** One queue per page for the browsers without Web Locks: the writes of this page stay one at a time. */
export let pageQueue: Promise<unknown> = Promise.resolve();

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



/** The plain player's move with `plan` in hand (#786, a rival's answer): the most points now, the engine's first cell on a tie; a discard where it fits nowhere. */
export function plainMove(attack: QueuedAttack, plan: number): QueuedMove {
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
