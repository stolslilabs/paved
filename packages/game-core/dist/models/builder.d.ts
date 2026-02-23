export interface BuilderData {
    game_id: number;
    player_id: number | bigint | string;
    tile_id: number;
    characters: number;
}
export declare class Builder {
    game_id: number;
    player_id: string;
    tile_id: number;
    characters: number;
    constructor(builder: BuilderData);
}
//# sourceMappingURL=builder.d.ts.map