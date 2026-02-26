// Types
export { OrientationType, Orientation } from "./types/orientation";
export { AreaType, Area } from "./types/area";
export { DirectionType, Direction } from "./types/direction";
export { SpotType, Spot } from "./types/spot";
export { Move } from "./types/move";
export { CategoryType, Category } from "./types/category";
export { RoleType, Role } from "./types/role";
export { ModeType, Mode } from "./types/mode";
export type { FeltLike, GameConfigInput, GameCreateOptions } from "./types/game-config";
export { validateGameConfigInput } from "./types/game-config";
export { PlanType, Plan } from "./types/plan";
export { Layout } from "./types/layout";
export { TutorialStage, TUTORIAL_STAGES } from "./types/tutorial-stage";

// Models
export { Builder } from "./models/builder";
export type { BuilderData } from "./models/builder";
export { Character } from "./models/character";
export type { CharacterData } from "./models/character";
export { Game } from "./models/game";
export type { GameData } from "./models/game";
export { Player } from "./models/player";
export type { PlayerData } from "./models/player";
export { Tile } from "./models/tile";
export type { TileData } from "./models/tile";
export { Tournament } from "./models/tournament";
export type { TournamentData } from "./models/tournament";

// Layouts (re-export for direct access)
export { Configuration as CccccccccLayout } from "./layouts/ccccccccc";
export { Configuration as CccccfffcLayout } from "./layouts/cccccfffc";
export { Configuration as CccccfrfcLayout } from "./layouts/cccccfrfc";
export { Configuration as CfffcfffcLayout } from "./layouts/cfffcfffc";
export { Configuration as FfcfffcffLayout } from "./layouts/ffcfffcff";
export { Configuration as FfcfffffcLayout } from "./layouts/ffcfffffc";
export { Configuration as FfffcccffLayout } from "./layouts/ffffcccff";
export { Configuration as FfffffcffLayout } from "./layouts/ffffffcff";
export { Configuration as RfffrfcfrLayout } from "./layouts/rfffrfcfr";
export { Configuration as RfffrfffrLayout } from "./layouts/rfffrfffr";
export { Configuration as RfrfcccfrLayout } from "./layouts/rfrfcccfr";
export { Configuration as RfrfffcfrLayout } from "./layouts/rfrfffcfr";
export { Configuration as RfrfffffrLayout } from "./layouts/rfrfffffr";
export { Configuration as RfrfrfcffLayout } from "./layouts/rfrfrfcff";
export { Configuration as SfrfrfcfrLayout } from "./layouts/sfrfrfcfr";
export { Configuration as SfrfrfffrLayout } from "./layouts/sfrfrfffr";
export { Configuration as SfrfrfrfrLayout } from "./layouts/sfrfrfrfr";
export { Configuration as WffffffffLayout } from "./layouts/wffffffff";
export { Configuration as WfffffffrLayout } from "./layouts/wfffffffr";

// Decks
export { Base } from "./elements/decks/base";
export { Tutorial } from "./elements/decks/tutorial";

// Helpers
export { Conflict } from "./helpers/conflict";

// Game logic
export { Store } from "./store";
export type { Tiles } from "./store";

// Constants
export {
  ROAD_BASE_POINTS,
  FOREST_BASE_POINTS,
  CITY_BASE_POINTS,
  WONDER_BASE_POINTS,
  TOURNAMENT_ID_OFFSET,
  TOURNAMENT_DURATION,
} from "./constants";

// Utilities
export {
  CHARACTER_COUNT,
  ORDER_COUNT,
  Characters,
  getSpotFromIndex,
  getIndexFromSpot,
  getCharacters,
  getAvailableCharacters,
  getRole,
  getBoost,
  getRoleAllowedSpots,
  getCharacterFromIndex,
  getIndexFromCharacter,
  getColorFromCharacter,
  getColor,
  offset,
  other_offset,
  getSpotOffset,
  categoryToChar,
  getValidSpotsForRole,
} from "./utils";

// Asset key helpers
export {
  getPlanKey,
  getTilePath,
  getCharacterKey,
  getCharacterPath,
} from "./asset-keys";

// Economy helpers
export {
  FP_SCALE_DEFAULT,
  fpToMultiplier,
  computeAdjustedReward,
} from "./economy";
