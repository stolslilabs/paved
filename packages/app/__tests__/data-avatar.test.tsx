import { QueryClient } from "@tanstack/react-query";
import { act, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import {
  AvatarPriceChangedError,
  AvatarRefusedError,
  ViewError,
  lookIds,
  lookOf,
  type AvatarViews,
  type BuyAvatarItemRequest,
  type CobbleAccount,
  type DecodedEvent,
  type FakeGameViews,
  type WriteResult,
} from "@paved/chain";
import type { GameSigner } from "../src/data";
import { cobbleKeys } from "../src/data/cobbles";
import { applyAvatarEvents, avatarKeys, partsOf, useAvatar, useAvatarCatalogue, useAvatarWrites } from "../src/data/avatar";
import { PLAYER_ID } from "../src/mocks/players";
import { dataOf, fakeSources, renderData } from "./data-fakes";

// The avatar's hooks (#627) on `FakeGameViews` and an in-memory writer with `Avatar`'s checks: the reads, the receipts into the cache.

/** The tests' layout: four categories of 3, 4, 7 and 2 bits (the owner's comes with #626's format). */
const WIDTHS = [3, 4, 7, 2];
const OTHER = "0x99";

const event = (name: string, fields: Record<string, unknown>): DecodedEvent => ({ name, fields }) as unknown as DecodedEvent;

/** `Avatar`'s writes in memory, on the fake views: `buy_avatar_item` and `set_avatar` with the contract's checks. */
class FakeAvatarWriter {
  readonly sent: string[] = [];
  constructor(
    readonly views: FakeGameViews,
    readonly address: string,
  ) {}

  async buyAvatarItem({ category, id, confirmedPrice }: BuyAvatarItemRequest, views: Pick<AvatarViews, "avatarItem">): Promise<WriteResult> {
    const item = await views.avatarItem(category, id);
    const current = item.state === 1 ? item.cobbles : 0;
    if (current !== confirmedPrice) throw new AvatarPriceChangedError(confirmedPrice, current);
    this.sent.push(`buy ${category} ${id}`);
    const player = this.views.avatarPlayer(this.address);
    const ledger = this.views.cobblePlayer(this.address);
    const owned = player.owned.get(category) ?? 0n;
    if (owned & (1n << BigInt(id))) throw new AvatarRefusedError("owned", "0x1");
    if (ledger.account.cobbles < current) throw new AvatarRefusedError("not-enough-cobbles", "0x1");
    ledger.account = { ...ledger.account, cobbles: ledger.account.cobbles - current };
    player.owned.set(category, owned | (1n << BigInt(id)));
    return { transactionHash: "0x1", events: [event("AvatarItemBought", { playerId: this.address, category, id, cobbles: current, sold: 1, balance: ledger.account.cobbles })] };
  }

  async setAvatar(look: bigint): Promise<WriteResult> {
    this.sent.push(`set ${look}`);
    const player = this.views.avatarPlayer(this.address);
    const ids = lookIds(look, this.views.avatars.layout);
    if (look !== 0n) {
      if (!ids) throw new AvatarRefusedError("invalid-look", "0x2");
      ids.forEach((id, category) => {
        const item = this.views.avatars.items.get(`${category}:${id}`);
        const free = item?.state === 1 && item.cobbles === 0;
        if (!free && !((player.owned.get(category) ?? 0n) & (1n << BigInt(id)))) throw new AvatarRefusedError("not-owned", "0x2");
      });
    }
    player.look = look;
    return { transactionHash: "0x2", events: [event("AvatarSet", { playerId: this.address, look })] };
  }
}

function avatarSetup() {
  const fakes = fakeSources();
  fakes.views.avatars.layout = [...WIDTHS];
  fakes.views.avatars.bounds = [20, 100];
  for (let category = 0; category < WIDTHS.length; category++) {
    fakes.views.listAvatarItem({ category, id: 0 });
    fakes.views.listAvatarItem({ category, id: 1 });
  }
  fakes.views.listAvatarItem({ category: 0, id: 2, cobbles: 30 });
  fakes.views.cobblePlayer(PLAYER_ID).account.cobbles = 100;
  fakes.views.avatarPlayer(OTHER).look = lookOf([1, 0, 1, 1], WIDTHS);
  const writer = new FakeAvatarWriter(fakes.views, PLAYER_ID);
  fakes.sources.signer = writer as unknown as GameSigner;
  return { ...fakes, writer };
}

describe("partsOf", () => {
  it("agrees with the chain's lookIds", () => {
    for (const look of [0n, 1n, 0x4000n, 0xffffn, 0x10000n, lookOf([7, 15, 127, 3], WIDTHS)]) {
      expect(partsOf(look, WIDTHS)).toEqual(lookIds(look, WIDTHS));
    }
  });
});

describe("useAvatar", () => {
  it("reads any player's look and its parts; none set reads 0n and no parts", async () => {
    const { sources } = avatarSetup();
    const other = renderData(() => useAvatar(OTHER), sources);
    expect(await dataOf(other.result)).toEqual({ look: lookOf([1, 0, 1, 1], WIDTHS), parts: [1, 0, 1, 1] });
    const mine = renderData(() => useAvatar(PLAYER_ID), sources);
    expect(await dataOf(mine.result)).toEqual({ look: 0n, parts: null });
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
  it("reads the layout, the bounds, each category's items and owned bitmap, the look and the balance", async () => {
    const { sources, views } = avatarSetup();
    views.avatarPlayer(PLAYER_ID).owned.set(2, 1n << 127n);
    const { result } = renderData(() => useAvatarCatalogue(PLAYER_ID), sources);
    const data = await dataOf(result);
    expect(data?.widths).toEqual(WIDTHS);
    expect(data?.bounds).toEqual([20, 100]);
    expect(data?.items.map((c) => c.length)).toEqual([8, 16, 128, 4]);
    expect(data?.items[0]![2]).toMatchObject({ state: 1, cobbles: 30 });
    expect(data?.owned).toEqual([0n, 0n, 1n << 127n, 0n]);
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
    const look = lookOf([2, 1, 0, 1], WIDTHS);
    await act(() => reads.result.current.writes.save(look));
    await waitFor(() => expect(reads.result.current.catalogue.data?.look).toBe(look));
    expect(writer.sent).toEqual(["buy 0 2", `set ${look}`]);
  });

  it("a refusal is the writer's typed error, kept until reset", async () => {
    const { sources } = avatarSetup();
    const { result } = renderData(() => useAvatarWrites(PLAYER_ID), sources);
    await act(async () => {
      await expect(result.current.save(lookOf([2, 0, 0, 0], WIDTHS))).rejects.toBeInstanceOf(AvatarRefusedError);
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
      event("AvatarItemBought", { category: 2, id: 127, balance: 0 }),
      event("AvatarSet", { look: 0x4000n }),
    ]);
    expect(client.getQueryData<CobbleAccount>(cobbleKeys.account(PLAYER_ID))?.cobbles).toBe(0);
    expect(client.getQueryData(avatarKeys.owned(PLAYER_ID, 2))).toBe(String(1n | (1n << 127n)));
    expect(client.getQueryData(avatarKeys.look(PLAYER_ID))).toBe("16384");
  });
});
