import { Account } from "starknet";

export interface Signer {
  account: Account;
}

export interface InitializeHost extends Signer {
  world: string;
}

export interface CreateGame extends Signer {}

export interface Claim extends Signer {
  tournament_id: number;
  rank: number;
}

export interface Sponsor extends Signer {
  amount: string;
}

export interface InitializeManage extends Signer {
  world: string;
}

export interface CreatePlayer extends Signer {
  name: string;
  master: string;
}

export interface InitializePlay extends Signer {
  world: string;
}

export interface Discard extends Signer {
  game_id: number;
}

export interface Surrender extends Signer {
  game_id: number;
}

export interface Build extends Signer {
  game_id: number;
  tile_id: number;
  orientation: number;
  x: number;
  y: number;
  role: number;
  spot: number;
}
