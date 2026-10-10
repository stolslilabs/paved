import accountAbi from "../../../contracts/abis/Account.json";
import dailyAbi from "../../../contracts/abis/Daily.json";
import tutorialAbi from "../../../contracts/abis/Tutorial.json";
import tokenAbi from "../../../contracts/abis/Token.json";
import lobbyAbi from "../../../contracts/abis/Lobby.json";
import mockUsdcAbi from "../../../contracts/abis/MockUSDC.json";
import pavedTokenAbi from "../../../contracts/abis/PavedToken.json";
import economyAbi from "../../../contracts/abis/Economy.json";
import vaultAbi from "../../../contracts/abis/Vault.json";
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
 * All of them are CORE's committed ABIs: `PavedToken` and `Vault` (E1), `Economy` (E2), and `Daily` with the paid
 * `spawn(stake, referrer, min_out)` (E3). `USDC` is `MockUSDC.json`: the ERC20 interface (`approve`, `balance_of`,
 * `allowance`) the real USDC exposes too, plus the mock's faucet `mint`.
 */
export type EconomyContractName = "Economy" | "PavedToken" | "Vault" | "USDC" | "Daily";

export const ECONOMY_ABIS: Record<EconomyContractName, Abi> = {
  Economy: economyAbi as Abi,
  PavedToken: pavedTokenAbi as Abi,
  Vault: vaultAbi as Abi,
  USDC: mockUsdcAbi as Abi,
  Daily: dailyAbi as Abi,
};

export type EconomyCodecs = Record<EconomyContractName, AbiCodec>;

export function createEconomyCodecs(abis: Record<EconomyContractName, Abi> = ECONOMY_ABIS): EconomyCodecs {
  return {
    Economy: new AbiCodec(abis.Economy),
    PavedToken: new AbiCodec(abis.PavedToken),
    Vault: new AbiCodec(abis.Vault),
    USDC: new AbiCodec(abis.USDC),
    Daily: new AbiCodec(abis.Daily),
  };
}

/** `MockUSDC.json`: the devnet faucet's `mint(recipient, amount)` is in it (`PavedWriter.mint`). */
export const MOCK_USDC_ABI = mockUsdcAbi as Abi;

/** What one faucet call mints on devnet: 100 USDC (6 decimals), enough for every stake of a day's games. */
export const FAUCET_USDC_AMOUNT = 100_000_000n;

/**
 * `Lobby.json`: Daily runs `Lobby` by library call, so its events (`Reclaimed { tournament_id, sponsor, amount }`) are
 * emitted from Daily's address but are declared in this ABI, not in `Daily.json`.
 */
export const LOBBY_ABI = lobbyAbi as Abi;
