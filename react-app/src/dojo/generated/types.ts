import { Account } from "starknet";

export interface Signer {
  account: Account;
}

export interface CreateGame extends Signer {
  endtime: number;
  points_cap: number;
  tiles_cap: number;
}
