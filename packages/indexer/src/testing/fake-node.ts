// Copied from Grim World, indexer/src/testing/fake-node.ts (https://github.com/bal7hazar/grimworld, commit e405340684e4202440a97a4073fcd2bc43ca49d7),
// Apache-2.0. Adapted for Paved: three contracts (daily, tutorial, account) and Paved's event builders, `starknet_chainId`
// and `starknet_call` (a scripted view). This copy is maintained by the Paved repository.
//
// A fake Starknet node for the unit tests: no network. It answers the read methods the indexer
// uses (JSON-RPC 0.10 shapes, as starknet-devnet 0.10.0 answers them) from blocks held in memory,
// and it can mine, reorganise (with devnet's quirk: a replacement block keeps the replaced block's
// hash, its commitments differ) and move the last L1-accepted block. Each block has a time: `time`,
// the next block's, advances by `interval` at every block mined (a test sets either).
import { RpcError, type Rpc } from "../chain.ts";
import { SELECTORS, type Source } from "../events.ts";

export const DAILY = "0x1111";
export const TUTORIAL = "0x2222";
export const ACCOUNT = "0x3333";
export const CHAIN_ID = "0x534e5f5345504f4c4941";
const ADDRESS: Record<Source, string> = {
  daily: DAILY,
  tutorial: TUTORIAL,
  account: ACCOUNT,
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

const MODE = { daily: 1, tutorial: 3 } as const;

export const ev = {
  spawned: (
    source: "daily" | "tutorial",
    gameId: number,
    player: bigint | number,
    options: {
      mode?: number;
      tournament?: bigint | number;
      start?: bigint | number;
      price?: bigint | number;
    } = {},
  ) =>
    raw(
      source,
      "GameSpawned",
      [gameId, player],
      [
        options.mode ?? MODE[source],
        options.tournament ?? (source === "daily" ? 100 : 0),
        options.start ?? 1_000_000,
        options.price ?? 5,
      ],
    ),
  over: (
    source: "daily" | "tutorial",
    gameId: number,
    player: bigint | number,
    score: number,
    options: {
      mode?: number;
      tournament?: bigint | number;
      start?: bigint | number;
      end?: bigint | number;
    } = {},
  ) =>
    raw(
      source,
      "GameOver",
      [gameId, player, options.tournament ?? (source === "daily" ? 100 : 0)],
      [
        options.mode ?? MODE[source],
        score,
        options.start ?? 1_000_000,
        options.end ?? (source === "daily" ? 1_000_500 : 0),
      ],
    ),
  created: (player: bigint | number, name: bigint | number, master: bigint | number = 0xabc) =>
    raw("account", "PlayerCreated", [player], [name, master]),
  /** An event of the contracts that is known and not indexed. */
  built: (source: Source, gameId: number) =>
    raw(source, "Built", [gameId], [1, 2, 3, 4, 5, 6, 7, 8]),
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

  /** The felts `starknet_call` answers, by contract address and entry point selector (a scripted view). */
  views: ((address: string, selector: string, calldata: string[], blockHash: string) => string[]) | null = null;

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
      case "starknet_call": {
        const request = p.request as {
          contract_address: string;
          entry_point_selector: string;
          calldata: string[];
        };
        const block_id = p.block_id as { block_hash: string };
        if (!this.views)
          throw new RpcError(method, { code: 40, message: "Contract error" });
        return this.views(
          request.contract_address,
          request.entry_point_selector,
          request.calldata,
          block_id.block_hash,
        );
      }
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
          from_block: { block_hash: string };
          address: string;
          chunk_size: number;
          continuation_token?: string;
        };
        // By hash, as devnet: the highest block with that hash (a replacement shares it).
        const block = [...this.blocks]
          .reverse()
          .find((b) => b.hash === filter.from_block.block_hash);
        if (!block)
          throw new RpcError(method, { code: 24, message: "Block not found" });
        const source = (Object.keys(ADDRESS) as Source[]).find(
          (name) => BigInt(ADDRESS[name]) === BigInt(filter.address),
        );
        if (!source)
          throw new RpcError(method, { code: -1, message: "unknown address" });
        const all = block.transactions.flatMap(
          (transaction, transactionIndex) =>
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
