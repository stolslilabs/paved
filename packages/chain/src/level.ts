import type { Decoded } from "./codec";

// The player's XP and level on `Setup` (#641, `docs/architecture/xp-level.md`): the XP is credited by the reporters only (a
// Challenge game over, Story stars, PvP), the level is computed from it by one curve, never stored. `playerLevel` reads both
// in one call; `CobbleAccount.xp` carries the XP with the rest of the account.

/** The sources of an `XpGained` (`Setup`'s `XP_CHALLENGE` to `XP_DEFENCE`). */
export const XP_SOURCE = { challenge: 1, story: 2, attack: 3, defence: 4 } as const;

/** The XP saturates at 2^27 - 1 (`Setup`'s `MAX_XP`). */
export const MAX_XP = 0x7ffffff;

/** The level curve (`Setup`'s `LEVEL_STEP`): going from level `n` to `n + 1` costs `LEVEL_STEP x n` XP. */
export const LEVEL_STEP = 100;

/** The XP at which `level` (1 or more) starts, as `Setup`'s `level_floor`: `LEVEL_STEP x level (level - 1) / 2`. */
export const levelFloor = (level: number): number => (LEVEL_STEP * level * (level - 1)) / 2;

/** The level of `xp` XP, as `Setup`'s `level_of`: the highest `L` with `levelFloor(L) <= xp`; 1 at 0 XP. */
export function levelOf(xp: number): number {
  const q = Math.floor((2 * xp) / LEVEL_STEP);
  let level = Math.floor((1 + Math.sqrt(4 * q + 1)) / 2);
  while (levelFloor(level) > xp) level -= 1;
  while (levelFloor(level + 1) <= xp) level += 1;
  return level;
}

/** `Setup.player_level(player_id)`: the XP, the level, and the XP at which the level and the next one start. */
export interface PlayerLevel {
  xp: number;
  level: number;
  floor: number;
  next: number;
}

/** The struct fields of `player_level`, in ABI order (camelCased); a test checks them against `contracts/abis/Setup.json`. */
export const PLAYER_LEVEL_FIELDS = ["xp", "level", "floor", "next"];

/** The level of a player with `xp` XP, as the view computes it. */
export const playerLevelOf = (xp: number): PlayerLevel => {
  const level = levelOf(xp);
  return { xp, level, floor: levelFloor(level), next: levelFloor(level + 1) };
};

export const playerLevel = (s: Record<string, Decoded>): PlayerLevel => ({
  xp: Number(s.xp ?? 0),
  level: Number(s.level ?? 1),
  floor: Number(s.floor ?? 0),
  next: Number(s.next ?? 0),
});

/**
 * The XP view on `Setup`. `RpcGameViews` reads it (a `not-configured` `ViewError` without a Setup address, `not-available`
 * before the class has it) and `FakeGameViews` answers it from the Cobbles account's `xp`; `GameViews` does not require it.
 */
export interface LevelViews {
  playerLevel(playerId: string): Promise<PlayerLevel>;
}
