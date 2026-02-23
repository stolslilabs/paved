// Source: contracts/src/layouts/cccccfrfc.cairo
import { AreaType } from "../types/area";
import { Move } from "../types/move";
import { Direction, DirectionType } from "../types/direction";
import { Spot, SpotType } from "../types/spot";
export class Configuration {
    static starts() {
        return [
            SpotType.Center,
            SpotType.South,
            SpotType.SouthEast,
            SpotType.SouthWest,
        ];
    }
    static moves(from) {
        switch (from) {
            case SpotType.Center:
            case SpotType.NorthWest:
            case SpotType.North:
            case SpotType.NorthEast:
            case SpotType.East:
            case SpotType.West:
                return [
                    new Move(new Direction(DirectionType.North), new Spot(SpotType.South)),
                    new Move(new Direction(DirectionType.East), new Spot(SpotType.West)),
                    new Move(new Direction(DirectionType.West), new Spot(SpotType.East)),
                ];
            case SpotType.SouthEast:
                return [
                    new Move(new Direction(DirectionType.South), new Spot(SpotType.NorthEast)),
                ];
            case SpotType.South:
                return [
                    new Move(new Direction(DirectionType.South), new Spot(SpotType.North)),
                ];
            case SpotType.SouthWest:
                return [
                    new Move(new Direction(DirectionType.South), new Spot(SpotType.NorthWest)),
                ];
            default:
                return [];
        }
    }
    static area(from) {
        switch (from) {
            case SpotType.None:
                return AreaType.None;
            case SpotType.Center:
            case SpotType.NorthWest:
            case SpotType.North:
            case SpotType.NorthEast:
            case SpotType.East:
            case SpotType.West:
                return AreaType.A;
            case SpotType.SouthEast:
                return AreaType.B;
            case SpotType.South:
                return AreaType.C;
            case SpotType.SouthWest:
                return AreaType.D;
            default:
                return AreaType.None;
        }
    }
    static adjacentRoads(from) {
        switch (from) {
            case SpotType.SouthEast:
            case SpotType.SouthWest:
                return [SpotType.South];
            default:
                return [];
        }
    }
    static adjacentCities(from) {
        switch (from) {
            case SpotType.SouthEast:
            case SpotType.SouthWest:
                return [SpotType.Center];
            default:
                return [];
        }
    }
}
//# sourceMappingURL=cccccfrfc.js.map