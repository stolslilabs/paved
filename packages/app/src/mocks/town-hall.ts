import { TOWN_HALL_LEVELS, townHallPlayerLevel, townHallPrice, townHallSlots } from "@paved/game-core";
import type { TownHallLevel, TownHallSceneProps } from "../components/scenes/town-hall-scene";

type Data<P> = { [K in keyof P as K extends `on${string}` ? never : K]: P[K] };

/** The rule's levels (game-core's), as the route builds them. */
export const TOWN_HALL_LEVEL_ROWS: readonly TownHallLevel[] = Array.from({ length: TOWN_HALL_LEVELS }, (_, i) => ({
  level: i + 1,
  tiles: townHallSlots(i + 1) - 1,
  price: i === 0 ? 0 : townHallPrice(i),
  playerLevel: i === 0 ? 1 : townHallPlayerLevel(i),
}));

const base = { levels: TOWN_HALL_LEVEL_ROWS, hall: { level: 3, playerLevel: 7, cobbles: 420 } } satisfies Data<TownHallSceneProps>;

/** The Town Hall's page (`Scenes/TownHall`), one key per state. */
export const TOWN_HALL_PAGE = {
  /** Level 3, the upgrade to level 4 within reach. */
  ready: base,
  /** A new village: level 1, the first upgrade within reach. */
  first: { ...base, hall: { level: 1, playerLevel: 2, cobbles: 100 } },
  /** The player's level short of the next one's. */
  levelShort: { ...base, hall: { ...base.hall, playerLevel: 5 } },
  /** The Cobbles short of the price. */
  cobblesShort: { ...base, hall: { ...base.hall, cobbles: 120 } },
  /** The upgrade on its way. */
  upgrading: { ...base, busy: true },
  /** The upgrade refused. */
  refused: { ...base, refusal: "The price changed: check it and buy again." },
  /** The last level: nothing to upgrade. */
  last: { ...base, hall: { level: 10, playerLevel: 20, cobbles: 5 } },
  /** The village on its way. */
  loading: { levels: TOWN_HALL_LEVEL_ROWS, hall: null, status: { kind: "loading" } },
  /** The village's read failed. */
  failed: { levels: TOWN_HALL_LEVEL_ROWS, hall: null, status: { kind: "error", message: "The village could not be read." } },
  /** No Town Hall served on this network. */
  notServed: { levels: TOWN_HALL_LEVEL_ROWS, hall: null },
} satisfies Record<string, Data<TownHallSceneProps>>;
