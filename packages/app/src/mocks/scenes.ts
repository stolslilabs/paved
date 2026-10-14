import type { PlayerStatusData } from "../components/containers/player-status";
import type { BoardSceneProps } from "../components/scenes/board-scene";
import type { HomeSceneProps } from "../components/scenes/home-scene";
import type { LoadingSceneProps } from "../components/scenes/loading-scene";
import type { OverSceneProps } from "../components/scenes/over-scene";
import type { PlaySceneProps } from "../components/scenes/play-scene";
import type { PurchaseSceneProps } from "../components/scenes/purchase-scene";
import type { WelcomeSceneProps } from "../components/scenes/welcome-scene";
import { BOARD_38, BOARD_72, CLOSINGS_38, LAST_SCORED } from "./board";
import { MOCK_NOW } from "./clock";
import { BALANCE_LOW, BALANCE_RICH, MAX_STAKE, PAVED_BALANCE, SPLIT_BPS, boostBps, quote } from "./economy";
import { GAME_OVER, GAME_PLAYING, TERMS_EXPIRED, TERMS_PLAYING, THRESHOLD_MILLI, expiresAt } from "./games";
import { LEADERBOARD_EMPTY, LEADERBOARD_TODAY, PLAYER, PLAYER_STATS, VIEWER_TODAY } from "./players";

/** A scene's data without its callbacks: what a page reads and hands it. One fixture per state below. */
type Data<P> = { [K in keyof P as K extends `on${string}` ? never : K]: P[K] };

// Welcome

const mosaic = BOARD_72.tiles.map(({ plan, orientation }) => ({ plan, orientation }));

export const WELCOME = {
  firstVisit: { mosaic },
  connecting: { mosaic, connecting: true },
  failed: { mosaic, error: "The controller window was closed before the account connected." },
} satisfies Record<string, Data<WelcomeSceneProps>>;

// Loading

export const LOADING = {
  booting: { progress: null, message: "Starting" },
  assets: { progress: 64, message: "Loading the board", tip: "Closing a city scores more the bigger it gets." },
} satisfies Record<string, Data<LoadingSceneProps>>;

// Home

export const PLAYER_STATUS: PlayerStatusData = { player: PLAYER, stats: PLAYER_STATS, today: VIEWER_TODAY, usdc: BALANCE_RICH, paved: PAVED_BALANCE };

const activeGame = { game: GAME_PLAYING, expiresAt: expiresAt(TERMS_PLAYING) };

export const HOME = {
  connected: { player: PLAYER_STATUS, leaderboard: LEADERBOARD_TODAY, activeGame, training: { score: 420, remaining: 31 }, spawnPaused: false, now: MOCK_NOW },
  guest: { player: null, leaderboard: LEADERBOARD_TODAY, activeGame: null, training: null, spawnPaused: false, now: MOCK_NOW },
  firstOfDay: {
    player: { ...PLAYER_STATUS, today: null },
    leaderboard: LEADERBOARD_EMPTY,
    activeGame: null,
    training: null,
    spawnPaused: false,
    now: MOCK_NOW,
  },
  paused: { player: PLAYER_STATUS, leaderboard: LEADERBOARD_TODAY, activeGame, training: null, spawnPaused: true, now: MOCK_NOW },
} satisfies Record<string, Data<HomeSceneProps>>;

// Play

export const PLAY = {
  connected: { connected: true, spawnPaused: false },
  guest: { connected: false, spawnPaused: false },
  paused: { connected: true, spawnPaused: true },
} satisfies Record<string, Data<PlaySceneProps>>;

// Board

const hand = { plan: BOARD_38.next.plan, orientation: BOARD_38.next.orientation };
const boardBase = {
  mode: "challenge",
  gameId: GAME_PLAYING.id,
  tiles: BOARD_38.tiles,
  score: GAME_PLAYING.score,
  remaining: GAME_PLAYING.remainingCount,
  discarded: GAME_PLAYING.discardedCount,
  expiresAt: expiresAt(TERMS_PLAYING),
  now: MOCK_NOW,
  lastScored: [],
} satisfies Partial<Data<BoardSceneProps>>;

export const BOARD = {
  placing: { ...boardBase, hand: { tile: hand, state: "placing" } },
  slotChosen: { ...boardBase, hand: { tile: hand, state: "placing", slotChosen: true, preview: 30 } },
  closing: { ...boardBase, delta: 370, hand: { tile: hand, state: "placing" }, lastScored: LAST_SCORED },
  pending: { ...boardBase, tiles: [...BOARD_38.tiles, { ...BOARD_38.next, pending: true }], hand: { tile: hand, state: "pending", slotChosen: true } },
  refused: { ...boardBase, hand: { tile: hand, state: "refused", slotChosen: true, error: "Move refused by the contract: the edges do not match." } },
  expired: { ...boardBase, expiresAt: expiresAt(TERMS_EXPIRED), hand: { tile: hand, state: "expired" } },
  storageDisabled: { ...boardBase, mode: "training", gameId: undefined, expiresAt: null, hand: { tile: hand, state: "placing" }, storageDisabled: true },
  large: {
    ...boardBase,
    tiles: BOARD_72.tiles,
    hand: { tile: { plan: BOARD_72.next.plan, orientation: BOARD_72.next.orientation }, state: "placing" },
    remaining: 4,
  },
} satisfies Record<string, Data<BoardSceneProps>>;

// Over

const threshold = THRESHOLD_MILLI / 1000;

export const OVER = {
  rewarded: {
    mode: "challenge",
    game: GAME_OVER,
    closings: CLOSINGS_38,
    previousBest: 1_180,
    rank: 7,
    reward: { state: "rewarded", amount: 8_420_000_000_000_000_000n, stake: 3, threshold },
  },
  awaiting: { mode: "challenge", game: GAME_OVER, closings: CLOSINGS_38, rank: 7, reward: { state: "awaiting", stake: 3, threshold } },
  settle: { mode: "challenge", game: GAME_OVER, closings: CLOSINGS_38, rank: 7, reward: { state: "settle", stake: 3, threshold } },
  below: {
    mode: "challenge",
    game: { ...GAME_OVER, score: 940 },
    closings: CLOSINGS_38.slice(0, 8),
    rank: 18,
    reward: { state: "below", stake: 3, threshold },
  },
  expired: { mode: "challenge", game: GAME_OVER, closings: CLOSINGS_38, reward: { state: "expired", stake: 3, threshold } },
  training: { mode: "training", game: { ...GAME_OVER, mode: 0 }, closings: CLOSINGS_38, previousBest: 1_420, reward: { state: "free" } },
  noClosing: { mode: "training", game: { ...GAME_OVER, score: 0, placedCount: 3, discardedCount: 0 }, closings: [], reward: { state: "free" } },
} satisfies Record<string, Data<OverSceneProps>>;

// Purchase

const purchaseBase = { maxStake: MAX_STAKE, split: SPLIT_BPS, referrer: null, balance: BALANCE_RICH, spawnPaused: false, now: MOCK_NOW };
const at = (stake: number) => ({ stake, quote: quote(stake), boostBps: boostBps(stake) });

export const PURCHASE = {
  stake1: { ...purchaseBase, ...at(1) },
  stake3Referred: { ...purchaseBase, ...at(3), referrer: "0x0456bb00000000000000000000000000000000000000000000000000000beef" },
  stake10: { ...purchaseBase, ...at(10) },
  short: { ...purchaseBase, ...at(5), balance: BALANCE_LOW },
  paused: { ...purchaseBase, ...at(1), spawnPaused: true },
  buying: { ...purchaseBase, ...at(3), buying: true },
} satisfies Record<string, Data<PurchaseSceneProps>>;
