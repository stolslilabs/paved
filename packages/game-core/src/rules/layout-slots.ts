import { layoutRefusal, type LayoutLimits, type LayoutRefusal, type LayoutTile } from "./free-village";

// Saved village layouts (#804, the owner's decisions of 2026-10-26, as Clash of Clans' layouts): 3 slots at most, the first
// free and never lost, the others bought with Cobbles (open point 1: 100 and 250, in any order). One slot is active: its
// layout is the village, the one attackers face. A save into another slot keeps the village as it is (a backup, a project, a
// random village of the die, #803). Every layout passes `layoutRefusal` against the stock and the slots when it is saved and
// when it is made active; the stock and the slots only grow (#734), so a saved layout stays valid.

/** The layout slots at most. */
export const LAYOUT_SLOTS = 3;

/** The price of each slot in Cobbles, by index (slot 1 is index 0, free). */
export const LAYOUT_SLOT_PRICES: readonly number[] = [0, 100, 250];

/** A player's layout slots: each one's layout (the starter left out; null: empty), the slots bought (indexes), the active one. */
export interface LayoutSlots {
  readonly layouts: readonly (readonly LayoutTile[] | null)[];
  readonly bought: readonly number[];
  readonly active: number;
}

/** Why a slot's write is refused: the layout's own reasons, or the slot's. */
export type LayoutSlotRefusal = LayoutRefusal | "not-a-slot" | "slot-locked" | "slot-empty" | "slot-open" | "price-changed" | "not-enough-cobbles";

/** A slot's index (0 to 2). */
export const isLayoutSlot = (slot: number): boolean => Number.isInteger(slot) && slot >= 0 && slot < LAYOUT_SLOTS;

/** A slot's price in Cobbles (0 for the free one), or null: not a slot. */
export const layoutSlotPrice = (slot: number): number | null => (isLayoutSlot(slot) ? LAYOUT_SLOT_PRICES[slot]! : null);

/** The slots of a village with one layout: it is in the free slot, active; the others locked and empty. */
export function layoutSlotsOf(layout: readonly LayoutTile[]): LayoutSlots {
  return { layouts: [layout.map((t) => ({ ...t })), null, null], bought: [], active: 0 };
}

/** The slot is the player's: the free one, or one bought. */
export const layoutSlotOpen = (slots: LayoutSlots, slot: number): boolean => isLayoutSlot(slot) && (slot === 0 || slots.bought.includes(slot));

/** Why `tiles` cannot be saved into `slot`, or null. */
export function saveSlotRefusal(slots: LayoutSlots, slot: number, tiles: readonly LayoutTile[], limits: LayoutLimits): LayoutSlotRefusal | null {
  if (!isLayoutSlot(slot)) return "not-a-slot";
  if (!layoutSlotOpen(slots, slot)) return "slot-locked";
  return layoutRefusal(tiles, limits);
}

/** Why `slot` cannot be made active, or null: an open slot with a layout that still fits the stock and the slots. */
export function activateSlotRefusal(slots: LayoutSlots, slot: number, limits: LayoutLimits): LayoutSlotRefusal | null {
  if (!isLayoutSlot(slot)) return "not-a-slot";
  if (!layoutSlotOpen(slots, slot)) return "slot-locked";
  const layout = slots.layouts[slot];
  if (!layout) return "slot-empty";
  return layoutRefusal(layout, limits);
}

/** Why `slot` cannot be bought at `confirmedPrice` (the price the page showed) with `cobbles`, or null. */
export function buySlotRefusal(slots: LayoutSlots, slot: number, confirmedPrice: number, cobbles: number): LayoutSlotRefusal | null {
  const price = layoutSlotPrice(slot);
  if (price === null) return "not-a-slot";
  if (layoutSlotOpen(slots, slot)) return "slot-open";
  if (price !== confirmedPrice) return "price-changed";
  if (cobbles < price) return "not-enough-cobbles";
  return null;
}

/** The slots with `tiles` saved into `slot` (checked first: `saveSlotRefusal`). */
export function withSlotSaved(slots: LayoutSlots, slot: number, tiles: readonly LayoutTile[]): LayoutSlots {
  return { ...slots, layouts: slots.layouts.map((l, i) => (i === slot ? tiles.map((t) => ({ ...t })) : l)) };
}

/** The slots with `slot` bought: open and empty. */
export function withSlotBought(slots: LayoutSlots, slot: number): LayoutSlots {
  return { ...slots, bought: [...slots.bought, slot].sort((a, b) => a - b) };
}

/** The slots with `slot` active. */
export const withSlotActive = (slots: LayoutSlots, slot: number): LayoutSlots => ({ ...slots, active: slot });
