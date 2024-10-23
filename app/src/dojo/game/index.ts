// Assets

import zero from "/assets/tiles/00.png";
import ccccccccc from "/assets/tiles/ccccccccc.png";
import cccccfffc from "/assets/tiles/cccccfffc.png";
import cccccfrfc from "/assets/tiles/cccccfrfc.png";
import cfffcfffc from "/assets/tiles/cfffcfffc.png";

import ffcfffcff from "/assets/tiles/ffcfffcff.png";
import ffcfffffc from "/assets/tiles/ffcfffffc.png";
import ffffcccff from "/assets/tiles/ffffcccff.png";
import ffffffcff from "/assets/tiles/ffffffcff.png";

import rfffrfcfr from "/assets/tiles/rfffrfcfr.png";
import rfffrfffr from "/assets/tiles/rfffrfffr.png";
import rfrfcccfr from "/assets/tiles/rfrfcccfr.png";
import rfrfffcfr from "/assets/tiles/rfrfffcfr.png";
import rfrfffffr from "/assets/tiles/rfrfffffr.png";
import rfrfrfcff from "/assets/tiles/rfrfrfcff.png";

import sfrfrfcfr from "/assets/tiles/sfrfrfcfr.png";
import sfrfrfffr from "/assets/tiles/sfrfrfffr.png";
import sfrfrfrfr from "/assets/tiles/sfrfrfrfr.png";
import wffffffff from "/assets/tiles/wffffffff.png";
import wfffffffr from "/assets/tiles/wfffffffr.png";

import lord from "/assets/characters/lord.png";
import lady from "/assets/characters/lady.png";
import adventurer from "/assets/characters/adventurer.png";
import paladin from "/assets/characters/paladin.png";
import pilgrim from "/assets/characters/pilgrim.png";

export const CHARACTER_COUNT = 5;
export const ORDER_COUNT = 14;

export const getImage = (tile: any) => {
  switch (tile?.plan) {
    case 1:
      return ccccccccc;
    case 2:
      return cccccfffc;
    case 3:
      return cccccfrfc;
    case 4:
      return cfffcfffc;
    case 5:
      return ffcfffcff;
    case 6:
      return ffcfffffc;
    case 7:
      return ffffcccff;
    case 8:
      return ffffffcff;
    case 9:
      return rfffrfcfr;
    case 10:
      return rfffrfffr;
    case 11:
      return rfrfcccfr;
    case 12:
      return rfrfffcfr;
    case 13:
      return rfrfffffr;
    case 14:
      return rfrfrfcff;
    case 15:
      return sfrfrfcfr;
    case 16:
      return sfrfrfffr;
    case 17:
      return sfrfrfrfr;
    case 18:
      return wffffffff;
    case 19:
      return wfffffffr;
    default:
      return zero;
  }
};

export const getModelVariations = (tile: any): number => {
  switch (tile?.plan) {
    case 1:
      return 1;
    case 2:
      return 4;
    case 3:
      return 3;
    case 4:
      return 3;
    case 5:
      return 3;
    case 6:
      return 2;
    case 7:
      return 5;
    case 8:
      return 5;
    case 9:
      return 4;
    case 10:
      return 8;
    case 11:
      return 5;
    case 12:
      return 3;
    case 13:
      return 9;
    case 14:
      return 3;
    case 15:
      return 3;
    case 16:
      return 4;
    case 17:
      return 1;
    case 18:
      return 4;
    case 19:
      return 2;
    default:
      return 0;
  }
};

export const getCharacterImage = (index: number | undefined) => {
  switch (index) {
    case 1:
      return lord;
    case 2:
      return lady;
    case 3:
      return adventurer;
    case 4:
      return paladin;
    case 5:
      return pilgrim;
    default:
      return zero;
  }
};

export const getSpotFromIndex = (index: number) => {
  switch (index) {
    case 0: // NW
      return 2;
    case 1: // W
      return 9;
    case 2: // SW
      return 8;
    case 3: // N
      return 3;
    case 4: // C
      return 1;
    case 5: // S
      return 7;
    case 6: // NE
      return 4;
    case 7: // E
      return 5;
    case 8: // SE
      return 6;
    default:
      return 0;
  }
};

export const getIndexFromSpot = (spot: number) => {
  switch (spot) {
    case 2: // NW
      return 0;
    case 9: // W
      return 1;
    case 8: // SW
      return 2;
    case 3: // N
      return 3;
    case 1: // C
      return 4;
    case 7: // S
      return 5;
    case 4: // NE
      return 6;
    case 5: // E
      return 7;
    case 6: // SE
      return 8;
    default:
      return -1;
  }
};

export const getCharacters = () => {
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
  // Return Object of character and their corresponding status
  // status = true if character is 0 at index, false otherwise
  let value = (packed >>= 1); // Skip first bit
  return characters.map((character) => {
    const status = (value & 1) === 0;
    value >>= 1;
    return { character, status };
  });
};

export const getRole = (index: number) => {
  switch (index) {
    case 0:
      return "Lord";
    case 1:
      return "Lady";
    case 2:
      return "Adventurer";
    case 3:
      return "Paladin";
    case 4:
      return "Pilgrim";
    case 5:
      return "Woodsman";
    case 6:
      return "Herdsman";
    default:
      return "";
  }
};

export const getBoost = (index: number) => {
  switch (index) {
    case 2:
      return "R";
    case 3:
      return "C";
    case 4:
      return "W";
    case 5:
      return "F";
    case 6:
      return "F";
    default:
      return "";
  }
};

export const getRoleAllowedSpots = (index: number) => {
  switch (index) {
    case 0:
      return ["C", "R", "W"];
    case 1:
      return ["C", "R", "W"];
    case 2:
      return ["R", "W"];
    case 3:
      return ["C", "W"];
    case 4:
      return ["C", "R", "W"];
    case 5:
      return ["R", "F"];
    case 6:
      return ["C", "F"];
    default:
      return [];
  }
};

export const getCharacterFromIndex = (index: number) => {
  switch (index) {
    case 0:
      return 1;
    case 1:
      return 2;
    case 2:
      return 3;
    case 3:
      return 4;
    case 4:
      return 5;
    case 5:
      return 6;
    case 6:
      return 7;
    default:
      return 0;
  }
};

export const getIndexFromCharacter = (character: number) => {
  switch (character) {
    case 1:
      return 0;
    case 2:
      return 1;
    case 3:
      return 2;
    case 4:
      return 3;
    case 5:
      return 4;
    case 6:
      return 5;
    case 7:
      return 6;
    default:
      return -1;
  }
};

export const getColorFromCharacter = (character: number) => {
  switch (character) {
    case 1:
      return "blue";
    case 2:
      return "pink";
    case 3:
      return "grey";
    case 4:
      return "red";
    case 5:
      return "yellow";
    case 6:
      return "green";
    case 7:
      return "purple";
    default:
      return "black";
  }
};

export const getColor = (str: string) => {
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
