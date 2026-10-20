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
import type { ReferralSceneProps } from "../components/scenes/referral-scene";
import type { Preferences, SettingsSceneProps } from "../components/scenes/settings-scene";
import type { OwnedSkins, ThemeSceneProps } from "../components/scenes/theme-scene";
import type { ThemeShopSceneProps, ThemeSkinsData } from "../components/scenes/theme-shop-scene";
import type { MyTiles, MyTilesSceneProps } from "../components/scenes/my-tiles-scene";
import type { VaultSceneProps } from "../components/scenes/vault-scene";
import { CategoryType } from "@paved/game-core";
import { APP_ASSETS, FOREST_VARIANTS, SOURCE_ASSETS, appRenders, originalTileArt } from "./assets";
import { BOARD_38, BOARD_72, CLOSINGS_38, LAST_SCORED, STATS_38, mockStats } from "./board";
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
import { ACHIEVEMENTS_ALL, ACHIEVEMENTS_MIXED, ACHIEVEMENTS_NEW, QUESTS_ALL_DONE, QUESTS_FROM, QUESTS_IDLE, QUESTS_NONE, QUESTS_TIERED, QUESTS_TIERED_DONE, QUESTS_TIERED_FRESH, QUESTS_MULTI_TASK, QUESTS_TODAY, QUESTS_WEEK_DONE, QUESTS_WEEKLY_DONE, TIERED_IDS, GAME_MISSIONS } from "./quests";
import { ACCOUNT, ACHIEVEMENT_COBBLES, NOTHING_CLAIMED, NO_PRICES, PACKS, QUEST_COBBLES, SKIN_PRICES, TIERED_COBBLES, activeOn, bits, ownedPlans } from "./cobbles";
import { REFERRAL_EARNINGS, REFERRAL_LINK, REFERRAL_NONE } from "./referral";
import { BIG_AMOUNT_18, BIG_AMOUNT_6, BIG_NUMBER, BIG_SCORE, LONG_ADDRESS, LONG_NAME, LONG_SENTENCE, LONG_WORD, STRESS_ENTRIES, STRESS_GAMES, STRESS_VAULT } from "./stress";
import { PREVIEW_DEPOSIT_100, PREVIEW_WITHDRAW_500, VAULT_HELD, VAULT_NONE, VAULT_STATES } from "./vault";

/** A scene's data without its callbacks: what a page reads and hands it. One fixture per state below. */
type Data<P> = { [K in keyof P as K extends `on${string}` ? never : K]: P[K] };

// Welcome

/** A failed read's detail, as `errorDetail` builds it (P-67): no hash, the version and the time. */
const READ_ERROR_DETAIL = { code: "IndexerError", version: "0.1.0", at: Date.UTC(2026, 9, 16, 9, 30) };

export const WELCOME = {
  firstVisit: {},
  connecting: { connecting: true },
  failed: { error: "The controller window was closed before the account connected." },
  /** WRAP360: an error with a long sentence, an unbroken address and compound. */
  stress: { error: `${LONG_SENTENCE} ${LONG_ADDRESS} ${LONG_WORD}` },
} satisfies Record<string, Data<WelcomeSceneProps>>;

// Loading

export const LOADING = {
  booting: { progress: null, message: "Starting" },
  assets: { progress: 64, message: "Loading the board", tip: "Closing a city scores more the bigger it gets." },
  /** WRAP360: a long message and tip. */
  stress: { progress: 99, message: `${LONG_SENTENCE} ${LONG_WORD}`, tip: LONG_SENTENCE },
} satisfies Record<string, Data<LoadingSceneProps>>;

// Home

export const PLAYER_STATUS: PlayerStatusData = { player: PLAYER, stats: PLAYER_STATS, today: VIEWER_TODAY };

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
  /** P-61: the Cobble balance in the header, no free game. */
  cobbles: { player: PLAYER_STATUS, leaderboard: LEADERBOARD_TODAY, activeGame: null, training: null, spawnPaused: false, now: MOCK_NOW, cobbles: { balance: ACCOUNT.gems, credits: 0 } },
  /** P-61: two free games from the quests: Free game spends one. */
  freeGame: { player: PLAYER_STATUS, leaderboard: LEADERBOARD_TODAY, activeGame: null, training: null, spawnPaused: false, now: MOCK_NOW, cobbles: { balance: ACCOUNT.gems, credits: 2 }, free: [LEADERBOARD_TODAY.entries[1].playerId] },
  /** WRAP360: the longest username, the widest balances and scores, a podium of long names and a full address. */
  stress: {
    player: { ...PLAYER_STATUS, player: { ...PLAYER, name: LONG_NAME }, stats: { ...PLAYER_STATS, challengeFinished: BIG_NUMBER, bestScore: BIG_SCORE }, today: STRESS_ENTRIES[3] },
    leaderboard: { ...LEADERBOARD_TODAY, entries: STRESS_ENTRIES.slice(0, 3) },
    activeGame: { ...activeGame, id: BIG_NUMBER, score: BIG_SCORE },
    training: { score: BIG_SCORE, remaining: 99 },
    spawnPaused: false,
    now: MOCK_NOW,
    cobbles: { balance: BIG_NUMBER, credits: 999 },
  },
} satisfies Record<string, Data<HomeSceneProps>>;

// Play

export const PLAY = {
  connected: { connected: true, spawnPaused: false },
  guest: { connected: false, spawnPaused: false },
  paused: { connected: true, spawnPaused: true },
  /** P-61: two free games: Free Challenge spends one. */
  freeGame: { connected: true, spawnPaused: false, credits: 2 },
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
  tileArt: originalTileArt(SOURCE_ASSETS),
} satisfies Partial<Data<BoardSceneProps>>;

export const BOARD = {
  placing: { ...boardBase, hand: { tile: hand, state: "placing" } },
  // The bubble's callbacks are the page's: no-ops here, the stories and tests pass their own.
  slotChosen: {
    ...boardBase,
    hand: { tile: hand, state: "placing", slotChosen: true, preview: 30 },
    ghost: { x: BOARD_38.next.x, y: BOARD_38.next.y, ...hand, placed: true, fits: true },
    bubble: { cell: { x: BOARD_38.next.x, y: BOARD_38.next.y }, rotations: 2, onRotate: () => {}, onClose: () => {}, onConfirm: () => {}, canConfirm: true },
  },
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
/** The finished 38-tile game's board, on the app's compressed models (the plan view without WebGL). */
const finalBoard = { tiles: BOARD_38.tiles, gameId: GAME_OVER.id, basePath: APP_ASSETS } as const;
const figures = { stats: STATS_38, board: finalBoard } as const;

export const OVER = {
  rewarded: {
    mode: "challenge",
    game: GAME_OVER,
    closings: CLOSINGS_38,
    ...figures,
    previousBest: 1_180,
    rank: 7,
    reward: { state: "rewarded", amount: 8_420_000_000_000_000_000n, stake: 3, threshold },
  },
  awaiting: { mode: "challenge", game: GAME_OVER, closings: CLOSINGS_38, ...figures, rank: 7, reward: { state: "awaiting", stake: 3, threshold } },
  /** #595: the missions the game completed, listed under the reward with their Cobbles. */
  missions: { mode: "challenge", game: GAME_OVER, closings: CLOSINGS_38, ...figures, rank: 7, reward: { state: "awaiting", stake: 3, threshold }, missions: GAME_MISSIONS },
  settle: { mode: "challenge", game: GAME_OVER, closings: CLOSINGS_38, ...figures, rank: 7, reward: { state: "settle", stake: 3, threshold } },
  below: {
    mode: "challenge",
    game: { ...GAME_OVER, score: 940 },
    closings: CLOSINGS_38.slice(0, 8),
    rank: 18,
    reward: { state: "below", stake: 3, threshold },
  },
  expired: { mode: "challenge", game: GAME_OVER, closings: CLOSINGS_38, ...figures, reward: { state: "expired", stake: 3, threshold } },
  training: { mode: "training", game: { ...GAME_OVER, mode: 0 }, closings: CLOSINGS_38, ...figures, previousBest: 1_420, reward: { state: "free" } },
  /** The final board shown, the scores under it (#539). */
  finalBoard: { mode: "training", game: { ...GAME_OVER, mode: 0 }, closings: CLOSINGS_38, ...figures, view: "board", reward: { state: "free" } },
  /** The scores alone: no board to show (the game's tiles could not be read), no figures beyond the closings. */
  noBoard: { mode: "challenge", game: GAME_OVER, closings: CLOSINGS_38, rank: 7, reward: { state: "awaiting", stake: 3, threshold } },
  noClosing: {
    mode: "training",
    game: { ...GAME_OVER, score: 0, placedCount: 3 },
    closings: [],
    stats: mockStats([], { placed: 2, discarded: 0, discardPenalty: 0, open: [{ category: CategoryType.Road, tiles: 3, size: 3 }] }),
    board: { tiles: BOARD_38.tiles.slice(0, 3), basePath: APP_ASSETS },
    reward: { state: "free" },
  },
  /** WRAP360: the widest score, rank, reward and closings. */
  stress: {
    mode: "challenge",
    game: { ...GAME_OVER, id: BIG_NUMBER, score: BIG_SCORE },
    closings: CLOSINGS_38.map((c) => ({ ...c, size: 999, points: BIG_SCORE })),
    stats: mockStats(
      CLOSINGS_38.map((c) => ({ ...c, size: 999, points: BIG_SCORE })),
      { placed: 254, discarded: 999, discardPenalty: BIG_SCORE, open: [{ category: CategoryType.Forest, tiles: 999, size: 999 }] },
    ),
    board: finalBoard,
    previousBest: BIG_SCORE - 1,
    rank: 99_999,
    reward: { state: "rewarded", amount: BIG_AMOUNT_18, stake: 999, threshold: BIG_SCORE - 1 },
  },
} satisfies Record<string, Data<OverSceneProps>>;

// Purchase

const purchaseBase = { maxStake: MAX_STAKE, split: SPLIT_BPS, referrer: null, balance: BALANCE_RICH, spawnPaused: false, now: MOCK_NOW, timeZone: MOCK_TIME_ZONE };
/** The stake, its quote and its boost: a story that moves the slider calls it again. */
export const purchaseAt = (stake: number) => ({ stake, quote: quote(stake), boostBps: boostBps(stake) });
const at = purchaseAt;
const cobbleShop = { balance: ACCOUNT.gems, packs: PACKS, selected: null };

export const PURCHASE = {
  stake1: { ...purchaseBase, ...at(1) },
  stake3Referred: { ...purchaseBase, ...at(3), referrer: "0x0456bb00000000000000000000000000000000000000000000000000000beef" },
  stake10: { ...purchaseBase, ...at(10) },
  short: { ...purchaseBase, ...at(5), balance: BALANCE_LOW },
  paused: { ...purchaseBase, ...at(1), spawnPaused: true },
  buying: { ...purchaseBase, ...at(3), buying: true },
  /** WRAP360: a full referrer address (cut in the middle) and the largest balance. */
  stress: { ...purchaseBase, ...at(10), referrer: LONG_ADDRESS, balance: BIG_AMOUNT_6 },
  /** P-61, the Cobbles tab: the four packs, none picked yet. */
  cobblePacks: { ...purchaseBase, ...at(1), tab: "cobbles", cobbles: { ...cobbleShop, selected: null } },
  /** A pack picked (100 for $9): Pay confirms. */
  cobblePackPicked: { ...purchaseBase, ...at(1), tab: "cobbles", cobbles: { ...cobbleShop, selected: 2 } },
  /** A referrer from `?ref=`: their share, as for a game. */
  cobblePackReferred: { ...purchaseBase, ...at(1), tab: "cobbles", referrer: "0x0456bb00000000000000000000000000000000000000000000000000000beef", cobbles: { ...cobbleShop, selected: 3 } },
  /** The approve and `buy_pack` on their way. */
  cobblePackBuying: { ...purchaseBase, ...at(1), tab: "cobbles", cobbles: { ...cobbleShop, selected: 2, buying: true } },
  /** 1,000 for $70 with $3.40 in the wallet. */
  cobblePackShort: { ...purchaseBase, ...at(1), tab: "cobbles", balance: BALANCE_LOW, cobbles: { ...cobbleShop, selected: 4 } },
  /** WRAP360: the largest Cobble balance and USDC balance, a full referrer address. */
  cobbleStress: { ...purchaseBase, ...at(1), tab: "cobbles", referrer: LONG_ADDRESS, balance: BIG_AMOUNT_6, cobbles: { ...cobbleShop, balance: BIG_NUMBER, selected: 4 } },
} satisfies Record<string, Data<PurchaseSceneProps>>;

// Leaderboard

const ranks = { today: TODAY, firstDay: FIRST_DAY, viewerId: PLAYER_ID, now: MOCK_NOW };

export const LEADERBOARD = {
  today: { ...ranks, day: TODAY, leaderboard: BOARD_TODAY },
  closed: { ...ranks, day: TODAY - 1, leaderboard: BOARD_CLOSED },
  empty: { ...ranks, day: BOARD_EMPTY.tournamentId, leaderboard: BOARD_EMPTY },
  offTop: { ...ranks, day: TODAY, leaderboard: BOARD_OFF_TOP, viewer: VIEWER_OFF_TOP },
  guest: { ...ranks, day: TODAY, leaderboard: BOARD_TODAY, viewerId: null },
  /** P-61: the second player's best game was a free one (`GameSpawned.price == 0`): marked Free, ranked like any other. */
  freeGame: { ...ranks, day: TODAY, leaderboard: BOARD_TODAY, free: [BOARD_TODAY.entries[1].playerId] },
  loading: { ...ranks, day: TODAY, leaderboard: null },
  error: { ...ranks, day: TODAY, leaderboard: null, error: "The indexer did not answer (unreachable). The ranking will show once it is back.", errorDetail: READ_ERROR_DETAIL },
  /** WRAP360: the longest usernames, a full address, the widest ranks and scores. */
  stress: { ...ranks, day: TODAY, leaderboard: { ...BOARD_TODAY, total: 99_999, entries: STRESS_ENTRIES.slice(0, 3) }, viewer: STRESS_ENTRIES[3], viewerId: STRESS_ENTRIES[3].playerId },
} satisfies Record<string, Data<LeaderboardSceneProps>>;

export const PLAYER_PAGE = {
  other: { playerId: OTHER_PROFILE.player!.playerId, profile: OTHER_PROFILE, today: LEADERBOARD_TODAY.entries[0], games: PLAYER_GAMES.slice(1) },
  self: { playerId: PLAYER_ID, profile: SELF_PROFILE, today: VIEWER_TODAY, games: PLAYER_GAMES, self: true },
  unknown: { playerId: "0x07a1b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f60718293a4b5c6d7e8f", profile: UNKNOWN_PROFILE, games: [] },
  loading: { playerId: OTHER_PROFILE.player!.playerId, profile: null, games: null },
  /** The indexer did not answer: the error with Retry, and its detail to copy (P-67). */
  failed: { playerId: OTHER_PROFILE.player!.playerId, profile: null, games: null, error: "The indexer did not answer (HTTP 503).", errorDetail: READ_ERROR_DETAIL },
  /** WRAP360: the longest username beside "You", the widest rank, stats and games. */
  stress: {
    playerId: LONG_ADDRESS,
    profile: { ...SELF_PROFILE, player: { ...SELF_PROFILE.player!, playerId: LONG_ADDRESS, name: LONG_NAME } },
    today: STRESS_ENTRIES[3],
    games: STRESS_GAMES,
    self: true,
  },
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
  ...VAULT_STATES,
  /** WRAP360: the largest position, balance, amount and preview; every description wraps. */
  stress: { ...vaultBase, position: STRESS_VAULT, balance: BIG_AMOUNT_18, amount: "123456789012.99", preview: BIG_AMOUNT_18 },
} satisfies Record<string, Data<VaultSceneProps>>;

// Settings and theme

export const PREFERENCES: Preferences = { quality: "high", dayNight: true, ambient: true, musicVolume: 0.4, musicBefore: 0.4, sfxVolume: 0.7, sfxBefore: 0.7, tilePreview: true, placementHighlight: true, showSkins: true };

export const SETTINGS = {
  connected: { preferences: PREFERENCES, account: { address: PLAYER_ID, name: PLAYER.name }, autoQuality: "medium", version: "0.1.0" },
  guest: { preferences: { ...PREFERENCES, quality: "auto", sfxVolume: 0, showSkins: false }, account: null, version: "0.1.0" },
  /** WRAP360: the longest username and a full address beside Disconnect; a long version. */
  stress: { preferences: PREFERENCES, account: { address: LONG_ADDRESS, name: LONG_NAME }, version: "0.1.0-rc.12+build.20261015.abcdef0" },
} satisfies Record<string, Data<SettingsSceneProps>>;

const FOREST = 1;
const ALL_PLANS = Array.from({ length: 19 }, (_, i) => i + 1);
/** P-61, Forest: four tiles owned (the commonest plans, 75 to 50 Cobbles), two of them active; 240 Cobbles. */
const ownedSkins: OwnedSkins = { balance: ACCOUNT.gems, owned: { [FOREST]: ownedPlans(7, 8, 10, 13) }, active: activeOn(FOREST, 10, 13) };
const themesBase = { renders: appRenders } as const;

export const THEME = {
  /** Four Forest tiles owned, two of them active: a mix chosen tile by tile, so Use asks first. */
  mixed: { ...themesBase, skins: ownedSkins },
  /** Every owned Forest tile active: Forest in use. */
  forestInUse: { ...themesBase, skins: { ...ownedSkins, active: activeOn(FOREST, 7, 8, 10, 13) } },
  /** No skin owned: Default in use, Forest to buy. */
  defaultInUse: { ...themesBase, skins: { ...ownedSkins, owned: { [FOREST]: 0 }, active: activeOn(FOREST) } },
  /** The whole Forest set, in use. */
  allForest: { ...themesBase, skins: { ...ownedSkins, owned: { [FOREST]: ownedPlans(...ALL_PLANS) }, active: activeOn(FOREST, ...ALL_PLANS) } },
  /** Use's `set_skins` on its way. */
  applying: { ...themesBase, skins: ownedSkins, applying: "forest" },
  /** Use refused by the chain. */
  refused: { ...themesBase, skins: ownedSkins, refusal: "A skin in this change is not yours: buy it before using it. Nothing was saved." },
  /** A guest: Connect, the covers alone. */
  guest: { ...themesBase, skinsStatus: { kind: "guest" } },
  /** The skins on their way from the chain. */
  loading: { ...themesBase, skinsStatus: { kind: "loading" } },
  /** A failed read, with Retry. */
  error: { ...themesBase, skinsStatus: { kind: "error", message: "The node did not answer: Failed to fetch" } },
  /** No render served (a host without the manifest): the covers fall back to the board's backdrop. */
  noRenders: { skins: ownedSkins },
} satisfies Record<string, Data<ThemeSceneProps>>;

const forestShop: ThemeSkinsData = { balance: ACCOUNT.gems, prices: SKIN_PRICES, owned: ownedPlans(7, 8, 10, 13), active: activeOn(FOREST, 10, 13) };
const shopBase = { theme: "forest", renders: appRenders, variants: FOREST_VARIANTS } as const;

export const THEME_SHOP = {
  /** Forest's 19 tiles: four owned, two active, the rest priced by rarity (50 to 100 Cobbles), with their variant counts. */
  forest: { ...shopBase, skins: forestShop },
  /** No Cobbles and nothing owned: every Buy disabled, Get Cobbles. */
  noCobbles: { ...shopBase, skins: { ...forestShop, balance: 0, owned: 0, active: activeOn(FOREST) } },
  /** 60 Cobbles: the two commonest plans (50 and 55) can be bought, the others say how many more. */
  cantAfford: { ...shopBase, skins: { ...forestShop, balance: 60, owned: 0, active: activeOn(FOREST) } },
  /** A tile's `buy_skin` on its way (plan 1, 100 Cobbles): the others wait. */
  buying: { ...shopBase, skins: forestShop, buying: 1 },
  /** The purchase refused (the price changed). */
  refused: { ...shopBase, skins: forestShop, refusal: "The price of this tile changed to 80 Cobbles: nothing was bought." },
  /** The whole set owned and active. */
  allOwned: { ...shopBase, skins: { ...forestShop, owned: ownedPlans(...ALL_PLANS), active: activeOn(FOREST, ...ALL_PLANS) } },
  /** Forest withdrawn from sale (every price 0) with four owned: they stay, the others are not for sale. */
  ownedUnpriced: { ...shopBase, skins: { ...forestShop, prices: NO_PRICES } },
  /** Snow: its art is not in, so nothing is read: coming soon, under a blur. */
  comingSoon: { theme: "snow", renders: appRenders },
  /** A guest: Connect. */
  guest: { ...shopBase, skinsStatus: { kind: "guest" } },
  /** The reads on their way. */
  loading: { ...shopBase, skinsStatus: { kind: "loading" } },
  /** A failed read, with Retry. */
  error: { ...shopBase, skinsStatus: { kind: "error", message: "The node did not answer: Failed to fetch" } },
  /** WRAP360: the largest Cobble balance. */
  stress: { ...shopBase, skins: { ...forestShop, balance: BIG_NUMBER } },
} satisfies Record<string, Data<ThemeShopSceneProps>>;

const myTiles: MyTiles = { ...ownedSkins, changes: {} };
const tilesBase = { renders: appRenders } as const;

export const MY_TILES = {
  /** Four Forest tiles owned (plans 7, 8, 10, 13), 10 and 13 wearing it: those four rows offer Default and Forest. */
  owned: { ...tilesBase, skins: myTiles },
  /** Two picks changed, not saved: Save sends them in one `set_skins`. */
  changed: { ...tilesBase, skins: { ...myTiles, changes: { 7: FOREST, 13: 0 } } },
  /** The write on its way. */
  saving: { ...tilesBase, skins: { ...myTiles, changes: { 7: FOREST, 13: 0 }, save: "saving" } },
  /** Saved: the picks are the chain's again. */
  saved: { ...tilesBase, skins: { ...myTiles, active: activeOn(FOREST, 7, 10), save: "saved" } },
  /** The save refused, the batch kept. */
  refused: { ...tilesBase, skins: { ...myTiles, changes: { 7: FOREST }, refusal: "A skin in this change is not yours: buy it before using it. Nothing was saved." } },
  /** No skin owned: every tile on Default, the shop to open. */
  none: { ...tilesBase, skins: { ...myTiles, owned: { [FOREST]: 0 }, active: activeOn(FOREST) } },
  /** The whole Forest set. */
  allForest: { ...tilesBase, skins: { ...myTiles, owned: { [FOREST]: ownedPlans(...ALL_PLANS) }, active: activeOn(FOREST, ...ALL_PLANS) } },
  /** A guest: Connect. */
  guest: { ...tilesBase, skinsStatus: { kind: "guest" } },
  /** The reads on their way. */
  loading: { ...tilesBase, skinsStatus: { kind: "loading" } },
  /** A failed read, with Retry. */
  error: { ...tilesBase, skinsStatus: { kind: "error", message: "The node did not answer: Failed to fetch" } },
} satisfies Record<string, Data<MyTilesSceneProps>>;

// Quests and achievements

const questsBase = { today: TODAY, firstDay: QUESTS_FROM, connected: true, now: MOCK_NOW };
const questRewards = { cobbles: QUEST_COBBLES, day: NOTHING_CLAIMED, week: NOTHING_CLAIMED, balance: ACCOUNT.gems, credits: 0 };

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
  /** P-61: today with Cobbles: Daily Run done and its 5 Cobbles to claim; the others show what they give. */
  cobblesToday: { ...questsBase, day: TODAY, quests: QUESTS_TODAY, rewards: questRewards },
  /** Daily Run's Cobbles claimed. */
  cobblesClaimed: { ...questsBase, day: TODAY, quests: QUESTS_TODAY, rewards: { ...questRewards, balance: ACCOUNT.gems + 5, day: { ...NOTHING_CLAIMED, claimed: bits(1) } } },
  /** Yesterday, closed but still claimable: the four dailies' 20 Cobbles (Claim all) and the day's free game. */
  cobblesPastDay: { ...questsBase, day: QUESTS_ALL_DONE.day, quests: QUESTS_ALL_DONE, rewards: questRewards },
  /** Claim all on its way. */
  cobblesClaiming: { ...questsBase, day: QUESTS_ALL_DONE.day, quests: QUESTS_ALL_DONE, rewards: { ...questRewards, claiming: "all" } },
  /** Everything of yesterday claimed: one free game to play. */
  cobblesFreeGame: {
    ...questsBase,
    day: QUESTS_ALL_DONE.day,
    quests: QUESTS_ALL_DONE,
    rewards: { ...questRewards, balance: ACCOUNT.gems + 20, credits: 1, day: { claimed: bits(1, 5, 8, 11), credit: true } },
  },
  /** The three weeklies done: their 45 Cobbles and the week's free game to claim. */
  cobblesWeekDone: { ...questsBase, day: TODAY, quests: QUESTS_WEEK_DONE, rewards: { ...questRewards, day: { ...NOTHING_CLAIMED, claimed: bits(1) } } },
  /**
   * #595, the tiered schedule (a proposal): each family a track of three steps. Daily Run and Small Works claimed; Public
   * Works, Woodland Walk, Warm-Up Score and Weekly Forester reached, their Cobbles to claim; the next steps lit, the rest locked.
   */
  tiered: { ...questsBase, day: TODAY, quests: QUESTS_TIERED, rewards: { ...questRewards, cobbles: TIERED_COBBLES, day: { ...NOTHING_CLAIMED, claimed: bits(1, 5) } } },
  /** The tiered schedule before any game: the first step of each track is next, the others locked. */
  tieredFresh: { ...questsBase, day: TODAY, quests: QUESTS_TIERED_FRESH, rewards: { ...questRewards, cobbles: TIERED_COBBLES } },
  /** Every step reached and claimed, the day's and the week's: both free games claimed. */
  tieredClaimed: {
    ...questsBase,
    day: TODAY,
    quests: QUESTS_TIERED_DONE,
    rewards: { ...questRewards, cobbles: TIERED_COBBLES, credits: 2, day: { claimed: bits(...TIERED_IDS.filter((id) => id <= 13)), credit: true }, week: { claimed: bits(...TIERED_IDS.filter((id) => id > 13)), credit: true } },
  },
  /** A mission of several tasks (id 20: roads and cities done, forests not): a bar per task, not a milestone track. */
  multiTask: { ...questsBase, day: TODAY, quests: QUESTS_MULTI_TASK },
  /** The tiered schedule without Cobbles (a network without the ledger): the bars and their steps, no reward drawn. */
  tieredNoRewards: { ...questsBase, day: TODAY, quests: QUESTS_TIERED },
} satisfies Record<string, Data<QuestsSceneProps>>;

const achievementRewards = { cobbles: ACHIEVEMENT_COBBLES, claimed: ACCOUNT.achievementsClaimed, balance: ACCOUNT.gems };

export const ACHIEVEMENTS = {
  mixed: { achievements: ACHIEVEMENTS_MIXED, connected: true },
  newPlayer: { achievements: ACHIEVEMENTS_NEW, connected: true },
  all: { achievements: ACHIEVEMENTS_ALL, connected: true },
  guest: { achievements: null, connected: false },
  loading: { achievements: null, connected: true },
  /** The indexer did not answer: the error with Retry, and its detail to copy (P-67). */
  failed: { achievements: null, connected: true, error: "The indexer did not answer (HTTP 503).", errorDetail: READ_ERROR_DETAIL },
  /** P-61: each achievement's Cobbles (its points); First Stone and Settler I claimed, Settler II and Grand Builder to claim. */
  cobbles: { achievements: ACHIEVEMENTS_MIXED, connected: true, rewards: achievementRewards },
  /** Claim all on its way. */
  cobblesClaiming: { achievements: ACHIEVEMENTS_MIXED, connected: true, rewards: { ...achievementRewards, claiming: "all" } },
  /** Every one earned and claimed: 580 Cobbles; On the Podium gives none. */
  cobblesAllClaimed: {
    achievements: ACHIEVEMENTS_ALL,
    connected: true,
    rewards: { ...achievementRewards, balance: 580, claimed: bits(...ACHIEVEMENT_COBBLES.map((a) => a.achievementId)) },
  },
} satisfies Record<string, Data<AchievementsSceneProps>>;

// Referral

export const REFERRAL = {
  earned: { link: REFERRAL_LINK, split: SPLIT_BPS, earnings: REFERRAL_EARNINGS },
  copied: { link: REFERRAL_LINK, split: SPLIT_BPS, earnings: REFERRAL_EARNINGS, copied: true },
  none: { link: REFERRAL_LINK, split: SPLIT_BPS, earnings: REFERRAL_NONE },
  loading: { link: REFERRAL_LINK, split: SPLIT_BPS, earnings: null },
  /** The indexer's read failed: the earnings have Retry, the link stays. */
  error: { link: REFERRAL_LINK, split: SPLIT_BPS, earnings: null, earningsError: "Indexer unreachable: fetch failed" },
  guest: { link: null, split: SPLIT_BPS, earnings: null },
  notDeployed: { link: REFERRAL_LINK, split: null, earnings: null },
  /** WRAP360: a link with a full address, the largest earnings and counts. */
  stress: {
    link: `${REFERRAL_LINK.split("?")[0]}?ref=${LONG_ADDRESS}`,
    split: SPLIT_BPS,
    earnings: { total: BIG_AMOUNT_6 * 2n, games: { count: BIG_NUMBER, total: BIG_AMOUNT_6 }, packs: { count: BIG_NUMBER, total: BIG_AMOUNT_6 } },
  },
} satisfies Record<string, Data<ReferralSceneProps>>;
