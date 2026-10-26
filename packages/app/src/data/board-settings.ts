import { useCallback, useMemo, useState } from "react";
import type { GameScene, RendererSettingsInput } from "@paved/renderer";
import { useSeasonWheel, wheelDayNight, type WheelPoint, type WheelState } from "./season-wheel";
import { BOARD_FOG, BOARD_SMOKE, squareGridSettings, useDeviceSettings } from "./settings";

// What the board takes of the settings. Its own module, not `settings.ts`, which the shell imports: the wheel's code is the board's.

/** What the board scene needs of the season wheel (#547): its state, the click, and where the cycle is. */
export interface BoardWheel {
  state: WheelState;
  onNext: () => void;
  /** The cycle's point as the scene last drew it; none until the scene is up. */
  read: (() => WheelPoint | null) | null;
}

/** The renderer's cycle off: summer's day with its fixed lights, no night and no chimney smoke (the renderer's rule, #770). */
export const SUMMER_DAY = { enabled: false, freezeAt: null } as const;

/**
 * The renderer's settings (quality, the day and night cycle, the ambient effects, the fog and the smoke, memoised so a change applies and a render does not), the two
 * board switches, and the season wheel of this game (#547: it starts from the Day and night setting, and `resetKey`, the
 * game, starts it again). The cycle's settings follow the wheel; `onScene` is the canvas's. `summerDay` (the scout and a visit,
 * #788) holds summer's day whatever the wheel and the Day and night setting say.
 */
export function useBoardSettings(resetKey?: unknown, summerDay = false): { renderer: RendererSettingsInput; tilePreview: boolean; placementHighlight: boolean; wheel: BoardWheel; onScene: (scene: GameScene | null) => void } {
  const [{ quality, dayNight, ambient, tilePreview, placementHighlight, squareGrid }] = useDeviceSettings();
  const { state, next } = useSeasonWheel(dayNight, resetKey);
  const [scene, setScene] = useState<GameScene | null>(null);
  const read = useCallback(() => scene?.getDayNight?.() ?? null, [scene]);
  const renderer = useMemo<RendererSettingsInput>(
    () => ({ quality, dayNight: summerDay ? SUMMER_DAY : wheelDayNight(state, dayNight), ambient: { enabled: ambient }, fog: BOARD_FOG, smoke: BOARD_SMOKE, squareGrid: squareGridSettings(squareGrid) }),
    [quality, dayNight, ambient, state, squareGrid, summerDay],
  );
  // A tap goes to the season after the cycle's (#634), read as the tap lands.
  const onNext = useCallback(() => next(read()?.season), [next, read]);
  const wheel = useMemo<BoardWheel>(() => ({ state, onNext, read: scene ? read : null }), [state, onNext, scene, read]);
  return { renderer, tilePreview, placementHighlight, wheel, onScene: setScene };
}
