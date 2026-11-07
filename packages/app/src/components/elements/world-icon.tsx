import { Relief, reliefParts, type GameIconProps, type ReliefLook } from "./game-icon";
import { WORLD_ICON_SHAPES, type WorldIconName } from "./world-icon-shapes";

export type { WorldIconName } from "./world-icon-shapes";

/**
 * Each world icon's tones (issue 870), from the game icons' palette: the categories, Forest green, Road stone with its line gold,
 * City's castle stone, Wonder's dome gold on stone columns (open point 1's gold).
 */
const LOOKS: Record<WorldIconName, ReliefLook> = {
  tree: { tones: ["green"] },
  road: { tones: ["stone", "gold"] },
  castle: { tones: ["stone"] },
  "landmark-dome": { tones: ["gold", "stone"] },
};

export interface WorldIconProps extends Omit<GameIconProps, "name"> {
  name: WorldIconName;
}

/**
 * A game icon of the world (issue 870): the structure categories, in `GameIcon`'s relief and box. Their shapes are a file of their
 * own, so the home's first load, which shows none of them, does not carry them.
 */
export function WorldIcon({ name, ...frame }: WorldIconProps) {
  const shape = WORLD_ICON_SHAPES[name];
  return <Relief name={name} width={shape.width} parts={reliefParts(shape, LOOKS[name])} {...frame} />;
}
