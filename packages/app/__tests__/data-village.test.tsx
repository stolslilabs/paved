import { QueryClient } from "@tanstack/react-query";
import { act, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { REWARD_COBBLES as CHAIN_REWARD_COBBLES, ViewError, VillageRefusedError, tierOf, type DecodedEvent, type RewardOffer } from "@paved/chain";
import { EngineGame, startTerritory, villageGame, villageRefusal } from "@paved/game-core";
import type { GameSigner } from "../src/data";
import { cobbleKeys } from "../src/data/cobbles";
import {
  REWARD_COBBLES,
  START_CELLS,
  STARTER,
  applyVillageEvents,
  chainTier,
  copiesByPlan,
  tierGates,
  useSkinTierGates,
  useVillage,
  useVillageReward,
  useVillageWrites,
  villageKeys,
} from "../src/data/village";
import { fits, legalCells } from "../src/components/containers/village-rules";
import { PLAYER_ID } from "../src/mocks/players";
import { dataOf, fakeSources, renderData } from "./data-fakes";
import { FakeVillageWriter } from "./village-fakes";

// The village screen's hooks (#646 PR 2) on `FakeGameViews` and an in-memory writer with `Village`'s and `Rewards`' checks.

const OTHER = "0x99";
const event = (name: string, fields: Record<string, unknown>): DecodedEvent => ({ name, fields }) as unknown as DecodedEvent;

function villageSetup() {
  const fakes = fakeSources();
  fakes.views.cobblePlayer(PLAYER_ID).account.cobbles = 50;
  const writer = new FakeVillageWriter(fakes.views, PLAYER_ID);
  fakes.sources.signer = writer as unknown as GameSigner;
  return { ...fakes, writer };
}

/** A founded village of `OTHER`: the start, one parcel, a road east of the starter, 3 copies of the road. */
function founded(views: ReturnType<typeof villageSetup>["views"], player = OTHER) {
  const v = views.villagePlayer(player);
  v.cells = [...startTerritory(), { x: 2, y: 0 }];
  v.tiles = [{ ...STARTER }];
  v.info = { gameId: 4, cells: 10, tiles: 0, score: 0, nextParcel: 2, nextPrice: 20, nextLevel: 2 };
  v.copies[9] = 3;
  return v;
}

describe("the chain's values", () => {
  it("agree with @paved/chain and game-core", () => {
    expect(REWARD_COBBLES).toBe(CHAIN_REWARD_COBBLES);
    for (let n = 0; n < 70; n++) expect(chainTier(n), String(n)).toBe(tierOf(n));
    expect(START_CELLS).toEqual(startTerritory());
    const game = EngineGame.village();
    expect(game.placed()).toHaveLength(1);
    expect(villageGame(START_CELLS, [STARTER]).placed()).toEqual(game.placed());
  });

  it("the scene's rules place a tile where Village.place would", () => {
    // Grow a village on the engine, then compare every cell, plan and orientation.
    const cells = [...startTerritory(), { x: 2, y: 0 }, { x: 2, y: 1 }, { x: 0, y: 2 }];
    const tiles = [{ ...STARTER }];
    for (const plan of [10, 13, 9, 18, 12, 1, 7]) {
      const game = villageGame(cells, tiles);
      for (const cell of [...cells, { x: 3, y: 0 }]) {
        for (let p = 1; p <= 19; p++) {
          for (let o = 1; o <= 4; o++) {
            expect(fits({ cells, tiles }, p, o, cell), `${p}/${o} at ${cell.x},${cell.y}`).toBe(villageRefusal(game, p, o, cell) === null);
          }
        }
      }
      const spot = legalCells({ cells, tiles }, plan)[0];
      if (spot) tiles.push({ id: tiles.length + 1, plan, orientation: spot.orientations[0]!, x: spot.x, y: spot.y });
    }
    expect(tiles.length).toBeGreaterThan(4);
  });
});

describe("useVillage", () => {
  it("reads a founded village: its cells, tiles, score, cap, copies, next parcel and its owner's level", async () => {
    const { sources, views } = villageSetup();
    const v = founded(views);
    v.info.score = 120;
    views.cobblePlayer(OTHER).account.xp = 100;
    const { result } = renderData(() => useVillage(OTHER, "Rook"), sources);
    const data = await dataOf(result);
    expect(data?.founded).toBe(true);
    expect(data?.parcel).toEqual({ price: 20, level: 2 });
    expect(data?.village).toMatchObject({ owner: "Rook", level: 2, score: 120, maxCells: 38, copies: { 10: 3 } });
    expect(data?.village.cells).toHaveLength(10);
    expect(data?.village.tiles).toEqual([STARTER]);
  });

  it("not founded: the start it would get, no parcel", async () => {
    const { sources } = villageSetup();
    const { result } = renderData(() => useVillage(PLAYER_ID, "Me"), sources);
    const data = await dataOf(result);
    expect(data).toMatchObject({ founded: false, parcel: null });
    expect(data?.village.cells).toEqual(START_CELLS);
    expect(data?.village.tiles).toEqual([STARTER]);
    expect(data?.village.copies).toEqual({});
  });

  it("is null on a network without Village, and stops pending on a failed read", async () => {
    const { sources, views } = villageSetup();
    views.villageFail = new ViewError("not-configured", "Village address is not configured");
    const none = renderData(() => useVillage(OTHER, "Rook"), sources);
    await waitFor(() => expect(none.result.current.data).toBeNull());
    views.villageFail = new Error("down");
    const failed = renderData(() => useVillage("0x77", "x"), sources);
    await waitFor(() => expect(failed.result.current.error?.message).toBe("down"));
    expect(failed.result.current.isPending).toBe(false);
  });

  it("is disabled without a player", () => {
    const { sources, views } = villageSetup();
    const { result } = renderData(() => useVillage(null, ""), sources);
    expect(result.current.data).toBeUndefined();
    expect(views.calls.filter((c) => /^(village|cells|tiles|copies)/.test(c))).toEqual([]);
  });
});

describe("useVillageReward", () => {
  it("an open offer: its 3 tiles and the Cobbles instead; none open: the rewards waiting", async () => {
    const { sources, views } = villageSetup();
    const v = views.villagePlayer(PLAYER_ID);
    v.grants = { day: 1, today: 2, pending: 2, opened: 0 };
    const waiting = renderData(() => useVillageReward(PLAYER_ID), sources);
    expect(await dataOf(waiting.result)).toEqual({ offer: null, pending: 2 });
    v.offer = { index: 1, plans: [10, 18, 13] };
    const open = renderData(() => useVillageReward(PLAYER_ID), sources);
    expect(await dataOf(open.result)).toEqual({ offer: { plans: [10, 18, 13], cobbles: REWARD_COBBLES }, pending: 2 });
  });

  it("is null on a network without Rewards", async () => {
    const { sources, views } = villageSetup();
    views.villageFail = new ViewError("not-configured", "Rewards address is not configured");
    const { result } = renderData(() => useVillageReward(PLAYER_ID), sources);
    await waitFor(() => expect(result.current.data).toBeNull());
  });
});

describe("useSkinTierGates", () => {
  it("names the skins reserved to a tier and whether the player's plan reached it", async () => {
    const { sources, views } = villageSetup();
    views.skinTierTable.set("1:1", 1);
    views.skinTierTable.set("1:18", 3);
    views.villagePlayer(PLAYER_ID).copies[0] = 2;
    views.villagePlayer(PLAYER_ID).copies[17] = 7;
    const { result } = renderData(() => useSkinTierGates(PLAYER_ID, 1), sources);
    expect(await dataOf(result)).toEqual({ 1: { tier: 1, name: "Silver", reached: true }, 18: { tier: 3, name: "Diamond", reached: false } });
  });

  it("a guest reached none; a tier past the client's names shows as the last", () => {
    expect(tierGates([2, 0, 6], [])).toEqual({ 1: { tier: 2, name: "Gold", reached: false }, 3: { tier: 4, name: "Ruby", reached: false } });
    expect(tierGates([0, 0, 6], [0, 0, 64])[3]?.reached).toBe(true);
  });

  it("reads nothing for a theme not out", () => {
    const { sources, views } = villageSetup();
    const { result } = renderData(() => useSkinTierGates(PLAYER_ID, null), sources);
    expect(result.current.data).toBeNull();
    expect(views.calls.filter((c) => c.startsWith("skin_tiers"))).toEqual([]);
  });
});

describe("applyVillageEvents", () => {
  it("RewardOpened sets the offer; RewardClaimed clears it and sets the plan's copies", () => {
    const client = new QueryClient();
    client.setQueryData(villageKeys.copies(PLAYER_ID), new Array(19).fill(0));
    applyVillageEvents(client, PLAYER_ID, [event("RewardOpened", { index: 2n, plan1: 10n, plan2: 9n, plan3: 18n })]);
    expect(client.getQueryData<RewardOffer>(villageKeys.offer(PLAYER_ID))).toEqual({ index: 2, plans: [10, 9, 18] });
    applyVillageEvents(client, PLAYER_ID, [event("RewardClaimed", { index: 2n, choice: 2n, plan: 18n, copies: 3n })]);
    expect(client.getQueryData<RewardOffer>(villageKeys.offer(PLAYER_ID))?.plans).toEqual([0, 0, 0]);
    expect(client.getQueryData<number[]>(villageKeys.copies(PLAYER_ID))?.[17]).toBe(3);
    expect(copiesByPlan(client.getQueryData<number[]>(villageKeys.copies(PLAYER_ID))!)).toEqual({ 18: 3 });
  });
});

describe("useVillageWrites", () => {
  it("found, open a reward, place a tile: each receipt moves the reads", async () => {
    const { sources, views, writer } = villageSetup();
    views.villagePlayer(PLAYER_ID).grants = { day: 1, today: 1, pending: 2, opened: 0 };
    const { result } = renderData(() => ({ village: useVillage(PLAYER_ID, "Me"), reward: useVillageReward(PLAYER_ID), writes: useVillageWrites(PLAYER_ID) }), sources);
    await waitFor(() => expect(result.current.village.data?.founded).toBe(false));
    expect(result.current.writes.signer).toBe(writer);

    await act(() => result.current.writes.found());
    await waitFor(() => expect(result.current.village.data?.founded).toBe(true));

    await act(() => result.current.writes.open());
    await waitFor(() => expect(result.current.reward.data?.offer).not.toBeNull());
    expect(result.current.reward.data?.pending).toBe(1);

    const plans = result.current.reward.data!.offer!.plans;
    const village = result.current.village.data!.village;
    const slot = plans.findIndex((p) => legalCells(village, p).length > 0);
    expect(slot).toBeGreaterThanOrEqual(0);
    const spot = legalCells(village, plans[slot]!)[0]!;
    await act(() => result.current.writes.place(slot, spot.orientations[0]!, spot));
    await waitFor(() => expect(result.current.village.data?.village.tiles).toHaveLength(2));
    expect(result.current.reward.data?.offer).toBeNull();
    expect(result.current.village.data?.village.copies[plans[slot]!]).toBe(1);
    expect(writer.sent).toEqual(["found", "open 0", "claim place"]);
  });

  it("the Cobbles, a copy and a parcel: the balance and the copies follow", async () => {
    const { sources, views, writer } = villageSetup();
    await writer.foundVillage();
    const v = views.villagePlayer(PLAYER_ID);
    v.grants = { day: 1, today: 1, pending: 0, opened: 1 };
    v.offer = { index: 1, plans: [18, 18, 18] };
    const { result, client } = renderData(() => ({ village: useVillage(PLAYER_ID, "Me"), writes: useVillageWrites(PLAYER_ID) }), sources);
    await waitFor(() => expect(result.current.village.data?.founded).toBe(true));
    await act(() => result.current.writes.merge(1));
    await waitFor(() => expect(result.current.village.data?.village.copies).toEqual({ 18: 1 }));

    v.offer = { index: 2, plans: [1, 1, 1] };
    await act(() => result.current.writes.cobbles());
    expect(views.cobblePlayer(PLAYER_ID).account.cobbles).toBe(55);
    expect(client.getQueryState(cobbleKeys.account(PLAYER_ID))?.isInvalidated ?? true).toBe(true);

    const parcel = result.current.village.data!.parcel!;
    expect(parcel).toEqual({ price: 10, level: 1 });
    await act(() => result.current.writes.buyParcel({ x: 2, y: 0 }, parcel.price));
    await waitFor(() => expect(result.current.village.data?.village.cells).toHaveLength(10));
    expect(result.current.village.data?.parcel).toEqual({ price: 20, level: 2 });
    expect(views.cobblePlayer(PLAYER_ID).account.cobbles).toBe(45);
  });

  it("a refusal is the page's error until reset, and the reads are reconciled", async () => {
    const { sources, views, writer } = villageSetup();
    await writer.foundVillage();
    const v = views.villagePlayer(PLAYER_ID);
    writer.level = 1;
    v.info = { ...v.info, nextParcel: 2, nextPrice: 20, nextLevel: 2 };
    const { result } = renderData(() => ({ village: useVillage(PLAYER_ID, "Me"), writes: useVillageWrites(PLAYER_ID) }), sources);
    await waitFor(() => expect(result.current.village.data?.parcel?.level).toBe(2));
    await act(() => result.current.writes.buyParcel({ x: 2, y: 0 }, 20).catch(() => undefined));
    await waitFor(() => expect(result.current.writes.error).toBeInstanceOf(VillageRefusedError));
    expect((result.current.writes.error as VillageRefusedError).reason).toBe("level-too-low");
    act(() => result.current.writes.reset());
    await waitFor(() => expect(result.current.writes.error).toBeNull());
  });

  it("shows the write on its way", async () => {
    const { sources, writer } = villageSetup();
    let release!: () => void;
    writer.gate = new Promise((resolve) => (release = resolve));
    const { result } = renderData(() => useVillageWrites(PLAYER_ID), sources);
    let sent!: Promise<unknown>;
    act(() => {
      sent = result.current.found();
    });
    await waitFor(() => expect(result.current.pending).toEqual({ kind: "found" }));
    release();
    await act(() => sent);
    await waitFor(() => expect(result.current.pending).toBeUndefined());
    expect(result.current.done).toEqual({ kind: "found" });
  });

  it("refuses without a signer that writes the village", async () => {
    const { sources } = villageSetup();
    sources.signer = null;
    const { result } = renderData(() => useVillageWrites(PLAYER_ID), sources);
    expect(result.current.signer).toBeNull();
    await expect(result.current.found()).rejects.toThrow("Connect");
  });
});
