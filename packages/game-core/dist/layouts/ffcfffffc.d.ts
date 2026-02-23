import { AreaType } from "../types/area";
import { Move } from "../types/move";
import { SpotType } from "../types/spot";
export declare class Configuration {
    static starts(): Array<SpotType>;
    static moves(from: SpotType): Array<Move>;
    static area(from: SpotType): AreaType;
    static adjacentRoads(_from: SpotType): Array<SpotType>;
    static adjacentCities(from: SpotType): Array<SpotType>;
}
//# sourceMappingURL=ffcfffffc.d.ts.map