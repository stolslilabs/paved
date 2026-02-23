import type { Account } from "starknet";
import { ModeType } from "@paved/game-core";
import type { DojoConfig } from "../config";
export interface ActionState {
    loading: boolean;
    error: string | null;
}
export declare function useActions(config: DojoConfig, account: Account | null): {
    build: (params: {
        mode: ModeType;
        gameId: number;
        tileId: number;
        orientation: number;
        x: number;
        y: number;
        role: number;
        spot: number;
    }) => Promise<{
        transactionHash: string;
    } | null>;
    discard: (mode: ModeType, gameId: number) => Promise<{
        transactionHash: string;
    } | null>;
    surrender: (mode: ModeType, gameId: number) => Promise<{
        transactionHash: string;
    } | null>;
    spawn: (mode: ModeType) => Promise<{
        transactionHash: string;
    } | null>;
    claim: (mode: ModeType, tournamentId: number, rank: number) => Promise<{
        transactionHash: string;
    } | null>;
    loading: boolean;
    error: string | null;
};
//# sourceMappingURL=useActions.d.ts.map