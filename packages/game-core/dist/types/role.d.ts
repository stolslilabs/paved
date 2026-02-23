import { CategoryType } from "./category";
export declare enum RoleType {
    None = "None",
    Lord = "Lord",
    Lady = "Lady",
    Adventurer = "Adventurer",
    Paladin = "Paladin",
    Pilgrim = "Pilgrim",
    Woodsman = "Woodsman",
    Herdsman = "Herdsman"
}
export declare class Role {
    value: RoleType;
    constructor(role: RoleType);
    into(): number;
    static from(index: number): Role;
    weight(category: CategoryType): number;
    power(category: CategoryType): number;
    isAllowed(category: CategoryType): boolean;
}
export declare class AssertImpl {
    constructor();
    static assertIsAllowed(role: Role, category: CategoryType): void;
}
//# sourceMappingURL=role.d.ts.map