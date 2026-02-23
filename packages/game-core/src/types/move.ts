// Source: contracts/src/types/move.cairo

import { OrientationType } from "./orientation";
import { Direction } from "./direction";
import { Spot } from "./spot";

export class Move {
  direction: Direction;
  spot: Spot;

  constructor(direction: Direction, spot: Spot) {
    this.direction = direction;
    this.spot = spot;
  }

  public rotate(orientation: OrientationType): Move {
    const direction = this.direction.rotate(orientation);
    const spot = this.spot.rotate(orientation);
    return new Move(direction, spot);
  }

  public antirotate(orientation: OrientationType): Move {
    const direction = this.direction.antirotate(orientation);
    const spot = this.spot.antirotate(orientation);
    return new Move(direction, spot);
  }
}
