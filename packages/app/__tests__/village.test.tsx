import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { LazyMotion, domMax } from "motion/react";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { rewardChoices } from "../src/components/containers/reward-sheet";
import { clearCells, edgeOf, fits, legalCells } from "../src/components/containers/village-rules";
import { VillageScene } from "../src/components/scenes/village-scene";
import { PLAN, REWARD, REWARD_CRAMPED, VILLAGE, VILLAGE_CRAMPED, VILLAGE_FULL, VILLAGE_GROWING, VILLAGE_START } from "../src/mocks/village";

const wrap = (ui: ReactNode) => <LazyMotion features={domMax}>{ui}</LazyMotion>;
afterEach(cleanup);

describe("the v1 village's rules (fakes until #733)", () => {
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

  it("clears the fog over the owned cells and their neighbours in the plan", () => {
    expect(clearCells(VILLAGE_START.cells).size).toBe(21);
    expect(VILLAGE_FULL.cells).toHaveLength(38);
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

});

describe("Scenes/Village", () => {
  it("shows the village and its score, with no parcel, tier or copy left (#739)", () => {
    render(wrap(<VillageScene {...VILLAGE.start} />));
    expect(screen.getByRole("heading", { name: "My village" })).toBeInTheDocument();
    expect(screen.getByText("Village score")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Parcel at/ })).toBeNull();
    expect(screen.queryByRole("button", { name: /Tiers/ })).toBeNull();
    expect(document.querySelector("[data-tier]")).toBeNull();
  });

  it("offers three tiles and Cobbles; a chosen tile lights its cells and goes where tapped", async () => {
    const onPlace = vi.fn();
    render(wrap(<VillageScene {...VILLAGE.reward} onPlace={onPlace} />));
    const tiles = within(screen.getByRole("list", { name: "Reward tiles" })).getAllByRole("button");
    expect(tiles).toHaveLength(3);
    expect(screen.getByRole("button", { name: "Take 5 Cobbles instead" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /as a copy instead$/ })).toBeNull();
    await userEvent.click(tiles[0]!);
    const cells = screen.getAllByRole("button", { name: /^Place it at/ });
    expect(cells).toHaveLength(legalCells(VILLAGE_GROWING, REWARD.plans[0]!).length);
    await userEvent.click(cells[0]!);
    expect(onPlace).toHaveBeenCalledTimes(1);
    const placed = onPlace.mock.calls[0]![0];
    expect(fits(VILLAGE_GROWING, placed.plan, placed.orientation, placed)).toBe(true);
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

  it("counts the first tap after a drag released on the board, and not the click that ends a drag on its own card", async () => {
    render(wrap(<VillageScene {...VILLAGE.reward} />));
    const cards = () => within(screen.getByRole("list", { name: "Reward tiles" })).getAllByRole("button");
    const original = document.elementFromPoint;
    const dragTo = (card: HTMLElement, under: Element | null) => {
      fireEvent.pointerDown(card, { button: 0, clientX: 10, clientY: 10 });
      document.elementFromPoint = () => under;
      try {
        fireEvent.pointerMove(window, { clientX: 100, clientY: 100 });
        fireEvent.pointerUp(window, { clientX: 100, clientY: 100 });
      } finally {
        document.elementFromPoint = original;
      }
    };
    // Released over the board, off any cell: no click follows on the card, so the next tap selects at once.
    dragTo(cards()[0]!, document.querySelector("[data-cell]"));
    await userEvent.click(cards()[1]!);
    expect(cards()[1]).toHaveAttribute("aria-pressed", "true");
    // Released on its own card: the click that follows is the drag's end, not a tap.
    dragTo(cards()[2]!, cards()[2]!);
    fireEvent.click(cards()[2]!);
    expect(cards()[2]).toHaveAttribute("aria-pressed", "false");
  });

  it("greys out a tile that fits nowhere", () => {
    render(wrap(<VillageScene {...VILLAGE.rewardCramped} />));
    const tiles = within(screen.getByRole("list", { name: "Reward tiles" })).getAllByRole("button");
    expect(tiles.map((t) => (t as HTMLButtonElement).disabled)).toEqual([false, true, true]);
    expect(screen.getAllByText("No free cell fits")).toHaveLength(2);
  });

  it("shows another player's village read-only", () => {
    render(wrap(<VillageScene {...VILLAGE.visitScout} />));
    expect(screen.getByRole("heading", { name: "Rook of Ashford's village" })).toBeInTheDocument();
    expect(screen.getByText("Scouting")).toBeInTheDocument();
    expect(screen.queryByRole("list", { name: "Reward tiles" })).toBeNull();
  });

  it("a village not founded shows its start and Found; rewards waiting show Open", async () => {
    const onFound = vi.fn();
    const { unmount } = render(wrap(<VillageScene {...VILLAGE.unfounded} onFound={onFound} />));
    await userEvent.click(screen.getByRole("button", { name: "Found" }));
    expect(onFound).toHaveBeenCalledTimes(1);
    unmount();
    const onOpenReward = vi.fn();
    render(wrap(<VillageScene {...VILLAGE.waiting} onOpenReward={onOpenReward} />));
    await userEvent.click(screen.getByRole("button", { name: /Open/ }));
    expect(onOpenReward).toHaveBeenCalledTimes(1);
  });

  it("names the slot of a tile placed from a lit cell", async () => {
    const onPlace = vi.fn();
    render(wrap(<VillageScene {...VILLAGE.reward} onPlace={onPlace} />));
    const tiles = within(screen.getByRole("list", { name: "Reward tiles" })).getAllByRole("button");
    await userEvent.click(tiles[0]!);
    await userEvent.click(screen.getAllByRole("button", { name: /^Place it at/ })[0]!);
    expect(onPlace).toHaveBeenCalledWith(expect.objectContaining({ slot: 0, plan: REWARD.plans[0] }));
  });

  it("shows a refusal until dismissed, and why the village is not shown", async () => {
    const onDismissRefusal = vi.fn();
    const { unmount } = render(wrap(<VillageScene {...VILLAGE.refused} onDismissRefusal={onDismissRefusal} />));
    expect(screen.getByText(/Your reward was claimed already/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Dismiss" }));
    expect(onDismissRefusal).toHaveBeenCalledTimes(1);
    unmount();
    const onRetry = vi.fn();
    const { unmount: failed } = render(wrap(<VillageScene {...VILLAGE.rewardFailed} onRetry={onRetry} />));
    expect(screen.getByText("Your rewards could not be read")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Open/ })).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(onRetry).toHaveBeenCalledTimes(1);
    failed();
    const { unmount: guest } = render(wrap(<VillageScene {...VILLAGE.guest} />));
    expect(screen.getByText("Connect to build your village")).toBeInTheDocument();
    guest();
    render(wrap(<VillageScene {...VILLAGE.unavailable} />));
    expect(screen.getByText("Villages are coming")).toBeInTheDocument();
  });

  it("has one story per state of its fixtures", () => {
    const text = readFileSync(join(__dirname, "../src/components/scenes/village-scene.stories.tsx"), "utf8");
    const stories = [...text.matchAll(/^export const (\w+): Story = \{ args: VILLAGE\.(\w+) \};$/gm)].map((m) => m[2]);
    expect(stories.sort()).toEqual(Object.keys(VILLAGE).sort());
  });
});
