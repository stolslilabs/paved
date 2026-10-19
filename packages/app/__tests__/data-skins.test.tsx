import { QueryClient } from "@tanstack/react-query";
import { act, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { SkinPriceChangedError, activeThemes, type CobbleAccount } from "@paved/chain";
import type { GameSigner } from "../src/data";
import { cobbleKeys } from "../src/data/cobbles";
import { applySkinEvents, skinChanges, skinKeys, unpackActive, useOwnedSkins, useSkinWrites, useThemeSkins } from "../src/data/skins";
import { PLAYER_ID } from "../src/mocks/players";
import { dataOf, fakeSources, renderData } from "./data-fakes";
import { FOREST_PRICES, FakeSkinWriter } from "./skin-fakes";

// The skins' hooks (P11b) on `FakeGameViews` and `FakeSkinWriter`: the reads, the receipts into the cache, the batch.

function skinsSetup() {
  const fakes = fakeSources();
  fakes.views.priceSkins(1, FOREST_PRICES);
  fakes.views.cobblePlayer(PLAYER_ID).account.cobbles = 240;
  const player = fakes.views.skinPlayer(PLAYER_ID);
  player.owned.set(1, 1 << 7);
  player.active[6] = 1;
  const writer = new FakeSkinWriter(fakes.views, PLAYER_ID);
  fakes.sources.signer = writer as unknown as GameSigner;
  return { ...fakes, writer };
}

describe("useThemeSkins", () => {
  it("reads a theme's 19 prices, the owned word, the active set and the balance", async () => {
    const { sources } = skinsSetup();
    const { result } = renderData(() => useThemeSkins(PLAYER_ID, 1), sources);
    expect(await dataOf(result)).toEqual({ balance: 240, prices: FOREST_PRICES, owned: 1 << 7, active: Array.from({ length: 19 }, (_, i) => (i === 6 ? 1 : 0)) });
  });

  it("reads no price for a theme not out (code null): all 0, nothing owned", async () => {
    const { sources, views } = skinsSetup();
    const { result } = renderData(() => useThemeSkins(PLAYER_ID, null), sources);
    const data = await dataOf(result);
    expect([data?.prices.every((p) => p === 0), data?.owned]).toEqual([true, 0]);
    expect(views.calls.filter((c) => c.startsWith("skin_price") || c.startsWith("skins "))).toEqual([]);
  });

  it("stops pending when a read fails", async () => {
    const { sources, views } = skinsSetup();
    views.skinsFail = new Error("rpc down");
    const { result } = renderData(() => useThemeSkins(PLAYER_ID, 1), sources);
    await waitFor(() => expect(result.current.error?.message).toBe("rpc down"));
    expect(result.current.isPending).toBe(false);
  });

  it("is disabled without a player, and null without the skins views", async () => {
    const { sources, views } = skinsSetup();
    expect(renderData(() => useThemeSkins(null, 1), sources).result.current.data).toBeUndefined();
    const bare = { ...sources, views: { ...views, skinPrices: undefined } as unknown as typeof views };
    expect(renderData(() => useThemeSkins(PLAYER_ID, 1), bare).result.current.data).toBeNull();
  });
});

describe("useOwnedSkins (Themes, My tiles)", () => {
  it("reads the balance, the active set and the owned word of each theme on sale, and no price", async () => {
    const { sources, views } = skinsSetup();
    const { result } = renderData(() => useOwnedSkins(PLAYER_ID), sources);
    expect(await dataOf(result)).toEqual({ balance: 240, active: Array.from({ length: 19 }, (_, i) => (i === 6 ? 1 : 0)), owned: { 1: 1 << 7 } });
    expect(views.calls.filter((c) => c.startsWith("skin_price"))).toEqual([]);
  });

  it("stops pending when a read fails, and is null without the skins views", async () => {
    const { sources, views } = skinsSetup();
    views.skinsFail = new Error("rpc down");
    const { result } = renderData(() => useOwnedSkins(PLAYER_ID), sources);
    await waitFor(() => expect(result.current.error?.message).toBe("rpc down"));
    expect(result.current.isPending).toBe(false);
    const bare = { ...sources, views: { ...views, skinPrices: undefined } as unknown as typeof views };
    expect(renderData(() => useOwnedSkins(PLAYER_ID), bare).result.current.data).toBeNull();
  });
});

describe("the skins' receipts into the cache", () => {
  it("SkinBought sets the balance and the owned bit; SkinsActivated the whole active set", () => {
    const client = new QueryClient();
    const account = { cobbles: 240 } as CobbleAccount;
    client.setQueryData(cobbleKeys.account(PLAYER_ID), account);
    client.setQueryData(skinKeys.owned(PLAYER_ID, 1), 1 << 7);
    client.setQueryData(skinKeys.active(PLAYER_ID), new Array(19).fill(0));
    const word = (1n << (8n * 9n)) | (1n << (8n * 6n));
    applySkinEvents(client, PLAYER_ID, [
      { name: "SkinBought", fields: { playerId: PLAYER_ID, theme: 1, plan: 10, cobbles: 55, balance: 185 }, fromAddress: "0x3" },
      { name: "SkinsActivated", fields: { playerId: PLAYER_ID, active: `0x${word.toString(16)}` }, fromAddress: "0x3" },
    ]);
    expect(client.getQueryData<CobbleAccount>(cobbleKeys.account(PLAYER_ID))?.cobbles).toBe(185);
    expect(client.getQueryData(skinKeys.owned(PLAYER_ID, 1))).toBe((1 << 7) | (1 << 10));
    expect(client.getQueryData<number[]>(skinKeys.active(PLAYER_ID))?.flatMap((t, i) => (t ? [i + 1] : []))).toEqual([7, 10]);
  });

  it("unpacks the active word as @paved/chain's activeThemes does", () => {
    for (const word of [0n, 1n, (255n << (8n * 18n)) | (3n << 8n), (1n << 152n) - 1n]) {
      expect(unpackActive(`0x${word.toString(16)}`)).toEqual(activeThemes(word));
    }
  });

  it("the batch is the changed plans only, in plan order", () => {
    expect(skinChanges({ 13: 0, 7: 1 })).toEqual([{ plan: 7, theme: 1 }, { plan: 13, theme: 0 }]);
    expect(skinChanges({})).toEqual([]);
  });
});

describe("useSkinWrites", () => {
  it("buys, then reconciles: the cache follows the receipt and the reads are asked again", async () => {
    const { sources, writer, views } = skinsSetup();
    const { result } = renderData(() => ({ read: useThemeSkins(PLAYER_ID, 1), writes: useSkinWrites(PLAYER_ID) }), sources);
    await waitFor(() => expect(result.current.read.data).toBeDefined());
    const before = views.calls.length;
    await act(() => result.current.writes.buy(1, 10, 55));
    expect(writer.sent).toEqual([{ buy: { theme: 1, plan: 10 } }]);
    await waitFor(() => expect(result.current.read.data?.balance).toBe(185));
    await waitFor(() => expect(views.calls.slice(before)).toEqual(expect.arrayContaining([`skins ${BigInt(PLAYER_ID)} 1`, `account ${BigInt(PLAYER_ID)}`])));
  });

  it("buys at the price the card showed: a price changed since sends nothing, and the new price is read again", async () => {
    const { sources, writer, views } = skinsSetup();
    const { result } = renderData(() => ({ read: useThemeSkins(PLAYER_ID, 1), writes: useSkinWrites(PLAYER_ID) }), sources);
    await waitFor(() => expect(result.current.read.data?.prices[9]).toBe(55));
    // The owner raises the price after the card was read.
    views.skinPriceTable.set("1:10", 70);
    await act(() => result.current.writes.buy(1, 10, 55).catch(() => undefined));
    await waitFor(() => expect(result.current.writes.error).toBeInstanceOf(SkinPriceChangedError));
    expect(writer.sent).toEqual([]);
    expect(result.current.read.data?.balance).toBe(240);
    await waitFor(() => expect(result.current.read.data?.prices[9]).toBe(70));
  });

  it("saves a batch in one write; a refusal is the error, saved only after a success", async () => {
    const { sources, writer } = skinsSetup();
    const { result } = renderData(() => ({ read: useThemeSkins(PLAYER_ID, 1), writes: useSkinWrites(PLAYER_ID) }), sources);
    await waitFor(() => expect(result.current.read.data).toBeDefined());
    await act(() => result.current.writes.save([{ plan: 8, theme: 1 }]).catch(() => undefined));
    await waitFor(() => expect(result.current.writes.error?.name).toBe("SkinRefusedError"));
    expect(result.current.writes.saved).toBe(false);
    await act(() => result.current.writes.save([{ plan: 7, theme: 0 }]));
    await waitFor(() => expect(result.current.writes.saved).toBe(true));
    expect(result.current.read.data?.active.every((t) => t === 0)).toBe(true);
    expect(writer.sent).toHaveLength(2);
  });

  it("refuses without a signer that writes skins", async () => {
    const { sources } = skinsSetup();
    const { result } = renderData(() => useSkinWrites(PLAYER_ID), { ...sources, signer: { address: PLAYER_ID } as unknown as GameSigner });
    expect(result.current.signer).toBeNull();
    await expect(result.current.buy(1, 10, 55)).rejects.toThrow(/Connect/);
  });
});
