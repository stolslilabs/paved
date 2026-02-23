import { PlanType } from "../../types/plan";
import { RoleType } from "../../types/role";
import { SpotType } from "../../types/spot";
import { OrientationType } from "../../types/orientation";
export class Tutorial {
    static total_count() {
        return 9;
    }
    static count() {
        return 9;
    }
    static plan(index) {
        const id = index % Tutorial.total_count();
        switch (id) {
            case 0:
                return PlanType.RFFFRFCFR;
            case 1:
                return PlanType.SFRFRFCFR;
            case 2:
                return PlanType.CFFFCFFFC;
            case 3:
                return PlanType.FFCFFFFFC;
            case 4:
                return PlanType.WFFFFFFFR;
            case 5:
                return PlanType.RFRFFFCFR;
            case 6:
                return PlanType.RFRFFFFFR;
            case 7:
                return PlanType.RFFFRFFFR;
            case 8:
                return PlanType.SFRFRFFFR;
            default:
                return PlanType.None;
        }
    }
    static parameters(index) {
        switch (index) {
            case 1:
                return {
                    orientation: OrientationType.North,
                    x: -1,
                    y: 0,
                    role: RoleType.Adventurer,
                    spot: SpotType.East,
                };
            case 2:
                return {
                    orientation: OrientationType.East,
                    x: -1,
                    y: -1,
                    role: RoleType.Paladin,
                    spot: SpotType.Center,
                };
            case 3:
                return {
                    orientation: OrientationType.East,
                    x: -1,
                    y: -2,
                    role: RoleType.None,
                    spot: SpotType.None,
                };
            case 4:
                return {
                    orientation: OrientationType.West,
                    x: 0,
                    y: -1,
                    role: RoleType.Pilgrim,
                    spot: SpotType.Center,
                };
            case 5:
                return {
                    orientation: OrientationType.East,
                    x: 0,
                    y: -2,
                    role: RoleType.Paladin,
                    spot: SpotType.West,
                };
            case 6:
                return {
                    orientation: OrientationType.North,
                    x: 1,
                    y: -2,
                    role: RoleType.Lady,
                    spot: SpotType.Center,
                };
            case 7:
                return {
                    orientation: OrientationType.East,
                    x: 1,
                    y: -1,
                    role: RoleType.None,
                    spot: SpotType.None,
                };
            case 8:
                return {
                    orientation: OrientationType.West,
                    x: 1,
                    y: 0,
                    role: RoleType.None,
                    spot: SpotType.None,
                };
            default:
                return {
                    orientation: OrientationType.None,
                    x: 0,
                    y: 0,
                    role: RoleType.None,
                    spot: SpotType.None,
                };
        }
    }
}
//# sourceMappingURL=tutorial.js.map