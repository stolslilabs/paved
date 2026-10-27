import type { RendererSettingsInput } from "@paved/renderer";
import { BOARD_FOG } from "./settings";

// Whose board it is, the board module's alone (`routes/game-board.tsx`): not `board-settings.ts`, which the home's first load reads.

/**
 * Whose board it is (#772): `own`, the player's games and village, in the square grid's green void; `rival`, someone else's
 * village (an attack, its scout, a replay of an attack on another village), in red tones, so "us" and "them" read apart;
 * `attack`, the player's own attack build in a match (#786), in blue tones, apart from the rival's red village it was played on.
 */
export type BoardSide = "own" | "rival" | "attack";

/**
 * The rival's void (#772, open point 7: the reds tuned in the story `Scenes/Board/Attack and Training`, Voids, whose controls
 * change them): the square grid's backdrop with a dark wine ground in place of the green's near black (the Low tier and software
 * WebGL draw no mist, so the ground carries the red alone there), a rose-rust veil in place of the sage (as light, so it shows at
 * the veil's small share), threads and lines to match, and less of the season's hue (`seasonShare` 0.3 of the green's 0.6) so
 * the red holds in every season. Rust and rose, not the HUD's ember (`--destructive`): the void must not read as an error.
 */
export const RIVAL_BACKDROP = {
  ground: "#220c0a",
  veil: "#c47c70",
  energyColor: "#ec8a6a",
  energyGlow: "#f6bea8",
  lineColor: "#8c625c",
  seasonShare: 0.3,
} as const;

/** The fog of a rival's board with the square grid off (open point 6): the void is the fog then, tinted a light red. */
export const RIVAL_FOG = { color: "#d8c4c4", shade: "#ae8f90" } as const;

/**
 * The player's attack build's void (#786, open point 1: the blues tuned in the story `Scenes/Board/Attack and Training`, Voids,
 * beside the green and the red): the rival's recipe in blue, a deep night-blue ground, a slate-blue veil, steel-blue threads and
 * lines, and the same `seasonShare` 0.3 so the blue holds in every season. Not the HUD's `--info` cyan: a void, not a notice.
 */
export const ATTACK_BACKDROP = {
  ground: "#0a1426",
  veil: "#7894c4",
  energyColor: "#6a98ec",
  energyGlow: "#a8c4f6",
  lineColor: "#5c6c8c",
  seasonShare: 0.3,
} as const;

/** The fog of the attack build's board with the square grid off: a light blue. */
export const ATTACK_FOG = { color: "#c4ccd8", shade: "#8f9aae" } as const;

const SIDE_TONES = { rival: { backdrop: RIVAL_BACKDROP, fog: RIVAL_FOG }, attack: { backdrop: ATTACK_BACKDROP, fog: ATTACK_FOG } } as const;

/** The renderer's square grid and fog for a side: the board's as they are (`own`), or the rival's reds or the attack's blues over them. */
export function sideSettings(side: BoardSide, squareGrid: NonNullable<RendererSettingsInput["squareGrid"]>, fog: RendererSettingsInput["fog"] = BOARD_FOG): Pick<RendererSettingsInput, "fog" | "squareGrid"> {
  if (side === "own") return { fog, squareGrid };
  const tones = SIDE_TONES[side];
  return {
    fog: { ...fog, ...tones.fog },
    squareGrid: squareGrid.enabled === false ? squareGrid : { ...squareGrid, backdrop: { ...squareGrid.backdrop, ...tones.backdrop } },
  };
}
