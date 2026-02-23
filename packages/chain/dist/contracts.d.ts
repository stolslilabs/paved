import type { DojoConfig } from "./config";
import type { Account } from "starknet";
import { ModeType } from "@paved/game-core";
export interface BuildParams {
    account: Account;
    mode: ModeType;
    gameId: number;
    tileId: number;
    orientation: number;
    x: number;
    y: number;
    role: number;
    spot: number;
}
export interface GameParams {
    account: Account;
    mode: ModeType;
}
export interface ClaimParams {
    account: Account;
    mode: ModeType;
    tournamentId: number;
    rank: number;
}
export interface SponsorParams {
    account: Account;
    amount: bigint;
}
export interface DiscardParams {
    account: Account;
    mode: ModeType;
    gameId: number;
}
export interface SurrenderParams {
    account: Account;
    mode: ModeType;
    gameId: number;
}
export interface CreatePlayerParams {
    account: Account;
    name: string;
    master: string;
}
type TxResult = {
    transactionHash: string;
};
export declare function createSystems(_config: DojoConfig): {
    createPlayer(params: CreatePlayerParams): Promise<TxResult>;
    createGame(params: GameParams): Promise<TxResult>;
    build(params: BuildParams): Promise<TxResult>;
    discard(params: DiscardParams): Promise<TxResult>;
    surrender(params: SurrenderParams): Promise<TxResult>;
    claim(params: ClaimParams): Promise<TxResult>;
    sponsor(params: SponsorParams): Promise<TxResult>;
};
export {};
//# sourceMappingURL=contracts.d.ts.map