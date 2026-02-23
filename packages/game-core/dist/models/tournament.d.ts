import { Mode } from "../types/mode";
export interface TournamentData {
    id: number;
    prize: number | bigint | string;
    top1_player_id: number | bigint | string;
    top2_player_id: number | bigint | string;
    top3_player_id: number | bigint | string;
    top1_score: number;
    top2_score: number;
    top3_score: number;
    top1_claimed: boolean;
    top2_claimed: boolean;
    top3_claimed: boolean;
}
export declare class Tournament {
    id: number;
    prize: string;
    top1_player_id: string;
    top2_player_id: string;
    top3_player_id: string;
    top1_score: number;
    top2_score: number;
    top3_score: number;
    top1_claimed: boolean;
    top2_claimed: boolean;
    top3_claimed: boolean;
    constructor(tournament: TournamentData);
    static computeId(duration: number): number;
    reward(rank: number): number;
    isClaimed(rank: number): boolean;
    isOver(mode: Mode): boolean;
    isCurrent(mode: Mode): boolean;
    isClaimable(rank: number, mode: Mode): boolean;
}
//# sourceMappingURL=tournament.d.ts.map