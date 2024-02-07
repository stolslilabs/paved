// Assets

import zero from "/assets/tiles/00.png";
import ccccccccc from "/assets/tiles/ccccccccc.png";
import cccccfffc from "/assets/tiles/cccccfffc.png";
import cccccfrfc from "/assets/tiles/cccccfrfc.png";
import cfffcfffc from "/assets/tiles/cfffcfffc.png";
import cfffcfrfc from "/assets/tiles/cfffcfrfc.png";
import ffcfffcfc from "/assets/tiles/ffcfffcfc.png";
import ffcfffcff from "/assets/tiles/ffcfffcff.png";
import ffcfffffc from "/assets/tiles/ffcfffffc.png";
import ffffcccff from "/assets/tiles/ffffcccff.png";
import ffffffcff from "/assets/tiles/ffffffcff.png";
import rfffrfcfr from "/assets/tiles/rfffrfcfr.png";
import rfffrfffr from "/assets/tiles/rfffrfffr.png";
import rfrfcccfr from "/assets/tiles/rfrfcccfr.png";
import rfrfffcff from "/assets/tiles/rfrfffcff.png";
import rfrfffcfr from "/assets/tiles/rfrfffcfr.png";
import rfrfffffr from "/assets/tiles/rfrfffffr.png";
import rfrfrfcff from "/assets/tiles/rfrfrfcff.png";
import sfffffffr from "/assets/tiles/sfffffffr.png";
import sfrfrfcfr from "/assets/tiles/sfrfrfcfr.png";
import sfrfrfffr from "/assets/tiles/sfrfrfffr.png";
import sfrfrfrfr from "/assets/tiles/sfrfrfrfr.png";
import wcccccccc from "/assets/tiles/wcccccccc.png";
import wffffffff from "/assets/tiles/wffffffff.png";
import wfffffffr from "/assets/tiles/wfffffffr.png";

import lord from "/assets/characters/lord.png";
import lady from "/assets/characters/lady.png";
import adventurer from "/assets/characters/adventurer.png";
import paladin from "/assets/characters/paladin.png";
import pilgrim from "/assets/characters/pilgrim.png";
import woodsman from "/assets/characters/woodsman.png";
import herdsman from "/assets/characters/herdsman.png";

export const CHARACTER_COUNT = 7;
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
      return cfffcfrfc;
    case 6:
      return ffcfffcfc;
    case 7:
      return ffcfffcff;
    case 8:
      return ffcfffffc;
    case 9:
      return ffffcccff;
    case 10:
      return ffffffcff;
    case 11:
      return rfffrfcfr;
    case 12:
      return rfffrfffr;
    case 13:
      return rfrfcccfr;
    case 14:
      return rfrfffcff;
    case 15:
      return rfrfffcfr;
    case 16:
      return rfrfffffr;
    case 17:
      return rfrfrfcff;
    case 18:
      return sfffffffr;
    case 19:
      return sfrfrfcfr;
    case 20:
      return sfrfrfffr;
    case 21:
      return sfrfrfrfr;
    case 22:
      return wcccccccc;
    case 23:
      return wffffffff;
    case 24:
      return wfffffffr;
    default:
      return zero;
  }
};

export const getCharacterImage = (index: number) => {
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
    case 6:
      return woodsman;
    case 7:
      return herdsman;
    default:
      return zero;
  }
};

export const getOrder = (order: number) => {
  switch (order) {
    case 1:
      return "ANGER";
    case 2:
      return "TITANS";
    case 3:
      return "VITRIOL";
    case 4:
      return "BRILLIANCE";
    case 5:
      return "DETECTION";
    case 6:
      return "ENLIGHTENMENT";
    case 7:
      return "FURY";
    case 8:
      return "GIANTS";
    case 9:
      return "PERFECTION";
    case 10:
      return "RAGE";
    case 11:
      return "REFLECTION";
    case 12:
      return "SKILL";
    case 13:
      return "FOX";
    case 14:
      return "TWINS";
    default:
      return "NONE";
  }
};

export const getOrderFromName = (order: string) => {
  switch (order) {
    case "ANGER":
      return 1;
    case "TITANS":
      return 2;
    case "VITRIOL":
      return 3;
    case "BRILLIANCE":
      return 4;
    case "DETECTION":
      return 5;
    case "ENLIGHTENMENT":
      return 6;
    case "FURY":
      return 7;
    case "GIANTS":
      return 8;
    case "PERFECTION":
      return 9;
    case "RAGE":
      return 10;
    case "REFLECTION":
      return 11;
    case "SKILL":
      return 12;
    case "FOX":
      return 13;
    case "TWINS":
      return 14;
    default:
      return 0;
  }
};

export const getOrders = () => {
  return Array.from({ length: ORDER_COUNT }, (_, index) => getOrder(index + 1));
};

export const getLightOrders = () => {
  return [
    "BRILLIANCE",
    "ENLIGHTENMENT",
    "GIANTS",
    "PERFECTION",
    "REFLECTION",
    "SKILL",
    "TWINS",
  ];
};

export const getDarkOrders = () => {
  return ["ANGER", "TITANS", "VITRIOL", "RAGE", "FOX", "DETECTION", "FURY"];
};

export const getAlliance = (order: number) => {
  switch (order) {
    case 1:
      return "DARKNESS";
    case 2:
      return "DARKNESS";
    case 3:
      return "DARKNESS";
    case 4:
      return "LIGHT";
    case 5:
      return "DARKNESS";
    case 6:
      return "LIGHT";
    case 7:
      return "DARKNESS";
    case 8:
      return "LIGHT";
    case 9:
      return "LIGHT";
    case 10:
      return "DARKNESS";
    case 11:
      return "LIGHT";
    case 12:
      return "LIGHT";
    case 13:
      return "DARKNESS";
    case 14:
      return "LIGHT";
    default:
      return 0;
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

export const getColorFromAddress = (str: string) => {
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

export const other_offset = Math.floor(30 / 2);
