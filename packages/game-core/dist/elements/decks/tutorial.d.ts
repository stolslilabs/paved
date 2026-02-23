import { PlanType } from "../../types/plan";
import { RoleType } from "../../types/role";
import { SpotType } from "../../types/spot";
import { OrientationType } from "../../types/orientation";
export declare class Tutorial {
    static total_count(): number;
    static count(): number;
    static plan(index: number): PlanType;
    static parameters(index: number): {
        orientation: OrientationType;
        x: number;
        y: number;
        role: RoleType;
        spot: SpotType;
    };
}
//# sourceMappingURL=tutorial.d.ts.map