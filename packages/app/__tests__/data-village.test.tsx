import { QueryClient } from "@tanstack/react-query";
import { act, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { REWARD_COBBLES as CHAIN_REWARD_COBBLES, ViewError, VillageRefusedError, type DecodedEvent, type RewardOffer } from "@paved/chain";
import { EngineGame, startTerritory, villageGame, villageRefusal } from "@paved/game-core";
import type { GameSigner } from "../src/data";
import { cobbleKeys } from "../src/data/cobbles";
import {
  REWARD_COBBLES,
  START_CELLS,
  STARTER,
  applyVillageEvents,
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

/** A founded village of `OTHER`: the start and one parcel the chain still holds (#739: the client reads no parcel), the starter. */
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
  it("reads a founded village: its cells, tiles, score and its owner's level; no parcel, cap or copies (#739)", async () => {
    const { sources, views } = villageSetup();
    const v = founded(views);
    v.info.score = 120;
    views.cobblePlayer(OTHER).account.xp = 100;
    const { result } = renderData(() => useVillage(OTHER, "Rook"), sources);
    const data = await dataOf(result);
    expect(data?.founded).toBe(true);
    expect(data).not.toHaveProperty("parcel");
    expect(data?.village).toEqual(expect.objectContaining({ owner: "Rook", level: 2, score: 120 }));
    expect(data?.village).not.toHaveProperty("copies");
    expect(data?.village).not.toHaveProperty("maxCells");
    expect(views.calls.filter((c) => /^(copies|max_cells)/.test(c))).toEqual([]);
    expect(data?.village.cells).toHaveLength(10);
    expect(data?.village.tiles).toEqual([STARTER]);
  });

  it("not founded: the start it would get", async () => {
    const { sources } = villageSetup();
    const { result } = renderData(() => useVillage(PLAYER_ID, "Me"), sources);
    const data = await dataOf(result);
    expect(data).toMatchObject({ founded: false });
    expect(data?.village.cells).toEqual(START_CELLS);
    expect(data?.village.tiles).toEqual([STARTER]);
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

describe("applyVillageEvents", () => {
  it("RewardOpened sets the offer; RewardClaimed clears it", () => {
    const client = new QueryClient();
    applyVillageEvents(client, PLAYER_ID, [event("RewardOpened", { index: 2n, plan1: 10n, plan2: 9n, plan3: 18n })]);
    expect(client.getQueryData<RewardOffer>(villageKeys.offer(PLAYER_ID))).toEqual({ index: 2, plans: [10, 9, 18] });
    applyVillageEvents(client, PLAYER_ID, [event("RewardClaimed", { index: 2n, choice: 2n, plan: 18n, copies: 3n })]);
    expect(client.getQueryData<RewardOffer>(villageKeys.offer(PLAYER_ID))?.plans).toEqual([0, 0, 0]);
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
    expect(writer.sent).toEqual(["found", "open 0", "claim place"]);
  });

  it("the Cobbles: the balance follows; no parcel or copy write is left (#739)", async () => {
    const { sources, views, writer } = villageSetup();
    await writer.foundVillage();
    const v = views.villagePlayer(PLAYER_ID);
    v.grants = { day: 1, today: 1, pending: 0, opened: 1 };
    v.offer = { index: 2, plans: [1, 1, 1] };
    const { result, client } = renderData(() => ({ village: useVillage(PLAYER_ID, "Me"), writes: useVillageWrites(PLAYER_ID) }), sources);
    await waitFor(() => expect(result.current.village.data?.founded).toBe(true));
    await act(() => result.current.writes.cobbles());
    expect(views.cobblePlayer(PLAYER_ID).account.cobbles).toBe(55);
    expect(client.getQueryState(cobbleKeys.account(PLAYER_ID))?.isInvalidated ?? true).toBe(true);
    expect(result.current.writes).not.toHaveProperty("buyParcel");
    expect(result.current.writes).not.toHaveProperty("merge");
  });

  it("a refusal is the page's error until reset, and the reads are reconciled", async () => {
    const { sources, writer } = villageSetup();
    await writer.foundVillage();
    const { result } = renderData(() => ({ village: useVillage(PLAYER_ID, "Me"), writes: useVillageWrites(PLAYER_ID) }), sources);
    await waitFor(() => expect(result.current.village.data?.founded).toBe(true));
    // No reward waits: `open_reward` refuses.
    await act(() => result.current.writes.open().catch(() => undefined));
    await waitFor(() => expect(result.current.writes.error).toBeInstanceOf(VillageRefusedError));
    expect((result.current.writes.error as VillageRefusedError).reason).toBe("no-reward");
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
