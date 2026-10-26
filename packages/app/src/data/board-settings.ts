import { useCallback, useMemo, useState } from "react";
import type { GameScene, RendererSettingsInput } from "@paved/renderer";
import { useSeasonWheel, wheelDayNight, type WheelPoint, type WheelState } from "./season-wheel";
import { BOARD_FOG, squareGridSettings, useDeviceSettings } from "./settings";

// What the board takes of the settings. Its own module, not `settings.ts`, which the shell imports: the wheel's code is the board's.

/** What the board scene needs of the season wheel (#547): its state, the click, and where the cycle is. */
export interface BoardWheel {
  state: WheelState;
  onNext: () => void;
  /** The cycle's point as the scene last drew it; none until the scene is up. */
  read: (() => WheelPoint | null) | null;
}

/**
 * Whose board it is (#772): `own`, the player's games and village, in the square grid's green void; `rival`, someone else's
 * village (an attack, its scout, a replay of an attack on another village), in red tones, so "us" and "them" read apart.
 */
export type BoardSide = "own" | "rival";

/**
 * The rival's void (#772, open point 7: the reds tuned in the story `Scenes/Board/Voids`): the square grid's backdrop with a dark
 * ground touched with red in place of the green, a muted rose veil in place of the sage (as light, so it shows at the veil's small
 * share), threads and lines to match, and less of the season's hue (`seasonShare` 0.3 of the green's 0.6) so the red holds in
 * every season. Rust and rose, not the HUD's ember (`--destructive`): the void must not read as an error.
 */
export const RIVAL_BACKDROP = {
  ground: "#130c0b",
  veil: "#b08a82",
  energyColor: "#e8956b",
  energyGlow: "#f4c4a6",
  lineColor: "#7d6c69",
  seasonShare: 0.3,
} as const;

/** The fog of a rival's board with the square grid off (open point 6): the void is the fog then, tinted a light red. */
export const RIVAL_FOG = { color: "#d8c4c4", shade: "#ae8f90" } as const;

/** The renderer's square grid and fog for a side: the green void as is, or the rival's reds over it. */
export function sideSettings(side: BoardSide, squareGrid: NonNullable<RendererSettingsInput["squareGrid"]>): Pick<RendererSettingsInput, "fog" | "squareGrid"> {
  if (side === "own") return { fog: BOARD_FOG, squareGrid };
  return {
    fog: { ...BOARD_FOG, ...RIVAL_FOG },
    squareGrid: squareGrid.enabled === false ? squareGrid : { ...squareGrid, backdrop: { ...squareGrid.backdrop, ...RIVAL_BACKDROP } },
  };
}

/**
 * The renderer's settings (quality, the day and night cycle, the ambient effects and the fog, memoised so a change applies and a render does not), the two
 * board switches, and the season wheel of this game (#547: it starts from the Day and night setting, and `resetKey`, the
 * game, starts it again). The cycle's settings follow the wheel; `onScene` is the canvas's. `side` gives the void its colours.
 */
export function useBoardSettings(resetKey?: unknown, side: BoardSide = "own"): { renderer: RendererSettingsInput; tilePreview: boolean; placementHighlight: boolean; wheel: BoardWheel; onScene: (scene: GameScene | null) => void } {
  const [{ quality, dayNight, ambient, tilePreview, placementHighlight, squareGrid }] = useDeviceSettings();
  const { state, next } = useSeasonWheel(dayNight, resetKey);
  const [scene, setScene] = useState<GameScene | null>(null);
  const read = useCallback(() => scene?.getDayNight?.() ?? null, [scene]);
  const renderer = useMemo<RendererSettingsInput>(
    () => ({ quality, dayNight: wheelDayNight(state, dayNight), ambient: { enabled: ambient }, ...sideSettings(side, squareGridSettings(squareGrid)) }),
    [quality, dayNight, ambient, state, squareGrid, side],
  );
  // A tap goes to the season after the cycle's (#634), read as the tap lands.
  const onNext = useCallback(() => next(read()?.season), [next, read]);
  const wheel = useMemo<BoardWheel>(() => ({ state, onNext, read: scene ? read : null }), [state, onNext, scene, read]);
  return { renderer, tilePreview, placementHighlight, wheel, onScene: setScene };
}
