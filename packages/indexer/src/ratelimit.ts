// Per-address rate limiting for the HTTP server (ruling P-43). A token bucket per client address: `burst` tokens at most,
// refilled at `rate` per second, one taken by every request (GET, OPTIONS or anything else: the check comes before the
// method is looked at). The public indexer sits behind a reverse proxy that may not limit by itself, and other sites share
// the machine, so the limit is in the process.
import { isIP } from "node:net";

/** Idle time after which an address is forgotten: by then its bucket is full again, so forgetting it changes nothing. */
export const BUCKET_IDLE_TTL_MS = 10 * 60 * 1000;

/** The most addresses tracked at once; past it the one unused for longest is dropped first. A few hundred bytes each. */
export const MAX_TRACKED_ADDRESSES = 10_000;

/** Defaults of `--rate` and `--burst`: one page view makes a handful of requests, so 10/s with a burst of 20 is generous. */
export const DEFAULT_RATE = 10;
export const DEFAULT_BURST = 20;

export type RateLimitOptions = {
  /** Requests per second refilled; 0 or less disables the limit. */
  rate: number;
  /** The bucket's size: requests allowed at once, at least 1. */
  burst: number;
  /** The clock in milliseconds (injectable for tests). */
  now?: () => number;
  /** Overrides of the memory bounds (tests). */
  idleTtlMs?: number;
  maxAddresses?: number;
};

export type Verdict = { allowed: true } | { allowed: false; retryAfter: number };

type Bucket = { tokens: number; at: number };

export class RateLimiter {
  private readonly rate: number;
  private readonly burst: number;
  private readonly now: () => number;
  private readonly idleTtlMs: number;
  private readonly maxAddresses: number;
  // Insertion order is last-use order: a used address is re-inserted at the end, so the oldest comes first.
  private readonly buckets = new Map<string, Bucket>();

  constructor(options: RateLimitOptions) {
    this.rate = options.rate;
    this.burst = Math.max(1, options.burst);
    this.now = options.now ?? Date.now;
    this.idleTtlMs = options.idleTtlMs ?? BUCKET_IDLE_TTL_MS;
    this.maxAddresses = options.maxAddresses ?? MAX_TRACKED_ADDRESSES;
  }

  /** Addresses currently tracked. */
  get size(): number {
    return this.buckets.size;
  }

  /** Takes one token of `address`'s bucket, or says in whole seconds when one will be there. */
  take(address: string): Verdict {
    const now = this.now();
    this.forgetIdle(now);
    const known = this.buckets.get(address);
    const bucket: Bucket = known
      ? {
          tokens: Math.min(this.burst, known.tokens + ((now - known.at) / 1000) * this.rate),
          at: now,
        }
      : { tokens: this.burst, at: now };
    this.buckets.delete(address);
    let verdict: Verdict = { allowed: true };
    if (bucket.tokens >= 1) bucket.tokens -= 1;
    else
      verdict = {
        allowed: false,
        retryAfter: Math.max(1, Math.ceil((1 - bucket.tokens) / this.rate)),
      };
    this.buckets.set(address, bucket);
    // Over the cap: drop the oldest. The address just used is last, so it stays.
    while (this.buckets.size > this.maxAddresses) {
      const oldest = this.buckets.keys().next().value as string;
      this.buckets.delete(oldest);
    }
    return verdict;
  }

  /** Forgets the addresses idle for the TTL; the map is in last-use order, so it stops at the first one still live. */
  private forgetIdle(now: number) {
    for (const [address, bucket] of this.buckets) {
      if (now - bucket.at < this.idleTtlMs) break;
      this.buckets.delete(address);
    }
  }
}

/** A limiter, or null when the limit is off (`rate` 0). */
export const limiterOf = (options: RateLimitOptions | undefined): RateLimiter | null =>
  options && options.rate > 0 ? new RateLimiter(options) : null;

const LOOPBACK = new Set(["127.0.0.1", "::1", "::ffff:127.0.0.1"]);

/** Whether the socket peer is this machine (the reverse proxy next to the process). */
export const isLoopback = (peer: string | undefined): boolean =>
  peer !== undefined && LOOPBACK.has(peer.toLowerCase());

/** An address as a key: lowercase, an IPv4-mapped IPv6 address as the IPv4 one. */
function normalized(address: string): string {
  const lower = address.toLowerCase();
  const mapped = /^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/.exec(lower);
  return mapped && isIP(mapped[1]!) === 4 ? mapped[1]! : lower;
}

/**
 * The client address a request is counted under. `X-Forwarded-For` is read only when the socket peer is loopback (the proxy
 * on this machine): from anyone else it is the client's own claim and is ignored. Then the left-most entry is the client
 * the proxy saw; if it is not an IP address the peer is used. Several header lines arrive joined by commas.
 */
export function clientAddress(
  peer: string | undefined,
  forwardedFor: string | string[] | undefined,
): string {
  const socket = normalized(peer ?? "unknown");
  if (!isLoopback(peer) || forwardedFor === undefined) return socket;
  const first = (Array.isArray(forwardedFor) ? forwardedFor.join(",") : forwardedFor)
    .split(",")[0]!
    .trim();
  return isIP(first) ? normalized(first) : socket;
}
