import { Direction, DirectionType } from "../types/direction";
import { Layout } from "../types/layout";
import { Spot, SpotType } from "../types/spot";
import { Plan } from "../types/plan";
import { Orientation } from "../types/orientation";
import { Area } from "../types/area";
export class Tile {
    gameId;
    id;
    playerId;
    plan;
    orientation;
    x;
    y;
    occupiedSpot;
    constructor(tile) {
        this.gameId = tile.game_id;
        this.id = tile.id;
        this.playerId = BigInt(tile.player_id).toString(16);
        this.plan = Plan.from(tile.plan);
        this.orientation = Orientation.from(tile.orientation);
        this.x = tile.x;
        this.y = tile.y;
        this.occupiedSpot = Spot.from(tile.occupied_spot);
    }
    getKey(area) {
        return (area.into() + this.id * 2 ** 8).toString();
    }
    referenceDirection(reference) {
        if (this.x === reference.x) {
            if (this.y + 1 === reference.y) {
                return new Direction(DirectionType.North);
            }
            else if (this.y === reference.y + 1) {
                return new Direction(DirectionType.South);
            }
            else {
                return new Direction(DirectionType.None);
            }
        }
        else if (this.y === reference.y) {
            if (this.x + 1 === reference.x) {
                return new Direction(DirectionType.East);
            }
            else if (this.x === reference.x + 1) {
                return new Direction(DirectionType.West);
            }
            else {
                return new Direction(DirectionType.None);
            }
        }
        else {
            return new Direction(DirectionType.None);
        }
    }
    getLayout() {
        return Layout.from(this.plan, this.orientation.value);
    }
    areConnected(from, to) {
        const noFrom = from.antirotate(this.orientation.value);
        const noTo = to.antirotate(this.orientation.value);
        return this.plan.area(noFrom.value) === this.plan.area(noTo.value);
    }
    isEmpty() {
        return this.occupiedSpot.value === SpotType.None;
    }
    canPlace(neighbors) {
        if (neighbors.length === 0)
            return false;
        if (neighbors.length >= 4)
            return false;
        const layout = this.getLayout();
        for (const neighbor of neighbors) {
            const direction = this.referenceDirection(neighbor);
            if (layout.isCompatible(neighbor.getLayout(), direction)) {
                return false;
            }
        }
        return true;
    }
    northOrientedStarts() {
        return this.plan.starts();
    }
    northOrientedWonder() {
        return this.plan.wonder();
    }
    northOrientedMoves(at) {
        let spot = at.antirotate(this.orientation.value);
        return this.plan.moves(spot.value);
    }
    area(at) {
        let spot = at.antirotate(this.orientation.value);
        return new Area(this.plan.area(spot.value));
    }
    northOrientedAdjacentRoads(at) {
        let spot = at.antirotate(this.orientation.value);
        return this.plan.adjacentRoads(spot.value);
    }
    northOrientedAdjacentCities(at) {
        let spot = at.antirotate(this.orientation.value);
        return this.plan.adjacentCities(spot.value);
    }
    proxyCoordinates(direction) {
        switch (direction.value) {
            case DirectionType.None:
                return [this.x, this.y];
            case DirectionType.NorthWest:
                return [this.x - 1, this.y + 1];
            case DirectionType.North:
                return [this.x, this.y + 1];
            case DirectionType.NorthEast:
                return [this.x + 1, this.y + 1];
            case DirectionType.East:
                return [this.x + 1, this.y];
            case DirectionType.SouthEast:
                return [this.x + 1, this.y - 1];
            case DirectionType.South:
                return [this.x, this.y - 1];
            case DirectionType.SouthWest:
                return [this.x - 1, this.y - 1];
            case DirectionType.West:
                return [this.x - 1, this.y];
        }
    }
}
//# sourceMappingURL=tile.js.map