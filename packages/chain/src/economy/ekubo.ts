import { sameAddress, toHex } from "../codec";
import type { PoolQuoter } from "./pool";

/**
 * Ekubo's public quoter (`https://prod-api-quoter.ekubo.org/openapi.json`, version 3.4.10 on 2026-10-10): one host
 * for every chain, the chain id in decimal in the path. It "may undergo breaking changes without notice" (Ekubo's
 * docs): every answer is checked, and anything unexpected is no quote.
 */
export const EKUBO_QUOTER_URL = "https://prod-api-quoter.ekubo.org";

/**
 * The quoter per network (`Deployment.network`), chain ids in decimal: `SN_MAIN` and `SN_SEPOLIA`. On 2026-10-10 the
 * quoter answers 404 `route_not_found` for Starknet Sepolia (Ekubo removed its testnets): a Sepolia purchase is
 * refused until it answers again.
 */
export const EKUBO_NETWORKS: Readonly<Record<string, { baseUrl: string; chainId: string }>> = {
  mainnet: { baseUrl: EKUBO_QUOTER_URL, chainId: "23448594291968334" },
  sepolia: { baseUrl: EKUBO_QUOTER_URL, chainId: "393402133025997798000961" },
};

/** How long a quote may take, the body included, before it is no quote. */
export const EKUBO_TIMEOUT_MS = 5_000;

/** Ekubo's quoter gave no usable quote: the purchase sends nothing. */
export class EkuboQuoteError extends Error {
  constructor(reason: string) {
    super(`Ekubo quote: ${reason}`);
    this.name = "EkuboQuoteError";
  }
}

export interface EkuboPoolQuoterOptions {
  baseUrl: string;
  /** Decimal, as the quoter's path takes it. */
  chainId: string;
  /** The tokens from the Economy deployment, never from the quoter's answer. */
  usdc: string;
  paved: string;
  fetch?: typeof fetch;
  timeoutMs?: number;
}

const UINT = /^[0-9]+$/;

/**
 * The exact-input quote USDC -> PAVED from Ekubo's quoter: `GET <base>/<chain id>/<usdc in>/<USDC>/<PAVED>`, the
 * answer's `total_calculated` (PAVED base units, pool fees included). Each call fetches a fresh quote: nothing is
 * cached. Refused as no quote: a non-2xx answer, a timeout, a malformed body, an amount that is not a positive
 * integer, splits whose inputs do not add up to `usdcIn` or whose outputs do not add up to the total, and a route
 * that does not start from USDC or does not end in PAVED.
 *
 * The quote is the best route over all of Ekubo's pools, split and multi-hop; `Economy` swaps through its one pool
 * key. The quoter takes no pool to keep to: see "Quoter per network" in `docs/architecture/client-economy.md`.
 */
export class EkuboPoolQuoter implements PoolQuoter {
  private readonly fetch: typeof fetch;

  constructor(private readonly options: EkuboPoolQuoterOptions) {
    this.fetch = options.fetch ?? ((input, init) => globalThis.fetch(input, init));
  }

  async quoteSwap(usdcIn: bigint): Promise<bigint> {
    const { baseUrl, chainId, usdc, paved } = this.options;
    if (usdcIn <= 0n) throw new EkuboQuoteError("nothing to swap");
    if (!UINT.test(chainId)) throw new EkuboQuoteError(`not a chain id: ${chainId}`);
    const url = `${baseUrl.replace(/\/+$/, "")}/${chainId}/${usdcIn.toString()}/${toHex(usdc)}/${toHex(paved)}`;
    const body = await this.get(url);
    return checkQuote(body, usdcIn, usdc, paved);
  }

  /** The answer's JSON, within the timeout; the body is read inside it too. */
  private async get(url: string): Promise<unknown> {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeoutMs = this.options.timeoutMs ?? EKUBO_TIMEOUT_MS;
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        controller.abort();
        reject(new EkuboQuoteError(`no answer within ${timeoutMs} ms`));
      }, timeoutMs);
    });
    const read = (async () => {
      let response: Response;
      try {
        response = await this.fetch(url, { signal: controller.signal, headers: { accept: "application/json" } });
      } catch (error) {
        throw new EkuboQuoteError(`request failed: ${error instanceof Error ? error.message : String(error)}`);
      }
      if (!response.ok) throw new EkuboQuoteError(`HTTP ${response.status}`);
      try {
        return (await response.json()) as unknown;
      } catch {
        throw new EkuboQuoteError("the answer is not JSON");
      }
    })();
    try {
      // A fetch that ignores the abort still loses the race.
      return await Promise.race([read, timeout]);
    } finally {
      clearTimeout(timer);
      read.catch(() => {});
    }
  }
}

function record(value: unknown, what: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw new EkuboQuoteError(`malformed ${what}`);
  return value as Record<string, unknown>;
}

/** A positive integer given as a decimal string, as the quoter writes amounts. */
function positive(value: unknown, what: string): bigint {
  if (typeof value !== "string" || !UINT.test(value)) throw new EkuboQuoteError(`${what} is not a positive integer`);
  const amount = BigInt(value);
  if (amount === 0n) throw new EkuboQuoteError(`${what} is 0`);
  return amount;
}

function address(value: unknown, what: string): bigint {
  if (typeof value !== "string" || !/^0x[0-9a-fA-F]{1,64}$/.test(value)) throw new EkuboQuoteError(`malformed ${what}`);
  return BigInt(value);
}

/** The quote's PAVED out, after checking that it answers the request: `usdcIn` of USDC in, every route USDC to PAVED. */
function checkQuote(body: unknown, usdcIn: bigint, usdc: string, paved: string): bigint {
  const quote = record(body, "quote");
  const total = positive(quote.total_calculated, "total_calculated");
  if (!Array.isArray(quote.splits) || quote.splits.length === 0) throw new EkuboQuoteError("no split");
  let specified = 0n;
  let calculated = 0n;
  for (const raw of quote.splits) {
    const split = record(raw, "split");
    specified += positive(split.amount_specified, "amount_specified");
    calculated += positive(split.amount_calculated, "amount_calculated");
    if (!Array.isArray(split.route) || split.route.length === 0) throw new EkuboQuoteError("empty route");
    // Each hop swaps the token in hand for its pool's other token: the first one in is USDC, the last one out PAVED.
    let token = BigInt(usdc);
    for (const node of split.route) {
      const key = record(record(node, "route node").pool_key, "pool_key");
      const token0 = address(key.token0, "token0");
      const token1 = address(key.token1, "token1");
      if (token0 === token1 || (token !== token0 && token !== token1)) throw new EkuboQuoteError("a route does not start from USDC or does not chain");
      token = token === token0 ? token1 : token0;
    }
    if (!sameAddress(token, paved)) throw new EkuboQuoteError("a route does not end in PAVED");
  }
  if (specified !== usdcIn) throw new EkuboQuoteError(`the quote is for ${specified} USDC in, not ${usdcIn}`);
  if (calculated !== total) throw new EkuboQuoteError("the splits do not add up to the total");
  return total;
}
