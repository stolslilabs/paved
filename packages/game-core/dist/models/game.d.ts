import { Mode } from "../types/mode";
import { Plan } from "../types/plan";
export interface GameData {
    id: number;
    over: boolean;
    built: number;
    discarded: number;
    tiles: number | bigint | string;
    tile_count: number;
    start_time: number;
    end_time: number;
    score: number;
    seed: number | bigint | string;
    mode: number;
    tournament_id: number | bigint | string;
}
export declare class Game {
    id: number;
    over: boolean;
    built: number;
    discarded: number;
    tiles: bigint;
    tile_count: number;
    start_time: Date;
    end_time: Date;
    score: number;
    seed: string;
    mode: Mode;
    tournament_id: bigint;
    constructor(game: GameData);
    isOver(): boolean;
    tilesLeft(): number;
    getPlans(): {
        plan: Plan;
        count: number;
    }[];
}
//# sourceMappingURL=game.d.ts.map