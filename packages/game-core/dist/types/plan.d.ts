import { Category } from "./category";
import { SpotType } from "./spot";
import { Move } from "./move";
import { AreaType } from "./area";
export declare enum PlanType {
    None = "None",
    CCCCCCCCC = "CCCCCCCCC",
    CCCCCFFFC = "CCCCCFFFC",
    CCCCCFRFC = "CCCCCFRFC",
    CFFFCFFFC = "CFFFCFFFC",
    FFCFFFCFF = "FFCFFFCFF",
    FFCFFFFFC = "FFCFFFFFC",
    FFFFCCCFF = "FFFFCCCFF",
    FFFFFFCFF = "FFFFFFCFF",
    RFFFRFCFR = "RFFFRFCFR",
    RFFFRFFFR = "RFFFRFFFR",
    RFRFCCCFR = "RFRFCCCFR",
    RFRFFFCFR = "RFRFFFCFR",
    RFRFFFFFR = "RFRFFFFFR",
    RFRFRFCFF = "RFRFRFCFF",
    SFRFRFCFR = "SFRFRFCFR",
    SFRFRFFFR = "SFRFRFFFR",
    SFRFRFRFR = "SFRFRFRFR",
    WFFFFFFFF = "WFFFFFFFF",
    WFFFFFFFR = "WFFFFFFFR"
}
export declare class Plan {
    value: PlanType;
    constructor(value: PlanType);
    into(): number;
    static from(index: number): Plan;
    unpack(): Array<Category>;
    starts(): Array<SpotType>;
    wonder(): SpotType;
    moves(from: SpotType): Array<Move>;
    area(from: SpotType): AreaType;
    adjacentRoads(from: SpotType): Array<SpotType>;
    adjacentCities(from: SpotType): Array<SpotType>;
}
//# sourceMappingURL=plan.d.ts.map