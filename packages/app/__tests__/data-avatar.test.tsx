import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { QueryClient } from "@tanstack/react-query";
import { act, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import {
  AvatarPriceChangedError,
  AvatarRefusedError,
  ViewError,
  lookIds,
  lookOf,
  type AvatarItem,
  type AvatarViews,
  type BuyAvatarItemRequest,
  type CobbleAccount,
  type DecodedEvent,
  type FakeGameViews,
  type WriteResult,
} from "@paved/chain";
import { KING_TRAITS, TRAIT_OPTIONS, TRAIT_PARTS, decodeTraits, encodeTraits, seededRandom, type Traits } from "@paved/renderer";
import type { GameSigner } from "../src/data";
import { cobbleKeys } from "../src/data/cobbles";
import { avatarKeys, idsOf, savedLook, useAvatar } from "../src/data/avatar";
import { applyAvatarEvents, useAvatarCatalogue, useAvatarWrites } from "../src/data/avatar-catalogue";
import { avatarOffer, avatarOffers } from "../src/data/avatar-offers";
import { KING_IDS, randomUsable, unusableParts } from "../src/components/containers/avatar-types";
import { AVATAR_FREE, AVATAR_ITEMS, AVATAR_PARTS_IN_USE } from "../src/mocks/avatar";
import { PLAYER_ID } from "../src/mocks/players";
import { FakeAvatarWriter } from "./avatar-fakes";
import { dataOf, fakeSources, renderData } from "./data-fakes";

// The avatar's hooks (#627) on `FakeGameViews` and an in-memory writer with `Avatar`'s checks: the reads, the receipts into the cache.

/** The tests' parts in use (the look has nine traits; the owner sets the count). */
const PARTS = 4;
const OTHER = "0x99";

const event = (name: string, fields: Record<string, unknown>): DecodedEvent => ({ name, fields }) as unknown as DecodedEvent;

function avatarSetup() {
  const fakes = fakeSources();
  fakes.views.avatars.parts = PARTS;
  fakes.views.avatars.bounds = [20, 100];
  for (let part = 0; part < PARTS; part++) {
    fakes.views.listAvatarItem({ part, id: 0 });
    fakes.views.listAvatarItem({ part, id: 1 });
  }
  fakes.views.listAvatarItem({ part: 0, id: 2, cobbles: 30 });
  fakes.views.listAvatarItem({ part: 2, id: 255, cobbles: 100 });
  fakes.views.cobblePlayer(PLAYER_ID).account.cobbles = 100;
  fakes.views.avatarPlayer(OTHER).look = lookOf([1, 0, 1, 1]);
  const writer = new FakeAvatarWriter(fakes.views, PLAYER_ID);
  fakes.sources.signer = writer as unknown as GameSigner;
  return { ...fakes, writer };
}

describe("idsOf", () => {
  it("agrees with the chain's lookIds", () => {
    for (const look of [0n, 1n, 2n, 0x101n, 0x1000000000000000000001n, lookOf([8, 5, 5, 4, 5, 7, 5, 7, 7, 16]), 2n ** 128n - 0xffn]) {
      for (const parts of [0, 4, 9, 10, 15]) expect(idsOf(look, parts), `${look} ${parts}`).toEqual(lookIds(look, parts));
    }
  });

  it("is the traits' look: the renderer's encodeTraits is the chain's lookOf of their ids, and decodeTraits reads idsOf's ids", () => {
    const traits: Traits = { skin: "deep", hair: "grey", eyes: "amber", outfit: "black", pauldrons: "none", hairStyle: "long", beard: "long", headwear: "feathered", accessory: "earrings" };
    const ids = TRAIT_PARTS.map((trait) => (TRAIT_OPTIONS[trait] as readonly string[]).indexOf(traits[trait]));
    const look = encodeTraits(traits);
    expect(look).toBe(lookOf(ids));
    expect(idsOf(look, TRAIT_PARTS.length)).toEqual(ids);
    expect(decodeTraits(lookOf(ids))).toEqual(traits);
    expect(encodeTraits(KING_TRAITS)).toBe(lookOf([]));
  });
});

describe("useAvatar", () => {
  it("reads any player's look and its item ids; none set reads 0n and no ids", async () => {
    const { sources } = avatarSetup();
    const other = renderData(() => useAvatar(OTHER), sources);
    expect(await dataOf(other.result)).toEqual({ look: lookOf([1, 0, 1, 1]), ids: [1, 0, 1, 1] });
    const mine = renderData(() => useAvatar(PLAYER_ID), sources);
    expect(await dataOf(mine.result)).toEqual({ look: 0n, ids: null });
  });

  it("is null on a network without Avatar, and stops pending on a failed read", async () => {
    const { sources, views } = avatarSetup();
    views.avatarFail = new ViewError("not-configured", "Avatar address is not configured");
    const none = renderData(() => useAvatar(OTHER), sources);
    await waitFor(() => expect(none.result.current.data).toBeNull());
    views.avatarFail = new Error("down");
    const failed = renderData(() => useAvatar("0x77"), sources);
    await waitFor(() => expect(failed.result.current.error?.message).toBe("down"));
    expect(failed.result.current.isPending).toBe(false);
  });

  it("is disabled without a player", () => {
    const { sources, views } = avatarSetup();
    const { result } = renderData(() => useAvatar(null), sources);
    expect(result.current.data).toBeUndefined();
    expect(views.calls.filter((c) => c.startsWith("avatar"))).toEqual([]);
  });
});

describe("useAvatarCatalogue", () => {
  it("reads the parts, the bounds, each part's items and owned bitmap, the look and the balance", async () => {
    const { sources, views } = avatarSetup();
    views.avatarPlayer(PLAYER_ID).owned.set(2, 1n << 255n);
    const { result } = renderData(() => useAvatarCatalogue(PLAYER_ID), sources);
    const data = await dataOf(result);
    expect(data?.parts).toBe(PARTS);
    expect(data?.bounds).toEqual([20, 100]);
    expect(data?.items.map((p) => p.length)).toEqual([3, 2, 256, 2]);
    expect(data?.items[0]![2]).toMatchObject({ state: 1, cobbles: 30 });
    expect(data?.owned).toEqual([0n, 0n, 1n << 255n, 0n]);
    expect([data?.look, data?.balance]).toEqual([0n, 100]);
  });

  it("is null on a network without Avatar", async () => {
    const { sources, views } = avatarSetup();
    views.avatarFail = new ViewError("not-configured", "Avatar address is not configured");
    const { result } = renderData(() => useAvatarCatalogue(PLAYER_ID), sources);
    await waitFor(() => expect(result.current.data).toBeNull());
  });
});

describe("useAvatarWrites", () => {
  it("a purchase moves the balance and the owned bitmap; a save moves the look", async () => {
    const { sources, writer } = avatarSetup();
    const reads = renderData(() => ({ catalogue: useAvatarCatalogue(PLAYER_ID), writes: useAvatarWrites(PLAYER_ID) }), sources);
    await waitFor(() => expect(reads.result.current.catalogue.data).toBeTruthy());
    await act(() => reads.result.current.writes.buy(0, 2, 30));
    await waitFor(() => expect(reads.result.current.catalogue.data?.balance).toBe(70));
    expect(reads.result.current.catalogue.data?.owned[0]).toBe(1n << 2n);
    const look = lookOf([2, 1, 0, 1]);
    await act(() => reads.result.current.writes.save(look));
    await waitFor(() => expect(reads.result.current.catalogue.data?.look).toBe(look));
    expect(writer.sent).toEqual(["buy 0 2", `set ${look}`]);
  });

  it("saved is the last write a save that went through; a purchase after it is not", async () => {
    const { sources } = avatarSetup();
    const { result } = renderData(() => useAvatarWrites(PLAYER_ID), sources);
    expect(result.current.saved).toBe(false);
    await act(() => result.current.save(lookOf([1, 1, 0, 1])));
    await waitFor(() => expect(result.current.saved).toBe(true));
    await act(() => result.current.buy(0, 2, 30));
    await waitFor(() => expect(result.current.saved).toBe(false));
  });

  it("the creator's flow on the fakes: try a priced item on, buy it, save the look, and any device reads it", async () => {
    const { sources } = avatarSetup();
    const page = renderData(() => ({ catalogue: useAvatarCatalogue(PLAYER_ID), writes: useAvatarWrites(PLAYER_ID) }), sources);
    await waitFor(() => expect(page.result.current.catalogue.data).toBeTruthy());
    const draft = { ...KING_IDS, skin: 2 };
    // Skin 2 is on sale (30 Cobbles): Save waits for it.
    expect(unusableParts(draft, avatarOffers(page.result.current.catalogue.data!, 0))).toEqual(["skin"]);
    await act(() => page.result.current.writes.buy(0, 2, 30));
    await waitFor(() => expect(unusableParts(draft, avatarOffers(page.result.current.catalogue.data!, 0))).toEqual([]));
    const look = lookOf([2, 0, 0, 0]);
    await act(() => page.result.current.writes.save(look));
    // Another device: a fresh cache on the same chain reads the saved look, decoded as the menus draw it.
    const other = renderData(() => useAvatar(PLAYER_ID), sources);
    const read = await dataOf(other.result);
    expect(decodeTraits(savedLook(read)!)).toEqual({ ...KING_TRAITS, skin: "tan" });
  });

  it("a refusal is the writer's typed error, kept until reset", async () => {
    const { sources } = avatarSetup();
    const { result } = renderData(() => useAvatarWrites(PLAYER_ID), sources);
    await act(async () => {
      await expect(result.current.save(lookOf([2, 0, 0, 0]))).rejects.toBeInstanceOf(AvatarRefusedError);
    });
    await waitFor(() => expect(result.current.error).toBeInstanceOf(AvatarRefusedError));
    act(() => result.current.reset());
    await waitFor(() => expect(result.current.error).toBeNull());
  });

  it("is read only without a signer that writes the avatar", () => {
    const { sources } = avatarSetup();
    sources.signer = null;
    const { result } = renderData(() => useAvatarWrites(PLAYER_ID), sources);
    expect(result.current.signer).toBeNull();
  });
});

describe("applyAvatarEvents", () => {
  it("sets the balance, the owned bit and the look from the receipt", () => {
    const client = new QueryClient();
    const account = { cobbles: 100 } as CobbleAccount;
    client.setQueryData(cobbleKeys.account(PLAYER_ID), account);
    client.setQueryData(avatarKeys.owned(PLAYER_ID, 2), "1");
    applyAvatarEvents(client, PLAYER_ID, [
      event("AvatarItemBought", { part: 2, id: 255, balance: 0 }),
      event("AvatarSet", { look: 0x4001n }),
    ]);
    expect(client.getQueryData<CobbleAccount>(cobbleKeys.account(PLAYER_ID))?.cobbles).toBe(0);
    expect(client.getQueryData(avatarKeys.owned(PLAYER_ID, 2))).toBe(String(1n | (1n << 255n)));
    expect(client.getQueryData(avatarKeys.look(PLAYER_ID))).toBe("16385");
  });
});

describe("avatarOffer and avatarOffers", () => {
  const item = (over: Partial<AvatarItem> = {}): AvatarItem => ({ part: 0, id: 4, state: 1, cobbles: 40, sold: 0, supply: 0, until: 0, ...over });

  it("owned first, then free, on sale, or off (never listed, withdrawn, sold out, past its season)", () => {
    expect(avatarOffer(item(), 1n << 4n, 4, 0)).toEqual({ kind: "owned" });
    expect(avatarOffer(item({ state: 2 }), 1n << 4n, 4, 0)).toEqual({ kind: "owned" });
    expect(avatarOffer(item({ cobbles: 0 }), 0n, 4, 0)).toEqual({ kind: "free" });
    expect(avatarOffer(item({ until: 100 }), 0n, 4, 99)).toEqual({ kind: "sale", cobbles: 40, until: 100 });
    expect(avatarOffer(item({ until: 100 }), 0n, 4, 100)).toEqual({ kind: "off" });
    expect(avatarOffer(item({ supply: 3, sold: 3 }), 0n, 4, 0)).toEqual({ kind: "off" });
    expect(avatarOffer(item({ state: 2 }), 0n, 4, 0)).toEqual({ kind: "off" });
    expect(avatarOffer(undefined, 0n, 4, 0)).toEqual({ kind: "off" });
  });

  it("covers the parts in use and the variants the client draws, on the hook's catalogue", async () => {
    const { sources } = avatarSetup();
    const { result } = renderData(() => useAvatarCatalogue(PLAYER_ID), sources);
    const offers = avatarOffers((await dataOf(result))!, 0);
    expect(Object.keys(offers)).toEqual(TRAIT_PARTS.slice(0, PARTS));
    // Skin has five options: 0 and 1 free, 2 on sale, the rest never listed.
    expect(offers.skin?.map((o) => o.kind)).toEqual(["free", "free", "sale", "off", "off"]);
    // Eyes' item 255 is listed, but the client draws five options: it is left out.
    expect(offers.eyes).toHaveLength(5);
  });

  it("Randomise draws only what can be saved, and leaves the parts not in use at 0", async () => {
    const { sources } = avatarSetup();
    const { result } = renderData(() => useAvatarCatalogue(PLAYER_ID), sources);
    const offers = avatarOffers((await dataOf(result))!, 0);
    for (let seed = 1; seed < 40; seed++) {
      const avatar = randomUsable(offers, seededRandom(seed));
      expect(unusableParts(avatar, offers)).toEqual([]);
      expect(TRAIT_PARTS.slice(PARTS).every((part) => avatar[part] === 0)).toBe(true);
    }
  });
});

describe("savedLook", () => {
  it("is the look saved; null for none saved, a look the chain would not take, or nothing read", () => {
    const look = lookOf([1, 0, 1, 1]);
    expect(savedLook({ look, ids: [1, 0, 1, 1] })).toBe(look);
    expect(decodeTraits(look)).toEqual({ ...KING_TRAITS, skin: "pale", eyes: "blue", outfit: "red" });
    expect(savedLook({ look: 0n, ids: null })).toBeNull();
    expect(savedLook({ look: 2n, ids: null })).toBeNull();
    expect(savedLook(null)).toBeNull();
    expect(savedLook(undefined)).toBeNull();
  });
});

describe("the fresh deployment's catalogue", () => {
  it("is the mocks': the nine traits, and the free items of each (`scripts/deploy.sh`'s FRESH_AVATAR_*)", () => {
    const script = readFileSync(resolve(__dirname, "../../../scripts/deploy.sh"), "utf8");
    expect(Number(/^FRESH_AVATAR_PARTS=(\d+)$/m.exec(script)![1])).toBe(AVATAR_PARTS_IN_USE);
    expect(AVATAR_PARTS_IN_USE).toBe(TRAIT_PARTS.length);
    const free = /^FRESH_AVATAR_FREE=\(([\d ]+)\)$/m.exec(script)![1]!.split(" ").map(Number);
    expect(free).toEqual(TRAIT_PARTS.map((trait) => AVATAR_FREE[trait]));
    // Every skin tone is free, whatever else is paid; and the free items are the mocks' listed at 0.
    expect(AVATAR_FREE.skin).toBe(TRAIT_OPTIONS.skin.length);
    TRAIT_PARTS.forEach((trait, part) => expect(AVATAR_ITEMS[part]!.filter((item) => item.cobbles === 0).map((item) => item.id)).toEqual([...Array(AVATAR_FREE[trait]).keys()]));
  });
});
