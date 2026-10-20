import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { LazyMotion, domMax } from "motion/react";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { parcelState } from "../src/components/containers/parcel-sheet";
import { rewardChoices } from "../src/components/containers/reward-sheet";
import { MAX_CELLS, buyableCells, clearCells, edgeOf, fits, legalCells, tierOf, tierProgress } from "../src/components/containers/village-rules";
import { VillageScene } from "../src/components/scenes/village-scene";
import { PLAN, REWARD, REWARD_CRAMPED, VILLAGE, VILLAGE_CRAMPED, VILLAGE_FULL, VILLAGE_GROWING, VILLAGE_START, parcelFor } from "../src/mocks/village";

const wrap = (ui: ReactNode) => <LazyMotion features={domMax}>{ui}</LazyMotion>;
afterEach(cleanup);

describe("the village's rules (fakes until #640 and #642)", () => {
  it("counts the tiers in copies: 1, 2, 4, 8, 16", () => {
    expect([1, 2, 3, 4, 7, 8, 15, 16, 40].map(tierOf)).toEqual([0, 1, 1, 2, 2, 3, 3, 4, 4]);
    expect(tierProgress(3)).toEqual({ tier: 1, next: 2, copies: 3, need: 4 });
    expect(tierProgress(16)).toEqual({ tier: 4, next: null, copies: 16, need: null });
  });

  it("turns a plan's edges with its orientation", () => {
    // RFFFRFFFR: a road east-west. Turned a quarter, north-south.
    expect([0, 1, 2, 3].map((s) => edgeOf(PLAN.road, 1, s))).toEqual(["F", "R", "F", "R"]);
    expect([0, 1, 2, 3].map((s) => edgeOf(PLAN.road, 2, s))).toEqual(["R", "F", "R", "F"]);
  });

  it("matches facing edges, and leaves the sides facing no tile open", () => {
    const village = { cells: [{ x: 0, y: 0 }, { x: 1, y: 0 }], tiles: [{ id: 1, plan: PLAN.road, orientation: 1, x: 0, y: 0 }] };
    expect(fits(village, PLAN.road, 1, { x: 1, y: 0 })).toBe(true);
    expect(fits(village, PLAN.road, 2, { x: 1, y: 0 })).toBe(false);
    // Not owned, or taken: never.
    expect(fits(village, PLAN.wonder, 1, { x: 2, y: 0 })).toBe(false);
    expect(fits(village, PLAN.road, 1, { x: 0, y: 0 })).toBe(false);
  });

  it("offers the cells next to the village as parcels, none at 38 cells; the fog clears the same", () => {
    expect(buyableCells(VILLAGE_START.cells)).toHaveLength(12);
    expect(clearCells(VILLAGE_START.cells).size).toBe(21);
    expect(VILLAGE_FULL.cells).toHaveLength(MAX_CELLS);
    expect(buyableCells(VILLAGE_FULL.cells)).toEqual([]);
  });

  it("builds the fakes by the rules", () => {
    expect(VILLAGE_GROWING.cells).toHaveLength(21);
    expect(VILLAGE_GROWING.tiles).toHaveLength(14);
    for (const v of [VILLAGE_START, VILLAGE_GROWING, VILLAGE_FULL]) {
      for (const t of v.tiles) {
        const rest = { cells: v.cells, tiles: v.tiles.filter((o) => o.id !== t.id) };
        expect(fits(rest, t.plan, t.orientation, t)).toBe(true);
      }
    }
    expect(legalCells(VILLAGE_CRAMPED, PLAN.city)).toHaveLength(1);
    expect(rewardChoices(REWARD_CRAMPED, VILLAGE_CRAMPED).map((c) => c.stuck)).toEqual([false, true, true]);
  });

  it("gates a parcel by level before Cobbles", () => {
    expect(parcelState({ price: 260, level: 5 }, 4, 10_000, 21)).toBe("level");
    expect(parcelState({ price: 260, level: 4 }, 4, 100, 21)).toBe("cobbles");
    expect(parcelState({ price: 260, level: 4 }, 4, 300, 21)).toBe("ready");
    expect(parcelState(parcelFor(38), 9, 300, 38)).toBe("full");
  });
});

describe("Scenes/Village", () => {
  it("shows the village, its score and the parcels to buy", () => {
    render(wrap(<VillageScene {...VILLAGE.start} />));
    expect(screen.getByRole("heading", { name: "My village" })).toBeInTheDocument();
    expect(screen.getByText("Village score")).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: /^Parcel at/ })).toHaveLength(12);
  });

  it("offers three tiles and Cobbles; a chosen tile lights its cells and goes where tapped", async () => {
    const onPlace = vi.fn();
    render(wrap(<VillageScene {...VILLAGE.reward} onPlace={onPlace} />));
    const tiles = within(screen.getByRole("list", { name: "Reward tiles" })).getAllByRole("button");
    expect(tiles).toHaveLength(3);
    expect(screen.getByRole("button", { name: "Take 15 Cobbles instead" })).toBeInTheDocument();
    // No parcel while a reward waits.
    expect(screen.queryByRole("button", { name: /^Parcel at/ })).toBeNull();
    await userEvent.click(tiles[0]!);
    const cells = screen.getAllByRole("button", { name: /^Place it at/ });
    expect(cells).toHaveLength(legalCells(VILLAGE_GROWING, REWARD.plans[0]!).length);
    await userEvent.click(cells[0]!);
    expect(onPlace).toHaveBeenCalledTimes(1);
    const placed = onPlace.mock.calls[0]![0];
    expect(fits(VILLAGE_GROWING, placed.plan, placed.orientation, placed)).toBe(true);
  });

  it("adds a copy when a tile of the plan is chosen", async () => {
    const onAddCopy = vi.fn();
    render(wrap(<VillageScene {...VILLAGE.rewardCopy} onAddCopy={onAddCopy} />));
    const targets = screen.getAllByRole("button", { name: /^Add a copy/ });
    expect(targets.length).toBeGreaterThan(0);
    await userEvent.click(targets[0]!);
    expect(onAddCopy).toHaveBeenCalledWith(expect.objectContaining({ plan: PLAN.wonder }));
  });

  it("places a tile dragged onto a lit cell", () => {
    const onPlace = vi.fn();
    render(wrap(<VillageScene {...VILLAGE.reward} onPlace={onPlace} />));
    const legal = legalCells(VILLAGE_GROWING, REWARD.plans[0]!)[0]!;
    const tile = within(screen.getByRole("list", { name: "Reward tiles" })).getAllByRole("button")[0]!;
    fireEvent.pointerDown(tile, { button: 0, clientX: 10, clientY: 10 });
    // jsdom lays nothing out: the cell under the pointer is the lit one.
    const original = document.elementFromPoint;
    document.elementFromPoint = () => document.querySelector(`[data-cell="${legal.x},${legal.y}"]`);
    try {
      fireEvent.pointerMove(window, { clientX: 100, clientY: 100 });
      fireEvent.pointerUp(window, { clientX: 100, clientY: 100 });
    } finally {
      document.elementFromPoint = original;
    }
    expect(onPlace).toHaveBeenCalledWith(expect.objectContaining({ plan: REWARD.plans[0], x: legal.x, y: legal.y }));
  });

  it("greys out a tile that fits nowhere and has nothing to copy onto", () => {
    render(wrap(<VillageScene {...VILLAGE.rewardCramped} />));
    const tiles = within(screen.getByRole("list", { name: "Reward tiles" })).getAllByRole("button");
    expect(tiles.map((t) => (t as HTMLButtonElement).disabled)).toEqual([false, true, true]);
    expect(screen.getAllByText("No free cell fits")).toHaveLength(2);
  });

  it("says the level a parcel needs, and Buy waits for it", () => {
    render(wrap(<VillageScene {...VILLAGE.parcelLevel} />));
    expect(screen.getByRole("button", { name: /Level 5 needed/ })).toBeDisabled();
  });

  it("buys a parcel in reach", async () => {
    const onBuyParcel = vi.fn();
    render(wrap(<VillageScene {...VILLAGE.parcelReady} onBuyParcel={onBuyParcel} />));
    await userEvent.click(screen.getByRole("button", { name: /Buy this parcel for/ }));
    expect(onBuyParcel).toHaveBeenCalledWith({ x: 2, y: 0 });
  });

  it("lists each plan's progress to its next tier", () => {
    render(wrap(<VillageScene {...VILLAGE.tiers} />));
    expect(screen.getByRole("list", { name: "Tier ladder" }).children).toHaveLength(5);
    expect(screen.getAllByRole("progressbar", { name: /^Tile \d+ to (Silver|Gold|Diamond|Ruby)$/ }).length).toBeGreaterThan(3);
  });

  it("shows another player's village read-only", () => {
    render(wrap(<VillageScene {...VILLAGE.visitScout} />));
    expect(screen.getByRole("heading", { name: "Rook of Ashford's village" })).toBeInTheDocument();
    expect(screen.getByText("Scouting")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Parcel at/ })).toBeNull();
    expect(screen.queryByRole("list", { name: "Reward tiles" })).toBeNull();
  });

  it("has one story per state of its fixtures", () => {
    const text = readFileSync(join(__dirname, "../src/components/scenes/village-scene.stories.tsx"), "utf8");
    const stories = [...text.matchAll(/^export const (\w+): Story = \{ args: VILLAGE\.(\w+) \};$/gm)].map((m) => m[2]);
    expect(stories.sort()).toEqual(Object.keys(VILLAGE).sort());
  });
});
