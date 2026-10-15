import type { DataSources } from "../data/sources";

/** Why a chain or indexer read fails in this build: no page reads them yet. */
const NOT_CONNECTED = "Not connected: the chain and the indexer are wired with their pages (P5 to P10)";

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
 * The sources the app's `DataProvider` gives (P3). Training needs only its save, `localStorage` (`store` left out:
 * `trainingStore` falls back to it). The chain's views and events and the indexer are refused until the pages that
 * read them are wired (P5: `PavedClient.views` and `.events` on the resolved deployment; P8, P9: the indexer client);
 * no economy deployment yet, so the economy's hooks answer null.
 */
export const APP_SOURCES: DataSources = {
  views: notConnected(),
  events: notConnected(),
  economy: null,
  pool: null,
  indexer: notConnected(),
};
