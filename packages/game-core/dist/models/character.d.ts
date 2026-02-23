export interface CharacterData {
    game_id: number;
    player_id: number | bigint | string;
    index: number;
    tile_id: number;
    spot: number;
    weight: number;
    power: number;
}
export declare class Character {
    game_id: number;
    player_id: string;
    index: number;
    tile_id: number;
    spot: number;
    weight: number;
    power: number;
    constructor(data: CharacterData);
}
//# sourceMappingURL=character.d.ts.map