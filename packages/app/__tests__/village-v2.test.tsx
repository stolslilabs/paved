import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { LazyMotion, MotionConfig, domMax } from "motion/react";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { formatInteger } from "@paved/game-core";
import { CHEST_CHOICES } from "../src/components/elements/chest-badge";
import { deckCount, rarityOf } from "../src/components/elements/rarity-badge";
import {
  STARTER,
  canLift,
  checkLayout,
  detachedOf,
  faultsOf,
  fittingAt,
  layoutProblem,
  layoutScore,
  legalSpots,
  placeTile,
  slotsFor,
  takeOffTile,
  trayOf,
} from "../src/components/containers/layout-rules";
import { VillageChestsScene } from "../src/components/scenes/village-chests-scene";
import { VillageLayoutScene } from "../src/components/scenes/village-layout-scene";
import { VillageShopScene } from "../src/components/scenes/village-shop-scene";
import { PLAN } from "../src/mocks/village";
import { INVENTORY, KEY_TILE, LAYOUT_FULL, LAYOUT_GROWING, LAYOUT_START, MOVED_SPOT, OUTER_TILE, SHOP_PRICE, VILLAGE_CHESTS, VILLAGE_LAYOUT, VILLAGE_SHOP, fakeScore, lay } from "../src/mocks/village-v2";

const wrap = (ui: ReactNode) => <LazyMotion features={domMax}>{ui}</LazyMotion>;
afterEach(cleanup);

/** A tile of the layout (not the starter) by id. */
const tile = (id: number, plan: number, orientation: number, x: number, y: number) => ({ id, plan, orientation, x, y });

describe("the v2 village's rules (#739)", () => {
  it("unlocks 8 + level slots, level 1 to 20", () => {
    expect(slotsFor(1)).toBe(9);
    expect(slotsFor(13)).toBe(21);
    expect(slotsFor(20)).toBe(28);
    expect(slotsFor(25)).toBe(28);
    expect(slotsFor(0)).toBe(9);
  });

  it("marks each pair of facing edges that differ, once", () => {
    // The starter faces South: its north edge is its city (its south letter, turned); a full city above it matches.
    expect(faultsOf([STARTER, tile(2, PLAN.city, 1, 0, 1)])).toEqual([]);
    // A road above it does not: the mark is on the starter's north edge.
    expect(faultsOf([STARTER, tile(2, PLAN.road, 1, 0, 1)])).toEqual([{ cell: { x: 0, y: 0 }, side: 0 }]);
    expect(faultsOf(LAYOUT_GROWING.tiles)).toEqual([]);
  });

  it("tells the tiles cut off from the starter", () => {
    const far = tile(3, PLAN.road, 1, 4, 4);
    expect(detachedOf([STARTER, tile(2, PLAN.road, 1, 0, 1), far])).toEqual([far]);
    expect(detachedOf([tile(2, PLAN.road, 1, 0, 1)])).toHaveLength(1);
  });

  it("checks a layout: connected, every edge matched, the starter there, within the slots", () => {
    expect(checkLayout(LAYOUT_GROWING.tiles, 28).valid).toBe(true);
    const faulty = checkLayout([STARTER, tile(2, PLAN.road, 1, 0, 1), tile(3, PLAN.road, 1, 5, 5)], 28);
    expect(faulty.valid).toBe(false);
    expect(layoutProblem(faulty)).toBe("1 tile is cut off from the starter; 1 edge does not match.");
    expect(layoutProblem(checkLayout(LAYOUT_GROWING.tiles, 20))).toBe("1 tile past your slots: take it off.");
    expect(layoutProblem(checkLayout(LAYOUT_GROWING.tiles.slice(1), 28))).toBe("The starter is missing.");
  });

  it("lights only the legal cells, as on the board: next to a tile, every facing edge matching", () => {
    const spots = legalSpots([STARTER], PLAN.city);
    // A full city fits only on the starter's city side, north of it.
    expect(spots).toEqual([{ x: 0, y: 1, orientations: [1, 2, 3, 4] }]);
    for (const spot of legalSpots(LAYOUT_GROWING.tiles, PLAN.road)) {
      for (const o of spot.orientations) expect(checkLayout(placeTile(LAYOUT_GROWING.tiles, PLAN.road, o, spot), 28).valid).toBe(true);
    }
    expect(fittingAt([STARTER], PLAN.road, { x: 0, y: 1 })).toEqual([]);
  });

  it("never lifts the starter, nor a tile whose removal would split the village", () => {
    expect(canLift(LAYOUT_GROWING.tiles, STARTER.id)).toBe(false);
    expect(canLift(LAYOUT_GROWING.tiles, OUTER_TILE.id)).toBe(true);
    expect(canLift(LAYOUT_GROWING.tiles, KEY_TILE.id)).toBe(false);
    expect(detachedOf(LAYOUT_GROWING.tiles.filter((t) => t.id !== KEY_TILE.id)).length).toBeGreaterThan(0);
    expect(takeOffTile([STARTER], STARTER.id)).toEqual([STARTER]);
    expect(placeTile([STARTER], PLAN.city, 1, { x: 0, y: 1 })[1]).toEqual(tile(2, PLAN.city, 1, 0, 1));
  });

  it("counts the tray from the inventory, the saved layout and the draft", () => {
    const saved = [STARTER, tile(2, PLAN.road, 1, 0, 1)];
    expect(trayOf({ [PLAN.road]: 1 }, saved, [STARTER])).toEqual({ [PLAN.road]: 2 });
    expect(trayOf({ [PLAN.road]: 1 }, saved, saved)).toEqual({ [PLAN.road]: 1 });
  });

  it("rates the plans by their count in the base deck: 6 mythic cards of 72, the 8 % of a single draw", () => {
    const plans = Array.from({ length: 19 }, (_, i) => i + 1);
    expect(plans.reduce((n, p) => n + deckCount(p), 0)).toBe(72);
    expect(plans.filter((p) => rarityOf(p) === "mythic").reduce((n, p) => n + deckCount(p), 0)).toBe(6);
    expect(rarityOf(PLAN.road)).toBe("common");
    expect(rarityOf(PLAN.wonder)).toBe("uncommon");
    expect(rarityOf(PLAN.city)).toBe("mythic");
    expect(CHEST_CHOICES).toEqual({ basic: 1, rare: 2, epic: 3 });
  });

  it("builds its fakes by the rules, the scores by the engine", () => {
    for (const village of [LAYOUT_START, LAYOUT_GROWING, LAYOUT_FULL]) expect(checkLayout(village.tiles, slotsFor(village.level)).valid).toBe(true);
    expect(LAYOUT_START.tiles).toHaveLength(9);
    // The start closes a structure (#732): it scores.
    expect(LAYOUT_START.score).toBeGreaterThan(0);
    expect(LAYOUT_GROWING.tiles).toHaveLength(21);
    expect(LAYOUT_FULL.tiles).toHaveLength(slotsFor(LAYOUT_FULL.level));
    expect(fakeScore(lay([]))).toBe(0);
    for (const fixture of Object.values(VILLAGE_LAYOUT)) {
      if (!("village" in fixture)) continue;
      const draft = "initialDraft" in fixture ? fixture.initialDraft : fixture.village.tiles;
      expect(checkLayout(draft, slotsFor(fixture.village.level)).valid).toBe(true);
      expect(Object.values(trayOf("inventory" in fixture ? fixture.inventory : {}, fixture.village.tiles, draft)).every((n) => n >= 0)).toBe(true);
    }
  });
});

describe("the v2 village scene (#739)", () => {
  it("shows the score, the level and the slots used, with Edit, Chests and Shop", async () => {
    const onOpenChests = vi.fn();
    const onOpenShop = vi.fn();
    render(wrap(<VillageLayoutScene {...VILLAGE_LAYOUT.growing} onOpenChests={onOpenChests} onOpenShop={onOpenShop} />));
    expect(screen.getAllByLabelText("21 of 28 slots used").length).toBeGreaterThan(0);
    expect(screen.getByText("Village score")).toBeInTheDocument();
    await userEvent.click(screen.getAllByRole("button", { name: "Chests, 2 waiting" })[0]!);
    await userEvent.click(screen.getAllByRole("button", { name: /Shop/ })[0]!);
    expect(onOpenChests).toHaveBeenCalledTimes(1);
    expect(onOpenShop).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("list", { name: "Inventory tiles" })).toBeNull();
  });

  it("places a tile from the inventory at once (#756): a card, a lit cell, the bubble by it with no Validate, the score with it", async () => {
    render(wrap(<VillageLayoutScene {...VILLAGE_LAYOUT.growing} />));
    await userEvent.click(screen.getAllByRole("button", { name: "Edit" })[0]!);
    expect(screen.getByRole("button", { name: /Save/ })).toBeDisabled();
    const inventory = screen.getByRole("region", { name: "Inventory tiles" });
    await userEvent.click(within(inventory).getByRole("button", { name: /^Tile 10, 4 left$/ }));
    // The board's cells by their marks: a role query over a few hundred cells is slow in jsdom.
    const plates = document.querySelectorAll<HTMLButtonElement>('[data-kind="plate"]');
    expect(plates.length).toBe(legalSpots(LAYOUT_GROWING.tiles, PLAN.road).length);
    await userEvent.click(plates[0]!);
    // Placed by the tap: the slot taken, the card counted, Save enabled, the score moved.
    expect(screen.getAllByLabelText("22 of 28 slots used").length).toBeGreaterThan(0);
    expect(within(inventory).getByRole("button", { name: /^Tile 10, 3 left$/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Save/ })).toBeEnabled();
    const bubble = screen.getByRole("toolbar", { name: "Tile" });
    expect(within(bubble).queryByRole("button", { name: "Hold to place the tile" })).toBeNull();
    // An inventory tile's Cancel would be Back to the inventory: the bubble shows only the latter.
    expect(within(bubble).queryByRole("button", { name: "Cancel placement" })).toBeNull();
    expect(within(bubble).getByRole("button", { name: "Back to the inventory" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Discard changes" })).toBeNull();
  });

  it("the live score follows each tap, the saved one beside it", async () => {
    render(wrap(<VillageLayoutScene {...VILLAGE_LAYOUT.editing} />));
    expect(screen.queryByText(/^saved/)).toBeNull();
    // Plan 9 on a cell where it grows the score.
    const spot = legalSpots(LAYOUT_GROWING.tiles, 9).find((c) => layoutScore(placeTile(LAYOUT_GROWING.tiles, 9, c.orientations.includes(1) ? 1 : c.orientations[0]!, c)) !== LAYOUT_GROWING.score)!;
    const placed = placeTile(LAYOUT_GROWING.tiles, 9, spot.orientations.includes(1) ? 1 : spot.orientations[0]!, spot);
    await userEvent.click(within(screen.getByRole("region", { name: "Inventory tiles" })).getByRole("button", { name: /^Tile 9, 2 left$/ }));
    await userEvent.click(document.querySelector<HTMLButtonElement>(`[data-kind="plate"][data-cell="${spot.x},${spot.y}"]`)!);
    expect(screen.getByText(/^saved/)).toBeInTheDocument();
    expect(screen.getByText("Layout score").closest("div")).toHaveTextContent(formatInteger(layoutScore(placed)));
  });

  it("moves the tile under the bubble with a tap on another lit cell; a tap on it lets it go; the card takes the next copy", async () => {
    render(wrap(<VillageLayoutScene {...VILLAGE_LAYOUT.placing} />));
    const pending = () => document.querySelector<HTMLButtonElement>('[data-kind="pending"]');
    const first = pending()!.dataset.cell;
    const plates = () => [...document.querySelectorAll<HTMLButtonElement>('[data-kind="plate"]')];
    // The tile's own cell is no plate; every other lit cell stays valid for it.
    expect(plates().some((p) => p.dataset.cell === first)).toBe(false);
    const target = plates()[plates().length - 1]!;
    const to = target.dataset.cell;
    await userEvent.click(target);
    expect(pending()!.dataset.cell).toBe(to);
    expect(document.querySelector(`[data-cell="${first}"]`)?.getAttribute("data-kind")).not.toBe("tile");
    expect(screen.getAllByLabelText("22 of 28 slots used").length).toBeGreaterThan(0);
    // Let go: it stays, the bubble goes.
    await userEvent.click(pending()!);
    expect(screen.queryByRole("toolbar", { name: "Tile" })).toBeNull();
    expect(document.querySelector(`[data-cell="${to}"]`)).toHaveAttribute("data-kind", "tile");
    // The card again: the next copy in hand, placed by its own tap.
    const inventory = screen.getByRole("region", { name: "Inventory tiles" });
    await userEvent.click(within(inventory).getByRole("button", { name: /^Tile 10, 3 left$/ }));
    await userEvent.click(plates()[0]!);
    expect(screen.getAllByLabelText("23 of 28 slots used").length).toBeGreaterThan(0);
    expect(within(inventory).getByRole("button", { name: /^Tile 10, 2 left$/ })).toBeInTheDocument();
  });

  it("Back to the inventory frees the slot; Escape sends an inventory tile back too", async () => {
    const { unmount } = render(wrap(<VillageLayoutScene {...VILLAGE_LAYOUT.placing} />));
    expect(screen.getAllByLabelText("22 of 28 slots used").length).toBeGreaterThan(0);
    await userEvent.click(within(screen.getByRole("toolbar", { name: "Tile" })).getByRole("button", { name: "Back to the inventory" }));
    expect(screen.getAllByLabelText("21 of 28 slots used").length).toBeGreaterThan(0);
    expect(screen.queryByRole("toolbar", { name: "Tile" })).toBeNull();
    expect(screen.getByRole("button", { name: /Save/ })).toBeDisabled();
    unmount();
    render(wrap(<VillageLayoutScene {...VILLAGE_LAYOUT.placing} />));
    await userEvent.keyboard("{Escape}");
    expect(screen.getAllByLabelText("21 of 28 slots used").length).toBeGreaterThan(0);
    expect(screen.getByRole("button", { name: /Save/ })).toBeDisabled();
  });

  it("lifts an outer tile, moves it, and Cancel puts it back where it was; a tile that holds the village shakes; the starter is no button", async () => {
    render(wrap(<VillageLayoutScene {...VILLAGE_LAYOUT.editing} />));
    expect(document.querySelector('[data-kind="starter"]')?.tagName).toBe("SPAN");
    await userEvent.click(document.querySelector<HTMLButtonElement>(`[data-tile="${KEY_TILE.id}"]`)!);
    expect(screen.getByText(/holds the village together/)).toBeInTheDocument();
    expect(screen.queryByRole("toolbar", { name: "Tile" })).toBeNull();
    await userEvent.click(document.querySelector<HTMLButtonElement>(`[data-tile="${OUTER_TILE.id}"]`)!);
    const home = `${OUTER_TILE.x},${OUTER_TILE.y}`;
    expect(document.querySelector('[data-kind="pending"]')).toHaveAttribute("data-cell", home);
    await userEvent.click(document.querySelector<HTMLButtonElement>(`[data-cell="${MOVED_SPOT.x},${MOVED_SPOT.y}"]`)!);
    expect(document.querySelector('[data-kind="pending"]')).toHaveAttribute("data-cell", `${MOVED_SPOT.x},${MOVED_SPOT.y}`);
    expect(screen.getByRole("button", { name: /Save/ })).toBeEnabled();
    await userEvent.click(within(screen.getByRole("toolbar", { name: "Tile" })).getByRole("button", { name: "Cancel placement" }));
    expect(document.querySelector(`[data-tile="${OUTER_TILE.id}"]`)).toHaveAttribute("data-cell", home);
    expect(screen.getByRole("button", { name: /Save/ })).toBeDisabled();
    // Lifted again and sent back: its slot is free.
    await userEvent.click(document.querySelector<HTMLButtonElement>(`[data-tile="${OUTER_TILE.id}"]`)!);
    await userEvent.click(within(screen.getByRole("toolbar", { name: "Tile" })).getByRole("button", { name: "Back to the inventory" }));
    expect(screen.getAllByLabelText("20 of 28 slots used").length).toBeGreaterThan(0);
  });

  it("a tap on another placed tile lifts that one; the first stays where it was moved", async () => {
    render(wrap(<VillageLayoutScene {...VILLAGE_LAYOUT.moved} />));
    const other = LAYOUT_GROWING.tiles.find((t) => t.id !== OUTER_TILE.id && canLift(LAYOUT_GROWING.tiles.filter((u) => u.id !== OUTER_TILE.id).concat({ ...OUTER_TILE, ...MOVED_SPOT }), t.id))!;
    await userEvent.click(document.querySelector<HTMLButtonElement>(`[data-tile="${other.id}"]`)!);
    expect(document.querySelector('[data-kind="pending"]')).toHaveAttribute("data-cell", `${other.x},${other.y}`);
    expect(document.querySelector(`[data-tile="${OUTER_TILE.id}"]`)).toHaveAttribute("data-cell", `${MOVED_SPOT.x},${MOVED_SPOT.y}`);
  });

  it("Reset all is the eraser held in the discard style (#756), resetting as before with the mouse, a finger or the keyboard", async () => {
    for (const press of ["mouse", "touch", "keyboard"] as const) {
      const { unmount } = render(wrap(<VillageLayoutScene {...VILLAGE_LAYOUT.editing} holdMs={50} />));
      const reset = screen.getByRole("button", { name: "Hold to reset all: the starter alone, every tile back in the inventory" });
      expect(reset.querySelector("[data-icon]")).toHaveAttribute("data-icon", "eraser");
      expect(reset).toHaveAttribute("data-tone", "destructive");
      if (press === "keyboard") fireEvent.keyDown(reset, { key: " " });
      else fireEvent.pointerDown(reset, { button: 0, pointerType: press });
      await waitFor(() => expect(screen.getAllByLabelText("1 of 28 slots used").length).toBeGreaterThan(0));
      expect(screen.getByRole("button", { name: /Save/ })).toBeEnabled();
      // The starter alone: nothing left to reset.
      expect(screen.getByRole("button", { name: /^Hold to reset all/ })).toBeDisabled();
      unmount();
    }
    // A screen reader's activation acts at once, as every hold's.
    render(wrap(<VillageLayoutScene {...VILLAGE_LAYOUT.editing} />));
    fireEvent.click(screen.getByRole("button", { name: /^Hold to reset all/ }));
    expect(screen.getAllByLabelText("1 of 28 slots used").length).toBeGreaterThan(0);
  });

  it("saves a changed layout and shows the new score; leaving with changes asks first", async () => {
    const onSave = vi.fn();
    const { unmount } = render(wrap(<VillageLayoutScene {...VILLAGE_LAYOUT.changed} onSave={onSave} />));
    expect(screen.getByText("Layout score")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /Save/ }));
    expect(onSave).toHaveBeenCalledWith(VILLAGE_LAYOUT.changed.initialDraft);
    unmount();
    const { unmount: saved } = render(wrap(<VillageLayoutScene {...VILLAGE_LAYOUT.saved} />));
    // No notice (#802): the score counts to the new one, its gain floating off it.
    expect(screen.queryByText("Layout saved")).toBeNull();
    expect(await screen.findByText("+1,122")).toBeInTheDocument();
    saved();
    render(wrap(<VillageLayoutScene {...VILLAGE_LAYOUT.leaving} />));
    const dialog = screen.getByRole("dialog", { name: "Leave without saving?" });
    await userEvent.click(within(dialog).getByRole("button", { name: "Leave" }));
    expect(screen.queryByRole("region", { name: "Inventory tiles" })).toBeNull();
  });

  it("greys the inventory once every slot is used", () => {
    render(wrap(<VillageLayoutScene {...VILLAGE_LAYOUT.full} />));
    expect(screen.getByText("Every slot is used")).toBeInTheDocument();
    for (const card of within(screen.getByRole("region", { name: "Inventory tiles" })).getAllByRole("button")) expect(card).toHaveAttribute("aria-disabled", "true");
  });

  it("never goes past the slots: a lifted tile stays in its slot, and only sending it back frees one", async () => {
    const onSave = vi.fn();
    render(wrap(<VillageLayoutScene {...VILLAGE_LAYOUT.full} onSave={onSave} />));
    const outer = [...LAYOUT_FULL.tiles].reverse().find((t) => canLift(LAYOUT_FULL.tiles, t.id))!;
    const cards = () => within(screen.getByRole("region", { name: "Inventory tiles" })).getAllByRole("button");
    // Lifted: the slot is still taken, the cards stay greyed, choosing one does nothing.
    await userEvent.click(document.querySelector<HTMLButtonElement>(`[data-tile="${outer.id}"]`)!);
    expect(screen.getAllByLabelText("20 of 20 slots used").length).toBeGreaterThan(0);
    for (const card of cards()) expect(card).toHaveAttribute("aria-disabled", "true");
    fireEvent.click(cards()[0]!);
    expect(screen.getAllByLabelText("20 of 20 slots used").length).toBeGreaterThan(0);
    // Sent back: a slot is free, one inventory tile can go down, and then the slots are full again.
    await userEvent.click(within(screen.getByRole("toolbar", { name: "Tile" })).getByRole("button", { name: "Back to the inventory" }));
    expect(screen.getAllByLabelText("19 of 20 slots used").length).toBeGreaterThan(0);
    await userEvent.click(within(screen.getByRole("region", { name: "Inventory tiles" })).getByRole("button", { name: /^Tile 10, \d+ left$/ }));
    await userEvent.click(document.querySelector<HTMLButtonElement>('[data-kind="plate"]')!);
    expect(screen.getAllByLabelText("20 of 20 slots used").length).toBeGreaterThan(0);
    for (const card of cards()) expect(card).toHaveAttribute("aria-disabled", "true");
    await userEvent.click(screen.getByRole("button", { name: /Save/ }));
    expect(onSave.mock.calls[0]?.[0]).toHaveLength(20);
  });

  it("a visit has no editor", () => {
    render(wrap(<VillageLayoutScene {...VILLAGE_LAYOUT.visit} />));
    expect(screen.getByRole("heading", { name: "Rook of Ashford's village" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Edit" })).toBeNull();
  });

  it("says why the village is not shown", () => {
    render(wrap(<VillageLayoutScene {...VILLAGE_LAYOUT.guest} />));
    expect(screen.getByText("Connect to build your village")).toBeInTheDocument();
  });
});

describe("the chests (#739, #784)", () => {
  it("opens a ready chest in the modal on arrival: Tap to open", async () => {
    const onOpen = vi.fn();
    render(wrap(<VillageChestsScene {...VILLAGE_CHESTS.waiting} onOpen={onOpen} />));
    const modal = screen.getByRole("dialog", { name: "Epic chest" });
    expect(within(modal).getByText("Tap to open")).toBeInTheDocument();
    await userEvent.click(within(modal).getByRole("button", { name: /Open the epic chest: one of 3 tiles/ }));
    expect(onOpen).toHaveBeenCalledWith(41);
  });

  it("keeps one of an epic chest's 3 tiles, chosen first", async () => {
    const onTake = vi.fn();
    render(wrap(<VillageChestsScene {...VILLAGE_CHESTS.epic} onTake={onTake} />));
    const tiles = within(screen.getByRole("list", { name: "Chest tiles" })).getAllByRole("button");
    expect(tiles).toHaveLength(3);
    expect(screen.getByRole("button", { name: "Choose a tile" })).toBeDisabled();
    await userEvent.click(tiles[1]!);
    await userEvent.click(screen.getByRole("button", { name: /^Keep Tile 18$/ }));
    expect(onTake).toHaveBeenCalledWith(41, 1);
  });

  it("gives a basic chest's one tile as it is, and says the Cobbles a chest held", async () => {
    const onTake = vi.fn();
    const { unmount } = render(wrap(<VillageChestsScene {...VILLAGE_CHESTS.basic} onTake={onTake} />));
    await userEvent.click(screen.getByRole("button", { name: /^Keep Tile 7$/ }));
    expect(onTake).toHaveBeenCalledWith(39, 0);
    unmount();
    render(wrap(<VillageChestsScene {...VILLAGE_CHESTS.cobbles} />));
    expect(screen.getByText("Cobbles in the chest!")).toBeInTheDocument();
    expect(screen.getByLabelText("+50 Cobbles")).toBeInTheDocument();
  });

  it("says the tile taken, the day capped, and none waiting", () => {
    const { unmount } = render(wrap(<VillageChestsScene {...VILLAGE_CHESTS.taken} />));
    expect(screen.getByRole("dialog", { name: "Added to your inventory" })).toBeInTheDocument();
    unmount();
    const { unmount: kept } = render(wrap(<VillageChestsScene {...VILLAGE_CHESTS.kept} />));
    expect(screen.getByText("Added to your inventory")).toBeInTheDocument();
    kept();
    const { unmount: capped } = render(wrap(<VillageChestsScene {...VILLAGE_CHESTS.capped} />));
    expect(screen.getByLabelText("0 of 3 left today")).toBeInTheDocument();
    expect(screen.getByRole("timer", { name: /More chests in/ })).toBeInTheDocument();
    capped();
    render(wrap(<VillageChestsScene {...VILLAGE_CHESTS.empty} />));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.getByText("No chest waiting")).toBeInTheDocument();
  });
});

describe("the chests' slots (#759, #784)", () => {
  const slots = () => within(screen.getByRole("list", { name: "Today's PvP slots" })).getAllByRole("listitem").map((li) => li.getAttribute("aria-label"));

  it("shows the day's three slots first: free outlines, then the chests won, with the reset ticking; no Waiting list", () => {
    const { unmount } = render(wrap(<VillageChestsScene {...VILLAGE_CHESTS.free} />));
    expect(slots()).toEqual(["Slot 1: free", "Slot 2: free", "Slot 3: free"]);
    expect(screen.getByRole("timer", { name: "Slots reset in 9:00:00" })).toBeInTheDocument();
    unmount();
    const { rerender } = render(wrap(<VillageChestsScene {...VILLAGE_CHESTS.closed} />));
    expect(slots()).toEqual(["Slot 1: won, epic chest", "Slot 2: won, rare chest", "Slot 3: free"]);
    expect(screen.queryByRole("region", { name: /Waiting/ })).toBeNull();
    expect(screen.getByLabelText("1 of 3 left today")).toBeInTheDocument();
    // The clock ticks: the countdown follows `now`.
    rerender(wrap(<VillageChestsScene {...VILLAGE_CHESTS.closed} now={VILLAGE_CHESTS.closed.now + 1} />));
    expect(screen.getByRole("timer", { name: "Slots reset in 8:59:59" })).toBeInTheDocument();
  });

  it("says a won slot with no rank as won, and the rules in one line", () => {
    render(wrap(<VillageChestsScene {...VILLAGE_CHESTS.noRanks} />));
    expect(slots()).toEqual(["Slot 1: won", "Slot 2: won", "Slot 3: free"]);
    expect(screen.getByText(/Basic: one tile · Rare: one of 2 · Epic: one of 3 · A chest may hold Cobbles\./)).toBeInTheDocument();
  });

  it("puts the countdown at the centre once the three are won, and pulses it in the last minute", () => {
    const { unmount } = render(wrap(<VillageChestsScene {...VILLAGE_CHESTS.capped} />));
    const hero = screen.getByRole("region", { name: "Today's PvP chests" });
    expect(hero).toHaveAttribute("data-state", "full");
    // The countdown comes before the slots.
    expect(screen.getByRole("timer").compareDocumentPosition(screen.getByRole("list", { name: "Today's PvP slots" })) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(hero.querySelector("[data-pulse]")).toBeNull();
    unmount();
    render(wrap(<VillageChestsScene {...VILLAGE_CHESTS.lastMinute} />));
    expect(screen.getByRole("timer", { name: "More chests in 0:00:42" })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Today's PvP chests" }).querySelector("[data-pulse]")).not.toBeNull();
  });

  it("keeps every frame still under reduced motion", () => {
    render(
      <MotionConfig reducedMotion="always">
        {wrap(<VillageChestsScene {...VILLAGE_CHESTS.lastMinute} chests={VILLAGE_CHESTS.waiting.chests} initialModalOpen />)}
      </MotionConfig>,
    );
    expect(screen.getByRole("dialog", { name: "Epic chest" })).toBeInTheDocument();
    expect(document.querySelector("[data-pulse]")).toBeNull();
    expect(document.querySelector("[data-shake]")).toBeNull();
  });

  it("says Ready at the reset, given or reached on the scene's clock", () => {
    const { unmount } = render(wrap(<VillageChestsScene {...VILLAGE_CHESTS.ready} />));
    expect(within(screen.getByRole("region", { name: "Today's PvP chests" })).getByRole("status")).toHaveTextContent("Ready");
    expect(slots()).toEqual(["Slot 1: free, ready", "Slot 2: free, ready", "Slot 3: free, ready"]);
    expect(screen.queryByRole("timer")).toBeNull();
    unmount();
    // The read still says yesterday's 3: the clock at the reset frees the slots all the same.
    render(wrap(<VillageChestsScene {...VILLAGE_CHESTS.capped} now={VILLAGE_CHESTS.capped.resetsAt} />));
    expect(screen.getByLabelText("3 of 3 left today")).toBeInTheDocument();
    expect(screen.getByText(/3 new chests to win today/)).toBeInTheDocument();
  });

  it("invites to attack when no chest waits: a button to the mode choice", async () => {
    const onPlay = vi.fn();
    render(wrap(<VillageChestsScene {...VILLAGE_CHESTS.empty} onPlay={onPlay} />));
    expect(screen.getByText(/Win stars to fill a slot/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Choose a mode" }));
    expect(onPlay).toHaveBeenCalledTimes(1);
  });

  it("draws the dial direction with the same slots and countdown", () => {
    render(wrap(<VillageChestsScene {...VILLAGE_CHESTS.capped} look="dial" />));
    expect(screen.getByRole("region", { name: "Today's PvP chests" })).toHaveAttribute("data-look", "dial");
    expect(slots()).toHaveLength(3);
    expect(screen.getByRole("timer", { name: /More chests in/ })).toBeInTheDocument();
  });
});

describe("the daily shop (#739)", () => {
  it("offers 3 plans with their rarity and price, bought once each", async () => {
    const onBuy = vi.fn();
    const { unmount } = render(wrap(<VillageShopScene {...VILLAGE_SHOP.today} onBuy={onBuy} />));
    const offers = within(screen.getByRole("list", { name: "Today's offers" })).getAllByRole("listitem");
    expect(offers).toHaveLength(3);
    expect(screen.getByText("Mythic")).toBeInTheDocument();
    expect(screen.getByRole("timer", { name: /New tiles in/ })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: `Buy Tile 17 for ${SHOP_PRICE.mythic} Cobbles` }));
    expect(onBuy).toHaveBeenCalledWith(2);
    unmount();
    render(wrap(<VillageShopScene {...VILLAGE_SHOP.oneBought} />));
    expect(screen.getByText("Bought today")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Buy Tile 10/ })).toBeNull();
  });

  it("says what is missing when short of Cobbles", () => {
    render(wrap(<VillageShopScene {...VILLAGE_SHOP.short} onGetCobbles={() => undefined} />));
    expect(screen.getByRole("button", { name: /Buy Tile 17/ })).toBeDisabled();
    expect(screen.getByRole("button", { name: /Get Cobbles/ })).toBeInTheDocument();
  });
});

describe("the v2 stories", () => {
  it("have one story per state of their fixtures", () => {
    for (const [file, name, fixtures] of [
      ["village-layout-scene", "VILLAGE_LAYOUT", VILLAGE_LAYOUT],
      ["village-chests-scene", "VILLAGE_CHESTS", VILLAGE_CHESTS],
      ["village-shop-scene", "VILLAGE_SHOP", VILLAGE_SHOP],
    ] as const) {
      const text = readFileSync(join(__dirname, `../src/components/scenes/${file}.stories.tsx`), "utf8");
      const stories = [...text.matchAll(new RegExp(`^export const (\\w+): Story = \\{ args: ${name}\\.(\\w+) \\};$`, "gm"))].map((m) => m[2]);
      expect(stories.sort(), file).toEqual(Object.keys(fixtures).sort());
    }
  });

  it("use an inventory of plans the deck has", () => {
    for (const plan of Object.keys(INVENTORY)) expect(deckCount(Number(plan))).toBeGreaterThan(0);
  });
});
