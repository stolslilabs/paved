// Copied from Grim World, indexer/src/events.ts (https://github.com/bal7hazar/grimworld, commit e405340684e4202440a97a4073fcd2bc43ca49d7),
// Apache-2.0. Adapted for Paved: `canonical`, `felt`, the selector table builder and `DecodeError` are kept; the nine
// Grim World decoders and the market key decoder are replaced by the Paved decoders (the games, the quests and
// achievements, Setup's wiring, Economy and Collection) and the list of the events of the contracts that are known and not
// indexed. This copy is maintained by
// the Paved repository.
//
// The events of the indexer (docs/architecture/indexer.md, contracts/abis/*.json): the first key is the selector of
// the event's name (Economy's own `Event` variants are not flat: they are named as their structs, so the selector is the
// struct's name too; its ownable and upgradeable components are flat, their events keep their own names); then the declared keys, then the data, in the declared order. Decoding is strict: a selector of no
// list, a count of keys or data that differs, or a value wider than its type is a DecodeError, and the indexer halts on
// it (it never guesses). The events of the contracts that are not indexed (the board events, the past prize events, the past
// player registry of Account, ownership) are known by name and skipped; any other selector is a contract change the indexer was not told about.
import { hash } from "starknet";
import { MAX_TOURNAMENT_ID } from "./api.ts";

/**
 * The four contracts whose events are read: `challenge` plays, `setup` holds the quests and the achievements (D-24: the
 * definitions, Challenge's reports at game over, and the player's tutorial claim, D-21) and the wiring (D-25 (E):
 * `EconomySet`, `CollectionSet`), `economy` holds the terms, the scores and the settlements of the paid Challenge games
 * (docs/architecture/economy.md, "Events"), and `collection` mints the game NFTs (economy.md, section 9). The on-chain
 * Tutorial left with D-21 and Account with D-25 (E): their addresses are no longer read. A player is a wallet address.
 */
export type Source = "challenge" | "setup" | "economy" | "collection";

export const SOURCES: readonly Source[] = ["challenge", "setup", "economy", "collection"];

/**
 * A past Tutorial game's token id was `TUTORIAL_OFFSET + game id`; a Challenge game's is its game id (`Collection`). The
 * Tutorial's games are dropped (D-21): a mint of a token id from here on is skipped, so that a replay of an older
 * history never halts.
 */
export const TUTORIAL_OFFSET = 2n ** 32n;
/** The first token id that belongs to no game contract, past or present. */
export const TOKEN_LIMIT = 2n ** 33n;

export class DecodeError extends Error {}

/**
 * The `mode` of each game contract (`public-interface.md`). 2 was Weekly and 3 the on-chain Tutorial (D-21): never given
 * again.
 */
export const MODE: Record<"challenge", number> = {
  challenge: 1,
};

export type Decoded =
  | {
      name: "GameSpawned";
      gameId: number;
      playerId: bigint;
      mode: number;
      dayId: bigint;
      startTime: bigint;
      price: bigint;
    }
  | {
      name: "GameOver";
      gameId: number;
      playerId: bigint;
      dayId: bigint;
      mode: number;
      score: number;
      startTime: bigint;
      endTime: bigint;
    }
  | {
      name: "QuestDefined";
      questId: number;
      start: bigint;
      end: bigint;
      duration: number;
      interval: number;
      tasks: TaskTarget[];
      conditions: number[];
    }
  | { name: "QuestProgressed"; playerId: bigint; taskId: number; count: number }
  | { name: "QuestRetired"; questId: number }
  | {
      name: "AchievementDefined";
      achievementId: number;
      start: bigint;
      end: bigint;
      tasks: TaskTarget[];
      points: number;
    }
  | { name: "AchievementProgressed"; playerId: bigint; taskId: number; count: number }
  | { name: "AchievementRetired"; achievementId: number }
  | {
      name: "Purchased";
      gameId: number;
      playerId: bigint;
      day: bigint;
      stake: number;
      /** USDC base units (u256). */
      price: bigint;
      /** 0 when the purchase had no referral. */
      referrer: bigint;
      referral: bigint;
      burnedQuote: bigint;
      /** PAVED base units burned (u256). */
      burned: bigint;
      margin: bigint;
      supply: bigint;
      /** The supply factor, bps. */
      factor: number;
      /** `R`, PAVED base units (u128). */
      reference: bigint;
      /** PAVED base units the margin bought, sent to the Vault without shares (u256, P-56). */
      vaultPaved: bigint;
    }
  | {
      /** The mint of a game's token (`Collection` emits no other transfer: it is soulbound). */
      name: "Transfer";
      /** The player the token was minted to. */
      to: bigint;
      /** Below 2^33, so exact as a JSON number. */
      tokenId: number;
      /** The game contract the token id belongs to, and the game id in it. */
      contract: "challenge";
      gameId: number;
    }
  | {
      /** Setup's registry of the Economy address (`Setup.set_economy`, D-25 (E); Account's before). */
      name: "EconomySet";
      economy: bigint;
    }
  | {
      /** Setup's registry of the Collection address (`Setup.set_collection`, D-25 (E); Account's before). */
      name: "CollectionSet";
      collection: bigint;
    }
  | {
      /** The owner's cobbles for a quest (0: removed). `kind` 1 daily, 2 weekly, 0 when removed from a quest that had none. */
      name: "QuestCobblesSet";
      questId: number;
      cobbles: number;
      kind: number;
    }
  | { name: "AchievementCobblesSet"; achievementId: number; cobbles: number }
  | {
      /**
       * A claim of cobbles: `kind` 1 a quest (`period`: its day or week number), 2 an achievement (`period` 0), 3 a star
       * of a Story level paid by `Story` (`id` `(campaign_id << 8) | level_id`, `period` the star, 1 to 3;
       * `docs/architecture/story-mode.md`). `balance`: the player's cobbles after it.
       */
      name: "CobblesClaimed";
      playerId: bigint;
      kind: number;
      id: number;
      period: bigint;
      cobbles: number;
      balance: bigint;
    }
  | {
      /** A claim of a free-game credit: `kind` 1 a day, 2 a week. `credits`: the player's credits after it. */
      name: "CreditClaimed";
      playerId: bigint;
      kind: number;
      period: bigint;
      credits: number;
    }
  | {
      /** A credit spent on the free game `gameId`. `credits`: the player's credits after it. */
      name: "CreditSpent";
      playerId: bigint;
      gameId: number;
      credits: number;
    }
  | {
      /** The owner's pack (`Setup.set_pack`, cobbles-v1.md 2.2); `active` false stops its sales. */
      name: "PackSet";
      packId: number;
      cobbles: number;
      /** USDC base units (u128). */
      price: bigint;
      active: boolean;
    }
  | {
      /** A pack bought, after its `Sold` in the same transaction. `balance`: the player's cobbles after it. */
      name: "PackBought";
      playerId: bigint;
      packId: number;
      cobbles: number;
      /** USDC base units (u128). */
      price: bigint;
      /** The referrer that counted; 0 when none. */
      referrer: bigint;
      balance: bigint;
    }
  | {
      /** The owner's price of the skin of `plan` in `theme` (`Setup.set_skin_price`, cobbles-v1.md 5.2); 0 withdraws it from sale. */
      name: "SkinPriced";
      theme: number;
      plan: number;
      cobbles: number;
    }
  | {
      /** A skin bought for the player itself, once. `cobbles`: its price. `balance`: the player's cobbles after it. */
      name: "SkinBought";
      playerId: bigint;
      theme: number;
      plan: number;
      cobbles: number;
      balance: bigint;
    }
  | {
      /** The player's active skins after a `set_skins`: the whole packed word and its `SKIN_PLANS` themes, plan 1 first (0: the default). */
      name: "SkinsActivated";
      playerId: bigint;
      active: bigint;
      themes: number[];
    }
  | {
      /** Economy's split of a pack's USDC (`Economy.sell`), emitted before `PackBought` in the same transaction. */
      name: "Sold";
      playerId: bigint;
      price: bigint;
      referrer: bigint;
      referral: bigint;
      burnedQuote: bigint;
      burned: bigint;
      margin: bigint;
      supply: bigint;
      vaultPaved: bigint;
    }
  | { name: "Recorded"; gameId: number; score: number; expired: boolean }
  | {
      name: "DayClosed";
      day: bigint;
      /** Points x 1,000. */
      mean: bigint;
      weight: number;
      prior: bigint;
      emaAfter: bigint;
    }
  | {
      name: "Settled";
      gameId: number;
      playerId: bigint;
      day: bigint;
      score: number;
      /** Milli-points. */
      threshold: bigint;
      /** PAVED base units minted (u128). */
      reward: bigint;
    };

/** One task of a quest or an achievement: the id the game reports, and the count that completes it. */
export type TaskTarget = { taskId: number; total: number };

/** quiver 0.2.0 (`MAX_TASKS`, `MAX_CONDITIONS`): a definition holds 1 to 3 tasks and at most 7 prerequisites. */
export const MAX_TASKS = 3;
export const MAX_CONDITIONS = 7;
/** The highest pack id `Setup.set_pack` takes (cobbles-v1.md 2.2: 1 to 8). */
export const MAX_PACK_ID = 8;
/** The tile plans that have a skin: the `Plan` codes 1 to 19 (`Setup`'s `PLANS`, cobbles-v1.md 5.1). */
export const SKIN_PLANS = 19;
/** The price of a skin when set, in cobbles (`SKIN_PRICE_MIN` and `SKIN_PRICE_MAX` of `Setup`); 0 withdraws it. */
export const SKIN_PRICE_MIN = 50;
export const SKIN_PRICE_MAX = 100;

/**
 * The themes of a `SkinsActivated` word (`Setup`'s `active_word`): the theme of plan `p` in byte `p - 1`, 19 bytes, plan 1
 * first. A word wider than 152 bits is not one the contract writes.
 */
export function unpackSkins(word: bigint): number[] {
  if (word < 0n || word >= 1n << BigInt(8 * SKIN_PLANS)) {
    throw new DecodeError(`active word ${word} is wider than ${SKIN_PLANS} bytes`);
  }
  return Array.from({ length: SKIN_PLANS }, (_, i) => Number((word >> BigInt(8 * i)) & 0xffn));
}

/** A theme (1 to 255) and a plan (1 to `SKIN_PLANS`) as `set_skin_price` and `buy_skin` take them. */
function skin(name: EventName, theme: string | undefined, plan: string | undefined) {
  const t = small(theme, 8, "theme");
  const p = small(plan, 8, "plan");
  if (t === 0) throw new DecodeError(`${name}: theme 0 is the default, it has no skin`);
  if (p === 0 || p > SKIN_PLANS) throw new DecodeError(`${name}: plan ${p}, expected 1 to ${SKIN_PLANS}`);
  return { theme: t, plan: p };
}

export type EventName = Decoded["name"];

/** Which contract emits each indexed event. */
export const EMITTERS: Record<EventName, readonly Source[]> = {
  GameSpawned: ["challenge"],
  GameOver: ["challenge"],
  // Setup's wiring (D-25 (E)): the store compares it with the deployment file (store.ts). Account emitted it before; its
  // address is no longer read, so its past wiring events are never seen.
  EconomySet: ["setup"],
  CollectionSet: ["setup"],
  // Quests and achievements come from Setup only (D-24): its definitions, Challenge's reports and the tutorial claim.
  // From Challenge they are past events, skipped (`PAST_FROM`).
  QuestDefined: ["setup"],
  QuestProgressed: ["setup"],
  QuestRetired: ["setup"],
  AchievementDefined: ["setup"],
  AchievementProgressed: ["setup"],
  AchievementRetired: ["setup"],
  // Cobbles v1 (cobbles-v1.md, 6.2): Setup's cobble amounts, claims and free-game credits.
  QuestCobblesSet: ["setup"],
  AchievementCobblesSet: ["setup"],
  CobblesClaimed: ["setup"],
  CreditClaimed: ["setup"],
  CreditSpent: ["setup"],
  // Cobbles v1 part 2 (cobbles-v1.md, 2): the packs and their sales. SellerSet is owner configuration, skipped by name.
  PackSet: ["setup"],
  PackBought: ["setup"],
  // Cobbles v1 part 3 (cobbles-v1.md, 5): the skins, priced, bought and activated.
  SkinPriced: ["setup"],
  SkinBought: ["setup"],
  SkinsActivated: ["setup"],
  Sold: ["economy"],
  Purchased: ["economy"],
  Recorded: ["economy"],
  DayClosed: ["economy"],
  Settled: ["economy"],
  Transfer: ["collection"],
};

/** Events of the contracts' ABIs that are not indexed in v1 (indexer.md, "Not indexed"). */
export const IGNORED = [
  "Built",
  "Discarded",
  "Scored",
  "OwnershipTransferStarted",
  "OwnershipTransferred",
  "Upgraded",
  // Quests and achievements of quiver 0.2.0 that Paved never emits: quests are in event mode (no completion, no claim).
  "QuestCompleted",
  "QuestClaimed",
  // Setup's owner allowlists a reporter (`set_reporter`, D-24: Challenge): it sets both components.
  "QuestReporterSet",
  "AchievementReporterSet",
  // Economy's owner events (its constructor emits EconomyConfigured and PoolSet).
  "EconomyConfigured",
  "PoolSet",
  "GameSet",
  // The owner's choice of the one account that may call `Economy.sell` (`set_seller`, cobbles-v1.md 2.3): Setup. No screen shows it.
  "SellerSet",
  // The owner's repoint of the router (E-9, set_router).
  "RouterSet",
  // The owner's one-time wiring of Collection's minters (`Collection.set_minters`, G7a): data `[challenge, tutorial]`, no keys. No screen shows the minters.
  "MintersSet",
  // The prize of a day (D-20 removed it): `Challenge.sponsor`, `Challenge.claim` of a rank, and a sponsor's reclaim (P-37, declared
  // by the Lobby class, emitted from Challenge's address). Past events only: the ABIs no longer declare them, and a replay of
  // a history that holds them skips them (public-interface.md, "Past events").
  "Sponsored",
  "Claimed",
  "Reclaimed",
  // The owner's change of the Lobby class of Challenge or Tutorial (P-42, set_lobby_class). Past events only: D-24 removed
  // the Lobby class and its setter.
  "LobbyClassSet",
  // The owner's wiring of Challenge to Setup (D-24, `Challenge.set_setup`): where Challenge reports; the indexer reads Setup's address
  // from the deployment file.
  "SetupSet",
  // Account's player registry (D-25 (E) removed Account: a player is the wallet address, names are off-chain). Past events
  // only. Account's address is no longer read; the game contract's ABI declared it too until D-23b (the shared game events), so a history that
  // holds one from a source still read skips it by name and never halts.
  "PlayerCreated",
  // Challenge's spawn pause (G4, a mainnet gate): the owner sets a guardian, the guardian or the owner pauses new games, the owner
  // unpauses. The leaderboard needs none of them: a game already bought is recorded and settled while spawn is paused, and a
  // paused spawn emits no `GameSpawned`. Known by name so that the strict decoder never halts on a Challenge that emits them.
  "GuardianSet",
  "SpawnPaused",
  "SpawnUnpaused",
] as const;

/**
 * Indexed events that a source emitted before D-21 and D-24 and no longer does: Challenge's own quests and achievements
 * (before Setup). A replay of such a history skips them (Sepolia's past progress is not carried over, P-51 ruling 5).
 * The Tutorial's address is not read at all.
 */
const PAST_FROM: Partial<Record<Source, readonly EventName[]>> = {
  challenge: [
    "QuestDefined",
    "QuestProgressed",
    "QuestRetired",
    "AchievementDefined",
    "AchievementProgressed",
    "AchievementRetired",
  ],
};

const INDEXED: readonly EventName[] = [
  "GameSpawned",
  "GameOver",
  "EconomySet",
  "CollectionSet",
  "QuestDefined",
  "QuestProgressed",
  "QuestRetired",
  "AchievementDefined",
  "AchievementProgressed",
  "AchievementRetired",
  "QuestCobblesSet",
  "AchievementCobblesSet",
  "CobblesClaimed",
  "CreditClaimed",
  "CreditSpent",
  "PackSet",
  "PackBought",
  "SkinPriced",
  "SkinBought",
  "SkinsActivated",
  "Sold",
  "Purchased",
  "Recorded",
  "DayClosed",
  "Settled",
  "Transfer",
];

/** Selector (a lowercase 0x hex without leading zeros) of every event name of the contracts. */
export const SELECTORS = Object.fromEntries(
  [...INDEXED, ...IGNORED].map((name) => [
    name,
    canonical(hash.getSelectorFromName(name)),
  ]),
) as Record<EventName | (typeof IGNORED)[number], string>;

const indexedBySelector = new Map<string, EventName>(
  INDEXED.map((name) => [SELECTORS[name], name]),
);
const ignoredSelectors = new Set<string>(IGNORED.map((name) => SELECTORS[name]));

const FELT_PRIME = 2n ** 251n + 17n * 2n ** 192n + 1n;

/** A felt from its JSON-RPC form (0x hex); anything else is a DecodeError. */
export function felt(value: string | undefined): bigint {
  if (value === undefined || !/^0x[0-9a-fA-F]{1,64}$/.test(value)) {
    throw new DecodeError(`${JSON.stringify(value)} is not a felt`);
  }
  const number = BigInt(value);
  if (number >= FELT_PRIME) throw new DecodeError(`${value} is not a felt`);
  return number;
}

/** The canonical text of a felt: lowercase 0x hex, no leading zeros. */
export function canonical(value: string | bigint): string {
  return `0x${BigInt(value).toString(16)}`;
}

/** A felt as the API and the tables write it: lowercase 0x hex, zero-padded to 66 characters. */
export function padded(value: string | bigint): string {
  return `0x${BigInt(value).toString(16).padStart(64, "0")}`;
}

function uint(value: string | undefined, bits: number, field: string): bigint {
  const number = felt(value);
  if (number >= 1n << BigInt(bits)) {
    throw new DecodeError(`${field} ${value} is wider than u${bits}`);
  }
  return number;
}
const small = (value: string | undefined, bits: 8 | 16 | 32, field: string) =>
  Number(uint(value, bits, field));

/** A u256 from its two felts, low then high (each a u128). */
function u256(data: readonly string[], at: number, field: string): bigint {
  return uint(data[at], 128, `${field}.low`) + (uint(data[at + 1], 128, `${field}.high`) << 128n);
}

function bool(value: string | undefined, field: string): boolean {
  const number = felt(value);
  if (number > 1n) throw new DecodeError(`${field} ${value} is not a bool`);
  return number === 1n;
}

function shape(
  name: EventName,
  keys: readonly string[],
  data: readonly string[],
  keyCount: number,
  dataCount: number,
) {
  if (keys.length !== 1 + keyCount || data.length !== dataCount) {
    throw new DecodeError(
      `${name}: ${keys.length - 1} keys and ${data.length} data, expected ${keyCount} and ${dataCount}`,
    );
  }
}

/** Times and ids are read as u64 and must stay exact as JSON numbers and SQLite integers (below 2^53). */
function safe(value: bigint, field: string): bigint {
  if (value > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new DecodeError(`${field} ${value} is above 2^53`);
  }
  return value;
}

/**
 * A day id (`day_id`, or an Economy day, the same UTC day id): at most `MAX_TOURNAMENT_ID`, the API's bound, so that no
 * indexed day can exceed it.
 */
function dayId(value: string | undefined, field = "day_id"): bigint {
  const id = uint(value, 64, field);
  if (id > BigInt(MAX_TOURNAMENT_ID)) {
    throw new DecodeError(`${field} ${id} is above the API bound ${MAX_TOURNAMENT_ID}`);
  }
  return id;
}

/** A u64 that the API serves as a JSON number: below 2^53. */
const u64 = (value: string | undefined, field: string) => safe(uint(value, 64, field), field);

/**
 * `count` then that many `[task_id, total]` pairs from `data` at `at` (a serialized `Span<QuestTask>` or
 * `Span<AchievementTask>`): the tasks and the index after them.
 */
function tasksAt(
  name: EventName,
  data: readonly string[],
  at: number,
): { tasks: TaskTarget[]; next: number } {
  const count = small(data[at], 8, "tasks length");
  if (count < 1 || count > MAX_TASKS) {
    throw new DecodeError(`${name}: ${count} tasks, expected 1 to ${MAX_TASKS}`);
  }
  const tasks: TaskTarget[] = [];
  for (let i = 0; i < count; i++) {
    const taskId = small(data[at + 1 + 2 * i], 32, "task_id");
    if (taskId === 0) throw new DecodeError(`${name}: task id 0`);
    tasks.push({ taskId, total: small(data[at + 2 + 2 * i], 32, "total") });
  }
  return { tasks, next: at + 1 + 2 * count };
}

/** The data of a progress event: `count` (u32); the keys are the player and the task. */
function progressed(
  name: "QuestProgressed" | "AchievementProgressed",
  keys: readonly string[],
  data: readonly string[],
) {
  shape(name, keys, data, 2, 1);
  const taskId = small(keys[2], 32, "task_id");
  if (taskId === 0) throw new DecodeError(`${name}: task id 0`);
  return {
    name,
    playerId: felt(keys[1]),
    taskId,
    count: small(data[0], 32, "count"),
  } as const;
}

/**
 * The event of `source` with these raw keys and data; null for an event of the contract that is known and not
 * indexed; a DecodeError for anything else (unknown selector, wrong contract, wrong shape).
 */
export function decode(
  source: Source,
  keys: readonly string[],
  data: readonly string[],
): Decoded | null {
  const selector = keys[0] === undefined ? undefined : canonical(felt(keys[0]));
  if (selector !== undefined && ignoredSelectors.has(selector)) return null;
  const name = selector === undefined ? undefined : indexedBySelector.get(selector);
  if (name === undefined) {
    throw new DecodeError(
      `unknown event of ${source}: selector ${selector ?? "(none)"}`,
    );
  }
  if (PAST_FROM[source]?.includes(name)) return null;
  if (!EMITTERS[name].includes(source)) {
    throw new DecodeError(`${name} emitted by ${source}, which does not emit it`);
  }
  switch (name) {
    case "GameSpawned":
      shape(name, keys, data, 2, 4);
      return {
        name,
        gameId: small(keys[1], 32, "game_id"),
        playerId: felt(keys[2]),
        mode: small(data[0], 8, "mode"),
        dayId: dayId(data[1]),
        startTime: safe(uint(data[2], 64, "start_time"), "start_time"),
        price: felt(data[3]),
      };
    case "GameOver":
      shape(name, keys, data, 3, 4);
      return {
        name,
        gameId: small(keys[1], 32, "game_id"),
        playerId: felt(keys[2]),
        dayId: dayId(keys[3]),
        mode: small(data[0], 8, "mode"),
        score: small(data[1], 32, "score"),
        startTime: safe(uint(data[2], 64, "start_time"), "start_time"),
        endTime: safe(uint(data[3], 64, "end_time"), "end_time"),
      };
    case "EconomySet":
      // The address is the only member, and not a key.
      shape(name, keys, data, 0, 1);
      return { name, economy: felt(data[0]) };
    case "CollectionSet":
      shape(name, keys, data, 0, 1);
      return { name, collection: felt(data[0]) };
    case "QuestDefined": {
      // key quest_id; data start, end, duration, interval, tasks (length, pairs), conditions (length, ids)
      if (keys.length !== 2 || data.length < 6) {
        throw new DecodeError(
          `${name}: ${keys.length - 1} keys and ${data.length} data, expected 1 key and at least 6 data`,
        );
      }
      const { tasks, next } = tasksAt(name, data, 4);
      const length = small(data[next], 8, "conditions length");
      if (length > MAX_CONDITIONS) {
        throw new DecodeError(`${name}: ${length} conditions, expected at most ${MAX_CONDITIONS}`);
      }
      if (data.length !== next + 1 + length) {
        throw new DecodeError(`${name}: ${data.length} data, expected ${next + 1 + length}`);
      }
      return {
        name,
        questId: small(keys[1], 32, "quest_id"),
        start: safe(uint(data[0], 64, "start"), "start"),
        end: safe(uint(data[1], 64, "end"), "end"),
        duration: small(data[2], 32, "duration"),
        interval: small(data[3], 32, "interval"),
        tasks,
        conditions: Array.from({ length }, (_, i) => small(data[next + 1 + i], 32, "condition")),
      };
    }
    case "QuestProgressed":
      return progressed(name, keys, data);
    case "QuestRetired":
      shape(name, keys, data, 1, 0);
      return { name, questId: small(keys[1], 32, "quest_id") };
    case "AchievementDefined": {
      // key achievement_id; data start, end, tasks (length, pairs), points (u16)
      if (keys.length !== 2 || data.length < 5) {
        throw new DecodeError(
          `${name}: ${keys.length - 1} keys and ${data.length} data, expected 1 key and at least 5 data`,
        );
      }
      const { tasks, next } = tasksAt(name, data, 2);
      if (data.length !== next + 1) {
        throw new DecodeError(`${name}: ${data.length} data, expected ${next + 1}`);
      }
      return {
        name,
        achievementId: small(keys[1], 32, "achievement_id"),
        start: safe(uint(data[0], 64, "start"), "start"),
        end: safe(uint(data[1], 64, "end"), "end"),
        tasks,
        points: small(data[next], 16, "points"),
      };
    }
    case "AchievementProgressed":
      return progressed(name, keys, data);
    case "AchievementRetired":
      shape(name, keys, data, 1, 0);
      return { name, achievementId: small(keys[1], 32, "achievement_id") };
    case "QuestCobblesSet": {
      shape(name, keys, data, 1, 2);
      const kind = small(data[1], 8, "kind");
      if (kind > 2) throw new DecodeError(`${name}: kind ${kind}, expected 0 to 2`);
      return { name, questId: small(keys[1], 32, "quest_id"), cobbles: small(data[0], 8, "cobbles"), kind };
    }
    case "AchievementCobblesSet":
      shape(name, keys, data, 1, 1);
      return { name, achievementId: small(keys[1], 32, "achievement_id"), cobbles: small(data[0], 8, "cobbles") };
    case "CobblesClaimed": {
      // key player_id; data kind, id, period, cobbles, balance
      shape(name, keys, data, 1, 5);
      const kind = small(data[0], 8, "kind");
      if (kind !== 1 && kind !== 2 && kind !== 3) throw new DecodeError(`${name}: kind ${kind}, expected 1, 2 or 3`);
      return {
        name,
        playerId: felt(keys[1]),
        kind,
        id: small(data[1], 32, "id"),
        period: u64(data[2], "period"),
        cobbles: small(data[3], 8, "cobbles"),
        balance: u64(data[4], "balance"),
      };
    }
    case "CreditClaimed": {
      // key player_id; data kind, period, credits
      shape(name, keys, data, 1, 3);
      const kind = small(data[0], 8, "kind");
      if (kind !== 1 && kind !== 2) throw new DecodeError(`${name}: kind ${kind}, expected 1 or 2`);
      return {
        name,
        playerId: felt(keys[1]),
        kind,
        period: u64(data[1], "period"),
        credits: small(data[2], 16, "credits"),
      };
    }
    case "CreditSpent":
      shape(name, keys, data, 1, 2);
      return {
        name,
        playerId: felt(keys[1]),
        gameId: small(data[0], 32, "game_id"),
        credits: small(data[1], 16, "credits"),
      };
    case "PackSet": {
      // key pack_id; data cobbles (u32), price (u128), active
      shape(name, keys, data, 1, 3);
      const packId = small(keys[1], 8, "pack_id");
      if (packId === 0 || packId > MAX_PACK_ID) {
        throw new DecodeError(`${name}: pack id ${packId}, expected 1 to ${MAX_PACK_ID}`);
      }
      return {
        name,
        packId,
        cobbles: small(data[0], 32, "cobbles"),
        price: uint(data[1], 128, "price"),
        active: bool(data[2], "active"),
      };
    }
    case "PackBought": {
      // key player_id; data pack_id (u8), cobbles (u32), price (u128), referrer, balance (u64)
      shape(name, keys, data, 1, 5);
      const packId = small(data[0], 8, "pack_id");
      if (packId === 0 || packId > MAX_PACK_ID) {
        throw new DecodeError(`${name}: pack id ${packId}, expected 1 to ${MAX_PACK_ID}`);
      }
      return {
        name,
        playerId: felt(keys[1]),
        packId,
        cobbles: small(data[1], 32, "cobbles"),
        price: uint(data[2], 128, "price"),
        referrer: felt(data[3]),
        balance: u64(data[4], "balance"),
      };
    }
    case "SkinPriced": {
      // keys theme, plan; data cobbles (u8): 0 or 50 to 100
      shape(name, keys, data, 2, 1);
      const cobbles = small(data[0], 8, "cobbles");
      if (cobbles !== 0 && (cobbles < SKIN_PRICE_MIN || cobbles > SKIN_PRICE_MAX)) {
        throw new DecodeError(`${name}: price ${cobbles}, expected 0 or ${SKIN_PRICE_MIN} to ${SKIN_PRICE_MAX}`);
      }
      return { name, ...skin(name, keys[1], keys[2]), cobbles };
    }
    case "SkinBought": {
      // key player_id; data theme (u8), plan (u8), cobbles (u8), balance (u64). A skin sold has a price of 50 to 100.
      shape(name, keys, data, 1, 4);
      const cobbles = small(data[2], 8, "cobbles");
      if (cobbles < SKIN_PRICE_MIN || cobbles > SKIN_PRICE_MAX) {
        throw new DecodeError(`${name}: price ${cobbles}, expected ${SKIN_PRICE_MIN} to ${SKIN_PRICE_MAX}`);
      }
      return {
        name,
        playerId: felt(keys[1]),
        ...skin(name, data[0], data[1]),
        cobbles,
        balance: u64(data[3], "balance"),
      };
    }
    case "SkinsActivated": {
      // key player_id; data active (felt252): 19 bytes, the theme of plan p in byte p - 1
      shape(name, keys, data, 1, 1);
      const active = felt(data[0]);
      return { name, playerId: felt(keys[1]), active, themes: unpackSkins(active) };
    }
    case "Sold":
      // key player_id; data price, referrer, referral, burned_quote, burned, margin, supply, vault_paved (u256 each, but the referrer)
      shape(name, keys, data, 1, 15);
      return {
        name,
        playerId: felt(keys[1]),
        price: u256(data, 0, "price"),
        referrer: felt(data[2]),
        referral: u256(data, 3, "referral"),
        burnedQuote: u256(data, 5, "burned_quote"),
        burned: u256(data, 7, "burned"),
        margin: u256(data, 9, "margin"),
        supply: u256(data, 11, "supply"),
        vaultPaved: u256(data, 13, "vault_paved"),
      };
    case "Purchased":
      // keys game_id, player_id; data day, stake, price (u256), referrer, referral, burned_quote, burned, margin,
      // supply (u256 each), factor, reference, vault_paved (u256, P-56)
      shape(name, keys, data, 2, 19);
      return {
        name,
        gameId: small(keys[1], 32, "game_id"),
        playerId: felt(keys[2]),
        day: dayId(data[0], "day"),
        stake: small(data[1], 8, "stake"),
        price: u256(data, 2, "price"),
        referrer: felt(data[4]),
        referral: u256(data, 5, "referral"),
        burnedQuote: u256(data, 7, "burned_quote"),
        burned: u256(data, 9, "burned"),
        margin: u256(data, 11, "margin"),
        supply: u256(data, 13, "supply"),
        factor: small(data[15], 32, "factor"),
        reference: uint(data[16], 128, "reference"),
        vaultPaved: u256(data, 17, "vault_paved"),
      };
    case "Transfer": {
      // keys from, to, token_id (u256: low, high); no data. Only the mint (from 0) exists on this contract.
      shape(name, keys, data, 4, 0);
      if (felt(keys[1]) !== 0n) {
        throw new DecodeError(`${name}: a transfer from ${keys[1]}, the collection only mints`);
      }
      const tokenId = u256(keys, 3, "token_id");
      if (tokenId >= TOKEN_LIMIT) {
        throw new DecodeError(`${name}: token id ${tokenId} belongs to no game contract`);
      }
      // A past Tutorial game's token (D-21 dropped those games): skipped.
      if (tokenId >= TUTORIAL_OFFSET) return null;
      if (tokenId === 0n) throw new DecodeError(`${name}: token id ${tokenId} is the game id 0`);
      return {
        name,
        to: felt(keys[2]),
        tokenId: Number(tokenId),
        contract: "challenge",
        gameId: Number(tokenId),
      };
    }
    case "Recorded":
      shape(name, keys, data, 1, 2);
      return {
        name,
        gameId: small(keys[1], 32, "game_id"),
        score: small(data[0], 32, "score"),
        expired: bool(data[1], "expired"),
      };
    case "DayClosed":
      shape(name, keys, data, 1, 4);
      return {
        name,
        day: dayId(keys[1], "day"),
        mean: u64(data[0], "mean"),
        weight: small(data[1], 32, "weight"),
        prior: u64(data[2], "prior"),
        emaAfter: u64(data[3], "ema_after"),
      };
    case "Settled":
      shape(name, keys, data, 2, 4);
      return {
        name,
        gameId: small(keys[1], 32, "game_id"),
        playerId: felt(keys[2]),
        day: dayId(data[0], "day"),
        score: small(data[1], 32, "score"),
        threshold: u64(data[2], "threshold"),
        reward: uint(data[3], 128, "reward"),
      };
  }
}
