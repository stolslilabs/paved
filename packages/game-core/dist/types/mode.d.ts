export declare enum ModeType {
    None = "none",
    Daily = "daily",
    Weekly = "weekly",
    Tutorial = "tutorial"
}
export declare class Mode {
    value: ModeType;
    constructor(mode: ModeType);
    into(): number;
    static from(index: number): Mode;
    duration(): number;
    offset(): number;
    price(): bigint;
    count(): number;
}
//# sourceMappingURL=mode.d.ts.map