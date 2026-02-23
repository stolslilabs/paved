import { OrientationType } from "./orientation";
import { Direction } from "./direction";
import { Spot } from "./spot";
export declare class Move {
    direction: Direction;
    spot: Spot;
    constructor(direction: Direction, spot: Spot);
    rotate(orientation: OrientationType): Move;
    antirotate(orientation: OrientationType): Move;
}
//# sourceMappingURL=move.d.ts.map