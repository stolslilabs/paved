import { shortString } from "starknet";
import type { Codecs, ContractName } from "./abis";
import { AbiMismatchError, type Encodable } from "./codec";
import {
  NO_ACCOUNT,
  NO_PROGRESS,
  achievementCobbles,
  cobbleAccount,
  periodProgress,
  questCobbles,
  type AchievementCobbles,
  type CobbleAccount,
  type CobbleViews,
  type FakeCobblePlayer,
  type PeriodProgress,
  type QuestCobbles,
  type Struct,
} from "./cobbles";
import type { Deployment } from "./deployment";
import { playerLevel, playerLevelOf, type LevelViews, type PlayerLevel } from "./level";
import { SKIN_PLANS, type FakeSkinPlayer, type SkinViews } from "./skins";

/**
 * The game contract the client plays: Challenge (D-23, Daily before). The on-chain Tutorial left the contracts (D-21): the
 * tutorial is off chain (`/tutorial`). A game is still keyed (mode, id).
 */
export type GameMode = "challenge";

export interface GameKey {
  mode: GameMode;
  gameId: number;
}

/** `mode` codes of the contracts (`public-interface.md`); 2 was Weekly and 3 the Tutorial, never given again. */
export const MODE_CODE: Record<GameMode, number> = { challenge: 1 };

export function modeFromCode(code: number): GameMode | null {
  return code === 1 ? "challenge" : null;
}

export function gameContract(_mode: GameMode): ContractName {
  return "Challenge";
}

/** Field types and meanings: `docs/architecture/public-interface.md`. Felts are 0x-hex strings. */
export interface GameView {
  id: number;
  playerId: string;
  mode: number;
  seed: string;
  score: number;
  over: boolean;
  tileCount: number;
  placedCount: number;
  discardedCount: number;
  tileId: number;
  plan: number;
  remainingCount: number;
  deckSize: number;
  startTime: number;
  endTime: number;
  dayId: number;
  /** Start + 24 h (S1, `GAME_VALIDITY`): from this second on, `build` and `discard` revert; `surrender` still closes the game. */
  expiresAt: number;
}

/** `TileView.status` codes. */
export const TILE_STATUS = { placed: 1, discarded: 2, held: 3 } as const;

export interface TileView {
  id: number;
  status: number;
  plan: number;
  orientation: number;
  x: number;
  y: number;
}

export interface BuilderView {
  gameId: number;
  playerId: string;
  tileId: number;
  plan: number;
}

/** What a Challenge `spawn` pulls from the player: the ERC20 and the amount (`Challenge.entry_price`). */
export interface PriceView {
  token: string;
  amount: bigint;
}

/** Field lists in ABI order; a test checks them against `contracts/abis/`. */
export const VIEW_FIELDS = {
  "paved::views::GameView": [
    "id", "playerId", "mode", "seed", "score", "over", "tileCount", "placedCount", "discardedCount",
    "tileId", "plan", "remainingCount", "deckSize", "startTime", "endTime", "dayId", "expiresAt",
  ] satisfies (keyof GameView)[],
  "paved::views::TileView": ["id", "status", "plan", "orientation", "x", "y"] satisfies (keyof TileView)[],
  "paved::views::BuilderView": ["gameId", "playerId", "tileId", "plan"] satisfies (keyof BuilderView)[],
  "paved::views::PriceView": ["token", "amount"] satisfies (keyof PriceView)[],
};

/**
 * `abi-mismatch`: the contract answered with another layout than the ABI (an upgrade the client does not follow).
 * `not-available`: the deployed class has no such entrypoint (the client is ahead of the network's deployment; #549).
 */
export type ViewErrorKind = "game-not-found" | "not-player" | "not-configured" | "abi-mismatch" | "not-available" | "rpc";

/** What the user reads when a view is not deployed on the network yet; the raw RPC text stays in `cause`. */
export const NOT_AVAILABLE_MESSAGE = "Not available on this network yet.";

// The node's text for a call to a selector the class does not have (Starknet: ENTRYPOINT_NOT_FOUND).
const NO_ENTRYPOINT = /entry ?point does not exist|entry ?point .*not found|ENTRYPOINT_NOT_FOUND/i;

/** A view that failed, with the reason the UI shows. */
export class ViewError extends Error {
  constructor(
    readonly kind: ViewErrorKind,
    message: string,
    readonly cause?: unknown,
  ) {
    super(message);
    this.name = "ViewError";
  }
}

const REVERTS: Array<[string, ViewErrorKind]> = [
  ["Game: does not exist", "game-not-found"],
  ["View: not the game player", "not-player"],
];

/** Maps a failed call to a `ViewError`: the two reverts of the views by their message, the rest as `rpc`. */
export function toViewError(error: unknown): ViewError {
  if (error instanceof ViewError) return error;
  if (error instanceof AbiMismatchError) return new ViewError("abi-mismatch", error.message, error);
  const text = error instanceof Error ? error.message : String(error);
  const lower = text.toLowerCase();
  if (NO_ENTRYPOINT.test(text)) return new ViewError("not-available", NOT_AVAILABLE_MESSAGE, error);
  for (const [message, kind] of REVERTS) {
    // A node may give the revert reason as text or as the hex of its short string.
    const hex = shortString.encodeShortString(message).slice(2).toLowerCase();
    if (text.includes(message) || lower.includes(hex)) return new ViewError(kind, message, error);
  }
  return new ViewError("rpc", text, error);
}

/** The game-state reads. `RpcGameViews` calls the contracts; `FakeGameViews` is for tests. */
export interface GameViews {
  game(key: GameKey): Promise<GameView>;
  /** Every tile of the game, in id order (pages of `MAX_PAGE` until a short page). */
  tiles(key: GameKey): Promise<TileView[]>;
  builder(key: GameKey, playerId: string): Promise<BuilderView>;
  /** `Challenge.initial_seed(game_id)` (S1): the seed the game started with, before any draw; `game().seed` is the current one. */
  initialSeed(key: GameKey): Promise<string>;
  currentDay(): Promise<number>;
  /** The Challenge entry: token and amount, from the same source `spawn` uses. */
  entryPrice(): Promise<PriceView>;
  /** `Challenge.spawn_paused()` (G4): the guardian or the owner paused new games; games already bought play on. */
  spawnPaused(): Promise<boolean>;
  /** `Challenge.guardian()` (G4): the address that may pause spawn, "0x0" for none. */
  guardian(): Promise<string>;
  /** `Setup.tutorial_claimed(player_id)`: the player's tutorial claim is made (D-21). A `not-configured` ViewError without Setup. */
  tutorialClaimed(playerId: string): Promise<boolean>;
}

/** The highest pack id `Setup.set_pack` takes (`MAX_PACK_ID`, cobbles v1, part 2): packs are ids 1 to 8. */
export const MAX_PACK_ID = 8;

/**
 * `Setup.pack(pack_id)` (cobbles v1, part 2, CORE #453): its Cobbles, its price in USDC base units (6 decimals) and whether
 * it is on sale. `cobbles` 0 is an id never set.
 */
export interface PackView {
  packId: number;
  cobbles: number;
  price: bigint;
  active: boolean;
}

/** The struct fields of `pack`, in ABI order (camelCased); a test checks them against `contracts/abis/Setup.json`. */
export const PACK_VIEW_FIELDS = ["cobbles", "price", "active"];

export const packView = (packId: number, s: Struct): PackView => ({
  packId,
  cobbles: Number(s.cobbles ?? 0),
  price: BigInt((s.price as number | bigint | string | undefined) ?? 0),
  active: s.active === true,
});

/**
 * The packs' view on `Setup`. `RpcGameViews` reads it (a `not-configured` `ViewError` without a Setup address) and
 * `FakeGameViews` answers it in memory; `GameViews` does not require it, as the Cobbles views.
 */
export interface PackViews {
  pack(packId: number): Promise<PackView>;
}

/** What the views need from starknet.js's `RpcProvider`. */
export interface CallProvider {
  callContract(call: { contractAddress: string; entrypoint: string; calldata: string[] }): Promise<string[]>;
}

export const MAX_PAGE = 64;

/** The game views, and `Setup`'s Cobbles views (`cobbles.ts`), packs and skins views (`skins.ts`). */
export class RpcGameViews implements GameViews, CobbleViews, PackViews, SkinViews, LevelViews {
  constructor(
    private readonly provider: CallProvider,
    private readonly deployment: Deployment,
    private readonly codecs: Codecs,
  ) {}

  async game(key: GameKey): Promise<GameView> {
    return (await this.call(gameContract(key.mode), "game", [key.gameId])) as GameView;
  }

  async tiles(key: GameKey): Promise<TileView[]> {
    const all: TileView[] = [];
    for (;;) {
      const page = (await this.call(gameContract(key.mode), "tiles", [key.gameId, all.length, MAX_PAGE])) as TileView[];
      all.push(...page);
      if (page.length < MAX_PAGE) return all;
    }
  }

  async builder(key: GameKey, playerId: string): Promise<BuilderView> {
    return (await this.call(gameContract(key.mode), "builder", [key.gameId, playerId])) as BuilderView;
  }

  async initialSeed(key: GameKey): Promise<string> {
    return (await this.call("Challenge", "initial_seed", [key.gameId])) as string;
  }

  async currentDay(): Promise<number> {
    return Number(await this.call("Challenge", "current_day", []));
  }

  async entryPrice(): Promise<PriceView> {
    return (await this.call("Challenge", "entry_price", [])) as PriceView;
  }

  async spawnPaused(): Promise<boolean> {
    return (await this.call("Challenge", "spawn_paused", [])) as boolean;
  }

  async guardian(): Promise<string> {
    return (await this.call("Challenge", "guardian", [])) as string;
  }

  async tutorialClaimed(playerId: string): Promise<boolean> {
    return (await this.call("Setup", "tutorial_claimed", [playerId])) as boolean;
  }

  async account(playerId: string): Promise<CobbleAccount> {
    return cobbleAccount((await this.call("Setup", "account", [playerId])) as Struct);
  }

  async dayProgress(playerId: string, day: number): Promise<PeriodProgress> {
    return periodProgress((await this.call("Setup", "day_progress", [playerId, day])) as Struct);
  }

  async weekProgress(playerId: string, week: number): Promise<PeriodProgress> {
    return periodProgress((await this.call("Setup", "week_progress", [playerId, week])) as Struct);
  }

  async questCobbles(questId: number): Promise<QuestCobbles> {
    return questCobbles(questId, (await this.call("Setup", "quest_cobbles", [questId])) as Struct);
  }

  async achievementCobbles(achievementId: number): Promise<AchievementCobbles> {
    return achievementCobbles(achievementId, (await this.call("Setup", "achievement_cobbles", [achievementId])) as Struct);
  }

  async playerLevel(playerId: string): Promise<PlayerLevel> {
    return playerLevel((await this.call("Setup", "player_level", [playerId])) as Struct);
  }

  async pack(packId: number): Promise<PackView> {
    return packView(packId, (await this.call("Setup", "pack", [packId])) as Struct);
  }

  async skinPrice(theme: number, plan: number): Promise<number> {
    return Number(await this.call("Setup", "skin_price", [theme, plan]));
  }

  async skinPrices(theme: number): Promise<number[]> {
    return Promise.all(Array.from({ length: SKIN_PLANS }, (_, i) => this.skinPrice(theme, i + 1)));
  }

  async ownedSkins(playerId: string, theme: number): Promise<number> {
    return Number(await this.call("Setup", "skins", [playerId, theme]));
  }

  async activeSkins(playerId: string): Promise<number[]> {
    const themes = (await this.call("Setup", "active_skins", [playerId])) as number[];
    if (themes.length !== SKIN_PLANS) throw new ViewError("abi-mismatch", `active_skins: ${themes.length} themes, not ${SKIN_PLANS}`);
    return themes.map(Number);
  }

  private async call(contract: ContractName, entrypoint: string, args: Encodable[]): Promise<unknown> {
    const contractAddress = this.deployment.addresses[contract];
    if (!contractAddress) throw new ViewError("not-configured", `${contract} address is not configured`);
    const codec = this.codecs[contract];
    try {
      const felts = await this.provider.callContract({
        contractAddress,
        entrypoint,
        calldata: codec.encodeCall(entrypoint, args),
      });
      return codec.decodeResult(entrypoint, felts);
    } catch (error) {
      throw toViewError(error);
    }
  }
}

/** One game held by `FakeGameViews`. */
export interface FakeGame {
  game: GameView;
  tiles: TileView[];
  builder: BuilderView;
  /** `initial_seed`; defaults to the game's seed. */
  initialSeed?: string;
}

function gameKeyId(key: GameKey): string {
  return `${key.mode}:${key.gameId}`;
}

/** In-memory views with the contracts' error rules, for unit tests of the app; the Cobbles views, the packs and the skins too. */
export class FakeGameViews implements GameViews, CobbleViews, PackViews, SkinViews, LevelViews {
  readonly games = new Map<string, FakeGame>();
  today = 0;
  price: PriceView = { token: "0x4", amount: 10n ** 18n };
  /** `spawn_paused()`; set to an Error to make the read fail. */
  paused: boolean | Error = false;
  guardianAddress = "0x0";
  /** The players whose tutorial claim is made (`tutorial_claimed`), as BigInt. */
  readonly tutorialClaims = new Set<bigint>();
  calls: string[] = [];
  /** The Cobbles ledger by player (`BigInt` of the id as a string); a player not listed reads zeros. */
  readonly cobblePlayers = new Map<string, FakeCobblePlayer>();
  /** `quest_cobbles` and `achievement_cobbles` by id; an id not listed reads 0 Cobbles. */
  readonly questRates = new Map<number, QuestCobbles>();
  readonly achievementRates = new Map<number, AchievementCobbles>();
  /** Set to an Error to make every Cobbles read fail (the packs' too). */
  cobblesFail: Error | null = null;
  /** `pack(id)` by id; an id not listed reads a pack never set (0 Cobbles, inactive). */
  readonly packs = new Map<number, PackView>();
  /** `skin_price` by `theme:plan`; a skin not listed reads 0 (not for sale). */
  readonly skinPriceTable = new Map<string, number>();
  /** The skins by player (`BigInt` of the id as a string); a player not listed owns none, all on the default theme. */
  readonly skinPlayers = new Map<string, FakeSkinPlayer>();
  /** Set to an Error to make every skins read fail. */
  skinsFail: Error | null = null;

  /** Prices every plan of `theme` from `prices` (plan 1 first); 0 withdraws one from sale. */
  priceSkins(theme: number, prices: readonly number[]): void {
    prices.forEach((price, i) => this.skinPriceTable.set(`${theme}:${i + 1}`, price));
  }

  /** The player's skins, created empty on first use: a test edits them in place. */
  skinPlayer(playerId: string): FakeSkinPlayer {
    const key = BigInt(playerId).toString();
    let player = this.skinPlayers.get(key);
    if (!player) {
      player = { owned: new Map(), active: new Array<number>(SKIN_PLANS).fill(0) };
      this.skinPlayers.set(key, player);
    }
    return player;
  }

  /** The player's ledger, created empty on first use: a test edits it in place. */
  cobblePlayer(playerId: string): FakeCobblePlayer {
    const key = BigInt(playerId).toString();
    let player = this.cobblePlayers.get(key);
    if (!player) {
      player = { account: { ...NO_ACCOUNT }, days: new Map(), weeks: new Map() };
      this.cobblePlayers.set(key, player);
    }
    return player;
  }

  setGame(key: GameKey, game: FakeGame): void {
    this.games.set(gameKeyId(key), game);
  }

  async game(key: GameKey): Promise<GameView> {
    this.calls.push(`game ${gameKeyId(key)}`);
    return { ...this.get(key).game };
  }

  async tiles(key: GameKey): Promise<TileView[]> {
    this.calls.push(`tiles ${gameKeyId(key)}`);
    return this.get(key).tiles.map((t) => ({ ...t }));
  }

  async builder(key: GameKey, playerId: string): Promise<BuilderView> {
    this.calls.push(`builder ${gameKeyId(key)}`);
    const { gameId, playerId: player, tileId, plan } = this.ownGame(key, playerId).builder;
    return { gameId, playerId: player, tileId, plan };
  }

  async initialSeed(key: GameKey): Promise<string> {
    this.calls.push(`initial_seed ${gameKeyId(key)}`);
    const game = this.get(key);
    return game.initialSeed ?? game.game.seed;
  }

  async currentDay(): Promise<number> {
    this.calls.push("current_day");
    return this.today;
  }

  async entryPrice(): Promise<PriceView> {
    this.calls.push("entry_price");
    return { ...this.price };
  }

  async spawnPaused(): Promise<boolean> {
    this.calls.push("spawn_paused");
    if (this.paused instanceof Error) throw this.paused;
    return this.paused;
  }

  async guardian(): Promise<string> {
    this.calls.push("guardian");
    return this.guardianAddress;
  }

  async tutorialClaimed(playerId: string): Promise<boolean> {
    this.calls.push("tutorial_claimed");
    return this.tutorialClaims.has(BigInt(playerId));
  }

  async account(playerId: string): Promise<CobbleAccount> {
    this.cobbleCall(`account ${BigInt(playerId)}`);
    return { ...(this.cobblePlayers.get(BigInt(playerId).toString())?.account ?? NO_ACCOUNT) };
  }

  async dayProgress(playerId: string, day: number): Promise<PeriodProgress> {
    this.cobbleCall(`day_progress ${BigInt(playerId)} ${day}`);
    return { ...(this.cobblePlayers.get(BigInt(playerId).toString())?.days.get(day) ?? NO_PROGRESS) };
  }

  async weekProgress(playerId: string, week: number): Promise<PeriodProgress> {
    this.cobbleCall(`week_progress ${BigInt(playerId)} ${week}`);
    return { ...(this.cobblePlayers.get(BigInt(playerId).toString())?.weeks.get(week) ?? NO_PROGRESS) };
  }

  async questCobbles(questId: number): Promise<QuestCobbles> {
    this.cobbleCall(`quest_cobbles ${questId}`);
    return { ...(this.questRates.get(questId) ?? { questId, cobbles: 0, kind: null, task: 0, total: 0, start: 0, interval: 0 }) };
  }

  async achievementCobbles(achievementId: number): Promise<AchievementCobbles> {
    this.cobbleCall(`achievement_cobbles ${achievementId}`);
    return { ...(this.achievementRates.get(achievementId) ?? { achievementId, cobbles: 0, task: 0, total: 0 }) };
  }

  async playerLevel(playerId: string): Promise<PlayerLevel> {
    this.cobbleCall(`player_level ${BigInt(playerId)}`);
    return playerLevelOf(this.cobblePlayers.get(BigInt(playerId).toString())?.account.xp ?? 0);
  }

  async pack(packId: number): Promise<PackView> {
    this.cobbleCall(`pack ${packId}`);
    return { ...(this.packs.get(packId) ?? { packId, cobbles: 0, price: 0n, active: false }) };
  }

  async skinPrice(theme: number, plan: number): Promise<number> {
    this.skinCall(`skin_price ${theme} ${plan}`);
    return this.skinPriceTable.get(`${theme}:${plan}`) ?? 0;
  }

  async skinPrices(theme: number): Promise<number[]> {
    return Promise.all(Array.from({ length: SKIN_PLANS }, (_, i) => this.skinPrice(theme, i + 1)));
  }

  async ownedSkins(playerId: string, theme: number): Promise<number> {
    this.skinCall(`skins ${BigInt(playerId)} ${theme}`);
    return this.skinPlayers.get(BigInt(playerId).toString())?.owned.get(theme) ?? 0;
  }

  async activeSkins(playerId: string): Promise<number[]> {
    this.skinCall(`active_skins ${BigInt(playerId)}`);
    return [...(this.skinPlayers.get(BigInt(playerId).toString())?.active ?? new Array<number>(SKIN_PLANS).fill(0))];
  }

  private skinCall(call: string): void {
    this.calls.push(call);
    if (this.skinsFail) throw this.skinsFail;
  }

  private cobbleCall(call: string): void {
    this.calls.push(call);
    if (this.cobblesFail) throw this.cobblesFail;
  }

  private get(key: GameKey): FakeGame {
    const game = this.games.get(gameKeyId(key));
    if (!game) throw new ViewError("game-not-found", "Game: does not exist");
    return game;
  }

  private ownGame(key: GameKey, playerId: string): FakeGame {
    const game = this.get(key);
    if (BigInt(game.game.playerId) !== BigInt(playerId)) {
      throw new ViewError("not-player", "View: not the game player");
    }
    return game;
  }
}
