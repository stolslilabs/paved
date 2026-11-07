/**
 * The rim's hole: the share of the frame's width inside the ring, the same on every tier. The portrait under it is a disc a little
 * wider (`RIM_PORTRAIT`), so its edge always hides under the ring. The rings of 2026-11-06 are half as thick as those of 2026-11-01
 * (the owner's ask), their outer edge where it was: each master's ring band remapped radially from its hole (0.664) to 0.804, every
 * ring centred on the frame (some sat up to 1.9% of the width aside); measured on the masters, the hole is 0.8037 to 0.8043 a tier
 * (alpha above half, its mean round the ring). The portrait keeps its 0.03 under the ring.
 *
 * A module of its own, apart from `league-standards.ts`: the player card's stand-in ring (`player-badge.tsx`, on the first load)
 * reads `RIM_PORTRAIT` before the rim's chunk comes, and the standards' module would add a chunk to the first load.
 */
export const RIM_HOLE = 0.804;
export const RIM_PORTRAIT = 0.834;
