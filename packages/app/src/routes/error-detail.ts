import { useMemo } from "react";
import { version } from "../../package.json";
import type { ErrorDetail } from "../components/elements/inline-error";

/** When each error object was first shown: its copied time stays that one, not the last render's. */
const SEEN = new WeakMap<object, number>();

/**
 * The detail `InlineError` copies for support (P-67), from what the page holds: a typed error's name and its transaction
 * hash (`WriteError.transactionHash`), the game, the app's version and the time the error was first shown. A string error carries only that time.
 */
export function errorDetail(error: unknown, extra: { gameId?: number | string; txHash?: string } = {}): ErrorDetail {
  const detail: ErrorDetail = { version, ...extra };
  if (error !== null && typeof error === "object") {
    if (!SEEN.has(error)) SEEN.set(error, Date.now());
    detail.at = SEEN.get(error);
    const name = (error as { name?: unknown }).name;
    if (typeof name === "string" && name !== "Error") detail.code = name;
    const hash = (error as { transactionHash?: unknown }).transactionHash;
    if (typeof hash === "string") detail.txHash = hash;
  } else {
    detail.at = Date.now();
  }
  return detail;
}

/** `errorDetail` kept across renders while the error is the same; undefined when there is none. */
export function useErrorDetail(error: unknown, gameId?: number | string): ErrorDetail | undefined {
  return useMemo(() => (error ? errorDetail(error, gameId === undefined ? {} : { gameId }) : undefined), [error, gameId]);
}
