import type { Account } from "starknet";
import { DojoProvider } from "@dojoengine/core";
import { ModeType } from "@paved/game-core";
import { CairoCustomEnum } from "starknet";

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

type TxResult = { transaction_hash: string };

function getContractName(mode: ModeType): string {
  switch (mode) {
    case ModeType.Daily: return "Daily";
    case ModeType.Weekly: return "Weekly";
    case ModeType.Tutorial: return "Tutorial";
    default: return "Daily";
  }
}

function createOrientationEnum(value: number): CairoCustomEnum {
  const names = ["None", "North", "East", "South", "West"];
  const variants: Record<string, any> = {};
  for (const n of names) variants[n] = undefined;
  const name = names[value] || "None";
  variants[name] = "";
  return new CairoCustomEnum(variants);
}

function createRoleEnum(value: number): CairoCustomEnum {
  const names = ["None", "Lord", "Lady", "Adventurer", "Paladin", "Pilgrim"];
  const variants: Record<string, any> = {};
  for (const n of names) variants[n] = undefined;
  const name = names[value] || "None";
  variants[name] = "";
  return new CairoCustomEnum(variants);
}

function createSpotEnum(value: number): CairoCustomEnum {
  const names = [
    "None", "Center", "NorthWest", "North", "NorthEast",
    "East", "SouthEast", "South", "SouthWest", "West",
  ];
  const variants: Record<string, any> = {};
  for (const n of names) variants[n] = undefined;
  const name = names[value] || "None";
  variants[name] = "";
  return new CairoCustomEnum(variants);
}

/** Find a contract's address from the manifest by tag */
function getContractAddress(manifest: any, namespace: string, name: string): string | undefined {
  const tag = `${namespace}-${name}`;
  const contract = manifest?.contracts?.find((c: any) => c.tag === tag);
  return contract?.address;
}

export function createSystems(provider: DojoProvider, manifest?: any) {
  const execute = async (
    account: Account,
    contractName: string,
    entrypoint: string,
    calldata: any[],
  ): Promise<TxResult> => {
    return (await provider.execute(
      account as any,
      { contractName, entrypoint, calldata },
      "paved",
    )) as any as TxResult;
  };

  const executeMulti = async (
    account: Account,
    calls: Array<{ contractName: string; entrypoint: string; calldata: any[] }>,
  ): Promise<TxResult> => {
    return (await provider.execute(
      account as any,
      calls,
      "paved",
    )) as any as TxResult;
  };

  return {
    async createPlayer(params: CreatePlayerParams): Promise<TxResult> {
      // Multicall: mint token + create account
      return executeMulti(params.account, [
        { contractName: "Token", entrypoint: "mint", calldata: [] },
        { contractName: "Account", entrypoint: "create", calldata: [params.name, params.master] },
      ]);
    },

    async createGame(params: GameParams): Promise<TxResult> {
      const ns = getContractName(params.mode);
      const contractAddr = manifest ? getContractAddress(manifest, "paved", ns) : undefined;

      // Tutorial mode is free, no approve needed
      if (params.mode === ModeType.Tutorial || !contractAddr) {
        return execute(params.account, ns, "spawn", []);
      }

      // Multicall: Token.approve(contractAddr, 1e18) + spawn
      return executeMulti(params.account, [
        {
          contractName: "Token",
          entrypoint: "approve",
          calldata: [contractAddr, `0x${(1e18).toString(16)}`],
        },
        { contractName: ns, entrypoint: "spawn", calldata: [] },
      ]);
    },

    async build(params: BuildParams): Promise<TxResult> {
      const ns = getContractName(params.mode);
      if (ns === "Tutorial") {
        // Tutorial build only takes gameId
        return execute(params.account, ns, "build", [params.gameId]);
      }
      const orientation = createOrientationEnum(params.orientation);
      const role = createRoleEnum(params.role);
      const spot = createSpotEnum(params.spot);
      return execute(params.account, ns, "build", [
        params.gameId, orientation, params.x, params.y, role, spot,
      ]);
    },

    async discard(params: DiscardParams): Promise<TxResult> {
      const ns = getContractName(params.mode);
      return execute(params.account, ns, "discard", [params.gameId]);
    },

    async surrender(params: SurrenderParams): Promise<TxResult> {
      const ns = getContractName(params.mode);
      return execute(params.account, ns, "surrender", [params.gameId]);
    },

    async claim(params: ClaimParams): Promise<TxResult> {
      const ns = getContractName(params.mode);
      return execute(params.account, ns, "claim", [params.tournamentId, params.rank]);
    },

    async sponsor(params: SponsorParams): Promise<TxResult> {
      return execute(params.account, "Daily", "sponsor", [params.amount]);
    },
  };
}
