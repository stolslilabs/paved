import { Account } from "starknet";

export interface Signer {
  account: Account;
}

export interface CreateGame extends Signer {
  name: string;
  duration: number;
  mode: number;
}

export interface RenameGame extends Signer {
  game_id: number;
  name: string;
}

export interface UpdateGame extends Signer {
  account: Account;
  game_id: number;
  duration: number;
}

export interface JoinGame extends Signer {
  game_id: number;
}

export interface ReadyGame extends Signer {
  game_id: number;
  status: number;
}

export interface TransferGame extends Signer {
  game_id: number;
  player_id: string;
}

export interface LeaveGame extends Signer {
  game_id: number;
}

export interface KickGame extends Signer {
  game_id: number;
  player_id: string;
}

export interface DeleteGame extends Signer {
  game_id: number;
}

export interface StartGame extends Signer {
  game_id: number;
}

export interface CreatePlayer extends Signer {
  name: string;
  order: number;
  master: string;
}

export interface RenamePlayer extends Signer {
  name: string;
}

export interface ReorderPlayer extends Signer {
  order: number;
}

export interface Buy extends Signer {
  amount: number;
}

export interface Claim extends Signer {
  game_id: number;
}

export interface Draw extends Signer {
  game_id: number;
}

export interface Discard extends Signer {
  game_id: number;
}

export interface Build extends Signer {
  game_id: number;
  orientation: number;
  x: number;
  y: number;
  role: number;
  spot: number;
}
