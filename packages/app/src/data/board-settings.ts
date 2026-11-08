import { useMemo } from "react";
import type { RendererSettingsInput } from "@paved/renderer";
import { SUMMER_DAY, cycleDayNight } from "./day-night";
import { BOARD_FOG, BOARD_SMOKE, squareGridSettings, useDeviceSettings } from "./settings";

// What every board takes of the settings: a game's, the home's village, a game's end.

/**
 * The renderer's settings (quality, the seasons and the day and night as Settings choose them, the ambient effects, the fog and the
 * smoke, memoised so a change applies and a render does not) and the two board switches. `summerDay` (the scout and a visit, #788)
 * holds summer's day whatever Settings say.
 */
export function useBoardSettings(summerDay = false): { renderer: RendererSettingsInput; tilePreview: boolean; placementHighlight: boolean } {
  const [{ quality, seasons, dayTime, ambient, tilePreview, placementHighlight, squareGrid }] = useDeviceSettings();
  const renderer = useMemo<RendererSettingsInput>(
    () => ({ quality, dayNight: summerDay ? SUMMER_DAY : cycleDayNight(seasons, dayTime), ambient: { enabled: ambient }, fog: BOARD_FOG, smoke: BOARD_SMOKE, squareGrid: squareGridSettings(squareGrid) }),
    [quality, seasons, dayTime, ambient, squareGrid, summerDay],
  );
  return { renderer, tilePreview, placementHighlight };
}
