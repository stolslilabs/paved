import accountAbi from "../../../contracts/abis/Account.json";
import dailyAbi from "../../../contracts/abis/Daily.json";
import tutorialAbi from "../../../contracts/abis/Tutorial.json";
import tokenAbi from "../../../contracts/abis/Token.json";
import { AbiCodec, type Abi } from "./codec";

/** The four native contracts, as named in `contracts/abis/` and in the deployments file. */
export type ContractName = "Account" | "Daily" | "Tutorial" | "Token";

export const ABIS: Record<ContractName, Abi> = {
  Account: accountAbi as Abi,
  Daily: dailyAbi as Abi,
  Tutorial: tutorialAbi as Abi,
  Token: tokenAbi as Abi,
};

export type Codecs = Record<ContractName, AbiCodec>;

export function createCodecs(abis: Record<ContractName, Abi> = ABIS): Codecs {
  return {
    Account: new AbiCodec(abis.Account),
    Daily: new AbiCodec(abis.Daily),
    Tutorial: new AbiCodec(abis.Tutorial),
    Token: new AbiCodec(abis.Token),
  };
}
