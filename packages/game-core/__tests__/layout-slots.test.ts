/** The saved layouts' slots (#804): how many, their prices, the purchases, the saves and the activation. */
import { describe, expect, it } from "vitest";
import {
  LAYOUT_SLOTS,
  LAYOUT_SLOT_PRICES,
  STARTER_LAYOUTS,
  activateSlotRefusal,
  buySlotRefusal,
  inventoryOf,
  layoutSlotOpen,
  layoutSlotPrice,
  layoutSlotsOf,
  saveSlotRefusal,
  withSlotActive,
  withSlotBought,
  withSlotSaved,
  type LayoutTile,
} from "../src";

const STARTER = STARTER_LAYOUTS[0]!;
const OTHER = STARTER_LAYOUTS[1]!;
const limits = { slots: 9, inventory: inventoryOf([...STARTER, ...OTHER].map((t) => t.plan)) };

describe("the layout slots", () => {
  it("holds 3 slots: the first free, the others at 100 and 250 Cobbles", () => {
    expect(LAYOUT_SLOTS).toBe(3);
    expect(LAYOUT_SLOT_PRICES).toEqual([0, 100, 250]);
    expect([0, 1, 2].map(layoutSlotPrice)).toEqual([0, 100, 250]);
    expect(layoutSlotPrice(3)).toBeNull();
    expect(layoutSlotPrice(-1)).toBeNull();
    expect(layoutSlotPrice(1.5)).toBeNull();
  });

  it("starts with the village's layout in the free slot, active, the others locked and empty", () => {
    const slots = layoutSlotsOf(STARTER);
    expect(slots.active).toBe(0);
    expect(slots.layouts).toEqual([STARTER, null, null]);
    expect([0, 1, 2].map((i) => layoutSlotOpen(slots, i))).toEqual([true, false, false]);
  });

  it("buys a locked slot once, at the price shown, with the Cobbles held, in any order", () => {
    const slots = layoutSlotsOf(STARTER);
    expect(buySlotRefusal(slots, 0, 0, 1_000)).toBe("slot-open");
    expect(buySlotRefusal(slots, 3, 0, 1_000)).toBe("not-a-slot");
    expect(buySlotRefusal(slots, 2, 100, 1_000)).toBe("price-changed");
    expect(buySlotRefusal(slots, 2, 250, 249)).toBe("not-enough-cobbles");
    expect(buySlotRefusal(slots, 2, 250, 250)).toBeNull();
    const bought = withSlotBought(slots, 2);
    expect(layoutSlotOpen(bought, 2)).toBe(true);
    expect(bought.layouts[2]).toBeNull();
    expect(buySlotRefusal(bought, 2, 250, 1_000)).toBe("slot-open");
    expect(withSlotBought(bought, 1).bought).toEqual([1, 2]);
  });

  it("saves into an open slot a layout that passes the rules, and keeps the others as they were", () => {
    const slots = withSlotBought(layoutSlotsOf(STARTER), 1);
    expect(saveSlotRefusal(slots, 2, OTHER, limits)).toBe("slot-locked");
    expect(saveSlotRefusal(slots, 5, OTHER, limits)).toBe("not-a-slot");
    const unheld: LayoutTile[] = [...OTHER, { plan: 10, orientation: 2, x: 40, y: 40 }];
    expect(saveSlotRefusal(slots, 1, unheld, { ...limits, slots: 20 })).not.toBeNull();
    expect(saveSlotRefusal(slots, 1, OTHER, limits)).toBeNull();
    const saved = withSlotSaved(slots, 1, OTHER);
    expect(saved.layouts).toEqual([STARTER, OTHER, null]);
    expect(saved.active).toBe(0);
  });

  it("makes active an open slot with a layout that still fits, never an empty or a locked one", () => {
    let slots = withSlotBought(layoutSlotsOf(STARTER), 1);
    expect(activateSlotRefusal(slots, 1, limits)).toBe("slot-empty");
    expect(activateSlotRefusal(slots, 2, limits)).toBe("slot-locked");
    slots = withSlotSaved(slots, 1, OTHER);
    expect(activateSlotRefusal(slots, 1, limits)).toBeNull();
    // The stock no longer holding the layout's tiles: it needs tiles first.
    expect(activateSlotRefusal(slots, 1, { slots: 9, inventory: inventoryOf(STARTER.map((t) => t.plan)) })).not.toBeNull();
    const active = withSlotActive(slots, 1);
    expect(active.active).toBe(1);
    // The free slot is never lost: back to it at any time.
    expect(activateSlotRefusal(active, 0, limits)).toBeNull();
    expect(layoutSlotOpen(active, 0)).toBe(true);
  });
});
