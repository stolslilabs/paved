import {
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
  WriteError,
  redeemFee,
  withdrawFee,
  type AchievementCobbles,
  type BuySkinRequest,
  type CobbleAccount,
  type CobbleClaim,
  type CobbleViews,
  type DecodedEvent,
  type Definitions,
  type EconomyViews,
  type GameViews,
  type PackBought,
  type PackPurchaseRequest,
  type PackView,
  type PackViews,
  type PavedWriter,
  type PeriodProgress,
  type PlayerReferrals,
  type QuestCobbles,
  type SkinChange,
  type SkinViews,
  type VaultPosition,
  type VaultViews,
  type WriteResult,
} from "@paved/chain";
import type { KeyValueStore } from "@paved/game-core";
import { ACHIEVEMENT_COBBLES, PACKS, QUEST_COBBLES, SKIN_PRICES } from "../../mocks/cobbles";
import { questPeriod } from "../../lib/quest-window";
import { addressKey } from "../keys";

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

/** The Cobbles of a quest the fresh table does not name (an id of an older deployment): a daily's middle target, a weekly's. */
const DEFAULT_QUEST_COBBLES = { daily: 10, weekly: 15 } as const;

/** Every read the deployed classes lack (#549): implemented by the chain (`RpcGameViews`, `RpcEconomyViews`) and by `MockLedger`. */
export interface MockedReads
  extends CobbleViews,
    PackViews,
    SkinViews,
    Pick<GameViews, "spawnPaused" | "guardian">,
    VaultViews,
    Pick<EconomyViews, "split" | "seller" | "usdcBalance"> {}

/** The receipt of a pack bought: the writer's `buyPack` answer. */
export type PackReceipt = WriteResult & { bought: PackBought };

/**
 * Every write the deployed classes lack, for the connected account: the writer's (`PavedWriter`) claims and skin writes, the
 * pack buyer's `buy` and the Vault's writes (`EconomyWriter`), with the same requests, receipts and typed refusals.
 */
export interface MockedWrites extends Pick<PavedWriter, "claim" | "claimQuest" | "claimAchievement" | "claimDailyCredit" | "claimWeeklyCredit" | "setSkins"> {
  buySkin(request: BuySkinRequest): Promise<WriteResult>;
  buyPack(request: PackPurchaseRequest): Promise<PackReceipt>;
  deposit(amount: bigint, options: { confirmedAmount: bigint }): Promise<WriteResult>;
  withdraw(amount: bigint, options: { confirmedAmount: bigint; confirmedExitFeeBps?: number }): Promise<WriteResult>;
  withdrawAll(options: { confirmedShares: bigint; confirmedExitFeeBps?: number }): Promise<WriteResult>;
}

/** One player's state, as stored: words and amounts as strings (JSON has no bigint). */
interface StoredPlayer {
  cobbles: number;
  credits: number;
  achievementsClaimed: string;
  days: Record<string, { claimed: string; credit: boolean }>;
  weeks: Record<string, { claimed: string; credit: boolean }>;
  /** `skins(player_id, theme)` by theme. */
  owned: Record<string, number>;
  active: number[];
  shares: string;
  /** What the mock moved of the player's PAVED and USDC, added to the chain's balance. */
  paved: string;
  usdc: string;
}

interface StoredState {
  version: 1;
  players: Record<string, StoredPlayer>;
  vault: { assets: string; supply: string };
  transactions: number;
}

const fresh = (): StoredState => ({ version: 1, players: {}, vault: { assets: MOCK_VAULT.assets.toString(), supply: MOCK_VAULT.supply.toString() }, transactions: 0 });

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
    return state && state.version === 1 && typeof state.players === "object" && state.vault ? state : null;
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

  constructor(private readonly options: MockLedgerOptions) {
    this.state = this.load();
    this.latency = options.latencyMs ?? MOCK_LATENCY_MS;
    this.lock = options.lock ?? mockLock;
  }

  // --- The definitions ---------------------------------------------------------------------------------------------

  /**
   * The indexer's definitions with the mock's Cobbles: a definition the indexer gives none (an indexer that predates
   * cobbles v1) takes the fresh deployment's table (`mocks/cobbles.ts`), else a daily's or a weekly's default for a quest
   * and its points for an achievement. Learned here: they are what the claims pay.
   */
  definitions(definitions: Definitions): Definitions {
    const quests = definitions.quests.map((q) => {
      const kind = questPeriod({ start: q.startTime, interval: q.interval, duration: q.duration });
      const cobbles = q.cobbles > 0 ? q.cobbles : (QUEST_COBBLES.find((r) => r.questId === q.questId && r.kind === kind)?.cobbles ?? DEFAULT_QUEST_COBBLES[kind]);
      const cobblesKind = q.cobbles > 0 ? q.cobblesKind : kind;
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

  /** `/v1/players/:id/referrals`: the mock's player referred nobody yet. */
  referrals(playerId: string): PlayerReferrals {
    return { playerId: addressKey(playerId), total: "0", games: { count: 0, total: "0" }, packs: { count: 0, total: "0" } };
  }

  // --- MockedReads -------------------------------------------------------------------------------------------------

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
      claim: (claims) => this.claim(account, claims),
      buySkin: (request) => this.buySkin(account, request),
      setSkins: (changes) => this.setSkins(account, changes),
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
          if (![...this.questRates.values()].some((q) => q.cobbles > 0 && (q.kind === "weekly") === weekly)) throw new ClaimRefusedError("no-live-quest", hash);
          const progress = this.period(p, weekly, c.period);
          if (progress.credit) throw new ClaimRefusedError("credit-claimed", hash);
          progress.credit = true;
          p.credits += 1;
          events.push(this.event("CreditClaimed", { playerId: account, kind: weekly ? 2 : 1, period: c.period, credits: p.credits }));
        }
      }
      return events;
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

  private progress(stored: { claimed: string; credit: boolean } | undefined): PeriodProgress {
    return { games: 0, structures: 0, forests: 0, points: 0, claimed: BigInt(stored?.claimed ?? "0"), credit: stored?.credit ?? false };
  }

  private period(p: StoredPlayer, weekly: boolean, period: number): { claimed: string; credit: boolean } {
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
