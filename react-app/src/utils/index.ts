// Assets

import zero from "/assets/tiles/00.png";
import one from "/assets/tiles/01.png";
import two from "/assets/tiles/02.png";
import three from "/assets/tiles/03.png";
import four from "/assets/tiles/04.png";
import five from "/assets/tiles/05.png";
import six from "/assets/tiles/06.png";
import seven from "/assets/tiles/07.png";
import eight from "/assets/tiles/08.png";
import nine from "/assets/tiles/09.png";
import ten from "/assets/tiles/10.png";
import eleven from "/assets/tiles/11.png";
import twelve from "/assets/tiles/12.png";
import thirteen from "/assets/tiles/13.png";
import fourteen from "/assets/tiles/14.png";
import fifteen from "/assets/tiles/15.png";
import sixteen from "/assets/tiles/16.png";
import seventeen from "/assets/tiles/17.png";
import eighteen from "/assets/tiles/18.png";
import nineteen from "/assets/tiles/19.png";
import twenty from "/assets/tiles/20.png";

export const getImage = (tile: any) => {
  switch (tile?.plan) {
    case 0:
      return zero;
    case 1:
      return one;
    case 2:
      return two;
    case 3:
      return three;
    case 4:
      return four;
    case 5:
      return five;
    case 6:
      return six;
    case 7:
      return seven;
    case 8:
      return eight;
    case 9:
      return nine;
    case 10:
      return ten;
    case 11:
      return eleven;
    case 12:
      return twelve;
    case 13:
      return thirteen;
    case 14:
      return fourteen;
    case 15:
      return fifteen;
    case 16:
      return sixteen;
    case 17:
      return seventeen;
    case 18:
      return eighteen;
    case 19:
      return nineteen;
    case 20:
      return twenty;
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
