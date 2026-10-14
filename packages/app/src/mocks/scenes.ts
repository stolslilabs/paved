import type { PlayerStatusData } from "../components/containers/player-status";
import type { BoardSceneProps } from "../components/scenes/board-scene";
import type { HomeSceneProps } from "../components/scenes/home-scene";
import type { LoadingSceneProps } from "../components/scenes/loading-scene";
import type { OverSceneProps } from "../components/scenes/over-scene";
import type { PlaySceneProps } from "../components/scenes/play-scene";
import type { PurchaseSceneProps } from "../components/scenes/purchase-scene";
import type { WelcomeSceneProps } from "../components/scenes/welcome-scene";
import type { AchievementsSceneProps } from "../components/scenes/achievements-scene";
import type { LeaderboardSceneProps } from "../components/scenes/leaderboard-scene";
import type { PlayerSceneProps } from "../components/scenes/player-scene";
import type { QuestsSceneProps } from "../components/scenes/quests-scene";
import type { ReferralEarnings, ReferralSceneProps } from "../components/scenes/referral-scene";
import type { Preferences, SettingsSceneProps } from "../components/scenes/settings-scene";
import type { ThemeSceneProps } from "../components/scenes/theme-scene";
import type { VaultSceneProps } from "../components/scenes/vault-scene";
import { RENDERER_ASSETS } from "./assets";
import { BOARD_38, BOARD_72, CLOSINGS_38, LAST_SCORED } from "./board";
import { DAY, MOCK_NOW, MOCK_TIME_ZONE } from "./clock";
import { BALANCE_LOW, BALANCE_RICH, MAX_STAKE, PAVED_BALANCE, SPLIT_BPS, boostBps, quote } from "./economy";
import { GAME_EXPIRED, GAME_OVER, GAME_PLAYING, THRESHOLD_MILLI } from "./games";
import {
  BOARD_CLOSED,
  BOARD_EMPTY,
  BOARD_OFF_TOP,
  BOARD_TODAY,
  FIRST_DAY,
  OTHER_PROFILE,
  PLAYER_GAMES,
  SELF_PROFILE,
  UNKNOWN_PROFILE,
  VIEWER_OFF_TOP,
} from "./leaderboard";
import { LEADERBOARD_EMPTY, LEADERBOARD_TODAY, PLAYER, PLAYER_ID, PLAYER_STATS, TODAY, VIEWER_TODAY } from "./players";
import { ACHIEVEMENTS_ALL, ACHIEVEMENTS_MIXED, ACHIEVEMENTS_NEW, QUESTS_ALL_DONE, QUESTS_FROM, QUESTS_IDLE, QUESTS_NONE, QUESTS_TODAY, QUESTS_WEEKLY_DONE } from "./quests";
import { REFERRAL_LINK, REFERRED_PURCHASES } from "./referral";
import { THEME_TILES } from "./settings";
import { PREVIEW_DEPOSIT_100, PREVIEW_WITHDRAW_500, VAULT_HELD, VAULT_NONE } from "./vault";

/** A scene's data without its callbacks: what a page reads and hands it. One fixture per state below. */
type Data<P> = { [K in keyof P as K extends `on${string}` ? never : K]: P[K] };

// Welcome

export const WELCOME = {
  firstVisit: {},
  connecting: { connecting: true },
  failed: { error: "The controller window was closed before the account connected." },
} satisfies Record<string, Data<WelcomeSceneProps>>;

// Loading

export const LOADING = {
  booting: { progress: null, message: "Starting" },
  assets: { progress: 64, message: "Loading the board", tip: "Closing a city scores more the bigger it gets." },
} satisfies Record<string, Data<LoadingSceneProps>>;

// Home

export const PLAYER_STATUS: PlayerStatusData = { player: PLAYER, stats: PLAYER_STATS, today: VIEWER_TODAY, usdc: BALANCE_RICH, paved: PAVED_BALANCE };

const activeGame = GAME_PLAYING;

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
  expiresAt: GAME_PLAYING.expiresAt,
  now: MOCK_NOW,
  lastScored: [],
  tileArt: RENDERER_ASSETS,
} satisfies Partial<Data<BoardSceneProps>>;

export const BOARD = {
  placing: { ...boardBase, hand: { tile: hand, state: "placing" } },
  slotChosen: { ...boardBase, hand: { tile: hand, state: "placing", slotChosen: true, preview: 30 } },
  closing: { ...boardBase, delta: 370, hand: { tile: hand, state: "placing" }, lastScored: LAST_SCORED },
  pending: { ...boardBase, tiles: [...BOARD_38.tiles, { ...BOARD_38.next, pending: true }], hand: { tile: hand, state: "pending", slotChosen: true } },
  refused: { ...boardBase, hand: { tile: hand, state: "refused", slotChosen: true, error: "Move refused by the contract: the edges do not match." } },
  expired: { ...boardBase, expiresAt: GAME_EXPIRED.expiresAt, hand: { tile: hand, state: "expired" } },
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
  noClosing: { mode: "training", game: { ...GAME_OVER, score: 0, placedCount: 3 }, closings: [], reward: { state: "free" } },
} satisfies Record<string, Data<OverSceneProps>>;

// Purchase

const purchaseBase = { maxStake: MAX_STAKE, split: SPLIT_BPS, referrer: null, balance: BALANCE_RICH, spawnPaused: false, now: MOCK_NOW, timeZone: MOCK_TIME_ZONE };
/** The stake, its quote and its boost: a story that moves the slider calls it again. */
export const purchaseAt = (stake: number) => ({ stake, quote: quote(stake), boostBps: boostBps(stake) });
const at = purchaseAt;

export const PURCHASE = {
  stake1: { ...purchaseBase, ...at(1) },
  stake3Referred: { ...purchaseBase, ...at(3), referrer: "0x0456bb00000000000000000000000000000000000000000000000000000beef" },
  stake10: { ...purchaseBase, ...at(10) },
  short: { ...purchaseBase, ...at(5), balance: BALANCE_LOW },
  paused: { ...purchaseBase, ...at(1), spawnPaused: true },
  buying: { ...purchaseBase, ...at(3), buying: true },
} satisfies Record<string, Data<PurchaseSceneProps>>;

// Leaderboard

const ranks = { today: TODAY, firstDay: FIRST_DAY, viewerId: PLAYER_ID, now: MOCK_NOW };

export const LEADERBOARD = {
  today: { ...ranks, day: TODAY, leaderboard: BOARD_TODAY },
  closed: { ...ranks, day: TODAY - 1, leaderboard: BOARD_CLOSED },
  empty: { ...ranks, day: BOARD_EMPTY.tournamentId, leaderboard: BOARD_EMPTY },
  offTop: { ...ranks, day: TODAY, leaderboard: BOARD_OFF_TOP, viewer: VIEWER_OFF_TOP },
  guest: { ...ranks, day: TODAY, leaderboard: BOARD_TODAY, viewerId: null },
  loading: { ...ranks, day: TODAY, leaderboard: null },
  error: { ...ranks, day: TODAY, leaderboard: null, error: "The indexer did not answer (unreachable). The ranking will show once it is back." },
} satisfies Record<string, Data<LeaderboardSceneProps>>;

export const PLAYER_PAGE = {
  other: { playerId: OTHER_PROFILE.player!.playerId, profile: OTHER_PROFILE, today: LEADERBOARD_TODAY.entries[0], games: PLAYER_GAMES.slice(1) },
  self: { playerId: PLAYER_ID, profile: SELF_PROFILE, today: VIEWER_TODAY, games: PLAYER_GAMES, self: true },
  unknown: { playerId: "0x07a1b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f60718293a4b5c6d7e8f", profile: UNKNOWN_PROFILE, games: [] },
  loading: { playerId: OTHER_PROFILE.player!.playerId, profile: null, games: null },
} satisfies Record<string, Data<PlayerSceneProps>>;

// Vault

const vaultBase = { deployed: true, position: VAULT_HELD, balance: PAVED_BALANCE, split: SPLIT_BPS, mode: "deposit", amount: "", preview: null } satisfies Partial<Data<VaultSceneProps>>;

export const VAULT = {
  noPosition: { ...vaultBase, position: VAULT_NONE, amount: "100", preview: PREVIEW_DEPOSIT_100 },
  position: { ...vaultBase, mode: "withdraw", amount: "500", preview: PREVIEW_WITHDRAW_500 },
  depositing: { ...vaultBase, amount: "100", preview: PREVIEW_DEPOSIT_100, busy: "deposit" },
  withdrawing: { ...vaultBase, mode: "withdraw", amount: "500", preview: PREVIEW_WITHDRAW_500, busy: "withdraw" },
  overMax: { ...vaultBase, mode: "withdraw", amount: "1300" },
  noPaved: { ...vaultBase, position: VAULT_NONE, balance: 0n },
  notDeployed: { ...vaultBase, deployed: false, position: null, balance: 0n, split: null },
} satisfies Record<string, Data<VaultSceneProps>>;

// Settings and theme

export const PREFERENCES: Preferences = { quality: "high", sound: true, music: false, tilePreview: true, placementHighlight: true };

export const SETTINGS = {
  connected: { preferences: PREFERENCES, account: { address: PLAYER_ID, name: PLAYER.name }, theme: "default", version: "0.1.0" },
  guest: { preferences: { ...PREFERENCES, quality: "medium", sound: false }, account: null, theme: "forest", version: "0.1.0" },
} satisfies Record<string, Data<SettingsSceneProps>>;

export const THEME = {
  defaultSelected: { selected: "default", tiles: THEME_TILES, tileArt: RENDERER_ASSETS },
  forestSelected: { selected: "forest", tiles: THEME_TILES, tileArt: RENDERER_ASSETS },
} satisfies Record<string, Data<ThemeSceneProps>>;

// Quests and achievements

const questsBase = { today: TODAY, firstDay: QUESTS_FROM, connected: true, now: MOCK_NOW };

export const QUESTS = {
  today: { ...questsBase, day: TODAY, quests: QUESTS_TODAY },
  allDone: { ...questsBase, day: QUESTS_ALL_DONE.day, quests: QUESTS_ALL_DONE },
  idle: { ...questsBase, day: QUESTS_IDLE.day, quests: QUESTS_IDLE },
  none: { ...questsBase, firstDay: QUESTS_NONE.day, day: QUESTS_NONE.day, quests: QUESTS_NONE },
  weeklyDone: { ...questsBase, day: TODAY, quests: QUESTS_WEEKLY_DONE },
  // 4 minutes before 00:00 UTC: the Daily countdown turns amber (the Weekly one has about a day).
  endingSoon: { ...questsBase, day: TODAY, quests: QUESTS_TODAY, now: (TODAY + 1) * DAY - 4 * 60 },
  guest: { ...questsBase, day: TODAY, quests: null, connected: false },
  loading: { ...questsBase, day: TODAY, quests: null },
  error: { ...questsBase, day: TODAY, quests: null, error: "The indexer did not answer (HTTP 503)." },
} satisfies Record<string, Data<QuestsSceneProps>>;

export const ACHIEVEMENTS = {
  mixed: { achievements: ACHIEVEMENTS_MIXED, connected: true },
  newPlayer: { achievements: ACHIEVEMENTS_NEW, connected: true },
  all: { achievements: ACHIEVEMENTS_ALL, connected: true },
  guest: { achievements: null, connected: false },
  loading: { achievements: null, connected: true },
} satisfies Record<string, Data<AchievementsSceneProps>>;

// Referral

// Every purchase through the link is listed: the count and the total are those of the list.
const earned: ReferralEarnings = { total: REFERRED_PURCHASES.reduce((sum, p) => sum + BigInt(p.referral), 0n), count: REFERRED_PURCHASES.length, recent: REFERRED_PURCHASES };

export const REFERRAL = {
  earned: { link: REFERRAL_LINK, split: SPLIT_BPS, earnings: earned, now: MOCK_NOW },
  copied: { link: REFERRAL_LINK, split: SPLIT_BPS, earnings: earned, copied: true, now: MOCK_NOW },
  none: { link: REFERRAL_LINK, split: SPLIT_BPS, earnings: { total: 0n, count: 0, recent: [] }, now: MOCK_NOW },
  loading: { link: REFERRAL_LINK, split: SPLIT_BPS, earnings: null, now: MOCK_NOW },
  guest: { link: null, split: SPLIT_BPS, earnings: null, now: MOCK_NOW },
  notDeployed: { link: REFERRAL_LINK, split: null, earnings: null, now: MOCK_NOW },
} satisfies Record<string, Data<ReferralSceneProps>>;
