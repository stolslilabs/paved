import { waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FIXTURE_HEAD } from "@paved/chain/testing";
import { formatRelative } from "@paved/game-core";
import { useChainClock } from "../src/data/clock";
import { fakeSources, renderData } from "./data-fakes";

// UTC-BOUND: the boundaries are read against the indexer's time (P9's clock), not the browser's alone.
const SLOW = 3 * 60;

describe("useChainClock", () => {
  afterEach(() => vi.useRealTimers());

  it("a browser clock 3 minutes slow: the chain's time, so the relative time is right", async () => {
    vi.useFakeTimers({ toFake: ["Date"], now: (FIXTURE_HEAD.timestamp - SLOW) * 1000 });
    const { sources } = fakeSources();
    const { result } = renderData(() => useChainClock(), sources);
    // Before the first read: the browser's clock.
    expect(result.current).toBe(FIXTURE_HEAD.timestamp - SLOW);
    await waitFor(() => expect(result.current).toBeGreaterThanOrEqual(FIXTURE_HEAD.timestamp));
    expect(result.current - FIXTURE_HEAD.timestamp).toBeLessThanOrEqual(1);
  });

  it("the indexer unreachable: the browser's clock", async () => {
    vi.useFakeTimers({ toFake: ["Date"], now: (FIXTURE_HEAD.timestamp - SLOW) * 1000 });
    const { sources, fixture } = fakeSources();
    fixture.state.down = true;
    const { result } = renderData(() => useChainClock(), sources);
    await waitFor(() => expect(fixture.requests).toContain("/v1/head"));
    expect(result.current).toBe(FIXTURE_HEAD.timestamp - SLOW);
  });

  it("the time left to an expiry is right with a slow browser", async () => {
    vi.useFakeTimers({ toFake: ["Date"], now: (FIXTURE_HEAD.timestamp - SLOW) * 1000 });
    const { sources } = fakeSources();
    const { result } = renderData(() => useChainClock(), sources);
    await waitFor(() => expect(result.current).toBeGreaterThanOrEqual(FIXTURE_HEAD.timestamp));
    const expiresAt = FIXTURE_HEAD.timestamp + 10 * 60;
    expect(formatRelative(expiresAt - result.current)).toBe("in 10 min");
    // On the slow browser clock alone it would read 13 min.
    expect(formatRelative(expiresAt - (FIXTURE_HEAD.timestamp - SLOW))).toBe("in 13 min");
  });
});
