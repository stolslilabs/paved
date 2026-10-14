// Players' display names (N1). A player is a wallet address; a Cartridge Controller account has a username, which a public
// read-only lookup returns. The indexer looks addresses up in the background, keeps the answers in its SQLite (the `names`
// table) and adds `name` to the routes that list players, from the cache only: null until resolved. A name is display
// data: never an identity, never read on the rewind or decode path, and a rebuild may drop it.
//
// The endpoint is undocumented (the PM accepted that risk, 2026-10-14; Glitchbomb relies on it): `POST <url>` with
// `{"addresses": [...]}`. The answer shape is tolerated, not trusted: see `parseLookup`.
import { padded } from "./events.ts";
import type { Store } from "./store.ts";

export const DEFAULT_NAMES_URL = "https://api.cartridge.gg/lookup";

/** A found username stays this long before it is looked up again (it is shown meanwhile). */
export const NAME_TTL_MS = 24 * 3600 * 1000;
/** "No username" is remembered a shorter time: an account may be created after the first look. */
export const NO_NAME_TTL_MS = 3600 * 1000;
/** At most this many addresses in one request. No limit is published: a modest batch. */
export const MAX_BATCH = 50;
/** At most one request this often. No limit is published: 12 requests a minute at most, 600 addresses a minute. */
export const MIN_INTERVAL_MS = 5000;
/** A request that has not answered by then is abandoned. */
export const TIMEOUT_MS = 5000;
/** After a failure the next request waits this long, doubled at each consecutive failure, at most MAX_BACKOFF_MS. */
export const BACKOFF_MS = 30_000;
export const MAX_BACKOFF_MS = 15 * 60 * 1000;
/** Addresses waiting for a request, at most; past it new ones are not queued (they are seen again by the next read). */
export const MAX_PENDING = 2000;
/** A longer username is not a username. */
const MAX_NAME_LENGTH = 64;

/** The found names by address (`padded` form); an address missing from the map has no username. Throws on failure. */
export type Lookup = (addresses: string[], signal: AbortSignal) => Promise<Map<string, string>>;

export class LookupError extends Error {}

/** Normalises an address to its `padded` form, or null when it is not one. */
function addressOf(value: unknown): string | null {
  if (typeof value !== "string" || !/^0x[0-9a-fA-F]{1,64}$/.test(value)) return null;
  return padded(value);
}

function nameOf(value: unknown): string | null {
  if (typeof value !== "string") return null;
  // eslint-disable-next-line no-control-regex
  const name = value.replace(/[\u0000-\u001f\u007f]/g, "").trim();
  return name !== "" && name.length <= MAX_NAME_LENGTH ? name : null;
}

/**
 * Reads an answer of the lookup for `requested` (`padded` addresses). Accepted: `{results: [...]}` or a bare array (as
 * Glitchbomb accepts); an item is `{name}` or `{username}`, with its address in `address` when the service says it, null
 * or a non-object for "none". Without addresses the items map by position, which needs as many items as addresses asked;
 * an empty list means nobody was found. Anything else throws: attributing a name to the wrong address is worse than none.
 */
export function parseLookup(body: unknown, requested: readonly string[]): Map<string, string> {
  const results = Array.isArray(body)
    ? body
    : body !== null && typeof body === "object" && Array.isArray((body as { results?: unknown }).results)
      ? (body as { results: unknown[] }).results
      : null;
  if (!results) throw new LookupError("the answer has no results list");
  const found = new Map<string, string>();
  if (results.length === 0) return found;
  const asked = new Set(requested);
  const objects = results.map((item) => (item !== null && typeof item === "object" ? (item as Record<string, unknown>) : null));
  // The observed shape (2026-10-14): {"username": "bal", "addresses": ["0x2514..."]}, addresses unpadded, misses omitted.
  const addressesOf = (item: Record<string, unknown>): unknown[] =>
    Array.isArray(item.addresses) ? item.addresses : [item.address ?? item.addr];
  const addressed = objects.some(
    (item) => item && (item.addresses !== undefined || item.address !== undefined || item.addr !== undefined),
  );
  if (addressed) {
    for (const item of objects) {
      if (!item) continue;
      const name = nameOf(item.name ?? item.username);
      if (!name) continue;
      for (const raw of addressesOf(item)) {
        const address = addressOf(raw);
        // An address that was not asked is ignored, never trusted.
        if (address && asked.has(address)) found.set(address, name);
      }
    }
    return found;
  }
  if (results.length !== requested.length) {
    throw new LookupError(`${results.length} results without addresses for ${requested.length} addresses asked`);
  }
  objects.forEach((item, index) => {
    const name = item ? nameOf(item.name ?? item.username) : null;
    if (name) found.set(requested[index]!, name);
  });
  return found;
}

/** The real lookup: one POST. `fetch` is injectable for tests. */
export function cartridgeLookup(options: { url?: string; fetch?: typeof fetch } = {}): Lookup {
  const url = options.url ?? DEFAULT_NAMES_URL;
  const doFetch = options.fetch ?? fetch;
  return async (addresses, signal) => {
    const response = await doFetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ addresses }),
      signal,
    });
    if (!response.ok) throw new LookupError(`HTTP ${response.status}`);
    return parseLookup(await response.json(), addresses);
  };
}

export type ResolverOptions = {
  store: Store;
  lookup: Lookup;
  /** Wall clock in milliseconds (TTLs); injectable for tests. */
  now?: () => number;
  /** Monotonic clock in milliseconds (the budget); injectable for tests. */
  mono?: () => number;
  ttlMs?: number;
  noNameTtlMs?: number;
  maxBatch?: number;
  minIntervalMs?: number;
  timeoutMs?: number;
  backoffMs?: number;
  maxBackoffMs?: number;
  maxPending?: number;
  log?: (message: string) => void;
};

/**
 * The cache and the background lookup. `read` answers from the cache alone and never waits; `want` queues the addresses
 * that are unknown or stale; `flush` makes at most one request when the budget allows, and never throws.
 */
export class NameResolver {
  private readonly o: Required<Omit<ResolverOptions, "store" | "lookup" | "log">>;
  private readonly store: Store;
  private readonly lookup: Lookup;
  private readonly log: (message: string) => void;
  private readonly pending = new Set<string>();
  private inFlight = false;
  private nextAt = -Infinity;
  private failures = 0;
  private timer: ReturnType<typeof setInterval> | null = null;
  requests = 0;

  constructor(options: ResolverOptions) {
    this.store = options.store;
    this.lookup = options.lookup;
    this.log = options.log ?? (() => {});
    this.o = {
      now: options.now ?? Date.now,
      mono: options.mono ?? (() => performance.now()),
      ttlMs: options.ttlMs ?? NAME_TTL_MS,
      noNameTtlMs: options.noNameTtlMs ?? NO_NAME_TTL_MS,
      maxBatch: Math.max(1, options.maxBatch ?? MAX_BATCH),
      minIntervalMs: options.minIntervalMs ?? MIN_INTERVAL_MS,
      timeoutMs: options.timeoutMs ?? TIMEOUT_MS,
      backoffMs: options.backoffMs ?? BACKOFF_MS,
      maxBackoffMs: options.maxBackoffMs ?? MAX_BACKOFF_MS,
      maxPending: options.maxPending ?? MAX_PENDING,
    };
  }

  get queued(): number {
    return this.pending.size;
  }

  /**
   * The names of `ids` from the cache: a found name whatever its age (it is refreshed in the background once stale),
   * null for the others. Queues what is unknown or stale. Synchronous, no network.
   */
  read(ids: readonly string[]): Map<string, string | null> {
    const unique = [...new Set(ids)];
    const rows = this.store.names(unique);
    const now = this.o.now();
    const out = new Map<string, string | null>();
    for (const id of unique) {
      const row = rows.get(id);
      out.set(id, row?.name ?? null);
      const age = row ? now - row.checked_at : Infinity;
      const ttl = row?.name ? this.o.ttlMs : this.o.noNameTtlMs;
      if (age >= ttl && this.pending.size < this.o.maxPending) this.pending.add(id);
    }
    return out;
  }

  /**
   * Makes the next request if one is due and the budget allows. Resolves when it is done; never rejects: a failure, a
   * timeout or an unreadable answer leaves the cache as it was and delays the next request.
   */
  async flush(): Promise<void> {
    if (this.inFlight || this.pending.size === 0) return;
    const mono = this.o.mono();
    if (mono < this.nextAt) return;
    const batch = [...this.pending].slice(0, this.o.maxBatch);
    for (const id of batch) this.pending.delete(id);
    this.inFlight = true;
    this.nextAt = mono + this.o.minIntervalMs;
    this.requests++;
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const timeout = new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          controller.abort();
          reject(new LookupError(`no answer in ${this.o.timeoutMs} ms`));
        }, this.o.timeoutMs);
      });
      const found = await Promise.race([this.lookup(batch, controller.signal), timeout]);
      const now = this.o.now();
      this.store.putNames(batch.map((id) => ({ address: id, name: found.get(id) ?? null, checked_at: now })));
      this.failures = 0;
    } catch (error) {
      this.failures++;
      const wait = Math.min(this.o.maxBackoffMs, this.o.backoffMs * 2 ** (this.failures - 1));
      this.nextAt = Math.max(this.nextAt, this.o.mono() + wait);
      this.log(`name lookup failed (${(error as Error).message}); next try in ${Math.round(wait / 1000)} s`);
    } finally {
      clearTimeout(timer);
      this.inFlight = false;
    }
  }

  /** Runs `flush` every second until `stop`. The timer does not keep the process alive. */
  start(): void {
    if (this.timer) return;
    this.timer = setInterval(() => void this.flush(), 1000);
    this.timer.unref();
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }
}
