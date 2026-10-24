// XP, levels and village slots (PvP v2, #732, #734). The curve stays (`docs/architecture/xp-level.md`): going from level `n`
// to `n + 1` costs `100 x n` XP. The level is capped at `LEVEL_CAP` and the XP stops there, so when the cap is raised every
// player at it stands at the same stage. Slots, the tiles a village may hold (its starter included), are `8 + level`.

/** Going from level `n` to `n + 1` costs `XP_STEP x n` XP (`Setup`'s `LEVEL_STEP`). */
export const XP_STEP = 100;
/** The highest level (owner, 2026-10-24); it can only be raised. */
export const LEVEL_CAP = 20;
/** The slots of a village are `SLOT_BASE + level`: 9 at level 1, 28 at the cap. */
export const SLOT_BASE = 8;

/** The XP an attack gives by its stars, 0 to 3 (owner, 2026-10-24). A defence gives none. */
export const PVP_XP = [0, 5, 10, 20] as const;
/** The XP of each Story star, the first time it is earned. */
export const STORY_XP_PER_STAR = 5;
/** The Challenge gives no XP. */
export const CHALLENGE_XP = 0;
/** A defence gives no XP. */
export const DEFENCE_XP = 0;

/** The XP at which `level` (1 or more) starts: `XP_STEP x level (level - 1) / 2`. */
export const xpFloor = (level: number): number => (XP_STEP * level * (level - 1)) / 2;

/** The most XP a player can hold: the cap's floor (19,000 at level 20). */
export const XP_CAP = xpFloor(LEVEL_CAP);

/** The level of `xp` XP: the highest `L` up to `LEVEL_CAP` with `xpFloor(L) <= xp`; 1 at 0 XP. */
export function xpLevelOf(xp: number): number {
  let level = 1;
  while (level < LEVEL_CAP && xpFloor(level + 1) <= xp) level += 1;
  return level;
}

/** The slots of a player at `level`: `SLOT_BASE + level`, the level read within 1 and the cap. */
export function slotsOf(level: number): number {
  return SLOT_BASE + Math.min(LEVEL_CAP, Math.max(1, Math.floor(level)));
}

/** Where a player stands: the XP, the level, the XP the level starts and the next one starts at, the slots. */
export interface LevelStatus {
  readonly xp: number;
  readonly level: number;
  /** The XP at which the level starts. */
  readonly floor: number;
  /** The XP at which the next level starts; the floor itself at the cap. */
  readonly next: number;
  /** At the cap: no XP is gained any more. */
  readonly capped: boolean;
  readonly slots: number;
}

export function levelStatus(xp: number): LevelStatus {
  const held = Math.min(XP_CAP, Math.max(0, Math.floor(xp)));
  const level = xpLevelOf(held);
  const capped = level >= LEVEL_CAP;
  return { xp: held, level, floor: xpFloor(level), next: capped ? xpFloor(level) : xpFloor(level + 1), capped, slots: slotsOf(level) };
}

/** `gain` XP added to `xp`, stopped at `XP_CAP`: the new total and what was really gained. */
export function addXp(xp: number, gain: number): { xp: number; gained: number } {
  const before = Math.min(XP_CAP, Math.max(0, Math.floor(xp)));
  const after = Math.min(XP_CAP, before + Math.max(0, Math.floor(gain)));
  return { xp: after, gained: after - before };
}

/** The XP of an attack with `stars` (0 to 3). */
export function pvpXp(stars: number): number {
  return PVP_XP[Math.min(3, Math.max(0, Math.floor(stars)))]!;
}

/** The XP of a Story run with `stars` on a level whose best was `best`: 5 per star earned for the first time. */
export function storyXp(best: number, stars: number): number {
  return STORY_XP_PER_STAR * Math.max(0, Math.min(3, stars) - Math.max(0, best));
}
