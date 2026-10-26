import type { Chest } from "../components/scenes/village-chests-scene";
import type { ChestOrigin, ChestsView } from "../data/free-village";

/**
 * The chests waiting as the scene shows them (#784), with today's slots: a chest won today in PvP fills the slot of its place
 * in the day (the chests open in the order won, so the day's first ones are those opened), a Story chest takes none. A read
 * that does not say where its chests were won fills no slot by a chest and counts none opened.
 */
export function chestSlots(view: ChestsView, day: number): { chests: Chest[]; opened: number } {
  const today = (o: ChestOrigin | null | undefined) => o?.source === "pvp" && o.day === day;
  const known = view.origins !== undefined;
  const left = (view.origins ?? []).filter(today).length + (view.open && today(view.openOrigin) ? 1 : 0);
  const opened = known ? Math.max(0, view.pvpToday - left) : 0;
  let next = opened + (view.open && today(view.openOrigin) ? 1 : 0);
  const chests = view.pending.map((rank, i): Chest => {
    const origin = view.origins?.[i] ?? null;
    return { id: i + 1, rank, ...(origin ? { source: origin.source } : {}), ...(today(origin) ? { slot: next++ } : {}) };
  });
  return { chests, opened };
}
