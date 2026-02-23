// Source: contracts/src/types/move.cairo
export class Move {
    direction;
    spot;
    constructor(direction, spot) {
        this.direction = direction;
        this.spot = spot;
    }
    rotate(orientation) {
        const direction = this.direction.rotate(orientation);
        const spot = this.spot.rotate(orientation);
        return new Move(direction, spot);
    }
    antirotate(orientation) {
        const direction = this.direction.antirotate(orientation);
        const spot = this.spot.antirotate(orientation);
        return new Move(direction, spot);
    }
}
//# sourceMappingURL=move.js.map