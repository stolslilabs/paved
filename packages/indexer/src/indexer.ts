// Copied from Grim World, indexer/src/indexer.ts (https://github.com/bal7hazar/grimworld, commit e405340684e4202440a97a4073fcd2bc43ca49d7),
// Apache-2.0. Adapted for Paved: the follow loop, the reorg rewind, the kept depth, the recheck and the halt rules are
// unchanged; the apply step calls Paved's store (events of the contracts that are known and not indexed are skipped), the
// subscription listeners are reduced to `served` and `rewound` (the answer cache and nothing else), and a hook runs after a
// block is served (the cross-check against the `tournament` view). This copy is maintained by the Paved repository.
//
// The follow loop (D-130; SPK-11 §4, rules R1 and R6). Each step:
// 1. reads the node's tip, then checks the stored tip against the node's block at that height, by
//    hash AND commitments. If they differ, the state is `rewinding`: the fork point is the highest
//    stored block the node still has, and every table goes back to it in one transaction;
// 2. checks, the same way, every stored block not checked since it was applied, and, every
//    `recheck.everyMs`, the last `recheck.depth` blocks below the tip again (on devnet a replaced
//    ancestor can hide under a tip of the same hash and commitments, as empty blocks have); the
//    highest checked block is the served one, and the state is `ok`; then forgets the history
//    below the kept depth, counted from the checked tip (never above the checked blocks);
// 3. applies the next blocks, up to a batch, each with the events of the three contracts in block order,
//    each in one transaction. Before applying block N+1 it reads the stored tip N again, AFTER N+1's
//    header and events were read: N+1 is applied only if N is still the node's (hash AND
//    commitments). On devnet a replacement keeps the replaced block's hash, so N+1's parent hash
//    does not prove N; without this, N+1 could land on a stale N. That read is also N's check.
// It halts (state `halted`, for good; the reason in the log and in every answer) on an event of
// the three contracts it cannot decode, a game or a player that the tables contradict (store.ts), or a
// node that went back below the kept history. A halt found while
// applying is made permanent only if the block and its parent are still the node's when read again;
// otherwise the step ends and the next one rewinds. Pre-confirmed blocks are never read: the
// node's tip is its latest accepted block.
//
// Listeners: `served(previous, next)` once a new block is served, with the block served before it (null after a rewind or
// at the start); `rewound(to)` once the tables went back to block `to`; `status(status, reason)` at every change of
// state. They run synchronously inside the step. A listener that throws is logged and does not stop the loop. The
// `afterServed` option is the one asynchronous hook: it runs after the served block changed, may read the node, and its
// failure is logged, never halts, and is retried at every step (also when no new block came) until it succeeds.
//
// RESIDUAL, DEVNET ONLY: a block replaced deeper than `recheck.depth` below the tip, under
// replacement blocks that keep the aborted blocks' hashes AND commitments (devnet's empty blocks
// do), is not seen: the tip and the window above it look unchanged. On a real network a replaced
// block changes its hash, so its children's parent hashes change up to the tip, and the tip check
// sees it. Nothing here covers that devnet case beyond the window.
import { Chain, sameBlock, type Header } from "./chain.ts";
import { DecodeError, decode } from "./events.ts";
import { Halt, Store, type Applied, type Config } from "./store.ts";

export type Status = "loading" | "ok" | "rewinding" | "halted";

/** How much history is kept: a number of blocks below the tip, or down to the last L1-accepted block. */
export type Depth = number | "l1";

export type Options = {
  chain: Chain;
  store: Store;
  config: Config;
  depth: Depth;
  /** Blocks applied in one step before the tip is checked again (at least 1). */
  batch?: number;
  /**
   * The ancestors checked again: the last `depth` blocks below the tip, at most once every
   * `everyMs` (default 10 blocks every 10 s: `depth` header reads each time).
   */
  recheck?: { depth: number; everyMs: number };
  log?: (message: string) => void;
  /** Runs after the served block changed (never during a rewind); its failure is logged, does not stop the loop, and is retried at every step until it succeeds or the served block changes. */
  afterServed?: (served: Header) => Promise<void>;
};

export type Rewind = { from: number; to: number; ms: number };

export type Listener = {
  served?: (previous: Header | null, next: Header) => void;
  rewound?: (to: number) => void;
  status?: (status: Status, reason: string) => void;
};

/** The rewinds kept in memory for /stats: the count, and the last ones. */
export const REWINDS_KEPT = 20;

const short = (hash: string) => `${hash.slice(0, 10)}…`;

export class Indexer {
  status: Status = "loading";
  reason = "";
  /** The block every answer is read at (R6): the highest block checked after it was applied. */
  served: Header | null = null;
  chainTip = -1;
  blocksApplied = 0;
  eventsApplied = 0;
  rewindCount = 0;
  /** The last REWINDS_KEPT rewinds, oldest first. */
  readonly rewinds: Rewind[] = [];
  readonly chain: Chain;
  readonly store: Store;
  private readonly config: Config;
  private readonly depth: Depth;
  private readonly batch: number;
  private readonly recheck: { depth: number; everyMs: number };
  private lastRecheck = -Infinity;
  private readonly log: (message: string) => void;
  private readonly afterServed: ((served: Header) => Promise<void>) | undefined;
  /** The hook threw for the served block: it runs again at the next step, new block or not. */
  private afterServedFailed = false;
  private readonly listeners = new Set<Listener>();

  constructor(options: Options) {
    this.chain = options.chain;
    this.store = options.store;
    this.config = options.config;
    this.depth = options.depth;
    this.batch = Math.max(1, options.batch ?? 100);
    this.recheck = options.recheck ?? { depth: 10, everyMs: 10_000 };
    this.log = options.log ?? (() => {});
    this.afterServed = options.afterServed;
    this.store.open(this.config);
  }

  /** Adds a listener; returns its removal. */
  listen(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private notify(call: (listener: Listener) => void) {
    for (const listener of [...this.listeners]) {
      try {
        call(listener);
      } catch (error) {
        this.log(`a listener failed: ${(error as Error).message}`);
      }
    }
  }

  private setStatus(next: Status, reason = "") {
    if (this.status === next && this.reason === reason) return;
    this.status = next;
    this.reason = reason;
    this.log(`status ${next}${reason ? `: ${reason}` : ""}`);
    this.notify((listener) => listener.status?.(next, reason));
  }

  /** Stops following for good: every answer is `halted`, with the reason. */
  halt(reason: string) {
    this.setStatus("halted", reason);
  }

  /** The highest stored block at or below `start` that the node still has, or the start's parent. */
  private async forkPoint(start: number): Promise<number> {
    for (let number = start; ; number--) {
      const stored = this.store.block(number);
      if (!stored) break;
      const onChain = await this.chain.header(number);
      if (onChain && sameBlock(onChain, stored)) return number;
    }
    const lowest = this.store.lowest();
    if (!lowest || lowest.number <= this.config.from)
      return this.config.from - 1;
    throw new Halt(
      `the node went back below the kept history: block ${lowest.number} ${short(lowest.hash)} is not the node's`,
    );
  }

  private async rewind(divergent: Header, why: string) {
    this.setStatus("rewinding", why);
    this.served = null;
    const fork = await this.forkPoint(divergent.number - 1);
    const tip = this.store.tip()?.number ?? fork;
    const started = performance.now();
    this.store.rewind(fork);
    const ms = performance.now() - started;
    this.rewindCount++;
    this.rewinds.push({ from: tip, to: fork, ms });
    if (this.rewinds.length > REWINDS_KEPT) this.rewinds.shift();
    this.log(`rewind from ${tip} to ${fork} (${why}) in ${ms.toFixed(1)} ms`);
    this.notify((listener) => listener.rewound?.(fork));
  }

  /** True when the node still has `block` (hash and commitments). */
  private async still(block: Header): Promise<boolean> {
    const now = await this.chain.header(block.number);
    return now !== null && sameBlock(now, block);
  }

  private async runAfterServed(served: Header) {
    if (!this.afterServed) return;
    this.afterServedFailed = false;
    try {
      await this.afterServed(served);
    } catch (error) {
      this.afterServedFailed = true;
      this.log(`after-served hook failed: ${(error as Error).message}`);
    }
  }

  /** One step; true when there is more to do right away. */
  async step(): Promise<boolean> {
    if (this.status === "halted") return false;
    const chainTip = await this.chain.tip();
    this.chainTip = chainTip.number;
    const stored = this.store.tip();
    if (stored) {
      if (!(await this.still(stored))) {
        await this.rewind(
          stored,
          `block ${stored.number} ${short(stored.hash)} is no longer the node's`,
        );
        return true;
      }
      const lowest = this.store.lowest()?.number ?? stored.number;
      let first = this.store.checked() + 1;
      const now = performance.now();
      if (now - this.lastRecheck >= this.recheck.everyMs) {
        first = Math.min(first, stored.number - this.recheck.depth);
        this.lastRecheck = now;
      }
      for (
        let number = Math.max(lowest, first);
        number < stored.number;
        number++
      ) {
        const block = this.store.block(number);
        if (!block) continue;
        if (!(await this.still(block))) {
          await this.rewind(
            block,
            `block ${number} ${short(block.hash)} is no longer the node's`,
          );
          return true;
        }
      }
      const advanced = this.store.checked() < stored.number;
      if (advanced) this.store.setChecked(stored.number);
      if (!this.served || !sameBlock(this.served, stored)) {
        const previous = this.served;
        this.served = stored;
        this.setStatus("ok");
        this.notify((listener) => listener.served?.(previous, stored));
        await this.runAfterServed(stored);
      } else if (this.afterServedFailed) {
        await this.runAfterServed(stored); // idle: the same block again, until the hook succeeds
      }
      if (advanced) await this.prune();
    }
    let next = stored ? stored.number + 1 : this.config.from;
    if (next > chainTip.number) return false;
    const last = Math.min(chainTip.number, next + this.batch - 1);
    for (; next <= last; next++) {
      const block = await this.chain.header(next);
      if (!block) break;
      const below = this.store.tip();
      if (below && block.parent !== below.hash) break; // the next step's checks rewind
      const raws = await this.chain.events(block);
      // Read after the block and its events: the parent is still the stored one (see 3. above).
      if (below) {
        if (!(await this.still(below))) break;
        if (this.store.checked() < below.number)
          this.store.setChecked(below.number);
      }
      try {
        const events = raws.flatMap((raw): Applied[] => {
          try {
            const event = decode(raw.source, raw.keys, raw.data);
            return event ? [{ raw, event }] : []; // null: known, not indexed
          } catch (error) {
            if (!(error instanceof DecodeError)) throw error;
            throw new Halt(
              `undecodable event of ${raw.source} in block ${block.number} (transaction ${raw.transactionIndex}, event ${raw.eventIndex}): ${error.message}`,
            );
          }
        });
        this.store.apply(block, events);
        this.blocksApplied++;
        this.eventsApplied += events.length;
      } catch (error) {
        if (!(error instanceof Halt)) throw error;
        // Permanent only if the block and its parent are still the node's now.
        const consistent =
          (await this.still(block)) && (!below || (await this.still(below)));
        if (consistent) throw error;
        this.log(
          `block ${block.number} changed while it was applied (${error.message}); checking again`,
        );
        break;
      }
    }
    return true;
  }

  /**
   * Forgets the history below the floor. A number of blocks counts down from the indexer's own
   * checked tip, never from the node's: during a catch-up the node is far ahead, and a floor taken
   * from its tip would forget blocks within the configured depth of what the indexer holds (fix
   * loop 2). `l1`: blocks accepted on L1 are final, so the floor is the last of them, never above
   * the checked tip.
   */
  private async prune() {
    const stored = this.store.tip();
    const lowest = this.store.lowest();
    if (!stored || !lowest) return;
    const checked = this.store.checked();
    let floor: number | null;
    if (this.depth === "l1") floor = await this.chain.l1Accepted();
    else floor = checked - this.depth;
    if (floor === null) return; // nothing final yet: everything is kept
    // Never above the checked blocks: a block is checked before its history may be forgotten.
    floor = Math.min(floor, stored.number, checked);
    if (floor > lowest.number) this.store.prune(floor);
  }

  /** Steps until halted or `signal` aborts; waits `pollMs` (at least 1) when idle or after a failed step. */
  async run(pollMs: number, signal: AbortSignal) {
    const wait = Math.max(1, pollMs);
    while (!signal.aborted && this.status !== "halted") {
      let more = false;
      try {
        more = await this.step();
      } catch (error) {
        if (error instanceof Halt) {
          this.halt(error.message);
          break;
        }
        this.log(`step failed: ${(error as Error).message}`);
      }
      if (!more) await sleep(wait, signal);
    }
  }
}

function sleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    if (signal.aborted) return resolve();
    const timer = setTimeout(done, ms);
    function done() {
      clearTimeout(timer);
      signal.removeEventListener("abort", done);
      resolve();
    }
    signal.addEventListener("abort", done);
  });
}
