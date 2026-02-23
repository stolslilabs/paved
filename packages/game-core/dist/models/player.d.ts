export interface PlayerData {
    id: number | bigint | string;
    name: number | bigint | string;
    score: number;
    paved: number;
    master: number | bigint | string;
}
export declare class Player {
    id: string;
    name: string;
    score: number;
    paved: number;
    master: string;
    constructor(player: PlayerData);
    getShortName(): string;
}
//# sourceMappingURL=player.d.ts.map