// Copied from Grim World, indexer/src/chain.ts (https://github.com/bal7hazar/grimworld, commit e405340684e4202440a97a4073fcd2bc43ca49d7),
// Apache-2.0. Adapted for Paved: three addresses (daily, tutorial, account) instead of hub and market, the `Source` type
// of events.ts, a smaller `getEvents` page, and two read calls added (`chainId`, `call`, for the chain id check and the
// cross-check against the `tournament` view). URL redaction, block header and commitments, call counters unchanged. This
// copy is maintained by the Paved repository.
//
// The indexer's view of the node: JSON-RPC 0.10 read methods only, counted by method. The node is one node we trust,
// never several mixed within a step. The indexer holds no key and sends nothing: this module knows only the read methods
// below.
//
// Nothing a node or a transport says is logged as it is: an RPC error is its method and code, a transport error its
// method and error code (a provider's text, or undici's, may hold the URL and its key).
import { createHash } from "node:crypto";
import { canonical, SOURCES, type Source } from "./events.ts";

/** A JSON-RPC transport: the method's result, or an RpcError. */
export type Rpc = (method: string, params: unknown) => Promise<unknown>;

/** A JSON-RPC error answer: the method and the code, never the provider's text. */
export class RpcError extends Error {
  readonly code: number;
  constructor(method: string, error: { code: number; message?: string }) {
    super(`${method}: JSON-RPC error ${error.code}`);
    this.code = error.code;
  }
}

/** An answer the indexer does not accept (another height, no commitments): the step is retried. */
export class BadAnswer extends Error {}

export const BLOCK_NOT_FOUND = 24;

/** The URL if it is an http(s) URL, else null. Never prints it. */
export function parseRpcUrl(url: string): URL | null {
  if (!URL.canParse(url)) return null;
  const parsed = new URL(url);
  return parsed.protocol === "http:" || parsed.protocol === "https:"
    ? parsed
    : null;
}

/**
 * What a log says of the RPC URL: a fixed label and the first 8 hex digits of the URL's sha256, enough to tell two
 * configurations apart. No part of the URL is ever logged: a provider's key can be in its host
 * (`https://<key>.rpc.example.com/`) as well as in its path or query. Never throws.
 */
export function redact(url: string): string {
  return `rpc ${createHash("sha256").update(url).digest("hex").slice(0, 8)}`;
}

/** JSON-RPC over HTTP POST. */
export function httpRpc(url: string): Rpc {
  let id = 0;
  return async (method, params) => {
    let response: Response;
    try {
      response = await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: ++id, method, params }),
      });
    } catch (error) {
      const cause = (error as { cause?: { code?: unknown } }).cause;
      const code =
        typeof cause?.code === "string" ? cause.code : (error as Error).name;
      // The cause is dropped on purpose: undici's error and its cause may hold the URL and its key.
      throw new Error(`${method}: transport error ${code}`);
    }
    if (!response.ok) throw new Error(`${method}: HTTP ${response.status}`);
    let body: { result?: unknown; error?: { code: number } };
    try {
      body = (await response.json()) as typeof body;
    } catch {
      throw new Error(`${method}: an answer that is not JSON`);
    }
    if (body.error) throw new RpcError(method, body.error);
    return body.result;
  };
}

/**
 * A block, known by its hash AND its commitments: devnet gives a replacement block the hash of the block it replaces, so
 * a hash alone does not identify it.
 */
export type Header = {
  number: number;
  hash: string;
  parent: string;
  commitments: string;
  /** The block's time (seconds, as the node reports it): the only clock of the rules. */
  timestamp: number;
};

export const sameBlock = (a: Header, b: Header) =>
  a.hash === b.hash && a.commitments === b.commitments;

/** A block as an answer names it: number, hash, commitments, and its time. */
export type Head = Omit<Header, "parent">;

export const headOf = (header: Header | null | undefined): Head | null =>
  header
    ? {
        number: header.number,
        hash: header.hash,
        commitments: header.commitments,
        timestamp: header.timestamp,
      }
    : null;

/** An event of one of the three contracts, with its position in its block. */
export type RawEvent = {
  source: Source;
  keys: string[];
  data: string[];
  transaction: string;
  transactionIndex: number;
  eventIndex: number;
};

export type BlockResult = {
  status?: string;
  block_hash?: string;
  parent_hash?: string;
  block_number?: number;
  timestamp?: number;
  transaction_commitment?: string | null;
  event_commitment?: string | null;
  receipt_commitment?: string | null;
  state_diff_commitment?: string | null;
};

type EventsPage = {
  events: {
    block_hash?: string;
    block_number?: number;
    transaction_hash: string;
    transaction_index?: number;
    event_index?: number;
    from_address: string;
    keys: string[];
    data: string[];
  }[];
  continuation_token?: string;
};

export type Addresses = Record<Source, string>;

/** Events asked per page of `starknet_getEvents`. */
export const CHUNK_SIZE = 100;

export class Chain {
  readonly calls: Record<string, number> = {};
  private readonly rpc: Rpc;
  private readonly addresses: Addresses;

  constructor(rpc: Rpc, addresses: Addresses) {
    this.rpc = rpc;
    this.addresses = {
      daily: canonical(addresses.daily),
      tutorial: canonical(addresses.tutorial),
      account: canonical(addresses.account),
    };
  }

  private call(method: string, params: unknown): Promise<unknown> {
    this.calls[method] = (this.calls[method] ?? 0) + 1;
    return this.rpc(method, params);
  }

  /** The chain id the node reports, as a canonical felt. */
  async chainId(): Promise<string> {
    const result = await this.call("starknet_chainId", []);
    if (typeof result !== "string") throw new BadAnswer("the node has no chain id");
    return canonical(result);
  }

  /** The node's latest accepted block (never a pre-confirmed one). */
  async tip(): Promise<{ number: number; hash: string }> {
    const result = (await this.call("starknet_blockHashAndNumber", [])) as {
      block_number: number;
      block_hash: string;
    };
    if (!Number.isInteger(result?.block_number) || !result.block_hash) {
      throw new BadAnswer("the node's tip has no number or hash");
    }
    return { number: result.block_number, hash: canonical(result.block_hash) };
  }

  /**
   * The header of an accepted block asked at `number`; null for a pre-confirmed or hash-less block, which is never
   * indexed. A block of another height, or an accepted block without its parent, its four commitments or its timestamp,
   * is a BadAnswer: its identity (or its time) is unknown.
   */
  static header(block: BlockResult, number: number): Header | null {
    if (block.status === "PRE_CONFIRMED" || !block.block_hash) return null;
    if (block.block_number !== number) {
      throw new BadAnswer(
        `the node answered block ${block.block_number} for block ${number}`,
      );
    }
    const commitments = [
      block.transaction_commitment,
      block.event_commitment,
      block.receipt_commitment,
      block.state_diff_commitment,
    ];
    if (!block.parent_hash || commitments.some((value) => !value)) {
      throw new BadAnswer(
        `block ${number} has no parent or no commitments: its identity is unknown`,
      );
    }
    if (!Number.isSafeInteger(block.timestamp) || block.timestamp! < 0) {
      throw new BadAnswer(
        `block ${number} has no timestamp: its time is unknown`,
      );
    }
    return {
      number,
      hash: canonical(block.block_hash),
      parent: canonical(block.parent_hash),
      commitments: commitments.map((value) => canonical(value!)).join(","),
      timestamp: block.timestamp!,
    };
  }

  /** The block at `number`, or null when the node has none there (or only a pre-confirmed one). */
  async header(number: number): Promise<Header | null> {
    let block: BlockResult;
    try {
      block = (await this.call("starknet_getBlockWithTxHashes", {
        block_id: { block_number: number },
      })) as BlockResult;
    } catch (error) {
      if (error instanceof RpcError && error.code === BLOCK_NOT_FOUND)
        return null;
      throw error;
    }
    return Chain.header(block, number);
  }

  /** The number of the last block accepted on L1, or null when there is none yet. */
  async l1Accepted(): Promise<number | null> {
    try {
      const block = (await this.call("starknet_getBlockWithTxHashes", {
        block_id: "l1_accepted",
      })) as BlockResult;
      return Number.isInteger(block.block_number) ? block.block_number! : null;
    } catch (error) {
      if (error instanceof RpcError && error.code === BLOCK_NOT_FOUND)
        return null;
      throw error;
    }
  }

  /**
   * The events of the three contracts in `block`, fetched by the block's hash, in block order (transaction index, then
   * event index within the transaction). An event reported for another block (hash or number), of another contract, or
   * without its position, is a BadAnswer.
   */
  async events(block: Header): Promise<RawEvent[]> {
    const events: RawEvent[] = [];
    for (const source of SOURCES) {
      let token: string | undefined;
      do {
        const page = (await this.call("starknet_getEvents", {
          filter: {
            from_block: { block_hash: block.hash },
            to_block: { block_hash: block.hash },
            address: this.addresses[source],
            chunk_size: CHUNK_SIZE,
            ...(token ? { continuation_token: token } : {}),
          },
        })) as EventsPage;
        for (const event of page.events) {
          if (
            !event.block_hash ||
            canonical(event.block_hash) !== block.hash ||
            event.block_number !== block.number
          ) {
            throw new BadAnswer(
              `an event of block ${event.block_number} in the answer for block ${block.number}`,
            );
          }
          if (canonical(event.from_address) !== this.addresses[source]) {
            throw new BadAnswer(
              `an event of another contract in the answer for ${source}`,
            );
          }
          if (
            event.transaction_index === undefined ||
            event.event_index === undefined
          ) {
            throw new BadAnswer(
              "an event without its position (JSON-RPC 0.10 is needed)",
            );
          }
          events.push({
            source,
            keys: event.keys,
            data: event.data,
            transaction: canonical(event.transaction_hash),
            transactionIndex: event.transaction_index,
            eventIndex: event.event_index,
          });
        }
        token = page.continuation_token;
      } while (token);
    }
    return events.sort(
      (a, b) =>
        a.transactionIndex - b.transactionIndex || a.eventIndex - b.eventIndex,
    );
  }

  /**
   * A read-only contract call, at the block with this hash: the felts of the answer. The cross-check against the
   * `tournament` view is its only use.
   */
  async view(
    contract: Source,
    selector: string,
    calldata: string[],
    blockHash: string,
  ): Promise<bigint[]> {
    const result = (await this.call("starknet_call", {
      request: {
        contract_address: this.addresses[contract],
        entry_point_selector: selector,
        calldata,
      },
      block_id: { block_hash: blockHash },
    })) as unknown;
    if (!Array.isArray(result)) throw new BadAnswer("a view call answered no felts");
    return result.map((value) => BigInt(value as string));
  }
}
