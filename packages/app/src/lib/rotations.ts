import { Layout, Orientation, Plan } from "@paved/game-core";

/** The nine areas of `plan` turned to `orientation`, as one key: two orientations with the same key are the same tile in the game. */
function layoutKey(plan: Plan, orientation: number): string {
  const l = Layout.from(plan, Orientation.from(orientation).value);
  return [l.center, l.northWest, l.north, l.northEast, l.east, l.southEast, l.south, l.southWest, l.west].map((c) => c.value).join("");
}

/**
 * The rotations of `legal` that change the tile (TILE-ACTIONS, the owner's ask of 2026-11-07: no Rotate where no other rotation is
 * possible): one per distinct layout, the current `orientation` standing for its own, so a turn always shows another tile. A symmetric
 * plan (the full city, the crossroads, the wonder: one layout; the straight road and the two-sided cities: two) fits a cell in several
 * orientations that are the same tile. Sorted, as `legal`. Unknown plan: `legal` as it is.
 */
export function distinctRotations(plan: number | null, legal: ReadonlyArray<number>, orientation: number): number[] {
  if (plan === null || legal.length < 2) return [...legal];
  let p: Plan;
  try {
    p = Plan.from(plan);
    layoutKey(p, 1);
  } catch {
    return [...legal];
  }
  const seen = new Set<string>();
  const out: number[] = [];
  for (let step = 0; step < 4; step++) {
    const o = ((orientation - 1 + step) % 4) + 1;
    if (!legal.includes(o)) continue;
    const key = layoutKey(p, o);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(o);
  }
  return out.sort((a, b) => a - b);
}
