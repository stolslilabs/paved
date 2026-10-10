// Copied from Grim World, indexer/src/events.ts (https://github.com/bal7hazar/grimworld, commit e405340684e4202440a97a4073fcd2bc43ca49d7),
// Apache-2.0. Adapted for Paved: `canonical`, `felt`, the selector table builder and `DecodeError` are kept; the nine
// Grim World decoders and the market key decoder are replaced by the three Paved decoders (GameSpawned, GameOver,
// PlayerCreated) and the list of the events of the contracts that are known and not indexed. This copy is maintained by
// the Paved repository.
//
// The events of the indexer (docs/architecture/indexer.md, contracts/abis/*.json): the first key is the selector of
// the event's name (Economy's `Event` enum is not flat: its variants are named as their structs, so the selector is the
// struct's name too); then the declared keys, then the data, in the declared order. Decoding is strict: a selector of no
// list, a count of keys or data that differs, or a value wider than its type is a DecodeError, and the indexer halts on
// it (it never guesses). The events of the contracts that are not indexed (the board events, claims, ownership) are
// known by name and skipped; any other selector is a contract change the indexer was not told about.
import { hash } from "starknet";
import { MAX_TOURNAMENT_ID } from "./api.ts";

/**
 * The five contracts whose events are read: `daily` and `tutorial` play, `account` registers players, `economy` holds the
 * terms, the scores and the settlements of the paid Daily games (docs/architecture/economy.md, "Events"), and `collection`
 * mints the game NFTs (economy.md, section 9).
 */
export type Source = "daily" | "tutorial" | "account" | "economy" | "collection";

export const SOURCES: readonly Source[] = ["daily", "tutorial", "account", "economy", "collection"];

/** A Tutorial game's token id is `TUTORIAL_OFFSET + game id`; a Daily game's is its game id (`Collection`). */
export const TUTORIAL_OFFSET = 2n ** 32n;
/** The first token id that belongs to no game contract. */
export const TOKEN_LIMIT = 2n ** 33n;

export class DecodeError extends Error {}

/** The `mode` of each game contract (`public-interface.md`). 2 was Weekly and is never given again. */
export const MODE: Record<"daily" | "tutorial", number> = {
  daily: 1,
  tutorial: 3,
};

export type Decoded =
  | {
      name: "GameSpawned";
      gameId: number;
      playerId: bigint;
      mode: number;
      tournamentId: bigint;
      startTime: bigint;
      price: bigint;
    }
  | {
      name: "GameOver";
      gameId: number;
      playerId: bigint;
      tournamentId: bigint;
      mode: number;
      score: number;
      startTime: bigint;
      endTime: bigint;
    }
  | {
      name: "PlayerCreated";
      playerId: bigint;
      displayName: bigint;
      master: bigint;
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
    }
  | {
      /** The mint of a game's token (`Collection` emits no other transfer: it is soulbound). */
      name: "Transfer";
      /** The player the token was minted to. */
      to: bigint;
      /** Below 2^33, so exact as a JSON number. */
      tokenId: number;
      /** The game contract the token id belongs to, and the game id in it. */
      contract: "daily" | "tutorial";
      gameId: number;
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

export type EventName = Decoded["name"];

/** Which contract emits each indexed event. */
export const EMITTERS: Record<EventName, readonly Source[]> = {
  GameSpawned: ["daily", "tutorial"],
  GameOver: ["daily", "tutorial"],
  PlayerCreated: ["account"],
  // Definitions and quest progress come from Daily only (Tutorial declares the achievement component, to report task 10).
  QuestDefined: ["daily"],
  QuestProgressed: ["daily"],
  QuestRetired: ["daily"],
  AchievementDefined: ["daily"],
  AchievementProgressed: ["daily", "tutorial"],
  AchievementRetired: ["daily"],
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
  "Sponsored",
  "Claimed",
  "OwnershipTransferStarted",
  "OwnershipTransferred",
  "Upgraded",
  // Quests and achievements of quiver 0.2.0 that Paved never emits: quests are in event mode (no completion, no claim),
  // and the reporters are not used (the game flow calls the internal layer).
  "QuestCompleted",
  "QuestClaimed",
  "QuestReporterSet",
  "AchievementReporterSet",
  // Economy's owner events (its constructor emits EconomyConfigured and PoolSet), and Account's one-shot wiring.
  "EconomyConfigured",
  "PoolSet",
  "GameSet",
  "EconomySet",
  "CollectionSet",
  // A sponsor's reclaim of a day's unclaimable prize (P-37): declared by the Lobby class, emitted from Daily's address.
  "Reclaimed",
] as const;

const INDEXED: readonly EventName[] = [
  "GameSpawned",
  "GameOver",
  "PlayerCreated",
  "QuestDefined",
  "QuestProgressed",
  "QuestRetired",
  "AchievementDefined",
  "AchievementProgressed",
  "AchievementRetired",
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

/**
 * A short string felt (31 bytes at most) as text: null when it is empty, is not UTF-8 or holds a control character.
 */
export function shortString(value: bigint): string | null {
  if (value === 0n) return null;
  const hex = value.toString(16);
  const bytes = Buffer.from(hex.length % 2 ? `0${hex}` : hex, "hex");
  try {
    const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    // eslint-disable-next-line no-control-regex
    return /[\u0000-\u001f\u007f]/.test(text) ? null : text;
  } catch {
    return null;
  }
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
 * A tournament id (or an Economy day, the same UTC day id): at most `MAX_TOURNAMENT_ID`, the API's bound, so that no
 * indexed day can exceed it.
 */
function tournamentId(value: string | undefined, field = "tournament_id"): bigint {
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
        tournamentId: tournamentId(data[1]),
        startTime: safe(uint(data[2], 64, "start_time"), "start_time"),
        price: felt(data[3]),
      };
    case "GameOver":
      shape(name, keys, data, 3, 4);
      return {
        name,
        gameId: small(keys[1], 32, "game_id"),
        playerId: felt(keys[2]),
        tournamentId: tournamentId(keys[3]),
        mode: small(data[0], 8, "mode"),
        score: small(data[1], 32, "score"),
        startTime: safe(uint(data[2], 64, "start_time"), "start_time"),
        endTime: safe(uint(data[3], 64, "end_time"), "end_time"),
      };
    case "PlayerCreated":
      shape(name, keys, data, 1, 2);
      return {
        name,
        playerId: felt(keys[1]),
        displayName: felt(data[0]),
        master: felt(data[1]),
      };
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
    case "Purchased":
      // keys game_id, player_id; data day, stake, price (u256), referrer, referral, burned_quote, burned, margin,
      // supply (u256 each), factor, reference
      shape(name, keys, data, 2, 17);
      return {
        name,
        gameId: small(keys[1], 32, "game_id"),
        playerId: felt(keys[2]),
        day: tournamentId(data[0], "day"),
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
      const tutorial = tokenId >= TUTORIAL_OFFSET;
      const gameId = tutorial ? tokenId - TUTORIAL_OFFSET : tokenId;
      if (gameId === 0n) throw new DecodeError(`${name}: token id ${tokenId} is the game id 0`);
      return {
        name,
        to: felt(keys[2]),
        tokenId: Number(tokenId),
        contract: tutorial ? "tutorial" : "daily",
        gameId: Number(gameId),
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
        day: tournamentId(keys[1], "day"),
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
        day: tournamentId(data[0], "day"),
        score: small(data[1], 32, "score"),
        threshold: u64(data[2], "threshold"),
        reward: uint(data[3], 128, "reward"),
      };
  }
}
