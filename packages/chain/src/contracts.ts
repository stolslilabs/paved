import type { Account } from "starknet";
import { DojoProvider } from "@dojoengine/core";
import type { GameConfigInput } from "@paved/game-core";
import { CairoCustomEnum } from "starknet";

export type ModeTypeValue = "none" | "daily" | "weekly" | "tutorial";

export interface BuildParams {
  account: Account;
  mode: ModeTypeValue;
  gameId: number;
  tileId: number;
  orientation: number;
  x: number;
  y: number;
  role: number;
  spot: number;
}

export interface CreateGameParams {
  account: Account;
  mode?: ModeTypeValue;
  templateId?: number;
  configInput?: GameConfigInput;
}

export interface PreviewValidationParams {
  configInput: GameConfigInput;
}

export type GameParams = CreateGameParams;

export interface ClaimParams {
  account: Account;
  mode: ModeTypeValue;
  tournamentId: number;
  rank: number;
}

export interface SponsorParams {
  account: Account;
  amount: bigint;
}

export interface DiscardParams {
  account: Account;
  mode: ModeTypeValue;
  gameId: number;
}

export interface SurrenderParams {
  account: Account;
  mode: ModeTypeValue;
  gameId: number;
}

export interface CreatePlayerParams {
  account: Account;
  name: string;
  master: string;
}

export interface MintTokenParams {
  account: Account;
}

export interface PreviewEconomyMultiplierParams {
  time: number;
}

export interface EconomyPreviewResult {
  supply: string;
  target: string;
  multiplierFp: number;
}

type TxResult = { transaction_hash: string };

function toStringValue(value: any, fallback = "0"): string {
  if (value == null) return fallback;
  if (typeof value === "bigint") return value.toString();
  if (typeof value === "number") return String(value);
  if (typeof value === "string") return value;
  return fallback;
}

function readTupleValue(result: any, index: number, keys: string[]): any {
  if (Array.isArray(result)) return result[index];
  if (result && typeof result === "object") {
    for (const key of keys) {
      if (key in result) return (result as any)[key];
    }
  }
  return undefined;
}

function getContractName(mode: ModeTypeValue): string {
  switch (mode) {
    case "daily": return "Daily";
    case "weekly": return "Weekly";
    case "tutorial": return "Tutorial";
    default: return "Daily";
  }
}

function modeToU8(mode: ModeTypeValue): number {
  switch (mode) {
    case "daily": return 1;
    case "weekly": return 2;
    case "tutorial": return 3;
    default: return 0;
  }
}

function toBoolFelt(value: boolean): number {
  return value ? 1 : 0;
}

function toConfigCalldata(config: GameConfigInput): Array<string | number | bigint> {
  return [
    modeToU8(config.mode),
    config.deckId,
    config.entryPrice,
    config.durationSeconds,
    config.tileLimit,
    toBoolFelt(config.allowDiscard),
    toBoolFelt(config.allowSurrender),
    toBoolFelt(config.privateGame),
    config.accessRoot,
    config.metadataUriHash,
  ];
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

    async createGame(params: CreateGameParams): Promise<TxResult> {
      const configurableAddr = manifest
        ? getContractAddress(manifest, "paved", "Configurable")
        : undefined;

      if (params.templateId !== undefined || params.configInput) {
        const calls: Array<{ contractName: string; entrypoint: string; calldata: any[] }> = [];
        if (configurableAddr) {
          calls.push({
            contractName: "Token",
            entrypoint: "approve",
            calldata: [configurableAddr, `0x${(1e18).toString(16)}`],
          });
        }

        if (params.templateId !== undefined) {
          calls.push({
            contractName: "Configurable",
            entrypoint: "create_with_template",
            calldata: [params.templateId],
          });
          return calls.length === 1
            ? execute(params.account, "Configurable", "create_with_template", [params.templateId])
            : executeMulti(params.account, calls);
        }

        const calldata = toConfigCalldata(params.configInput!);
        calls.push({
          contractName: "Configurable",
          entrypoint: "create_with_config",
          calldata,
        });
        return calls.length === 1
          ? execute(params.account, "Configurable", "create_with_config", calldata)
          : executeMulti(params.account, calls);
      }

      const mode = params.mode ?? "daily";
      const ns = getContractName(mode);
      const contractAddr = manifest ? getContractAddress(manifest, "paved", ns) : undefined;

      if (mode === "tutorial" || !contractAddr) {
        return execute(params.account, ns, "spawn", []);
      }

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

    async mintToken(params: MintTokenParams): Promise<TxResult> {
      return execute(params.account, "Token", "mint", []);
    },

    async previewValidation(params: PreviewValidationParams): Promise<number> {
      const result = await provider.call("paved", {
        contractName: "Configurable",
        entrypoint: "preview_validation",
        calldata: toConfigCalldata(params.configInput),
      });
      if (Array.isArray(result) && result.length > 0) return Number(result[0]);
      if (typeof result === "bigint") return Number(result);
      if (typeof result === "string") return Number(result);
      if (typeof result === "number") return result;
      return 1;
    },

    async previewEconomyMultiplier(
      params: PreviewEconomyMultiplierParams,
    ): Promise<EconomyPreviewResult> {
      const result = await provider.call("paved", {
        contractName: "Economy",
        entrypoint: "preview_multiplier",
        calldata: [params.time],
      });

      const supply = toStringValue(
        readTupleValue(result, 0, ["supply", "last_supply"]),
        "0",
      );
      const target = toStringValue(
        readTupleValue(result, 1, ["target", "last_target"]),
        "0",
      );
      const multiplierFp = Number(
        toStringValue(
          readTupleValue(result, 2, ["multiplier_fp", "last_multiplier_fp"]),
          "0",
        ),
      );

      return { supply, target, multiplierFp };
    },
  };
}
