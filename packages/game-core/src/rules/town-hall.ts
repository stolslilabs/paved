import { TOWN_HALL_TILES, isTownHallCell, type TownHallTile } from "../engine/town-hall";
import { LEVEL_CAP } from "./xp";

// The Town Hall (TOWN-HALL, owner 2026-11-19): the 2 x 2 tile at the centre of a village, in place of the starter. It has a
// level, 1 at the foundation; an upgrade takes the next level, costs Cobbles and asks for a player level. The Town Hall's level
// sets the village's slots (the tiles it may hold, the Town Hall counted as one): the player's level no longer does, it only
// opens the upgrades. An attack is played round the defender's Town Hall.

export { TOWN_HALL_TILES, isTownHallCell };
export type { TownHallTile };

/**
 * The decoration plots of a Town Hall's square: eight, round the hall. Each holds a placeholder for now; a player's own
 * decorations (won or bought) will stand there. The client's model places them (`DECOR_SLOTS` of its generator).
 */
export const TOWN_HALL_DECOR_SLOTS = 8;

/** The highest Town Hall level. */
export const TOWN_HALL_LEVELS = 10;
/** The Cobbles of the upgrade to each level (index `level - 1`; level 1 is the foundation, free). */
export const TOWN_HALL_PRICES = [0, 40, 80, 150, 250, 400, 600, 800, 1000, 1200] as const;
/** The player level each Town Hall level asks for (index `level - 1`), up to the level cap. */
export const TOWN_HALL_PLAYER_LEVELS = [1, 2, 4, 6, 8, 10, 12, 14, 17, LEVEL_CAP] as const;
/** The slots at level 1, the Town Hall included, and the slots each further level adds. */
export const TOWN_HALL_SLOT_BASE = 9;
export const TOWN_HALL_SLOT_STEP = 2;

/** A Town Hall level read within 1 and `TOWN_HALL_LEVELS`. */
export const townHallLevel = (level: number | undefined): number => Math.min(TOWN_HALL_LEVELS, Math.max(1, Math.floor(level ?? 1)));

/** The slots of a village whose Town Hall is at `level`, the Town Hall counted as one: 9 at level 1, 27 at level 10. */
export const townHallSlots = (level: number): number => TOWN_HALL_SLOT_BASE + TOWN_HALL_SLOT_STEP * (townHallLevel(level) - 1);

/** The Cobbles of the upgrade from `level` to the next, 0 at the last level. */
export const townHallPrice = (level: number): number => TOWN_HALL_PRICES[townHallLevel(level)] ?? 0;

/** The player level the upgrade from `level` asks for, 0 at the last level. */
export const townHallPlayerLevel = (level: number): number => TOWN_HALL_PLAYER_LEVELS[townHallLevel(level)] ?? 0;

/** The Town Hall level a player of `playerLevel` could reach with Cobbles enough (a rival's, a seeded player's). */
export function townHallLevelAt(playerLevel: number): number {
  let level = 1;
  while (level < TOWN_HALL_LEVELS && TOWN_HALL_PLAYER_LEVELS[level]! <= playerLevel) level += 1;
  return level;
}

/** Why an upgrade is refused, in the order it is checked. */
export type TownHallRefusal = "max-level" | "level-too-low" | "price-changed" | "not-enough-cobbles";

/** Why the upgrade from `level` is refused for a player at `playerLevel` holding `cobbles`, who confirmed `confirmedPrice`, or null. */
export function townHallRefusal(level: number, playerLevel: number, confirmedPrice: number, cobbles: number): TownHallRefusal | null {
  if (townHallLevel(level) >= TOWN_HALL_LEVELS) return "max-level";
  if (playerLevel < townHallPlayerLevel(level)) return "level-too-low";
  if (confirmedPrice !== townHallPrice(level)) return "price-changed";
  if (cobbles < confirmedPrice) return "not-enough-cobbles";
  return null;
}
