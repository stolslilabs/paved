import { OrientationType } from "./orientation";
export declare enum AreaType {
    None = "None",
    A = "A",
    B = "B",
    C = "C",
    D = "D",
    E = "E",
    F = "F",
    G = "G",
    H = "H",
    I = "I"
}
export declare class Area {
    value: AreaType;
    constructor(area: AreaType);
    into(): number;
    static from(index: number): Area;
    rotate(orientation: OrientationType): Area;
    antirotate(orientation: OrientationType): Area;
}
//# sourceMappingURL=area.d.ts.map