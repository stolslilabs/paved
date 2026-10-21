// Copied from Grim World, indexer/src/testing/fake-node.ts (https://github.com/bal7hazar/grimworld, commit e405340684e4202440a97a4073fcd2bc43ca49d7),
// Apache-2.0. Adapted for Paved: four contracts (challenge, setup, economy, collection) and Paved's event builders, and
// `starknet_chainId`. This copy is maintained by the Paved repository.
//
// A fake Starknet node for the unit tests: no network. It answers the read methods the indexer
// uses (JSON-RPC 0.10 shapes, as starknet-devnet 0.10.0 answers them) from blocks held in memory,
// and it can mine, reorganise (with devnet's quirk: a replacement block keeps the replaced block's
// hash, its commitments differ) and move the last L1-accepted block. Each block has a time: `time`,
// the next block's, advances by `interval` at every block mined (a test sets either).
import { RpcError, type Rpc } from "../chain.ts";
import { SELECTORS, type Source } from "../events.ts";

export const CHALLENGE = "0x1111";
export const SETUP = "0x2222";
export const ECONOMY = "0x4444";
export const COLLECTION = "0x5555";
export const CHAIN_ID = "0x534e5f5345504f4c4941";
const ADDRESS: Record<Source, string> = {
  challenge: CHALLENGE,
  setup: SETUP,
  economy: ECONOMY,
  collection: COLLECTION,
};

export type FakeEvent = { source: Source; keys: string[]; data: string[] };
/** A transaction: its events, in order. */
export type FakeTransaction = FakeEvent[];

type Block = {
  number: number;
  hash: string;
  parent: string;
  commitment: string;
  timestamp: number;
  transactions: { hash: string; events: FakeEvent[] }[];
};

const hex = (value: bigint | number) => `0x${BigInt(value).toString(16)}`;

/** The raw keys and data of an event, as a node reports it. */
export function raw(
  source: Source,
  name: keyof typeof SELECTORS,
  keys: (bigint | number)[],
  data: (bigint | number)[],
): FakeEvent {
  return {
    source,
    keys: [SELECTORS[name], ...keys.map(hex)],
    data: data.map(hex),
  };
}

/** Where the quest and achievement builders emit: Setup (D-24), or Challenge for a past history (skipped). */
type QuestSource = "setup" | "challenge";

export const ev = {
  spawned: (
    source: "challenge",
    gameId: number,
    player: bigint | number,
    options: {
      mode?: number;
      day?: bigint | number;
      start?: bigint | number;
      price?: bigint | number;
    } = {},
  ) =>
    raw(
      source,
      "GameSpawned",
      [gameId, player],
      [
        options.mode ?? 1,
        options.day ?? 100,
        options.start ?? 1_000_000,
        options.price ?? 5,
      ],
    ),
  over: (
    source: "challenge",
    gameId: number,
    player: bigint | number,
    score: number,
    options: {
      mode?: number;
      day?: bigint | number;
      start?: bigint | number;
      end?: bigint | number;
    } = {},
  ) =>
    raw(
      source,
      "GameOver",
      [gameId, player, options.day ?? 100],
      [
        options.mode ?? 1,
        score,
        options.start ?? 1_000_000,
        options.end ?? 1_000_500,
      ],
    ),
  /**
   * A past `PlayerCreated` (Account's registry, before D-25 (E)): key the player, data the name and the master. Only a
   * source still read can carry one (the game contract's ABI declared it until D-23b); it is known by name and skipped.
   */
  pastCreated: (source: Source, player: bigint | number, name: bigint | number, master: bigint | number = 0xabc) =>
    raw(source, "PlayerCreated", [player], [name, master]),
  /** Challenge's pause events (G4): `GuardianSet { guardian }`, `SpawnPaused { by }`, `SpawnUnpaused`. Known by name and skipped. */
  guardianSet: (guardian: bigint | number) => raw("challenge", "GuardianSet", [], [guardian]),
  spawnPaused: (by: bigint | number) => raw("challenge", "SpawnPaused", [], [by]),
  spawnUnpaused: () => raw("challenge", "SpawnUnpaused", [], []),
  /** Setup's `EconomySet` and `CollectionSet` (D-25 (E)): the address is the only member, in the data. */
  economySet: (economy: bigint | number = BigInt(ECONOMY)) => raw("setup", "EconomySet", [], [economy]),
  collectionSet: (collection: bigint | number = BigInt(COLLECTION)) =>
    raw("setup", "CollectionSet", [], [collection]),
  /** Cobbles v1 (Setup): `QuestCobblesSet { quest_id; cobbles, kind }`, `AchievementCobblesSet { achievement_id; cobbles }`. */
  questCobblesSet: (questId: number, cobbles: number, kind = cobbles === 0 ? 0 : 1) =>
    raw("setup", "QuestCobblesSet", [questId], [cobbles, kind]),
  achievementCobblesSet: (achievementId: number, cobbles: number) =>
    raw("setup", "AchievementCobblesSet", [achievementId], [cobbles]),
  /** `CobblesClaimed { player_id; kind (1 quest, 2 achievement), id, period, cobbles, balance }`. */
  cobblesClaimed: (player: bigint | number, kind: 1 | 2 | 3, id: number, period: number, cobbles: number, balance: number) =>
    raw("setup", "CobblesClaimed", [player], [kind, id, period, cobbles, balance]),
  /** `CreditClaimed { player_id; kind (1 day, 2 week), period, credits }`, `CreditSpent { player_id; game_id, credits }`. */
  creditClaimed: (player: bigint | number, kind: 1 | 2, period: number, credits: number) =>
    raw("setup", "CreditClaimed", [player], [kind, period, credits]),
  creditSpent: (player: bigint | number, gameId: number, credits: number) =>
    raw("setup", "CreditSpent", [player], [gameId, credits]),
  /** Cobbles v1 part 2. `PackSet { pack_id; cobbles, price, active }`, `PackBought { player_id; pack_id, cobbles, price, referrer, balance }`. */
  packSet: (packId: number, cobbles: number, price: bigint | number, active = true) =>
    raw("setup", "PackSet", [packId], [cobbles, price, active ? 1 : 0]),
  packBought: (
    player: bigint | number,
    packId: number,
    cobbles: number,
    price: bigint | number,
    referrer: bigint | number,
    balance: number,
  ) => raw("setup", "PackBought", [player], [packId, cobbles, price, referrer, balance]),
  /**
   * Cobbles v1 part 3. `SkinPriced { theme, plan; cobbles }`, `SkinBought { player_id; theme, plan, cobbles, balance }`,
   * `SkinsActivated { player_id; active }` (`active`: the packed word, the theme of plan p in byte p - 1; `skinWord` builds it).
   */
  skinPriced: (theme: number, plan: number, cobbles: number) => raw("setup", "SkinPriced", [theme, plan], [cobbles]),
  skinBought: (player: bigint | number, theme: number, plan: number, cobbles: number, balance: number) =>
    raw("setup", "SkinBought", [player], [theme, plan, cobbles, balance]),
  /** #639. `CobblesSpent { player_id; spender, reason, cobbles, balance }`. */
  cobblesSpent: (player: bigint | number, spender: bigint | number, reason: bigint | number, cobbles: number, balance: number) =>
    raw("setup", "CobblesSpent", [player], [spender, reason, cobbles, balance]),
  skinsActivated: (player: bigint | number, active: bigint | number) => raw("setup", "SkinsActivated", [player], [active]),
  /** Economy's `Sold { player_id; price, referrer, referral, burned_quote, burned, margin, supply, vault_paved }` (u256 but the referrer). */
  sold: (
    player: bigint | number,
    options: {
      price?: bigint;
      referrer?: bigint | number;
      referral?: bigint;
      burnedQuote?: bigint;
      burned?: bigint;
      margin?: bigint;
      supply?: bigint;
      vaultPaved?: bigint;
    } = {},
  ) => {
    const u256 = (value: bigint) => [value & (2n ** 128n - 1n), value >> 128n];
    return raw(
      "economy",
      "Sold",
      [player],
      [
        ...u256(options.price ?? 5_000_000n),
        options.referrer ?? 0,
        ...u256(options.referral ?? 0n),
        ...u256(options.burnedQuote ?? 3_500_000n),
        ...u256(options.burned ?? 70_000n),
        ...u256(options.margin ?? 1_000_000n),
        ...u256(options.supply ?? 1_000_000_000n),
        ...u256(options.vaultPaved ?? 25_000n),
      ],
    );
  },
  /** `QuestDefined`: key quest_id; data schedule (start, end, duration, interval), tasks span, conditions span. */
  questDefined: (
    questId: number,
    options: {
      start?: number;
      end?: number;
      duration?: number;
      interval?: number;
      tasks?: [number, number][];
      conditions?: number[];
      source?: QuestSource;
    } = {},
  ) => {
    const tasks = options.tasks ?? [[1, 1]];
    const conditions = options.conditions ?? [];
    return raw(
      options.source ?? "setup",
      "QuestDefined",
      [questId],
      [
        options.start ?? 0,
        options.end ?? 0,
        options.duration ?? 86400,
        options.interval ?? 86400,
        tasks.length,
        ...tasks.flat(),
        conditions.length,
        ...conditions,
      ],
    );
  },
  questProgressed: (player: bigint | number, task: number, count: number, source: QuestSource = "setup") =>
    raw(source, "QuestProgressed", [player, task], [count]),
  questRetired: (questId: number, source: QuestSource = "setup") => raw(source, "QuestRetired", [questId], []),
  /** `AchievementDefined`: key achievement_id; data window (start, end), tasks span, points. */
  achievementDefined: (
    achievementId: number,
    options: { start?: number; end?: number; tasks?: [number, number][]; points?: number; source?: QuestSource } = {},
  ) => {
    const tasks = options.tasks ?? [[1, 1]];
    return raw(
      options.source ?? "setup",
      "AchievementDefined",
      [achievementId],
      [options.start ?? 0, options.end ?? 0, tasks.length, ...tasks.flat(), options.points ?? 10],
    );
  },
  achievementProgressed: (
    player: bigint | number,
    task: number,
    count: number,
    source: QuestSource = "setup",
  ) => raw(source, "AchievementProgressed", [player, task], [count]),
  /** `Setup.claim_tutorial()` the first time: `AchievementProgressed { task 10, count 1 }` (D-21). */
  tutorialClaimed: (player: bigint | number) => raw("setup", "AchievementProgressed", [player, 10], [1]),
  achievementRetired: (achievementId: number, source: QuestSource = "setup") =>
    raw(source, "AchievementRetired", [achievementId], []),
  /**
   * Economy's `Purchased`: keys game_id, player_id; data day, stake, price (u256: low, high), referrer, referral,
   * burned_quote, burned, margin, supply (u256 each), factor, reference (u128), vault_paved (u256, P-56). Defaults: a
   * stake-1 purchase, no referrer.
   */
  purchased: (
    gameId: number,
    player: bigint | number,
    options: {
      day?: number;
      stake?: number;
      price?: bigint;
      referrer?: bigint | number;
      referral?: bigint;
      burnedQuote?: bigint;
      burned?: bigint;
      margin?: bigint;
      supply?: bigint;
      factor?: number;
      reference?: bigint;
      vaultPaved?: bigint;
    } = {},
  ) => {
    const stake = options.stake ?? 1;
    const u256 = (value: bigint) => [value & (2n ** 128n - 1n), value >> 128n];
    return raw(
      "economy",
      "Purchased",
      [gameId, player],
      [
        options.day ?? 100,
        stake,
        ...u256(options.price ?? BigInt(stake) * 2_000_000n),
        options.referrer ?? 0,
        ...u256(options.referral ?? 0n),
        ...u256(options.burnedQuote ?? BigInt(stake) * 1_400_000n),
        ...u256(options.burned ?? 107n * 10n ** 18n),
        ...u256(options.margin ?? BigInt(stake) * 600_000n),
        ...u256(options.supply ?? 999_893n * 10n ** 18n),
        options.factor ?? 10_000,
        options.reference ?? 107n * 10n ** 18n,
        ...u256(options.vaultPaved ?? 45n * 10n ** 18n),
      ],
    );
  },
  /** Collection's mint `Transfer` (keys from, to, token_id as u256; no data): a Challenge game's token is its id. */
  minted: (to: bigint | number, tokenId: bigint | number) =>
    raw("collection", "Transfer", [0, to, BigInt(tokenId) & (2n ** 128n - 1n), BigInt(tokenId) >> 128n], []),
  recorded: (gameId: number, score: number, expired = false) =>
    raw("economy", "Recorded", [gameId], [score, expired ? 1 : 0]),
  dayClosed: (
    day: number,
    options: { mean?: number; weight?: number; prior?: number; emaAfter?: number } = {},
  ) =>
    raw(
      "economy",
      "DayClosed",
      [day],
      [options.mean ?? 4_215_689, options.weight ?? 21, options.prior ?? 3_980_000, options.emaAfter ?? 3_500_000],
    ),
  settled: (
    gameId: number,
    player: bigint | number,
    options: { day?: number; score?: number; threshold?: number; reward?: bigint } = {},
  ) =>
    raw(
      "economy",
      "Settled",
      [gameId, player],
      [options.day ?? 100, options.score ?? 5000, options.threshold ?? 4_215_689, options.reward ?? 231n * 10n ** 18n],
    ),
  /**
   * The past prize events of `Challenge`, before D-20 (public-interface.md, "Past events"): known by name and skipped.
   * `Sponsored`: key the day, data the sponsor and the amount. `Claimed`: key the day, data the player, the rank and the
   * reward (u256). `Reclaimed`: keys the day and the sponsor, data the amount (u256).
   */
  sponsored: (day: number, sponsor: bigint | number, amount: bigint | number = 10n ** 18n) =>
    raw("challenge", "Sponsored", [day], [sponsor, amount]),
  claimed: (day: number, player: bigint | number, rank: number, reward: bigint | number = 10n ** 18n) =>
    raw("challenge", "Claimed", [day], [player, rank, reward, 0]),
  reclaimed: (day: number, sponsor: bigint | number, amount: bigint | number = 10n ** 18n) =>
    raw("challenge", "Reclaimed", [day, sponsor], [amount, 0]),
  /** An event of the contracts that is known and not indexed. */
  built: (source: Source, gameId: number) =>
    raw(source, "Built", [gameId], [1, 2, 3, 4, 5, 6]),
};

export class FakeNode {
  blocks: Block[] = [];
  l1Accepted: number | null = null;
  readonly calls: string[] = [];
  /** Called before each answer: a test injects a reorg between two calls of a step. */
  beforeCall: ((method: string, params: unknown) => void) | null = null;
  /** The time of the next block mined (seconds). */
  time = 1_000_000;
  /** Seconds between two blocks. */
  interval = 1;
  /** The largest page `starknet_getEvents` serves (code 31 above it). */
  maxChunk = 1024;
  /** The refusal of a page above `maxChunk`: a test gives another code, or text, than the public node's. */
  pageRefusal: { code: number; message?: string } = { code: 31, message: "Requested page size is too big" };
  /** The widest block range `starknet_getEvents` serves, null for any (a "too many" refusal above it). */
  maxSpan: number | null = null;
  private salt = 0;

  constructor(emptyBlocks = 1) {
    for (let i = 0; i < emptyBlocks; i++) this.mine();
  }

  get tip(): number {
    return this.blocks.length - 1;
  }

  /** Mines one block holding these transactions; its number. */
  mine(...transactions: FakeTransaction[]): number {
    const number = this.blocks.length;
    const parent = number === 0 ? "0x0" : this.blocks[number - 1]!.hash;
    const salt = ++this.salt;
    this.blocks.push({
      number,
      hash: hex(0xb000000n + BigInt(number) * 0x1000n + BigInt(salt)),
      parent,
      commitment: hex(0xc000000n + BigInt(salt)),
      timestamp: this.time,
      transactions: transactions.map((events, index) => ({
        hash: hex(0x7000000n + BigInt(salt) * 0x100n + BigInt(index)),
        events,
      })),
    });
    this.time += this.interval;
    return number;
  }

  /**
   * Aborts the last `depth` blocks and mines `replacements` (one list of transactions per block).
   * `sameHash`: devnet's quirk, each replacement at a height keeps the aborted block's hash.
   */
  reorg(
    depth: number,
    replacements: FakeTransaction[][] = [],
    sameHash = false,
  ) {
    const aborted = this.blocks.splice(this.blocks.length - depth, depth);
    for (const [index, transactions] of replacements.entries()) {
      this.mine(...transactions);
      const block = this.blocks[this.blocks.length - 1]!;
      const old = aborted[index];
      if (sameHash && old) {
        block.hash = old.hash;
        block.parent = this.blocks[block.number - 1]?.hash ?? "0x0";
      }
    }
  }

  private header(block: Block) {
    return {
      status: "ACCEPTED_ON_L2",
      block_hash: block.hash,
      parent_hash: block.parent,
      block_number: block.number,
      timestamp: block.timestamp,
      transaction_commitment: block.commitment,
      event_commitment: block.commitment,
      receipt_commitment: block.commitment,
      state_diff_commitment: block.commitment,
      transactions: block.transactions.map((transaction) => transaction.hash),
    };
  }

  /** Rewrites an answer: a test makes the node answer wrongly. */
  tamper:
    ((method: string, params: unknown, result: unknown) => unknown) | null =
    null;

  readonly rpc: Rpc = async (method, params) => {
    const result = await this.answer(method, params);
    return this.tamper ? this.tamper(method, params, result) : result;
  };

  private async answer(method: string, params: unknown): Promise<unknown> {
    this.calls.push(method);
    this.beforeCall?.(method, params);
    const p = params as Record<string, unknown>;
    switch (method) {
      case "starknet_chainId":
        return CHAIN_ID;
      case "starknet_blockHashAndNumber": {
        const block = this.blocks[this.tip]!;
        return { block_hash: block.hash, block_number: block.number };
      }
      case "starknet_getBlockWithTxHashes": {
        const id = p.block_id as { block_number: number } | string;
        if (id === "l1_accepted") {
          if (this.l1Accepted === null)
            throw new RpcError(method, {
              code: 24,
              message: "Block not found",
            });
          return this.header(this.blocks[this.l1Accepted]!);
        }
        if (id === "pre_confirmed")
          return { block_number: this.tip + 1, transactions: [] };
        const block =
          typeof id === "object" ? this.blocks[id.block_number] : undefined;
        if (!block)
          throw new RpcError(method, { code: 24, message: "Block not found" });
        return this.header(block);
      }
      case "starknet_getEvents": {
        const filter = p.filter as {
          from_block: { block_hash: string } | { block_number: number };
          to_block: { block_hash: string } | { block_number: number };
          address: string;
          chunk_size: number;
          continuation_token?: string;
        };
        if (filter.chunk_size > this.maxChunk)
          throw new RpcError(method, this.pageRefusal);
        // By hash, as devnet: the highest block with that hash (a replacement shares it). By number: the blocks in range.
        const find = (id: { block_hash: string } | { block_number: number }) => {
          const block =
            "block_hash" in id
              ? [...this.blocks].reverse().find((b) => b.hash === id.block_hash)
              : this.blocks[id.block_number];
          if (!block) throw new RpcError(method, { code: 24, message: "Block not found" });
          return block.number;
        };
        const from = find(filter.from_block);
        const to = find(filter.to_block);
        if (this.maxSpan !== null && to - from + 1 > this.maxSpan)
          throw new RpcError(method, { code: -32005, message: "Too many blocks in range" });
        const source = (Object.keys(ADDRESS) as Source[]).find(
          (name) => BigInt(ADDRESS[name]) === BigInt(filter.address),
        );
        if (!source)
          throw new RpcError(method, { code: -1, message: "unknown address" });
        const all = this.blocks.slice(from, to + 1).flatMap((block) =>
          block.transactions.flatMap((transaction, transactionIndex) =>
            transaction.events.flatMap((event, eventIndex) =>
              event.source === source
                ? [
                    {
                      transaction_hash: transaction.hash,
                      transaction_index: transactionIndex,
                      event_index: eventIndex,
                      block_hash: block.hash,
                      block_number: block.number,
                      from_address: ADDRESS[source],
                      keys: event.keys,
                      data: event.data,
                    },
                  ]
                : [],
            ),
          ),
        );
        const start = Number(filter.continuation_token ?? 0);
        const end = start + filter.chunk_size;
        return {
          events: all.slice(start, end),
          ...(end < all.length ? { continuation_token: String(end) } : {}),
        };
      }
      default:
        throw new RpcError(method, {
          code: -32601,
          message: "Method not found",
        });
    }
  }
}

/** The `active` word of a `SkinsActivated` from `[plan, theme]` pairs (the last of a plan wins; the other plans stay 0, the default). */
export function skinWord(pairs: readonly (readonly [number, number])[]): bigint {
  const themes = new Array<number>(19).fill(0);
  for (const [plan, theme] of pairs) themes[plan - 1] = theme;
  return themes.reduceRight((word, theme) => (word << 8n) | BigInt(theme), 0n);
}
