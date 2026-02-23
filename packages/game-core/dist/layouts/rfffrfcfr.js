// Source: https://github.com/stolslilabs/paved/blob/main/contracts/src/layouts/rfffrfcfr.cairo
import { AreaType } from "../types/area";
import { Move } from "../types/move";
import { Direction, DirectionType } from "../types/direction";
import { Spot, SpotType } from "../types/spot";
export class Configuration {
    static starts() {
        return [
            SpotType.Center,
            SpotType.North,
            SpotType.SouthEast,
            SpotType.South,
        ];
    }
    static moves(from) {
        switch (from) {
            case SpotType.Center:
            case SpotType.East:
            case SpotType.West:
                return [
                    new Move(new Direction(DirectionType.East), new Spot(SpotType.West)),
                    new Move(new Direction(DirectionType.West), new Spot(SpotType.East)),
                ];
            case SpotType.North:
            case SpotType.NorthWest:
            case SpotType.NorthEast:
                return [
                    new Move(new Direction(DirectionType.North), new Spot(SpotType.South)),
                    new Move(new Direction(DirectionType.East), new Spot(SpotType.NorthWest)),
                    new Move(new Direction(DirectionType.West), new Spot(SpotType.NorthEast)),
                ];
            case SpotType.SouthEast:
            case SpotType.SouthWest:
                return [
                    new Move(new Direction(DirectionType.East), new Spot(SpotType.SouthWest)),
                    new Move(new Direction(DirectionType.West), new Spot(SpotType.SouthEast)),
                ];
            case SpotType.South:
                return [
                    new Move(new Direction(DirectionType.South), new Spot(SpotType.North)),
                ];
            default:
                return [];
        }
    }
    static area(from) {
        switch (from) {
            case SpotType.Center:
            case SpotType.East:
            case SpotType.West:
                return AreaType.A;
            case SpotType.North:
            case SpotType.NorthWest:
            case SpotType.NorthEast:
                return AreaType.B;
            case SpotType.SouthEast:
            case SpotType.SouthWest:
                return AreaType.C;
            case SpotType.South:
                return AreaType.D;
            default:
                return AreaType.None;
        }
    }
    static adjacentRoads(from) {
        switch (from) {
            case SpotType.North:
            case SpotType.NorthWest:
            case SpotType.NorthEast:
            case SpotType.SouthEast:
            case SpotType.SouthWest:
                return [SpotType.Center];
            default:
                return [];
        }
    }
    static adjacentCities(from) {
        switch (from) {
            case SpotType.SouthEast:
            case SpotType.SouthWest:
                return [SpotType.South];
            default:
                return [];
        }
    }
}
//# sourceMappingURL=rfffrfcfr.js.map