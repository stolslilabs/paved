// The node's rate limits (I2). Every read of Chain goes through one Throttle: at most `limit` calls in flight, a call the
// node answers as rate limited (HTTP 429 or JSON-RPC -32011, as S-1f retries them for the signer) waited out and sent again.
// These are reads only: a retry never changes an answer, and a rate limit never becomes a wrong answer or a skipped block;
// after `attempts` refusals in a row the error is thrown, the step fails and is retried after the poll wait.
//
// The wait: the answer's Retry-After when it gives one, at most MAX_WAIT_MS; otherwise BASE_WAIT_MS doubled at each
// attempt, at most MAX_WAIT_MS. Every caller waits it, not only the refused one, so a burst of refusals never loops hot.
// The limit: halved (at least 1) at each refusal, and raised back by one after `limit` successes in a row, up to `max`.

/** A call the node refused as rate limited; `retryAfterMs` is its Retry-After, when it gave one. */
export class RateLimited extends Error {
  readonly retryAfterMs: number | undefined;
  constructor(method: string, cause: string, retryAfterMs?: number) {
    super(`${method}: rate limited (${cause})`);
    this.retryAfterMs = retryAfterMs;
  }
}

/** JSON-RPC: "rate limit" (the public Sepolia node, S-1f). */
export const RATE_LIMITED = -32011;

/** The longest wait, whatever Retry-After asks. */
export const MAX_WAIT_MS = 30_000;
/** The first wait when Retry-After is absent. */
export const BASE_WAIT_MS = 500;
/** Refusals in a row before a call fails. */
export const ATTEMPTS = 8;

/** A Retry-After header (delta-seconds or an HTTP date) in milliseconds; undefined when absent or unreadable. */
export function retryAfterMs(value: string | null | undefined, now = Date.now()): number | undefined {
  const text = value?.trim();
  if (!text) return undefined;
  if (/^\d{1,9}$/.test(text)) return Number(text) * 1000;
  const date = Date.parse(text);
  return Number.isNaN(date) ? undefined : Math.max(0, date - now);
}

export type ThrottleOptions = {
  /** The most calls in flight (at least 1). */
  max: number;
  attempts?: number;
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
  log?: (message: string) => void;
};

export class Throttle {
  readonly max: number;
  /** The calls allowed in flight now: `max`, lowered by refusals. */
  limit: number;
  /** Rate-limit answers seen. */
  refusals = 0;
  private inFlight = 0;
  private successes = 0;
  private resumeAt = 0;
  private readonly waiting: (() => void)[] = [];
  private readonly attempts: number;
  private readonly sleep: (ms: number) => Promise<void>;
  private readonly now: () => number;
  log: (message: string) => void;

  constructor(options: ThrottleOptions) {
    this.max = Math.max(1, Math.floor(options.max));
    this.limit = this.max;
    this.attempts = Math.max(1, options.attempts ?? ATTEMPTS);
    this.sleep = options.sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
    this.now = options.now ?? (() => performance.now());
    this.log = options.log ?? (() => {});
  }

  /** Runs `call`, within the limit, again after each rate-limit answer. */
  async run<T>(call: () => Promise<T>): Promise<T> {
    for (let attempt = 1; ; attempt++) {
      await this.acquire();
      let wait: number;
      try {
        const result = await call();
        this.succeeded();
        return result;
      } catch (error) {
        if (!(error instanceof RateLimited)) throw error;
        wait = this.refused(error, attempt);
        if (attempt >= this.attempts) throw error;
      } finally {
        this.release();
      }
      await this.sleep(wait);
    }
  }

  private async acquire() {
    for (;;) {
      const pause = this.resumeAt - this.now();
      if (pause > 0) await this.sleep(pause);
      else if (this.inFlight < this.limit) {
        this.inFlight++;
        return;
      } else await new Promise<void>((resolve) => this.waiting.push(resolve));
    }
  }

  private release() {
    this.inFlight--;
    this.waiting.shift()?.();
  }

  private succeeded() {
    if (this.limit >= this.max) return;
    if (++this.successes >= this.limit) {
      this.successes = 0;
      this.limit++;
      this.wake();
    }
  }

  /** Counts a refusal, lowers the limit, and returns the wait before the next attempt (every caller waits it). */
  private refused(error: RateLimited, attempt: number): number {
    this.refusals++;
    this.successes = 0;
    const lowered = Math.max(1, Math.floor(this.limit / 2));
    const wait = Math.min(MAX_WAIT_MS, error.retryAfterMs ?? BASE_WAIT_MS * 2 ** (attempt - 1));
    this.resumeAt = Math.max(this.resumeAt, this.now() + wait);
    if (lowered < this.limit) this.log(`rate limited: ${lowered} reads in flight at most (was ${this.limit})`);
    this.limit = lowered;
    return wait;
  }

  /** Lets waiting callers in after the limit rose. */
  private wake() {
    for (const resume of this.waiting.splice(0)) resume();
  }
}
