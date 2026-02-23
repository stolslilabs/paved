// Source: https://github.com/stolslilabs/paved/blob/main/contracts/src/layouts/ffffffcff.cairo
import { AreaType } from "../types/area";
import { Move } from "../types/move";
import { Direction, DirectionType } from "../types/direction";
import { Spot, SpotType } from "../types/spot";
export class Configuration {
    static starts() {
        return [SpotType.Center, SpotType.South];
    }
    static moves(from) {
        switch (from) {
            case SpotType.Center:
            case SpotType.NorthWest:
            case SpotType.North:
            case SpotType.NorthEast:
            case SpotType.East:
            case SpotType.SouthEast:
            case SpotType.SouthWest:
            case SpotType.West:
                return [
                    new Move(new Direction(DirectionType.North), new Spot(SpotType.South)),
                    new Move(new Direction(DirectionType.East), new Spot(SpotType.West)),
                    new Move(new Direction(DirectionType.West), new Spot(SpotType.East)),
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
            case SpotType.NorthWest:
            case SpotType.North:
            case SpotType.NorthEast:
            case SpotType.East:
            case SpotType.SouthEast:
            case SpotType.SouthWest:
            case SpotType.West:
                return AreaType.A;
            case SpotType.South:
                return AreaType.B;
            default:
                return AreaType.None;
        }
    }
    static adjacentRoads(from) {
        return [];
    }
    static adjacentCities(from) {
        switch (from) {
            case SpotType.Center:
            case SpotType.NorthWest:
            case SpotType.North:
            case SpotType.NorthEast:
            case SpotType.East:
            case SpotType.SouthEast:
            case SpotType.SouthWest:
            case SpotType.West:
                return [SpotType.South];
            default:
                return [];
        }
    }
}
//# sourceMappingURL=ffffffcff.js.map