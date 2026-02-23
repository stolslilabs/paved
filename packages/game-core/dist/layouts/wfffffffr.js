// Source: https://github.com/stolslilabs/paved/blob/main/contracts/src/layouts/wfffffffr.cairo
import { AreaType } from "../types/area";
import { Move } from "../types/move";
import { Direction, DirectionType } from "../types/direction";
import { Spot, SpotType } from "../types/spot";
export class Configuration {
    static starts() {
        return [SpotType.Center, SpotType.North];
    }
    static moves(from) {
        switch (from) {
            case SpotType.Center:
                return [
                    new Move(new Direction(DirectionType.NorthWest), new Spot(SpotType.None)),
                    new Move(new Direction(DirectionType.North), new Spot(SpotType.None)),
                    new Move(new Direction(DirectionType.NorthEast), new Spot(SpotType.None)),
                    new Move(new Direction(DirectionType.East), new Spot(SpotType.None)),
                    new Move(new Direction(DirectionType.SouthEast), new Spot(SpotType.None)),
                    new Move(new Direction(DirectionType.South), new Spot(SpotType.None)),
                    new Move(new Direction(DirectionType.SouthWest), new Spot(SpotType.None)),
                    new Move(new Direction(DirectionType.West), new Spot(SpotType.None)),
                ];
            case SpotType.NorthWest:
            case SpotType.North:
            case SpotType.NorthEast:
            case SpotType.East:
            case SpotType.SouthEast:
            case SpotType.South:
            case SpotType.SouthWest:
                return [
                    new Move(new Direction(DirectionType.North), new Spot(SpotType.South)),
                    new Move(new Direction(DirectionType.East), new Spot(SpotType.West)),
                    new Move(new Direction(DirectionType.South), new Spot(SpotType.North)),
                    new Move(new Direction(DirectionType.West), new Spot(SpotType.NorthEast)),
                    new Move(new Direction(DirectionType.West), new Spot(SpotType.SouthEast)),
                ];
            case SpotType.West:
                return [
                    new Move(new Direction(DirectionType.West), new Spot(SpotType.East)),
                ];
            default:
                return [];
        }
    }
    static area(from) {
        switch (from) {
            case SpotType.Center:
                return AreaType.A;
            case SpotType.NorthWest:
            case SpotType.North:
            case SpotType.NorthEast:
            case SpotType.East:
            case SpotType.SouthEast:
            case SpotType.South:
            case SpotType.SouthWest:
                return AreaType.B;
            case SpotType.West:
                return AreaType.C;
            default:
                return AreaType.None;
        }
    }
    static adjacentRoads(from) {
        switch (from) {
            case SpotType.NorthWest:
            case SpotType.North:
            case SpotType.NorthEast:
            case SpotType.East:
            case SpotType.SouthEast:
            case SpotType.South:
            case SpotType.SouthWest:
                return [SpotType.West];
            default:
                return [];
        }
    }
    static adjacentCities(_from) {
        return [];
    }
}
//# sourceMappingURL=wfffffffr.js.map