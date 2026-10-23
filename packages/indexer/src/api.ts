// The v1 response types of the read API (docs/architecture/indexer.md, "Read API (v1)"), shared with the client: plain
// TypeScript, no import, so that a client may import this file as types only and the daemon's code never enters its
// bundle. A v1 field is never removed or retyped; fields may be appended.
//
// Amounts (Economy's u256 and u128: USDC and PAVED base units) can exceed 2^53, so they are decimal strings, never JSON
// numbers (P-19); every other number is a safe integer.

export const API_VERSION = 1;

/** Seconds of a tournament, a UTC day (`CHALLENGE_DURATION` of the contracts). */
export const TOURNAMENT_DURATION = 86400;

/** The most unsettled games an answer lists (`unsettled`); the whole count is `unsettled_count`. API v1 has no cursor for them. */
export const UNSETTLED_PAGE = 100;

/**
 * The largest tournament id the API accepts and returns (P-19): `floor((2^53 - 1) / 86400) - 1`, so that the end time
 * `(id + 1) * 86400` of the id, the largest number the API returns for it, is at most 2^53 - 1 (`Number.MAX_SAFE_INTEGER`).
 * The contracts' `day_id` is a u64; above this bound the API answers 400.
 */
export const MAX_TOURNAMENT_ID = Math.floor(Number.MAX_SAFE_INTEGER / 86400) - 1; // 104249991373

/** The block every answer is read at: the highest block checked after it was applied. */
export interface ApiHead {
  number: number;
  hash: string;
  timestamp: number;
}

export type IndexerState = "loading" | "ok" | "rewinding" | "halted";

/** The contract of a game: Challenge only since D-21 (the on-chain Tutorial's games are dropped). */
export type GameContract = "challenge";

/** Every 200 answer carries these, then the rows of its route. */
export interface Envelope {
  version: 1;
  status: "ok";
  head: ApiHead;
  /** Blocks between the served block and the node's tip. */
  behind: number;
}

/** A 4xx or 500 answer. `state` is the serving state of the indexer, `head` the served block (null when none). */
export interface ErrorAnswer {
  version: 1;
  status: "error";
  error: string;
  state: IndexerState;
  head: ApiHead | null;
}

/** A 503 answer: the indexer is not `ok`. `status` is its state. */
export interface UnavailableAnswer {
  version: 1;
  status: Exclude<IndexerState, "ok">;
  reason?: string;
  head: ApiHead | null;
}

export interface HeadAnswer extends Envelope {
  state: "ok";
  chain_id: string;
  from_block: number;
  contracts: {
    /** The game contract, `daily` before schema 11 (D-23b). */
    challenge: string;
    /**
     * Setup (D-24): the quests, the achievements and the tutorial claim; the wiring since D-25 (E). Replaces `tutorial` in
     * schema 8. `account` left in schema 9 (D-25 (E)).
     */
    setup: string;
    economy: string;
    /** null for a deployment without a Collection (before E5b). Appended in E5b. */
    collection: string | null;
    /** null for a deployment without an Arena (#643): no attack is read. Appended in schema 19. */
    arena: string | null;
  };
  checks: {
    /** Quest and achievement definitions left out of every answer: a task total of 0 or a task id repeated (P-30). */
    definitions_excluded: number;
  };
}

export interface TournamentSummary {
  id: number;
  start_time: number;
  end_time: number;
  games_spawned: number;
  /** Players ranked: those with at least one finished game that counted. */
  players: number;
  /** Best score of the day, 0 when no game counted. */
  best_score: number;
}

export interface TournamentsAnswer extends Envelope {
  tournaments: TournamentSummary[];
  /** Pass as `before` for the next page; null on the last. */
  next: number | null;
}

export interface TournamentDetail extends TournamentSummary {
  games_finished: number;
}

/** A day of Economy (the tournament id is the UTC day): its paid games and, once its first settlement closed it, its mean. */
export interface DayEconomy {
  /** Challenge games bought this day (`Purchased`). */
  games_purchased: number;
  /** Of them, the games whose score Economy has (`Recorded`), settled or not. */
  games_recorded: number;
  games_settled: number;
  /** The recorded games of the day not settled yet, by id: what `Economy.settle` takes from `(id + 2) x 86400`. The first `UNSETTLED_PAGE` only: `unsettled_count` is the whole count. */
  unsettled: number[];
  /** How many recorded games of the day are not settled yet (appended; `unsettled` holds at most `UNSETTLED_PAGE` of them). */
  unsettled_count: number;
  /** PAVED base units minted to the day's settled games, a decimal string. */
  rewards: string;
  /** `DayClosed` seen: the day's mean is fixed. */
  closed: boolean;
  /** Of `DayClosed`, points x 1,000; null until the day closes. */
  mean: number | null;
  weight: number | null;
  prior: number | null;
  ema_after: number | null;
  /** Time of the block that closed the day; null until then. */
  closed_at: number | null;
}

export interface TournamentAnswer extends Envelope {
  tournament: TournamentDetail;
  /** Appended in E3. */
  economy: DayEconomy;
}

export interface LeaderboardEntry {
  rank: number;
  player_id: string;
  best_score: number;
  best_game_id: number;
  /** Games of the player spawned in this tournament, finished or not: entries. */
  games_played: number;
  /** Games of the player that finished and counted for this tournament. */
  games_finished: number;
  /** `end_time` of the best game. */
  finished_at: number;
  /**
   * The best game is a free game (`GameSpawned.price` 0, bought with a credit): it ranks like any game, marked. Appended with
   * cobbles v1 (schema 14).
   */
  free: boolean;
  /**
   * The player's Cartridge username, from the indexer's cache only (names.ts): null until looked up, when there is none,
   * or when the lookup is off. Display only. Appended in schema 10 (N1).
   */
  name: string | null;
}

export interface LeaderboardAnswer extends Envelope {
  tournament_id: number;
  start_time: number;
  end_time: number;
  /** Players ranked. */
  total: number;
  entries: LeaderboardEntry[];
  next_offset: number | null;
}

/** A player is a wallet address (D-25 (E)): no name on chain; `name` is the off-chain Cartridge username (schema 10, N1). */
export interface PlayerInfo {
  player_id: string;
  /** As `LeaderboardEntry.name`. */
  name: string | null;
  /** Time of the block of the player's first event: GameSpawned, Purchased or a quest or achievement progress (seconds). */
  created: number;
}

export interface PlayerStats {
  challenge_games: number;
  challenge_finished: number;
  /** Best score of a finished Challenge game, 0 when none finished; `challenge_finished` says whether 0 is a real score. */
  best_score: number;
  /** Challenge games the player bought (`Purchased`). Appended in E3. */
  paid_games: number;
  /** Of them, the games settled. */
  settled_games: number;
  /** PAVED base units minted to the player's settled games, a decimal string. */
  rewards: string;
}

/** A paid game whose score Economy has and that is not settled yet: what a client or a keeper settles. */
export interface UnsettledGame {
  game_id: number;
  /** The purchase day: the game can be settled from `(day + 2) x 86400`. */
  day: number;
  /** Recorded 24 h or more after its purchase: it settles for 0. */
  expired: boolean;
}

export interface PlayerAnswer extends Envelope {
  /** null for a player the indexer does not know (200, not 404). */
  player: PlayerInfo | null;
  stats: PlayerStats | null;
  /** The player's unsettled games, oldest first, the first `UNSETTLED_PAGE` only; null for a player the indexer does not know. Appended in E3. */
  unsettled: UnsettledGame[] | null;
  /** How many games of the player are not settled yet (appended; `unsettled` holds at most `UNSETTLED_PAGE` of them); null for a player the indexer does not know. */
  unsettled_count: number | null;
}

export interface GameRow {
  contract: GameContract;
  game_id: number;
  player_id: string;
  mode: number;
  start_time: number;
  /** The day of the spawn, `GameSpawned.day_id`. */
  day_id: number;
  over: boolean;
  /** null while the game is running. */
  score: number | null;
  /** The day the game counted for, `GameOver.day_id` (0 when it ended after its day); null while running. */
  counted_day_id: number | null;
  /** 0 when the game did not count; null while running. */
  end_time: number | null;
  /** The terms and the settlement of a Challenge game bought through Economy; null for a game not bought. Appended in E3. */
  economy: GameEconomy | null;
  /**
   * The id of the game's token in `Collection` (the game id), from its mint, a
   * safe integer; null for a game spawned before the collection existed. Appended in E5b.
   */
  token_id: number | null;
  /**
   * A free game (`GameSpawned.price` 0, a credit spent): it has no `economy` (no `Purchased`, `Recorded` or `Settled`) and
   * pays no reward, and `economy: null` does not mean "not bought yet". Appended with cobbles v1 (schema 14).
   */
  free: boolean;
}

export interface GameEconomy {
  /** The purchase's UTC day. */
  day: number;
  stake: number;
  /** USDC base units, a decimal string. */
  price: string;
  /** The referrer paid, `0x` and 64 hex digits; null when the purchase had no referral. */
  referrer: string | null;
  /** USDC base units paid to the referrer, a decimal string ("0" without one). */
  referral: string;
  /** PAVED base units burned by the purchase, a decimal string. */
  burned: string;
  /** The supply factor at the purchase, bps. */
  factor: number;
  /** `R`, the reference reward, PAVED base units, a decimal string. */
  reference: string;
  /** Time of the block of the purchase. */
  purchased_at: number;
  /** Economy has the game's score (`Recorded`). */
  recorded: boolean;
  /** Recorded 24 h or more after its purchase: no reward, no mean. False until recorded. */
  expired: boolean;
  settled: boolean;
  /** The cliff the score was paid against, points x 1,000; null until settled. */
  threshold: number | null;
  /** PAVED base units minted at the settlement, a decimal string; null until settled. */
  reward: string | null;
}

export interface PlayerGamesAnswer extends Envelope {
  games: GameRow[];
  /** Pass as `before` for the next page: `<start_time>:<contract>:<game_id>`; null on the last. */
  next: string | null;
}

export interface GameAnswer extends Envelope {
  game: GameRow;
}

export interface EntryAnswer extends Envelope {
  tournament_id: number;
  /** The player's leaderboard row of that day, null when the player has no finished game that counted. */
  entry: LeaderboardEntry | null;
}

/** A task of a definition: the id the game reports and the count that completes it. */
export interface TaskTarget {
  task_id: number;
  total: number;
}

export interface QuestDefinition {
  quest_id: number;
  /** The schedule of `QuestDefined`: `end` 0 never ends; `duration` and `interval` 0 for a one-off quest. */
  start_time: number;
  end_time: number;
  duration: number;
  interval: number;
  tasks: TaskTarget[];
  /** Prerequisites as defined; the indexer does not apply them (quests.md, "Indexer"). */
  conditions: number[];
  /** Time of the block that defined it. */
  defined_at: number;
  retired: boolean;
  /** Time of the block that retired it, null while it is live. */
  retired_at: number | null;
  /** The cobbles a claim of this quest gives (`QuestCobblesSet`), 0 when none are set. Appended with cobbles v1 (schema 14). */
  cobbles: number;
  /** The kind of the cobbles' schedule: "daily" or "weekly" (its claim's period is a day or a week number); null without cobbles. */
  cobbles_kind: "daily" | "weekly" | null;
}

export interface AchievementDefinition {
  achievement_id: number;
  /** The window of `AchievementDefined`: 0 is open on that side. */
  start_time: number;
  end_time: number;
  tasks: TaskTarget[];
  /** Display only. */
  points: number;
  defined_at: number;
  retired: boolean;
  retired_at: number | null;
  /** The cobbles a claim of this achievement gives (`AchievementCobblesSet`), 0 when none are set. Appended with cobbles v1 (schema 14). */
  cobbles: number;
}

export interface DefinitionsAnswer extends Envelope {
  quests: QuestDefinition[];
  achievements: AchievementDefinition[];
}

export interface TaskProgress extends TaskTarget {
  /** The sum of the counts that counted, at most `total`. */
  count: number;
}

export interface PlayerQuest {
  quest_id: number;
  /** The interval of the schedule the day falls in (0 for a one-off quest). */
  interval_id: number;
  tasks: TaskProgress[];
  completed: boolean;
  /** Time of the block of the report that completed it; null while incomplete. */
  completed_at: number | null;
  /** Retired at the served block: what counted before stays, nothing counts after. */
  retired: boolean;
}

export interface PlayerQuestsAnswer extends Envelope {
  player_id: string;
  /** The UTC day (`timestamp / 86400`, the tournament id of the day). */
  day: number;
  start_time: number;
  end_time: number;
  /** The quests active at some time of that day, with the player's progress (zero for an unknown player). */
  quests: PlayerQuest[];
}

export interface PlayerAchievement {
  achievement_id: number;
  points: number;
  tasks: TaskProgress[];
  completed: boolean;
  completed_at: number | null;
  retired: boolean;
}

export interface PlayerAchievementsAnswer extends Envelope {
  player_id: string;
  /** The points of the completed achievements. */
  points: number;
  achievements: PlayerAchievement[];
}

/** A player's cobbles and free-game credits at the served block (cobbles v1): the running values of the chain's own events. */
export interface PlayerCobblesAnswer extends Envelope {
  player_id: string;
  /** The cobble balance, the `balance` of the last `CobblesClaimed`, `PackBought` or `SkinBought`; 0 for a player with none. */
  cobbles: number;
  /** The free-game credits left: claimed (`CreditClaimed`) less spent (`CreditSpent`). */
  credits: number;
  credits_claimed: number;
  credits_spent: number;
  /** Ids of the achievements claimed, ascending. */
  achievements_claimed: number[];
  /** The skins the player bought (`SkinBought`) and the cobbles they cost, already out of `cobbles`. Appended in schema 16. */
  skins_bought: number;
  skins_spent: number;
  /** The player's XP and level (#641), the `total` and `level` of its last `XpGained`; 0 and 1 for a player with none. Appended in schema 18. */
  xp: number;
  level: number;
}

/** A pack of Cobbles on sale (`PackSet`, the last one of its id) at the served block (cobbles v1 part 2, schema 15). */
export interface Pack {
  pack_id: number;
  cobbles: number;
  /** USDC base units, a decimal string (u128). */
  price: string;
  /** false: the owner stopped its sales; it is kept. */
  active: boolean;
}

/** The packs set by the owner, ascending by id, the inactive ones included. */
export interface PacksAnswer extends Envelope {
  packs: Pack[];
}

/** A pack a player bought (`PackBought` with its `Sold`, the same transaction). */
export interface PackPurchase {
  pack_id: number;
  cobbles: number;
  /** USDC base units paid, a decimal string. */
  price: string;
  /** The balance after it (the chain's own running value). */
  balance: number;
  /** The referrer that counted, `0x` and 64 hex digits; null when the purchase had no referral. */
  referrer: string | null;
  /** USDC base units paid to the referrer, a decimal string ("0" without one). */
  referral: string;
  /** The purchase's position: the block, the transaction's index in it and the event's index in it. */
  block: number;
  tx: number;
  idx: number;
  /** Time of the block of the purchase. */
  purchased_at: number;
}

export interface PlayerPacksAnswer extends Envelope {
  player_id: string;
  /** Newest first. */
  purchases: PackPurchase[];
  /** Pass as `before` for the next page: `<block>:<tx>:<idx>`; null on the last. */
  next: string | null;
}

/** The price of the skin of one plan in one theme (`SkinPriced`, the last of the pair) at the served block (cobbles v1 part 3, schema 16). */
export interface SkinPrice {
  theme: number;
  /** The tile plan, 1 to 19. */
  plan: number;
  /** Cobbles, 50 to 100; 0: not for sale (never priced, or withdrawn; what is owned stays owned). */
  cobbles: number;
}

/** The skin prices, ascending by theme then plan: the pairs the owner has priced, the withdrawn ones (0) included. */
export interface SkinsAnswer extends Envelope {
  /** The theme asked for; null for all of them. */
  theme: number | null;
  prices: SkinPrice[];
}

/** The skins a player owns in one theme. */
export interface OwnedSkins {
  theme: number;
  /** The plans owned, ascending. */
  plans: number[];
}

/** A player's skins at the served block: what it owns per theme (`SkinBought`) and what it shows (`SkinsActivated`, the last one). */
export interface PlayerSkinsAnswer extends Envelope {
  player_id: string;
  /** Ascending by theme; only the themes with a skin owned. */
  owned: OwnedSkins[];
  /** The 19 active themes, plan 1 first; 0 the default theme, and all zeros for a player that never activated. */
  active: number[];
}

/** What a player earned as a referrer, from the games (`Purchased`) and the packs (`Sold`), at the served block. USDC base units, decimal strings. */
export interface PlayerReferralsAnswer extends Envelope {
  player_id: string;
  /** Games and packs together. */
  total: string;
  games: { count: number; total: string };
  packs: { count: number; total: string };
}

/** An attack that ended (#643, `AttackFinished`): by its last move or a surrender. */
export interface PvpAttack {
  attacker: string;
  /** The attack's id among its attacker's (`(attacker, id)` names it, and its replay: `Arena.moves`). */
  id: number;
  defender: string;
  /** The defender is an NPC village (its address its id, 1 to 255). */
  npc: boolean;
  /** The defender's score at the start: the stars are shares of it. */
  target: number;
  /** The defender's tiles the attack played. */
  tiles: number;
  score: number;
  stars: number;
  surrendered: boolean;
  /** The crowns the attacker won (1 to 3 stars), taken from the defender; 0 otherwise. */
  gained: number;
  /** The crowns the attacker lost (0 stars), given to the defender; 0 otherwise. */
  lost: number;
  /** Times of the blocks of `AttackOpened` and `AttackFinished`. */
  opened_at: number;
  finished_at: number;
}

/**
 * A player's attacks that ended, newest first (by their end): those it made (`/players/:id/attacks`) or those on its village
 * (`/players/:id/defences`, the defence log, #647). Open and skipped attacks are left out.
 */
export interface PlayerAttacksAnswer extends Envelope {
  player_id: string;
  side: "attacker" | "defender";
  attacks: PvpAttack[];
}

/** A claim of cobbles (`CobblesClaimed`). */
export interface CobbleClaim {
  kind: "quest" | "achievement";
  /** The quest or achievement id. */
  id: number;
  /** A quest's day or week number (by its definition's `cobbles_kind`); 0 for an achievement. */
  period: number;
  cobbles: number;
  /** Time of the block of the claim. */
  claimed_at: number;
}

/** A claim of a free-game credit (`CreditClaimed`). */
export interface CreditClaim {
  kind: "daily" | "weekly";
  /** The day number (`daily`) or the week number (`weekly`, Monday to Sunday UTC, week 0 from 1970-01-05). */
  period: number;
  claimed_at: number;
}

/**
 * What a player has claimed for one UTC day: the quests of that day and of its week, the credits of that day and of its week,
 * and every achievement claim. A client shows claimed against claimable from these and the definitions.
 */
export interface PlayerClaimsAnswer extends Envelope {
  player_id: string;
  day: number;
  /** The week number the day falls in; null for a day before the first week (1970-01-01 to 1970-01-04). */
  week: number | null;
  claims: CobbleClaim[];
  credits: CreditClaim[];
}
