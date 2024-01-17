// Assets

import zero from '/assets/tiles/00.png';
import one from '/assets/tiles/01.png';
import two from '/assets/tiles/02.png';
import three from '/assets/tiles/03.png';
import four from '/assets/tiles/04.png';
import five from '/assets/tiles/05.png';
import six from '/assets/tiles/06.png';
import seven from '/assets/tiles/07.png';
import eight from '/assets/tiles/08.png';
import nine from '/assets/tiles/09.png';
import ten from '/assets/tiles/10.png';
import eleven from '/assets/tiles/11.png';
import twelve from '/assets/tiles/12.png';
import thirteen from '/assets/tiles/13.png';
import fourteen from '/assets/tiles/14.png';
import fifteen from '/assets/tiles/15.png';
import sixteen from '/assets/tiles/16.png';
import seventeen from '/assets/tiles/17.png';
import eighteen from '/assets/tiles/18.png';
import nineteen from '/assets/tiles/19.png';
import twenty from '/assets/tiles/20.png';

export const getImage = (tile: any) => {
  switch (tile?.plan) {
    case 0: return zero;
    case 1: return one;
    case 2: return two;
    case 3: return three;
    case 4: return four;
    case 5: return five;
    case 6: return six;
    case 7: return seven;
    case 8: return eight;
    case 9: return nine;
    case 10: return ten;
    case 11: return eleven;
    case 12: return twelve;
    case 13: return thirteen;
    case 14: return fourteen;
    case 15: return fifteen;
    case 16: return sixteen;
    case 17: return seventeen;
    case 18: return eighteen;
    case 19: return nineteen;
    case 20: return twenty;
    default: return zero;
  }
};
