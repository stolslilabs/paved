export declare enum CategoryType {
    None = "None",
    Forest = "Forest",
    Road = "Road",
    City = "City",
    Stop = "Stop",
    Wonder = "Wonder"
}
export declare class Category {
    value: CategoryType;
    constructor(category: CategoryType);
    into(): number;
    static from(index: number): Category;
    static fromChar(category: string): Category;
    basePoints(): number;
}
//# sourceMappingURL=category.d.ts.map