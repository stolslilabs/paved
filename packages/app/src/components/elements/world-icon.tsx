import { Relief, reliefParts, type GameIconProps, type ReliefLook } from "./game-icon";
import { WORLD_ICON_SHAPES, type WorldIconName } from "./world-icon-shapes";

export type { WorldIconName } from "./world-icon-shapes";

/**
 * Each world icon's tones (issue 870), from the game icons' palette: the categories (Forest green, Road stone with its line
 * gold, City's castle stone, Wonder's dome gold on stone columns: open point 1's gold), the seasons (summer's wheat sheaf gold,
 * since issue 930's follow-up; autumn's leaf orange, winter's snowflake ice, spring's seedling a light green) and the wheel's
 * day and night marks: by day the sun gold (the owner's ask, in summer's old place), by night the moon silver. Summer's other
 * candidates, until the owner picks: a flame red, a beach umbrella red and light on its wooden pole.
 */
const LOOKS: Record<WorldIconName, ReliefLook> = {
  tree: { tones: ["green"] },
  road: { tones: ["stone", "gold"] },
  castle: { tones: ["stone"] },
  "landmark-dome": { tones: ["gold", "stone"] },
  sun: { tones: ["gold"] },
  "wheat-awn": { tones: ["gold"] },
  "fire-flame-curved": { tones: ["red"] },
  "umbrella-beach": { tones: ["wood", "red", "light", "red"] },
  leaf: { tones: ["orange"] },
  snowflake: { tones: ["ice"] },
  seedling: { tones: ["sprout"] },
  moon: { tones: ["silver"] },
  // The home's Camera mode (issue 875): a camera's steel body, its lens stone.
  video: { tones: ["steel", "stone"] },
};

export interface WorldIconProps extends Omit<GameIconProps, "name"> {
  name: WorldIconName;
}

/**
 * A game icon of the world (issue 870): the structure categories and the season wheel's, in `GameIcon`'s relief and box. Their
 * shapes are a file of their own, so the home's first load, which shows none of them, does not carry them.
 */
export function WorldIcon({ name, tone, ...frame }: WorldIconProps) {
  const shape = WORLD_ICON_SHAPES[name];
  return <Relief name={name} width={shape.width} parts={reliefParts(shape, LOOKS[name], tone)} {...frame} />;
}
