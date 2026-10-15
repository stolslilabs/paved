import { waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { fakeTerms } from "@paved/chain/testing";
import {
  queryKeys,
  useActiveGame,
  useEconomyDay,
  useEntryPrice,
  useGame,
  usePavedBalance,
  usePlayerGames,
  usePoolQuote,
  useQuote,
  useSpawnPaused,
  useSplit,
  useTerms,
  useUsdcBalance,
  useVaultPosition,
} from "../src/data";
import { GAME_PLAYING } from "../src/mocks/games";
import { PLAYER_ID } from "../src/mocks/players";
import { dataOf, fakeSources, renderData } from "./data-fakes";

describe("the chain's hooks, on @paved/chain's fakes", () => {
  it("useSpawnPaused answers spawn_paused", async () => {
    const f = fakeSources();
    f.views.paused = true;
    const { result } = renderData(() => useSpawnPaused(), f.sources);
    expect(await dataOf(result)).toBe(true);
  });

  it("useEntryPrice answers entry_price", async () => {
    const f = fakeSources();
    const { result } = renderData(() => useEntryPrice(), f.sources);
    expect(await dataOf(result)).toEqual(f.views.price);
  });

  it("useGame answers the game view, and is idle without an id", async () => {
    const f = fakeSources();
    const { result } = renderData(() => useGame(GAME_PLAYING.id), f.sources);
    expect(await dataOf(result)).toEqual(GAME_PLAYING);
    const idle = renderData(() => useGame(null), f.sources);
    expect(idle.result.current.fetchStatus).toBe("idle");
    expect(f.views.calls).toEqual([`game challenge:${GAME_PLAYING.id}`]);
  });

  it("usePlayerGames lists the player's games newest first, the open ones with `open`", async () => {
    const f = fakeSources();
    const all = renderData(() => usePlayerGames(PLAYER_ID), f.sources);
    expect((await dataOf(all.result)).map((g) => g.gameId)).toEqual([GAME_PLAYING.id, 1_038]);
    const open = renderData(() => usePlayerGames(PLAYER_ID, { open: true }), f.sources);
    expect((await dataOf(open.result)).map((g) => g.gameId)).toEqual([GAME_PLAYING.id]);
  });

  it("useActiveGame reads the newest open game with game(id); null when none is open", async () => {
    const f = fakeSources();
    const { result } = renderData(() => useActiveGame(PLAYER_ID), f.sources);
    expect(await dataOf(result)).toEqual(GAME_PLAYING);
    const none = fakeSources({ events: { playerGames: async () => [] } });
    const empty = renderData(() => useActiveGame(PLAYER_ID), none.sources);
    expect(await dataOf(empty.result)).toBeNull();
  });

  it("useQuote answers Economy.quote; null without an economy", async () => {
    const f = fakeSources();
    const { result } = renderData(() => useQuote(3), f.sources);
    expect(await dataOf(result)).toEqual(await f.economy.quote(3));
    const without = renderData(() => useQuote(3), fakeSources({ economy: null }).sources);
    expect(await dataOf(without.result)).toBeNull();
  });

  it("useSplit answers split_bps", async () => {
    const f = fakeSources();
    const { result } = renderData(() => useSplit(), f.sources);
    expect(await dataOf(result)).toEqual(f.economy.split_);
  });

  it("usePoolQuote answers quote_swap", async () => {
    const f = fakeSources();
    const { result } = renderData(() => usePoolQuote(6_000_000n), f.sources);
    expect(await dataOf(result)).toBe(await f.pool.quoteSwap(6_000_000n));
  });

  it("useTerms answers Economy.terms", async () => {
    const f = fakeSources();
    const terms = fakeTerms({ stake: 3, day: GAME_PLAYING.dayId, score: 1_270 });
    f.economy.terms_.set(GAME_PLAYING.id, terms);
    const { result } = renderData(() => useTerms(GAME_PLAYING.id), f.sources);
    expect(await dataOf(result)).toEqual(terms);
  });

  it("useEconomyDay answers Economy.day, and keeps a closed day", async () => {
    const f = fakeSources();
    const closed = { prior: 1, sum: 2n, weight: 3, mean: 1_020_000, closed: true };
    f.economy.days.set(20_000, closed);
    const { result, client } = renderData(() => useEconomyDay(20_000), f.sources);
    expect(await dataOf(result)).toEqual(closed);
    expect(client.getQueryCache().find({ queryKey: queryKeys.chain.day(20_000) })?.isStale()).toBe(false);
  });

  it("useVaultPosition answers the Vault position; null without an economy", async () => {
    const f = fakeSources();
    f.economy.setShares(PLAYER_ID, 1_250n * 10n ** 18n);
    const { result } = renderData(() => useVaultPosition(PLAYER_ID), f.sources);
    expect(await dataOf(result)).toEqual(await f.economy.vault(PLAYER_ID));
    const without = renderData(() => useVaultPosition(PLAYER_ID), fakeSources({ economy: null }).sources);
    expect(await dataOf(without.result)).toBeNull();
  });

  it("useUsdcBalance and usePavedBalance answer the balances", async () => {
    const f = fakeSources();
    f.economy.setBalance("usdc", PLAYER_ID, 48_500_000n);
    f.economy.setBalance("paved", PLAYER_ID, 7n * 10n ** 18n);
    const usdc = renderData(() => useUsdcBalance(PLAYER_ID), f.sources);
    expect(await dataOf(usdc.result)).toBe(48_500_000n);
    const paved = renderData(() => usePavedBalance(PLAYER_ID), f.sources);
    expect(await dataOf(paved.result)).toBe(7n * 10n ** 18n);
  });

  it("does not poll: one read per key, and none after the first answer", async () => {
    const f = fakeSources();
    const { result, rerender } = renderData(() => [useGame(GAME_PLAYING.id), useGame(GAME_PLAYING.id)] as const, f.sources);
    await waitFor(() => expect(result.current[0].data).not.toBeUndefined());
    rerender();
    await new Promise((r) => setTimeout(r, 50));
    expect(f.views.calls).toEqual([`game challenge:${GAME_PLAYING.id}`]);
  });
});
