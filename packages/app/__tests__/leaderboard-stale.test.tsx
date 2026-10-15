import type { ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { IndexerAnswer, IndexerClient, Leaderboard } from "@paved/chain";
import { FIXTURE_HEAD, FIXTURE_TOURNAMENT } from "@paved/chain/testing";
import { DataProvider } from "../src/data";
import { useLeaderboard } from "../src/data/indexer";
import { fakeSources } from "./data-fakes";

// P2's review note: a day is cached for good only once the indexer has ingested its end, not when the browser's clock
// passes it.

const OPEN_DAY = FIXTURE_TOURNAMENT;
const CLOSED_DAY = FIXTURE_TOURNAMENT - 1;

/** The fixture indexer, its served block set to `timestamp`; counts the leaderboard reads. */
function indexerAt(timestamp: number) {
  const f = fakeSources();
  let reads = 0;
  const indexer = new Proxy(f.indexer, {
    get(target, key) {
      if (key === "leaderboard")
        return async (...a: Parameters<IndexerClient["leaderboard"]>): Promise<IndexerAnswer<Leaderboard>> => {
          reads++;
          const answer = await target.leaderboard(...a);
          return { ...answer, head: { ...answer.head, timestamp } };
        };
      const value = Reflect.get(target, key) as unknown;
      return typeof value === "function" ? value.bind(target) : value;
    },
  });
  return { sources: { ...f.sources, indexer }, reads: () => reads };
}

/** Reads a day, unmounts, reads it again in the same cache (a remount, a return to the page): how many requests were made. */
async function readTwice(day: number, timestamp: number) {
  const { sources, reads } = indexerAt(timestamp);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>
      <DataProvider sources={sources}>{children}</DataProvider>
    </QueryClientProvider>
  );
  const first = renderHook(() => useLeaderboard(day, 20), { wrapper });
  await waitFor(() => expect(first.result.current.data).toBeDefined());
  first.unmount();
  const second = renderHook(() => useLeaderboard(day, 20), { wrapper });
  await waitFor(() => expect(second.result.current.isFetching).toBe(false));
  expect(second.result.current.data?.tournamentId).toBe(day);
  return reads();
}

describe("useLeaderboard: when a day is final", () => {
  it("a day the indexer has ingested the end of is read once", async () => {
    expect(await readTwice(CLOSED_DAY, FIXTURE_HEAD.timestamp)).toBe(1);
  });

  it("a day whose end the indexer has not reached is read again, whatever the browser's clock says", async () => {
    // The closed day's end is 1791849600: the indexer's served block is a second before it.
    expect(await readTwice(CLOSED_DAY, 1791849599)).toBe(2);
  });

  it("today is read again", async () => {
    expect(await readTwice(OPEN_DAY, FIXTURE_HEAD.timestamp)).toBe(2);
  });

  it("the cache entry is stale at once when the read was made before the indexer reached the day's end, and final after", async () => {
    const stale = async (timestamp: number) => {
      const { sources } = indexerAt(timestamp);
      const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
      const wrapper = ({ children }: { children: ReactNode }) => (
        <QueryClientProvider client={client}>
          <DataProvider sources={sources}>{children}</DataProvider>
        </QueryClientProvider>
      );
      const view = renderHook(() => useLeaderboard(CLOSED_DAY, 20), { wrapper });
      await waitFor(() => expect(view.result.current.data).toBeDefined());
      await waitFor(() => expect(view.result.current.isFetching).toBe(false));
      return view.result.current.isStale;
    };
    expect(await stale(1791849599)).toBe(true);
    expect(await stale(FIXTURE_HEAD.timestamp)).toBe(false);
  });
});
