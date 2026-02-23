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

type TxResult = { transactionHash: string };

function getContractNamespace(mode: ModeType): string {
  switch (mode) {
    case ModeType.Daily: return "Daily";
    case ModeType.Weekly: return "Weekly";
    case ModeType.Tutorial: return "Tutorial";
    default: return "Daily";
  }
}

export function createSystems(_config: DojoConfig) {
  return {
    async createPlayer(params: CreatePlayerParams): Promise<TxResult> {
      // Account.create(name, master)
      // Placeholder: actual implementation calls the Account contract
      console.log("createPlayer", params.name);
      return { transactionHash: "0x0" };
    },

    async createGame(params: GameParams): Promise<TxResult> {
      const ns = getContractNamespace(params.mode);
      console.log(`${ns}.spawn()`, params.account.address);
      return { transactionHash: "0x0" };
    },

    async build(params: BuildParams): Promise<TxResult> {
      const ns = getContractNamespace(params.mode);
      console.log(`${ns}.build()`, {
        gameId: params.gameId,
        orientation: params.orientation,
        x: params.x,
        y: params.y,
        role: params.role,
        spot: params.spot,
      });
      return { transactionHash: "0x0" };
    },

    async discard(params: DiscardParams): Promise<TxResult> {
      const ns = getContractNamespace(params.mode);
      console.log(`${ns}.discard()`, params.gameId);
      return { transactionHash: "0x0" };
    },

    async surrender(params: SurrenderParams): Promise<TxResult> {
      const ns = getContractNamespace(params.mode);
      console.log(`${ns}.surrender()`, params.gameId);
      return { transactionHash: "0x0" };
    },

    async claim(params: ClaimParams): Promise<TxResult> {
      const ns = getContractNamespace(params.mode);
      console.log(`${ns}.claim()`, params.tournamentId, params.rank);
      return { transactionHash: "0x0" };
    },

    async sponsor(params: SponsorParams): Promise<TxResult> {
      console.log("Daily.sponsor()", params.amount.toString());
      return { transactionHash: "0x0" };
    },
  };
}
