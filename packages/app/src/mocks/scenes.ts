import type { PlayerStatusData, ProfileState } from "../components/containers/profile-sheet";
import type { BoardSceneProps } from "../components/scenes/board-scene";
import type { HomeSceneProps } from "../components/scenes/home-scene";
import type { LoadingSceneProps } from "../components/scenes/loading-scene";
import type { OverSceneProps } from "../components/scenes/over-scene";
import type { PlaySceneProps } from "../components/scenes/play-scene";
import type { PurchaseSceneProps } from "../components/scenes/purchase-scene";
import type { CobblesSceneProps } from "../components/scenes/cobbles-scene";
import type { AvatarCreator, AvatarCreatorSceneProps } from "../components/scenes/avatar-creator-scene";
import type { WelcomeSceneProps } from "../components/scenes/welcome-scene";
import type { AchievementsSceneProps } from "../components/scenes/achievements-scene";
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
import { PLAYER, PLAYER_ID, PLAYER_STATS, TODAY } from "./players";
import { ACHIEVEMENTS_ALL, ACHIEVEMENTS_MIXED, ACHIEVEMENTS_NEW, QUESTS_ALL_DONE, QUESTS_FROM, QUESTS_IDLE, QUESTS_NONE, QUESTS_TODAY, QUESTS_WEEK_DONE, QUESTS_WEEKLY_DONE, GAME_MISSIONS } from "./quests";
import { DEFAULT_AVATAR as DEFAULT_AVATAR_LOOK } from "@paved/renderer";
import { AVATAR_ITEMS, AVATAR_OFFERS, SAVED_AVATAR, offersOf } from "./avatar";
import { ACCOUNT, ACHIEVEMENT_COBBLES, NOTHING_CLAIMED, NO_PRICES, PACKS, QUEST_COBBLES, SKIN_PRICES, activeOn, bits, ownedPlans } from "./cobbles";
import { REFERRAL_EARNINGS, REFERRAL_LINK, REFERRAL_NONE } from "./referral";
import { BIG_AMOUNT_18, BIG_AMOUNT_6, BIG_NUMBER, BIG_SCORE, LONG_ADDRESS, LONG_NAME, LONG_SENTENCE, LONG_WORD, STRESS_VAULT } from "./stress";
import { SKIN_TIER_GATES } from "./village";
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

export const PLAYER_STATUS: PlayerStatusData = { player: PLAYER, stats: PLAYER_STATS };

const activeGame = GAME_PLAYING;

/** The menu screens' avatar and its sheet (#624): one state each. */
export const PROFILE = {
  connected: { status: "connected", data: PLAYER_STATUS },
  /** No Cartridge username: the address names the player, its first digit is the initial. */
  noUsername: { status: "connected", data: { ...PLAYER_STATUS, player: { ...PLAYER, name: null } } },
  guest: { status: "guest" },
  connecting: { status: "guest", connecting: true },
  /** The wallet still looks for an earlier session. */
  loading: { status: "loading" },
  /** WRAP360: the longest username, the largest figures. */
  stress: { status: "connected", data: { player: { ...PLAYER, name: LONG_NAME }, stats: { ...PLAYER_STATS, challengeFinished: BIG_NUMBER, bestScore: BIG_SCORE } } },
} satisfies Record<string, ProfileState>;

export const HOME = {
  connected: { player: PLAYER_STATUS, activeGame, training: { score: 420, remaining: 31 }, spawnPaused: false, now: MOCK_NOW },
  guest: { player: null, activeGame: null, training: null, spawnPaused: false, now: MOCK_NOW },
  paused: { player: PLAYER_STATUS, activeGame, training: null, spawnPaused: true, now: MOCK_NOW },
  /** P-61: the Cobble balance in the header, no free game. */
  cobbles: { player: PLAYER_STATUS, activeGame: null, training: null, spawnPaused: false, now: MOCK_NOW, cobbles: { balance: ACCOUNT.gems, credits: 0 } },
  /** P-61: two free games from the quests: Free game spends one. */
  freeGame: { player: PLAYER_STATUS, activeGame: null, training: null, spawnPaused: false, now: MOCK_NOW, cobbles: { balance: ACCOUNT.gems, credits: 2 } },
  /** WRAP360: the longest username, the widest balances and scores. */
  stress: {
    player: { ...PLAYER_STATUS, player: { ...PLAYER, name: LONG_NAME }, stats: { ...PLAYER_STATS, challengeFinished: BIG_NUMBER, bestScore: BIG_SCORE } },
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

/** The two tiles known after the one in hand (#645): plans of the 38-tile board's deck. */
const coming = [{ plan: BOARD_38.tiles[3]!.plan }, { plan: BOARD_38.tiles[8]!.plan }];

export const BOARD = {
  placing: { ...boardBase, hand: { tile: hand, state: "placing" } },
  /** #645: the tile to place and the two coming tiles (a Challenge on the VRF). */
  queue: { ...boardBase, hand: { tile: hand, state: "placing", coming } },
  /** #645: a Challenge move on its way: the next tile waits with it, the one after it is shown, the chain draws the last. */
  queueDrawing: {
    ...boardBase,
    tiles: [...BOARD_38.tiles, { ...BOARD_38.next, pending: true }],
    hand: { tile: { plan: coming[0]!.plan, orientation: 1 }, state: "pending", coming: coming.slice(1), drawing: true },
  },
  /** #645: Training plays the same queue from its local random. */
  queueTraining: { ...boardBase, mode: "training", gameId: undefined, expiresAt: null, hand: { tile: hand, state: "placing", coming } },
  /** #645: the deck's last two tiles: one coming, none after it. */
  queueLast: { ...boardBase, remaining: 2, hand: { tile: hand, state: "placing", coming: coming.slice(0, 1) } },
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
    reward: { state: "rewarded", amount: 8_420_000_000_000_000_000n, stake: 3, threshold },
  },
  awaiting: { mode: "challenge", game: GAME_OVER, closings: CLOSINGS_38, ...figures, reward: { state: "awaiting", stake: 3, threshold } },
  /** #595: the missions the game completed, listed under the reward with their Cobbles. */
  missions: { mode: "challenge", game: GAME_OVER, closings: CLOSINGS_38, ...figures, reward: { state: "awaiting", stake: 3, threshold }, missions: GAME_MISSIONS },
  settle: { mode: "challenge", game: GAME_OVER, closings: CLOSINGS_38, ...figures, reward: { state: "settle", stake: 3, threshold } },
  below: {
    mode: "challenge",
    game: { ...GAME_OVER, score: 940 },
    closings: CLOSINGS_38.slice(0, 8),
    reward: { state: "below", stake: 3, threshold },
  },
  expired: { mode: "challenge", game: GAME_OVER, closings: CLOSINGS_38, ...figures, reward: { state: "expired", stake: 3, threshold } },
  training: { mode: "training", game: { ...GAME_OVER, mode: 0 }, closings: CLOSINGS_38, ...figures, previousBest: 1_420, reward: { state: "free" } },
  /** The final board shown, the scores under it (#539). */
  finalBoard: { mode: "training", game: { ...GAME_OVER, mode: 0 }, closings: CLOSINGS_38, ...figures, view: "board", reward: { state: "free" } },
  /** The scores alone: no board to show (the game's tiles could not be read), no figures beyond the closings. */
  noBoard: { mode: "challenge", game: GAME_OVER, closings: CLOSINGS_38, reward: { state: "awaiting", stake: 3, threshold } },
  noClosing: {
    mode: "training",
    game: { ...GAME_OVER, score: 0, placedCount: 3 },
    closings: [],
    stats: mockStats([], { placed: 2, discarded: 0, discardPenalty: 0, open: [{ category: CategoryType.Road, tiles: 3, size: 3 }] }),
    board: { tiles: BOARD_38.tiles.slice(0, 3), basePath: APP_ASSETS },
    reward: { state: "free" },
  },
  /** WRAP360: the widest score, reward and closings. */
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
} satisfies Record<string, Data<PurchaseSceneProps>>;

// Cobble packs (#621: their own page)

const cobblesBase = { split: SPLIT_BPS, referrer: null, balance: BALANCE_RICH };
const REFERRER = "0x0456bb00000000000000000000000000000000000000000000000000000beef";

export const COBBLES = {
  /** P-61: the four packs, none picked yet. */
  packs: { ...cobblesBase, cobbles: { ...cobbleShop, selected: null } },
  /** A pack picked (100 for $9): Pay confirms. */
  picked: { ...cobblesBase, cobbles: { ...cobbleShop, selected: 2 } },
  /** A referrer from `?ref=`: their share, as for a game. */
  referred: { ...cobblesBase, referrer: REFERRER, cobbles: { ...cobbleShop, selected: 3 } },
  /** The approve and `buy_pack` on their way. */
  buying: { ...cobblesBase, cobbles: { ...cobbleShop, selected: 2, buying: true } },
  /** 1,000 for $70 with $3.40 in the wallet. */
  short: { ...cobblesBase, balance: BALANCE_LOW, cobbles: { ...cobbleShop, selected: 4 } },
  /** WRAP360: the largest Cobble balance and USDC balance, a full referrer address. */
  stress: { ...cobblesBase, referrer: LONG_ADDRESS, balance: BIG_AMOUNT_6, cobbles: { ...cobbleShop, balance: BIG_NUMBER, selected: 4 } },
} satisfies Record<string, Data<CobblesSceneProps>>;

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
  /** Some skins reserved to a tier of their plan (#646): the plan's tier reached or not. */
  tierGated: { ...shopBase, skins: { ...forestShop, balance: 600 }, tierGates: SKIN_TIER_GATES },
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

// The avatar creator (#626 PR 2)

const creator: AvatarCreator = { saved: SAVED_AVATAR, draft: SAVED_AVATAR, balance: 120, offers: AVATAR_OFFERS, now: MOCK_NOW };
/** The draft wearing the Horned helm (headwear 5, 40 Cobbles): on sale, Save waits for it. */
const tryingHelm: AvatarCreator = { ...creator, draft: { ...SAVED_AVATAR, headwear: 5 } };

export const AVATAR_CREATOR = {
  /** The saved avatar, Skin tone open: four free tones, the others priced 20 to 100 Cobbles. */
  saved: { creator, part: "skin" },
  /** Headwear: the Crown and the Wizard hat owned (bought), four free, the Horned helm on sale. */
  headwear: { creator, part: "headwear" },
  /** The Horned helm tried on: its price and Buy above the grid, Save waits for it. */
  priced: { creator: tryingHelm, part: "headwear" },
  /** Background: City owned, Night and Wonder seasonal (on sale until the winter's end). */
  background: { creator: { ...creator, draft: { ...SAVED_AVATAR, background: 15 } }, part: "background" },
  /** Beard: the Long beard withdrawn from sale (not for sale), the others free or priced. */
  beard: { creator, part: "beard" },
  /** Eyes, eyebrows, mouth, hair colour, hair and accessory: the other tabs. */
  eyes: { creator, part: "eyes" },
  eyebrows: { creator, part: "eyebrows" },
  mouth: { creator, part: "mouth" },
  hairColour: { creator, part: "hairColour" },
  hair: { creator, part: "hair" },
  accessory: { creator, part: "accessory" },
  /** A free change not saved yet: Save. */
  changed: { creator: { ...creator, draft: { ...SAVED_AVATAR, hair: 2, mouth: 3 } }, part: "hair" },
  /** The Horned helm's `buy_avatar_item` on its way. */
  buying: { creator: { ...tryingHelm, buying: { part: "headwear", id: 5 } }, part: "headwear" },
  /** Too few Cobbles for the item tried on: Get Cobbles. */
  short: { creator: { ...tryingHelm, balance: 15 }, part: "headwear" },
  /** The `set_avatar` on its way. */
  saving: { creator: { ...creator, draft: { ...SAVED_AVATAR, hair: 2 }, save: "saving" }, part: "hair" },
  /** Saved: the draft is the chain's again. */
  savedNow: { creator: { ...creator, save: "saved" }, part: "skin" },
  /** A purchase refused (the price changed since the swatch was read). */
  refused: { creator: { ...tryingHelm, refusal: "This item's price changed: check the new price and buy again. Nothing was sent." }, part: "headwear" },
  /** No avatar saved yet: the default one, every part at 0. */
  none: { creator: { ...creator, saved: DEFAULT_AVATAR_LOOK, draft: DEFAULT_AVATAR_LOOK, balance: 0 }, part: "skin" },
  /** Four parts in use (the owner's count): the other six tabs are not shown. */
  fewParts: { creator: { ...creator, offers: offersOf(AVATAR_ITEMS, [], 4), saved: DEFAULT_AVATAR_LOOK, draft: DEFAULT_AVATAR_LOOK } },
  /** A guest: Connect. */
  guest: { status: { kind: "guest" } },
  /** The reads on their way. */
  loading: { status: { kind: "loading" } },
  /** A failed read, with Retry. */
  error: { status: { kind: "error", message: "The node did not answer: Failed to fetch", detail: READ_ERROR_DETAIL } },
  /** A network without the avatar contract. */
  unavailable: { creator: null },
  /** WRAP360: the largest Cobble balance. */
  stress: { creator: { ...tryingHelm, balance: BIG_NUMBER }, part: "headwear" },
} satisfies Record<string, Data<AvatarCreatorSceneProps>>;
