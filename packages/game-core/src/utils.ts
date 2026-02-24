export const CHARACTER_COUNT = 5;
export const ORDER_COUNT = 14;

export const getSpotFromIndex = (index: number): number => {
  switch (index) {
    case 0: return 2;  // NW
    case 1: return 9;  // W
    case 2: return 8;  // SW
    case 3: return 3;  // N
    case 4: return 1;  // C
    case 5: return 7;  // S
    case 6: return 4;  // NE
    case 7: return 5;  // E
    case 8: return 6;  // SE
    default: return 0;
  }
};

export const getIndexFromSpot = (spot: number): number => {
  switch (spot) {
    case 2: return 0;  // NW
    case 9: return 1;  // W
    case 8: return 2;  // SW
    case 3: return 3;  // N
    case 1: return 4;  // C
    case 7: return 5;  // S
    case 4: return 6;  // NE
    case 5: return 7;  // E
    case 6: return 8;  // SE
    default: return -1;
  }
};

export const getCharacters = (): string[] => {
  return Array.from({ length: CHARACTER_COUNT }, (_, index) => getRole(index));
};

export enum Characters {
  Lord,
  Lady,
  Adventurer,
  Paladin,
  Pilgrim,
  Woodsman,
  Herdsman,
}

export const getAvailableCharacters = (packed: number) => {
  const characters = getCharacters();
  let value = (packed >>= 1);
  return characters.map((character) => {
    const status = (value & 1) === 0;
    value >>= 1;
    return { character, status };
  });
};

export const getRole = (index: number): string => {
  switch (index) {
    case 0: return "Lord";
    case 1: return "Lady";
    case 2: return "Adventurer";
    case 3: return "Paladin";
    case 4: return "Pilgrim";
    case 5: return "Woodsman";
    case 6: return "Herdsman";
    default: return "";
  }
};

export const getBoost = (index: number): string => {
  switch (index) {
    case 2: return "R";
    case 3: return "C";
    case 4: return "W";
    case 5: return "F";
    case 6: return "F";
    default: return "";
  }
};

export const getRoleAllowedSpots = (index: number): string[] => {
  switch (index) {
    case 0: return ["C", "R", "W"];
    case 1: return ["C", "R", "W"];
    case 2: return ["R", "W"];
    case 3: return ["C", "W"];
    case 4: return ["C", "R", "W"];
    case 5: return ["R", "F"];
    case 6: return ["C", "F"];
    default: return [];
  }
};

export const getCharacterFromIndex = (index: number): number => {
  switch (index) {
    case 0: return 1;
    case 1: return 2;
    case 2: return 3;
    case 3: return 4;
    case 4: return 5;
    case 5: return 6;
    case 6: return 7;
    default: return 0;
  }
};

export const getIndexFromCharacter = (character: number): number => {
  switch (character) {
    case 1: return 0;
    case 2: return 1;
    case 3: return 2;
    case 4: return 3;
    case 5: return 4;
    case 6: return 5;
    case 7: return 6;
    default: return -1;
  }
};

export const getColorFromCharacter = (character: number): string => {
  switch (character) {
    case 1: return "blue";
    case 2: return "pink";
    case 3: return "grey";
    case 4: return "red";
    case 5: return "yellow";
    case 6: return "green";
    case 7: return "purple";
    default: return "black";
  }
};

export const getColor = (str: string): string => {
  let hash = 0;
  str.split("").forEach((char) => {
    hash = char.charCodeAt(0) + ((hash << 5) - hash);
  });
  let color = "#";
  for (let i = 0; i < 3; i++) {
    const value = (hash >> (i * 8)) & 0xff;
    color += value.toString(16).padStart(2, "0");
  }
  return color;
};

export const offset = 0x7fffffff;
export const other_offset = 0;

import { SpotType } from "./types/spot";
import { CategoryType } from "./types/category";
import { Layout } from "./types/layout";
import { Plan } from "./types/plan";
import { Orientation } from "./types/orientation";

const SPOT_OFFSETS: Record<SpotType, { dx: number; dz: number }> = {
  [SpotType.None]:      { dx: 0,      dz: 0 },
  [SpotType.Center]:    { dx: 0,      dz: 0 },
  [SpotType.NorthWest]: { dx: -1 / 3, dz: -1 / 3 },
  [SpotType.North]:     { dx: 0,      dz: -1 / 3 },
  [SpotType.NorthEast]: { dx: 1 / 3,  dz: -1 / 3 },
  [SpotType.East]:      { dx: 1 / 3,  dz: 0 },
  [SpotType.SouthEast]: { dx: 1 / 3,  dz: 1 / 3 },
  [SpotType.South]:     { dx: 0,      dz: 1 / 3 },
  [SpotType.SouthWest]: { dx: -1 / 3, dz: 1 / 3 },
  [SpotType.West]:      { dx: -1 / 3, dz: 0 },
};

export const getSpotOffset = (spotType: SpotType): { dx: number; dz: number } => {
  return SPOT_OFFSETS[spotType] ?? { dx: 0, dz: 0 };
};

export const categoryToChar = (category: CategoryType): string => {
  switch (category) {
    case CategoryType.City: return "C";
    case CategoryType.Road: return "R";
    case CategoryType.Forest: return "F";
    case CategoryType.Wonder: return "W";
    case CategoryType.Stop: return "S";
    case CategoryType.None: return "";
  }
};

const SPOT_TYPES_1_TO_9: SpotType[] = [
  SpotType.Center,    // 1
  SpotType.NorthWest, // 2
  SpotType.North,     // 3
  SpotType.NorthEast, // 4
  SpotType.East,      // 5
  SpotType.SouthEast, // 6
  SpotType.South,     // 7
  SpotType.SouthWest, // 8
  SpotType.West,      // 9
];

export const getValidSpotsForRole = (
  roleIndex: number,
  tilePlan: number,
  orientation: number,
): number[] => {
  const allowed = getRoleAllowedSpots(roleIndex);
  if (allowed.length === 0) return [];

  const plan = Plan.from(tilePlan);
  const layout = Layout.from(plan, Orientation.from(orientation).value);

  const valid: number[] = [];
  for (let i = 0; i < SPOT_TYPES_1_TO_9.length; i++) {
    const spotType = SPOT_TYPES_1_TO_9[i];
    const category = layout.getCategory(spotType);
    const ch = categoryToChar(category.value);
    if (allowed.includes(ch)) {
      valid.push(i + 1); // contract spot number (1-indexed)
    }
  }
  return valid;
};
