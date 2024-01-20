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

export const getOrder = (builder: any) => {
  switch (builder?.order) {
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
}

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
}

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
      return "Algrim";
    case 5:
      return "Woodsman";
    default:
      return "None";
  }
}

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
    default:
      return 0;
  }
}

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
    default:
      return -1;
  }
}
