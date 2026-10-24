import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { LazyMotion, domMax } from "motion/react";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
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
import { INVENTORY, KEY_TILE, LAYOUT_FULL, LAYOUT_GROWING, LAYOUT_START, OUTER_TILE, SHOP_PRICE, VILLAGE_CHESTS, VILLAGE_LAYOUT, VILLAGE_SHOP, fakeScore, lay } from "../src/mocks/village-v2";

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

  it("rates the plans by their count in the base deck: 6 rare cards of 72, the 8 % of a single draw", () => {
    const plans = Array.from({ length: 19 }, (_, i) => i + 1);
    expect(plans.reduce((n, p) => n + deckCount(p), 0)).toBe(72);
    expect(plans.filter((p) => rarityOf(p) === "rare").reduce((n, p) => n + deckCount(p), 0)).toBe(6);
    expect(rarityOf(PLAN.road)).toBe("common");
    expect(rarityOf(PLAN.wonder)).toBe("uncommon");
    expect(rarityOf(PLAN.city)).toBe("rare");
    expect(CHEST_CHOICES).toEqual({ bronze: 1, silver: 2, gold: 3 });
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

  it("places a tile from the inventory as on the board: a card, a lit cell, the bubble's hold", async () => {
    render(wrap(<VillageLayoutScene {...VILLAGE_LAYOUT.growing} />));
    await userEvent.click(screen.getAllByRole("button", { name: "Edit" })[0]!);
    expect(screen.getByRole("button", { name: /Save/ })).toBeDisabled();
    const inventory = screen.getByRole("region", { name: "Inventory tiles" });
    await userEvent.click(within(inventory).getByRole("button", { name: /^Tile 10, 4 left$/ }));
    // The board's cells by their marks: a role query over a few hundred cells is slow in jsdom.
    const plates = document.querySelectorAll<HTMLButtonElement>('[data-kind="plate"]');
    expect(plates.length).toBe(legalSpots(LAYOUT_GROWING.tiles, PLAN.road).length);
    await userEvent.click(plates[0]!);
    const bubble = screen.getByRole("toolbar", { name: "Tile" });
    // An activation with no press acts at once (a screen reader's): the hold guards a slip of the finger.
    fireEvent.click(within(bubble).getByRole("button", { name: "Hold to place the tile" }));
    expect(screen.getAllByLabelText("22 of 28 slots used").length).toBeGreaterThan(0);
    expect(within(inventory).getByRole("button", { name: /^Tile 10, 3 left$/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Save/ })).toBeEnabled();
  });

  it("lifts an outer tile and sends it back; a tile that holds the village shakes; the starter is no button", async () => {
    render(wrap(<VillageLayoutScene {...VILLAGE_LAYOUT.editing} />));
    expect(document.querySelector('[data-kind="starter"]')?.tagName).toBe("SPAN");
    await userEvent.click(document.querySelector<HTMLButtonElement>(`[data-tile="${KEY_TILE.id}"]`)!);
    expect(screen.getByText(/holds the village together/)).toBeInTheDocument();
    expect(screen.getAllByLabelText("21 of 28 slots used").length).toBeGreaterThan(0);
    await userEvent.click(document.querySelector<HTMLButtonElement>(`[data-tile="${OUTER_TILE.id}"]`)!);
    await userEvent.click(within(screen.getByRole("toolbar", { name: "Tile" })).getByRole("button", { name: "Back to the inventory" }));
    expect(screen.getAllByLabelText("20 of 28 slots used").length).toBeGreaterThan(0);
  });

  it("Reset all brings the village back to the starter; Discard changes back to the saved layout", async () => {
    render(wrap(<VillageLayoutScene {...VILLAGE_LAYOUT.editing} />));
    fireEvent.click(screen.getByRole("button", { name: /^Hold to reset all/ }));
    expect(screen.getAllByLabelText("1 of 28 slots used").length).toBeGreaterThan(0);
    expect(screen.getByRole("button", { name: /Save/ })).toBeEnabled();
    await userEvent.click(screen.getByRole("button", { name: "Discard changes" }));
    expect(screen.getAllByLabelText("21 of 28 slots used").length).toBeGreaterThan(0);
  });

  it("saves a changed layout and shows the new score; leaving with changes asks first", async () => {
    const onSave = vi.fn();
    const { unmount } = render(wrap(<VillageLayoutScene {...VILLAGE_LAYOUT.changed} onSave={onSave} />));
    expect(screen.getByText("Layout score")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /Save/ }));
    expect(onSave).toHaveBeenCalledWith(VILLAGE_LAYOUT.changed.initialDraft);
    unmount();
    const { unmount: saved } = render(wrap(<VillageLayoutScene {...VILLAGE_LAYOUT.saved} />));
    expect(screen.getByText("Layout saved")).toBeInTheDocument();
    expect(screen.getByText(/\+1,122/)).toBeInTheDocument();
    saved();
    render(wrap(<VillageLayoutScene {...VILLAGE_LAYOUT.leaving} />));
    const dialog = screen.getByRole("dialog", { name: "Leave without saving?" });
    await userEvent.click(within(dialog).getByRole("button", { name: "Leave" }));
    expect(screen.queryByRole("region", { name: "Inventory tiles" })).toBeNull();
  });

  it("greys the inventory once every slot is used", () => {
    render(wrap(<VillageLayoutScene {...VILLAGE_LAYOUT.full} />));
    expect(screen.getByText("Every slot is used")).toBeInTheDocument();
    for (const card of within(screen.getByRole("region", { name: "Inventory tiles" })).getAllByRole("button")) expect(card).toBeDisabled();
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

describe("the chests (#739)", () => {
  it("lists the chests by rank and the day's PvP chests left", async () => {
    const onOpen = vi.fn();
    render(wrap(<VillageChestsScene {...VILLAGE_CHESTS.waiting} onOpen={onOpen} />));
    expect(screen.getByLabelText("1 of 3 left today")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /Open the gold chest: one of 3 tiles/ }));
    expect(onOpen).toHaveBeenCalledWith(41);
  });

  it("keeps one of a gold chest's 3 tiles, chosen first", async () => {
    const onTake = vi.fn();
    render(wrap(<VillageChestsScene {...VILLAGE_CHESTS.gold} onTake={onTake} />));
    const tiles = within(screen.getByRole("list", { name: "Chest tiles" })).getAllByRole("button");
    expect(tiles).toHaveLength(3);
    expect(screen.getByRole("button", { name: "Choose a tile" })).toBeDisabled();
    await userEvent.click(tiles[1]!);
    await userEvent.click(screen.getByRole("button", { name: /^Keep Tile 18$/ }));
    expect(onTake).toHaveBeenCalledWith(41, 1);
  });

  it("gives a bronze chest's one tile as it is, and says the Cobbles a chest held", async () => {
    const onTake = vi.fn();
    const { unmount } = render(wrap(<VillageChestsScene {...VILLAGE_CHESTS.bronze} onTake={onTake} />));
    await userEvent.click(screen.getByRole("button", { name: /^Keep Tile 7$/ }));
    expect(onTake).toHaveBeenCalledWith(39, 0);
    unmount();
    render(wrap(<VillageChestsScene {...VILLAGE_CHESTS.cobbles} />));
    expect(screen.getByText("Cobbles in the chest!")).toBeInTheDocument();
    expect(screen.getByLabelText("+50 Cobbles")).toBeInTheDocument();
  });

  it("says the tile taken, the day capped, and none waiting", () => {
    const { unmount } = render(wrap(<VillageChestsScene {...VILLAGE_CHESTS.taken} />));
    expect(screen.getByText("Added to your inventory")).toBeInTheDocument();
    unmount();
    const { unmount: capped } = render(wrap(<VillageChestsScene {...VILLAGE_CHESTS.capped} />));
    expect(screen.getByLabelText("0 of 3 left today")).toBeInTheDocument();
    expect(screen.getByRole("timer", { name: /More chests in/ })).toBeInTheDocument();
    capped();
    render(wrap(<VillageChestsScene {...VILLAGE_CHESTS.empty} />));
    expect(screen.getByText("No chest waiting")).toBeInTheDocument();
  });
});

describe("the daily shop (#739)", () => {
  it("offers 3 plans with their rarity and price, bought once each", async () => {
    const onBuy = vi.fn();
    const { unmount } = render(wrap(<VillageShopScene {...VILLAGE_SHOP.today} onBuy={onBuy} />));
    const offers = within(screen.getByRole("list", { name: "Today's offers" })).getAllByRole("listitem");
    expect(offers).toHaveLength(3);
    expect(screen.getByText("Rare")).toBeInTheDocument();
    expect(screen.getByRole("timer", { name: /New tiles in/ })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: `Buy Tile 17 for ${SHOP_PRICE.rare} Cobbles` }));
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
