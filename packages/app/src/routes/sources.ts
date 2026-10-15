import type { PavedClient } from "@paved/chain";
import type { DataSources } from "../data/sources";

/** Why an indexer read fails in this build: no page reads it yet. */
const NOT_CONNECTED = "Not connected: the indexer is wired with its pages (P8 to P10)";

/**
 * A source whose every read is refused with `NOT_CONNECTED`. It imports nothing from `@paved/chain`, so starknet.js
 * stays out of the first bundle until a page that reads the chain brings the real client in its own chunk.
 */
function notConnected<T extends object>(): T {
  return new Proxy({} as T, {
    get: (_target, key) => (key === "then" ? undefined : () => Promise.reject(new Error(NOT_CONNECTED))),
  });
}

/**
 * A part of the chain client whose reads load it on the first call (`data/chain-client.ts`, its own chunk): starknet.js
 * stays out of the first bundle. A deployment that is not configured refuses each read with a `not-configured` error.
 */
function lazyChain<T extends object>(part: (client: PavedClient) => T): T {
  return new Proxy({} as T, {
    get: (_target, key) =>
      key === "then"
        ? undefined
        : async (...args: unknown[]) => {
            const { chainClient } = await import("../data/chain-client");
            const target = part(chainClient()) as Record<PropertyKey, (...a: unknown[]) => unknown>;
            return target[key]!(...args);
          },
  });
}

/**
 * The sources the app's `DataProvider` gives. Training needs only its save, `localStorage` (`store` left out:
 * `trainingStore` falls back to it). The chain's views and events are `PavedClient`'s on the resolved deployment (P5),
 * loaded with the first read. No signer until the wallet connects (P6): a Challenge board is read only. The indexer is
 * refused until its pages are wired (P8, P9); no economy deployment yet, so the economy's hooks answer null.
 */
export const APP_SOURCES: DataSources = {
  views: lazyChain((c) => c.views),
  events: lazyChain((c) => c.events),
  economy: null,
  pool: null,
  indexer: notConnected(),
  signer: null,
};
