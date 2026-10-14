import challengeAbi from "../../../contracts/abis/Challenge.json";
import setupAbi from "../../../contracts/abis/Setup.json";
import faucetAbi from "../../../contracts/abis/Faucet.json";
import pavedTokenAbi from "../../../contracts/abis/PavedToken.json";
import economyAbi from "../../../contracts/abis/Economy.json";
import vaultAbi from "../../../contracts/abis/Vault.json";
import { AbiCodec, type Abi } from "./codec";

/**
 * The native contracts the writer and the views call, as named in `contracts/abis/` and in the deployments file. `Setup`
 * (D-24, D-25) holds the quests, the achievements, the tutorial claim and the wiring; it is optional in a deployment
 * (`deployment.ts`). `Account` left with D-25 (E): a player is the wallet address, with no registration.
 */
export type ContractName = "Challenge" | "Setup";

export const ABIS: Record<ContractName, Abi> = {
  Challenge: challengeAbi as Abi,
  Setup: setupAbi as Abi,
};

export type Codecs = Record<ContractName, AbiCodec>;

export function createCodecs(abis: Record<ContractName, Abi> = ABIS): Codecs {
  return {
    Challenge: new AbiCodec(abis.Challenge),
    Setup: new AbiCodec(abis.Setup),
  };
}

// The economy's contracts (P8, `docs/architecture/economy.md`), apart from the three above: their addresses are
// optional until CORE deploys them, so a deployment without them keeps working (`economy/deployment.ts`).

/**
 * All of them are CORE's committed ABIs: `PavedToken` and `Vault` (E1), `Economy` (E2), and `Challenge` with the paid
 * `spawn(stake, referrer, min_out)` (E3). `USDC` is `Faucet.json`: the ERC20 interface (`approve`, `balance_of`,
 * `allowance`) the real USDC exposes too, plus the mock's faucet `mint`.
 */
export type EconomyContractName = "Economy" | "PavedToken" | "Vault" | "USDC" | "Challenge";

export const ECONOMY_ABIS: Record<EconomyContractName, Abi> = {
  Economy: economyAbi as Abi,
  PavedToken: pavedTokenAbi as Abi,
  Vault: vaultAbi as Abi,
  USDC: faucetAbi as Abi,
  Challenge: challengeAbi as Abi,
};

export type EconomyCodecs = Record<EconomyContractName, AbiCodec>;

export function createEconomyCodecs(abis: Record<EconomyContractName, Abi> = ECONOMY_ABIS): EconomyCodecs {
  return {
    Economy: new AbiCodec(abis.Economy),
    PavedToken: new AbiCodec(abis.PavedToken),
    Vault: new AbiCodec(abis.Vault),
    USDC: new AbiCodec(abis.USDC),
    Challenge: new AbiCodec(abis.Challenge),
  };
}

/** `Faucet.json`: the faucet's (devnet, Sepolia) `mint(recipient, amount)` is in it (`PavedWriter.mint`). */
export const FAUCET_ABI = faucetAbi as Abi;

/**
 * What one faucet call mints: 100 USDC (6 decimals), enough for every stake of a day's games. Far under the contract's
 * caps (10,000 USDC a call, 20,000 USDC an address in total, `contracts/src/mocks/usdc.cairo`), which still end the
 * faucet for an address after 200 calls: `FaucetCapError`.
 */
export const FAUCET_USDC_AMOUNT = 100_000_000n;
