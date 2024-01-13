import { Account } from "starknet";

export interface SystemSigner {
    signer: Account;
}

export interface InitializeSystemProps extends SystemSigner {
    setGameId: (gameId: number) => void
}

export interface CreateSystemProps extends SystemSigner {
    game_id: number;
    name: string;
    order: number;
}

export interface BuySystemProps extends SystemSigner {
    game_id: number;
}

export interface DrawSystemProps extends SystemSigner {
    game_id: number;
}

export interface DiscardSystemProps extends SystemSigner {
    game_id: number;
}

export interface BuildSystemProps extends SystemSigner {
    game_id: number;
    tile_id: number;
    orientation: number;
    x: number;
    y: number;
    role?: number;
    spot?: number;
}