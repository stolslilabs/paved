import { Account } from "starknet";
import { Mode } from "../game/types/mode";

export interface Signer {
  account: Account;
}

export interface Initialize extends Signer {
  world: string;
}

export interface CreateGame extends Signer {
  mode?: Mode;
}

export interface Claim extends Signer {
  tournament_id: number;
  rank: number;
  mode?: Mode;
}

export interface Sponsor extends Signer {
  mode?: Mode;
  amount: string;
}

export interface CreatePlayer extends Signer {
  name: string;
  master: string;
}

export interface Discard extends Signer {
  game_id: number;
  mode?: Mode;
}

export interface Surrender extends Signer {
  game_id: number;
  mode?: Mode;
}

export interface Build extends Signer {
  game_id: number;
  tile_id: number;
  orientation: number;
  x: number;
  y: number;
  role: number;
  spot: number;
  mode?: Mode;
}
