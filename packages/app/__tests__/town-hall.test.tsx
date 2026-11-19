import { execFileSync } from "node:child_process";
import { join } from "node:path";
import { waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { FIXTURE_ADA } from "@paved/chain/testing";
import { TOWN_HALL_TILES, layoutScore, starterLayout, townHallPrice, townHallSlots, xpFloor } from "@paved/game-core";
import { townHallSeams, townHallSkin, TOWN_HALL_THEME } from "@paved/renderer";
import { toRenderTiles } from "../src/components/containers/board-viewport";
import { TOWN_HALL, isStarter, townHallTiles, usedSlots } from "../src/components/containers/layout-starter";
import { V2RefusedError } from "../src/data/free-village-base";
import { MOCK_KEY } from "../src/data/mock/ledger";
import { attackTiles, attackV2Board } from "../src/data/free-attack";
import { layoutBoard } from "../src/data/matches";
import { useStageLayoutSlots } from "../src/routes/layout-slots";
import { boardTilesOf, layoutTilesOf } from "../src/routes/village-shapes";
import { rendererManifest } from "../vite/renderer-assets";
import { renderData } from "./data-fakes";
import { mockImplementation } from "./mock-fakes";

// The Town Hall (TOWN-HALL): the 2 x 2 tile at the centre of a village. Its four cells on the client, its models, its upgrade
// on the mock, and a save from before it.

const PLAYER = FIXTURE_ADA;
const APP = join(import.meta.dirname, "..");

/** The stored player, rewritten as a test needs it (Cobbles, XP, an old save). */
function edit(store: { data: Map<string, string> }, change: (player: { cobbles: number; v2: Record<string, unknown> }) => void) {
  const state = JSON.parse(store.data.get(MOCK_KEY)!);
  change(Object.values(state.players as Record<string, never>)[0]!);
  store.data.set(MOCK_KEY, JSON.stringify(state));
}

const refusal = async (write: Promise<unknown>) =>
  write.then(
    () => null,
    (error: unknown) => (error instanceof V2RefusedError ? error.reason : String(error)),
  );

describe("the Town Hall's cells on the client", () => {
  it("are game-core's four, ids 1 to 4, and one slot together", () => {
    expect(TOWN_HALL.map(({ plan, orientation, x, y }) => ({ plan, orientation, x, y }))).toEqual(TOWN_HALL_TILES.map(({ plan, orientation, x, y }) => ({ plan, orientation, x, y })));
    expect(TOWN_HALL.map((t) => t.id)).toEqual([1, 2, 3, 4]);
    expect(TOWN_HALL.every(isStarter)).toBe(true);
    expect(isStarter({ id: 5 })).toBe(false);
    expect(usedSlots(townHallTiles())).toBe(1);
    expect(usedSlots([...townHallTiles(), { id: 5 }, { id: 6 }])).toBe(3);
  });

  it("lead a saved layout as the scenes draw it, at the village's level, and leave it as it is saved", () => {
    const layout = starterLayout(BigInt(PLAYER));
    const tiles = boardTilesOf(layout, 3);
    expect(tiles.slice(0, 4).map((t) => t.townHall)).toEqual([3, 3, 3, 3]);
    expect(tiles.slice(4).map((t) => t.id)).toEqual(layout.map((_, i) => i + 5));
    expect(tiles.slice(4).every((t) => t.townHall === undefined)).toBe(true);
    expect(layoutTilesOf(tiles)).toEqual(layout);
    // A scout's and a match's board: the same cells, in the board's coordinates.
    expect(layoutBoard(layout, 3).filter((t) => t.townHall === 3)).toHaveLength(4);
  });

  it("draw their part of the hall's model at its level; no other tile does", () => {
    const drawn = toRenderTiles(boardTilesOf(starterLayout(BigInt(PLAYER)), 4), 0);
    expect(drawn.slice(0, 4).map((t) => t.skin)).toEqual(TOWN_HALL_TILES.map((cell) => townHallSkin(cell, 4)));
    expect(drawn.slice(0, 4).every((t) => t.skin!.theme === TOWN_HALL_THEME)).toBe(true);
    expect(drawn.slice(4).every((t) => t.skin === undefined)).toBe(true);
    // Two cells share a plan: each its own variant.
    expect(new Set(drawn.slice(0, 4).map((t) => `${t.plan}:${t.skin!.hash}`)).size).toBe(4);
  });
});

describe("the Town Hall's models (scripts/town-hall-models.ts)", () => {
  it("are current: what the generator writes from the base tiles", () => {
    expect(() => execFileSync(process.execPath, [join(APP, "scripts/town-hall-models.ts"), "--check"], { stdio: "pipe" })).not.toThrow();
  }, 120_000);

  it("are listed by the manifest: every cell at each of the 10 levels, each a model with its seams", () => {
    const { townHall, themes } = rendererManifest();
    expect(Object.keys(themes)).toEqual(["1"]);
    for (const level of [1, 5, 10]) {
      for (const cell of TOWN_HALL_TILES) {
        const key = rendererPlanKey(cell.plan);
        const path = townHall[key]![townHallSkin(cell, level).hash]!;
        expect(path, `${cell.quadrant} level ${level}`).toMatch(/^models\/townhall\/[a-z]{9}_TH_\d+\.[0-9a-f]{10}\.glb$/);
        // Two of its four sides join another cell of the Town Hall.
        expect(townHallSeams(path)!.filter(Boolean)).toHaveLength(2);
      }
    }
    expect(Object.values(townHall).reduce((n, paths) => n + paths.length, 0)).toBe(40);
    expect(townHallSeams("models/forest/ccccccccc_HF_1.0123456789.glb")).toBeNull();
  });
});

/** The plan key of a plan code, as the manifest names it. */
function rendererPlanKey(plan: number): string {
  return ["", "ccccccccc", "cccccfffc", "cccccfrfc", "cfffcfffc", "ffcfffcff", "ffcfffffc", "ffffcccff", "ffffffcff", "rfffrfcfr", "rfffrfffr", "rfrfcccfr", "rfrfffcfr", "rfrfffffr", "rfrfrfcff", "sfrfrfcfr", "sfrfrfffr", "sfrfrfrfr", "wffffffff", "wfffffffr"][plan]!;
}

describe("the Town Hall on the mock", () => {
  it("founds a village round it at level 1, 9 slots, whatever the player's level", async () => {
    const { ledger, store } = mockImplementation();
    await ledger.foundFreeVillage(PLAYER);
    expect(await ledger.freeVillage(PLAYER)).toMatchObject({ founded: true, level: 1, townHall: 1, slots: 9 });
    edit(store, (p) => (p.v2.xp = xpFloor(8)));
    expect(await ledger.freeVillage(PLAYER)).toMatchObject({ level: 8, townHall: 1, slots: 9 });
  });

  it("upgrades for Cobbles with the player level it asks for, and the slots follow", async () => {
    const { ledger, store } = mockImplementation();
    expect(await refusal(ledger.upgradeTownHall(PLAYER, { confirmedPrice: 40 }))).toBe("no-village");
    await ledger.foundFreeVillage(PLAYER);
    edit(store, (p) => (p.cobbles = 500));
    // Level 2 asks for player level 2.
    expect(await refusal(ledger.upgradeTownHall(PLAYER, { confirmedPrice: 40 }))).toBe("level-too-low");
    edit(store, (p) => (p.v2.xp = xpFloor(2)));
    expect(await refusal(ledger.upgradeTownHall(PLAYER, { confirmedPrice: 30 }))).toBe("price-changed");
    edit(store, (p) => (p.cobbles = 39));
    expect(await refusal(ledger.upgradeTownHall(PLAYER, { confirmedPrice: 40 }))).toBe("not-enough-cobbles");
    edit(store, (p) => (p.cobbles = 500));
    const receipt = await ledger.upgradeTownHall(PLAYER, { confirmedPrice: townHallPrice(1) });
    expect(receipt.events.map((e) => e.name)).toEqual(["CobblesSpent", "TownHallUpgraded"]);
    expect(await ledger.freeVillage(PLAYER)).toMatchObject({ townHall: 2, slots: townHallSlots(2) });
    expect((await ledger.account(PLAYER)).cobbles).toBe(460);
    // Level 3 asks for player level 4: no Cobbles go.
    expect(await refusal(ledger.upgradeTownHall(PLAYER, { confirmedPrice: townHallPrice(2) }))).toBe("level-too-low");
    expect((await ledger.account(PLAYER)).cobbles).toBe(460);
  });

  it("plays an attack round the defender's Town Hall, at its level", async () => {
    const { ledger } = mockImplementation();
    await ledger.foundFreeVillage(PLAYER);
    await ledger.drawOpponentV2(PLAYER, "search");
    const { match } = await ledger.attackV2(PLAYER);
    await ledger.startAttackV2(PLAYER);
    const { attack } = await ledger.attackV2(PLAYER);
    expect(attack!.townHall).toBe(match!.townHall);
    expect(match!.slots).toBe(townHallSlots(match!.townHall));
    const tiles = attackTiles(attackV2Board(attack!), attack!.townHall);
    expect(tiles.map((t) => [t.id, t.townHall])).toEqual([1, 2, 3, 4].map((id) => [id, attack!.townHall]));
  });

  it("draws a saved layout round the village's Town Hall at its level, not a level-1 one", async () => {
    const { sources, ledger } = mockImplementation();
    await ledger.foundFreeVillage(PLAYER);
    const { result } = renderData(() => useStageLayoutSlots(PLAYER, 3), sources);
    await waitFor(() => expect(result.current?.slots[0]?.tiles).toBeTruthy());
    const tiles = result.current!.slots[0]!.tiles!;
    expect(tiles.slice(0, 4).map((t) => t.townHall)).toEqual([3, 3, 3, 3]);
    expect(tiles).toHaveLength(4 + starterLayout(BigInt(PLAYER)).length);
  });

  it("brings a save from before the Town Hall to it: the layouts emptied, the tiles kept, the attacks dropped", async () => {
    const { ledger, store } = mockImplementation();
    await ledger.foundFreeVillage(PLAYER);
    const held = await ledger.inventory(PLAYER);
    // A layout laid out round the old starter: a tile on a cell the Town Hall now stands on.
    edit(store, (p) => {
      delete p.v2.townHall;
      p.v2.layout = [{ plan: 10, orientation: 1, x: 1, y: 0 }];
      p.v2.slots = { layouts: [[{ plan: 10, orientation: 1, x: 1, y: 0 }], null, null], bought: [], active: 0 };
    });
    const village = await ledger.freeVillage(PLAYER);
    expect(village).toMatchObject({ founded: true, townHall: 1, tiles: [], score: layoutScore([]) });
    expect(await ledger.inventory(PLAYER)).toEqual(held);
  });
});
