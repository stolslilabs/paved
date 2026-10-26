/**
 * Every query key of the app, in one place (section 3.3). The first segment is the domain (`chain` for a view call or
 * an event read, `indexer` for the indexer's API), the second the read, then its arguments. A write's receipt updates
 * the cache by these keys (`setQueryData`) and invalidates the reconciling read; nothing polls.
 *
 * Arguments are numbers and strings only: TanStack Query hashes a key with `JSON.stringify`, which refuses a bigint.
 * Addresses are normalised (`addressKey`), so `0x05f1...` and `0x5f1...` share one entry.
 */

/** An address as one key: lower-case hex with no leading zeros. */
export const addressKey = (address: string): string => `0x${BigInt(address).toString(16)}`;

export const queryKeys = {
  chain: {
    all: ["chain"] as const,
    spawnPaused: () => ["chain", "spawnPaused"] as const,
    /** `currentDay()`: the day the Challenge is on (home's top 3). */
    currentDay: () => ["chain", "currentDay"] as const,
    /** `Setup.player_level(player)`: the XP and level of the ring (#641). */
    playerLevel: (playerId: string) => ["chain", "playerLevel", addressKey(playerId)] as const,
    /** `Setup.tutorial_claimed(player)`. */
    tutorialClaimed: (playerId: string) => ["chain", "tutorialClaimed", addressKey(playerId)] as const,
    entryPrice: () => ["chain", "entryPrice"] as const,
    /** `Challenge.game(id)`. */
    game: (gameId: number) => ["chain", "game", "challenge", gameId] as const,
    /** The player's games from their `GameSpawned` and `GameOver` events. */
    playerGames: (playerId: string) => ["chain", "playerGames", addressKey(playerId)] as const,
    /** The newest of the player's games still open, read with `game(id)`. */
    activeGame: (playerId: string) => ["chain", "activeGame", addressKey(playerId)] as const,
    quote: (stake: number) => ["chain", "economy", "quote", stake] as const,
    split: () => ["chain", "economy", "split"] as const,
    /** `Economy.rate()`, the guard's swap rate (the purchase's reward estimate, #705). */
    guardRate: () => ["chain", "economy", "guardRate"] as const,
    /** The pool's `quote_swap` of `usdcIn` base units (a decimal string: see above). */
    poolQuote: (usdcIn: string) => ["chain", "economy", "poolQuote", usdcIn] as const,
    terms: (gameId: number) => ["chain", "economy", "terms", gameId] as const,
    day: (day: number) => ["chain", "economy", "day", day] as const,
    vault: (account: string) => ["chain", "economy", "vault", addressKey(account)] as const,
    usdcBalance: (account: string) => ["chain", "balance", "usdc", addressKey(account)] as const,
    pavedBalance: (account: string) => ["chain", "balance", "paved", addressKey(account)] as const,
    /** PvP v2 (#741): the free village, the inventory, the chests, the shop, the attack. Served by the mock until step 3 (#742, #743). */
    v2: {
      all: ["chain", "v2"] as const,
      /** The village's layout, its score, the player's level and slots (a rival's too). */
      village: (playerId: string) => ["chain", "v2", "village", addressKey(playerId)] as const,
      /** The tiles held, by plan. */
      inventory: (playerId: string) => ["chain", "v2", "inventory", addressKey(playerId)] as const,
      /** The chests waiting, the one open, the day's PvP chests. */
      chests: (playerId: string) => ["chain", "v2", "chests", addressKey(playerId)] as const,
      /** The day's 3 offers and what the player bought of them. */
      shop: (playerId: string, day: number) => ["chain", "v2", "shop", addressKey(playerId), day] as const,
      /** The opponent drawn and the attack, the open one or the last. */
      attack: (attacker: string) => ["chain", "v2", "attack", addressKey(attacker)] as const,
      /** One attack of the attacker by its id, open or ended: its result's page (#790). */
      attackOf: (attacker: string, id: number) => ["chain", "v2", "attack-of", addressKey(attacker), id] as const,
      /** The player's ended attacks and the attacks on their village, newest first, each with its snapshot (#786). */
      matches: (playerId: string) => ["chain", "v2", "matches", addressKey(playerId)] as const,
    },
  },
  indexer: {
    all: ["indexer"] as const,
    /** `/v1/players/:id`. */
    player: (playerId: string) => ["indexer", "player", addressKey(playerId)] as const,
    /** `/v1/players/:id/games`, the first page. */
    playerGames: (playerId: string, limit: number) => ["indexer", "playerGames", addressKey(playerId), limit] as const,
    /** `/v1/games/:contract/:id`. */
    game: (gameId: number) => ["indexer", "game", "challenge", gameId] as const,
    definitions: () => ["indexer", "definitions"] as const,
    /** `/v1/players/:id/quests?day=`. */
    quests: (playerId: string, day: number) => ["indexer", "quests", addressKey(playerId), day] as const,
    /** `/v1/players/:id/achievements`. */
    achievements: (playerId: string) => ["indexer", "achievements", addressKey(playerId)] as const,
  },
};
