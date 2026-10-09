import accountAbi from "../../../contracts/abis/Account.json";
import dailyAbi from "../../../contracts/abis/Daily.json";
import tutorialAbi from "../../../contracts/abis/Tutorial.json";
import tokenAbi from "../../../contracts/abis/Token.json";
import pavedTokenAbi from "../../../contracts/abis/PavedToken.json";
import vaultAbi from "../../../contracts/abis/Vault.json";
import { STUB_DAILY_PAID_ABI, STUB_ECONOMY_ABI, STUB_USDC_ABI } from "./economy/stub-abi";
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

// The economy's contracts (P8, `docs/architecture/economy.md`), apart from the four above: their addresses are
// optional until CORE deploys them, so a deployment without them keeps working (`economy/deployment.ts`).

/**
 * `PavedToken` and `Vault` are CORE's real ABIs (E1, #260). `Economy` and `USDC` are **STUBS** until E2/E3
 * commit `contracts/abis/Economy.json` and the MockUSDC ABI; `DailyPaid` is `Daily` with the paid `spawn` of
 * E3 (**STUB**), used for that one call. See `economy/stub-abi.ts`.
 */
export type EconomyContractName = "Economy" | "PavedToken" | "Vault" | "USDC" | "DailyPaid";

export const ECONOMY_ABIS: Record<EconomyContractName, Abi> = {
  Economy: STUB_ECONOMY_ABI,
  PavedToken: pavedTokenAbi as Abi,
  Vault: vaultAbi as Abi,
  USDC: STUB_USDC_ABI,
  DailyPaid: STUB_DAILY_PAID_ABI,
};

export type EconomyCodecs = Record<EconomyContractName, AbiCodec>;

export function createEconomyCodecs(abis: Record<EconomyContractName, Abi> = ECONOMY_ABIS): EconomyCodecs {
  return {
    Economy: new AbiCodec(abis.Economy),
    PavedToken: new AbiCodec(abis.PavedToken),
    Vault: new AbiCodec(abis.Vault),
    USDC: new AbiCodec(abis.USDC),
    DailyPaid: new AbiCodec(abis.DailyPaid),
  };
}
