import type { Chest } from "../components/scenes/village-chests-scene";
import type { ChestOrigin, ChestsView } from "../data/free-village";

/**
 * The chests waiting as the scene shows them (#784), with today's slots: a chest won today in PvP names the slot it fills, a
 * Story chest takes none, and a slot of today's whose chest is neither waiting nor open was opened. A chest the read cannot place
 * (no origin, from a save before them, or today's PvP with no slot) may be any slot's: then no slot counts as opened, so a
 * chest waiting is never shown as opened.
 */
export function chestSlots(view: ChestsView, day: number): { chests: Chest[]; opened: number[] } {
  const today = (o: ChestOrigin | null | undefined): o is Extract<ChestOrigin, { source: "pvp" }> => o?.source === "pvp" && o.day === day;
  const origins = view.pending.map((_, i) => view.origins?.[i] ?? null);
  const held = [...origins, ...(view.open ? [view.openOrigin ?? null] : [])];
  const unplaced = held.some((o) => o === null || (today(o) && o.slot === undefined));
  const taken = new Set(held.flatMap((o) => (today(o) && o.slot !== undefined ? [o.slot] : [])));
  const opened = unplaced ? [] : Array.from({ length: Math.max(0, view.pvpToday) }, (_, i) => i).filter((i) => !taken.has(i));
  const chests = view.pending.map((rank, i): Chest => {
    const origin = origins[i] ?? null;
    return { id: i + 1, rank, ...(origin ? { source: origin.source } : {}), ...(today(origin) && origin.slot !== undefined ? { slot: origin.slot } : {}) };
  });
  return { chests, opened };
}
