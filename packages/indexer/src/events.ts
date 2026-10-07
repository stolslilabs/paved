// Copied from Grim World, indexer/src/events.ts (https://github.com/bal7hazar/grimworld, commit e405340684e4202440a97a4073fcd2bc43ca49d7),
// Apache-2.0. Adapted for Paved: `canonical`, `felt`, the selector table builder and `DecodeError` are kept; the nine
// Grim World decoders and the market key decoder are replaced by the three Paved decoders (GameSpawned, GameOver,
// PlayerCreated) and the list of the events of the contracts that are known and not indexed. This copy is maintained by
// the Paved repository.
//
// The three events of the indexer (docs/architecture/indexer.md, contracts/abis/*.json): the first key is the selector of
// the event's name; then the declared keys, then the data, in the declared order. Decoding is strict: a selector of no
// list, a count of keys or data that differs, or a value wider than its type is a DecodeError, and the indexer halts on
// it (it never guesses). The events of the contracts that are not indexed (the board events, claims, ownership) are
// known by name and skipped; any other selector is a contract change the indexer was not told about.
import { hash } from "starknet";
import { MAX_TOURNAMENT_ID } from "./api.ts";

/** The three contracts whose events are read: `daily` and `tutorial` play, `account` registers players. */
export type Source = "daily" | "tutorial" | "account";

export const SOURCES: readonly Source[] = ["daily", "tutorial", "account"];

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
    };

export type EventName = Decoded["name"];

/** Which contract emits each indexed event. */
export const EMITTERS: Record<EventName, readonly Source[]> = {
  GameSpawned: ["daily", "tutorial"],
  GameOver: ["daily", "tutorial"],
  PlayerCreated: ["account"],
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
  // Quests and achievements (quiver 0.2.0): read by the P7 indexer PR
  "QuestDefined",
  "QuestProgressed",
  "QuestCompleted",
  "QuestClaimed",
  "QuestRetired",
  "QuestReporterSet",
  "AchievementDefined",
  "AchievementProgressed",
  "AchievementRetired",
  "AchievementReporterSet",
] as const;

const INDEXED: readonly EventName[] = [
  "GameSpawned",
  "GameOver",
  "PlayerCreated",
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

/** A tournament id: at most `MAX_TOURNAMENT_ID`, the API's bound, so that no indexed day can exceed it. */
function tournamentId(value: string | undefined): bigint {
  const id = uint(value, 64, "tournament_id");
  if (id > BigInt(MAX_TOURNAMENT_ID)) {
    throw new DecodeError(`tournament_id ${id} is above the API bound ${MAX_TOURNAMENT_ID}`);
  }
  return id;
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
  }
}
