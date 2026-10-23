// Copied from Grim World, indexer/src/chain.ts (https://github.com/bal7hazar/grimworld, commit e405340684e4202440a97a4073fcd2bc43ca49d7),
// Apache-2.0. Adapted for Paved: four addresses (challenge, setup, economy, collection) instead of hub and market, the `Source` type
// of events.ts, a smaller `getEvents` page, and a read call added (`chainId`, for the chain id check). URL redaction, block header and commitments, call counters unchanged. This
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
import { RATE_LIMITED, RateLimited, Throttle, retryAfterMs } from "./throttle.ts";

/** A JSON-RPC transport: the method's result, or an RpcError. */
export type Rpc = (method: string, params: unknown) => Promise<unknown>;

/**
 * A JSON-RPC error answer: the method and the code, never the provider's text. `pageSizeTooBig`: the node refused a
 * `getEvents` page as too big, by its code (31) or by its text (a node that answers another code); the text is read for
 * that and dropped.
 */
export class RpcError extends Error {
  readonly code: number;
  readonly pageSizeTooBig: boolean;
  constructor(method: string, error: { code: number; message?: string }) {
    super(`${method}: JSON-RPC error ${error.code}`);
    this.code = error.code;
    const text = typeof error.message === "string" ? error.message : "";
    this.pageSizeTooBig =
      error.code === PAGE_SIZE_TOO_BIG ||
      (/\b(page|chunk)[ _]size\b/i.test(text) && /too (big|large)|exceed|maximum|at most/i.test(text));
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

/** JSON-RPC over HTTP POST. A rate limit (HTTP 429, or JSON-RPC -32011 whatever the status) is a RateLimited, with its Retry-After. */
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
    const retryAfter = () => retryAfterMs(response.headers.get("retry-after"));
    if (response.status === 429) throw new RateLimited(method, "HTTP 429", retryAfter());
    let body: { result?: unknown; error?: { code: number } } | undefined;
    try {
      body = (await response.json()) as typeof body;
    } catch {
      if (!response.ok) throw new Error(`${method}: HTTP ${response.status}`);
      throw new Error(`${method}: an answer that is not JSON`);
    }
    if (body?.error?.code === RATE_LIMITED) throw new RateLimited(method, `JSON-RPC ${RATE_LIMITED}`, retryAfter());
    if (!response.ok) throw new Error(`${method}: HTTP ${response.status}`);
    if (!body) throw new Error(`${method}: an answer that is not JSON`);
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

/** An event of one of the five contracts, with its position in its block. */
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

/**
 * `collection` is optional: without it its mints are not read (a deployment before E5b). So is `arena` (#643): without it no
 * attack is read.
 */
export type Addresses = Record<Exclude<Source, "collection" | "arena">, string> & { collection?: string | undefined; arena?: string | undefined };

type Resolved = Record<Exclude<Source, "collection" | "arena">, string> & { collection: string | undefined; arena: string | undefined };

/** Events asked per page of `starknet_getEvents`. */
export const CHUNK_SIZE = 100;

/** Events asked per page of a range read: the public Sepolia node's maximum (2026-10-14; code 31 above it). */
export const RANGE_CHUNK_SIZE = 1024;

/** `starknet_getEvents`: "Requested page size is too big". */
export const PAGE_SIZE_TOO_BIG = 31;

/**
 * JSON-RPC errors that name another cause than a page size: no block (24), an internal error (-32603), a limit of the
 * range or the node (-32005). The indexer never cuts the page size for them.
 */
export const NOT_A_PAGE_SIZE: readonly number[] = [BLOCK_NOT_FOUND, -32603, -32005];

/** An event of a range read: a RawEvent with its block, by number and hash. */
export type RangedEvent = RawEvent & { block: number; blockHash: string };

/** The reads in flight at most, by default (`--concurrency`). */
export const DEFAULT_CONCURRENCY = 8;

export class Chain {
  /** The calls sent, by method: a retry after a rate limit counts again. */
  readonly calls: Record<string, number> = {};
  /** Every read goes through it: the reads in flight, and the rate limits (throttle.ts). */
  readonly throttle: Throttle;
  private readonly rpc: Rpc;
  private readonly addresses: Resolved;

  constructor(rpc: Rpc, addresses: Addresses, throttle?: Throttle) {
    this.rpc = rpc;
    this.throttle = throttle ?? new Throttle({ max: DEFAULT_CONCURRENCY });
    this.addresses = {
      challenge: canonical(addresses.challenge),
      setup: canonical(addresses.setup),
      economy: canonical(addresses.economy),
      collection: addresses.collection === undefined ? undefined : canonical(addresses.collection),
      arena: addresses.arena === undefined ? undefined : canonical(addresses.arena),
    };
  }

  private call(method: string, params: unknown): Promise<unknown> {
    return this.throttle.run(() => {
      this.calls[method] = (this.calls[method] ?? 0) + 1;
      return this.rpc(method, params);
    });
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
   * The events of the four contracts in `block`, fetched by the block's hash, in block order (transaction index, then
   * event index within the transaction). An event reported for another block (hash or number), of another contract, or
   * without its position, is a BadAnswer.
   */
  async events(block: Header): Promise<RawEvent[]> {
    const events: RawEvent[] = [];
    for (const source of SOURCES) {
      const address = this.addresses[source];
      if (address === undefined) continue;
      let token: string | undefined;
      do {
        const page = (await this.call("starknet_getEvents", {
          filter: {
            from_block: { block_hash: block.hash },
            to_block: { block_hash: block.hash },
            address,
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
   * The page size of `rangeEvents`. A refusal known as a page size (code 31 or its text) halves it and its ceiling, for
   * good; the indexer may cut it below the ceiling (a refusal of one block it cannot name) and doubles it back after each
   * ranged read that succeeds, up to the ceiling.
   */
  rangeChunkSize = RANGE_CHUNK_SIZE;
  /** The largest page size not refused as too big. */
  rangeChunkCeiling = RANGE_CHUNK_SIZE;

  /**
   * The events of the four contracts in blocks `from` to `to` (by number), one filter per contract followed through its
   * continuation tokens (a node may answer an empty page with a token: it bounds its own scan), merged in chain order:
   * block, then transaction index, then event index, the order `events` gives within a block. For final blocks only: a
   * number names one block there. A page size the node refuses (code 31, or a text that says so: RpcError.pageSizeTooBig)
   * is halved and the read starts again; any other refusal is thrown (the caller halves the range, then the page). An event outside the range, of another contract, without its block
   * hash or without its position, is a BadAnswer.
   */
  async rangeEvents(from: number, to: number): Promise<RangedEvent[]> {
    for (;;) {
      try {
        return await this.readRange(from, to);
      } catch (error) {
        if (!(error instanceof RpcError) || !error.pageSizeTooBig || this.rangeChunkSize <= 1) throw error;
        this.rangeChunkSize = Math.max(1, Math.floor(this.rangeChunkSize / 2));
        this.rangeChunkCeiling = Math.min(this.rangeChunkCeiling, this.rangeChunkSize);
      }
    }
  }

  private async readRange(from: number, to: number): Promise<RangedEvent[]> {
    const events: RangedEvent[] = [];
    for (const source of SOURCES) {
      const address = this.addresses[source];
      if (address === undefined) continue;
      let token: string | undefined;
      do {
        const page = (await this.call("starknet_getEvents", {
          filter: {
            from_block: { block_number: from },
            to_block: { block_number: to },
            address,
            chunk_size: this.rangeChunkSize,
            ...(token ? { continuation_token: token } : {}),
          },
        })) as EventsPage;
        for (const event of page.events) {
          const block = event.block_number;
          if (!event.block_hash || !Number.isInteger(block) || block! < from || block! > to) {
            throw new BadAnswer(`an event of block ${block} in the answer for blocks ${from} to ${to}`);
          }
          if (canonical(event.from_address) !== address) {
            throw new BadAnswer(`an event of another contract in the answer for ${source}`);
          }
          if (event.transaction_index === undefined || event.event_index === undefined) {
            throw new BadAnswer("an event without its position (JSON-RPC 0.10 is needed)");
          }
          events.push({
            source,
            keys: event.keys,
            data: event.data,
            transaction: canonical(event.transaction_hash),
            transactionIndex: event.transaction_index,
            eventIndex: event.event_index,
            block: block!,
            blockHash: canonical(event.block_hash),
          });
        }
        token = page.continuation_token;
      } while (token);
    }
    // Stable: one contract's events keep the node's order where two positions would tie (they never do on a node).
    return events.sort(
      (a, b) => a.block - b.block || a.transactionIndex - b.transactionIndex || a.eventIndex - b.eventIndex,
    );
  }
}
