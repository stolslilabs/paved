import type { EconomyContractName } from "../abis";
import { MOCK_USDC_NETWORKS, type Deployment, type DeploymentFile } from "../deployment";

/** The deployments file as E3 extends it (economy.md section 6): the economy's contracts under `contracts`. */
export interface EconomyDeploymentFile extends DeploymentFile {
  contracts?: DeploymentFile["contracts"] & Partial<Record<"Economy" | "PavedToken" | "Vault" | "MockUSDC" | "USDC" | "MockRouter", { address?: string }>>;
}

export interface EconomyEnv {
  economy?: string;
  pavedToken?: string;
  vault?: string;
  usdc?: string;
}

/** The addresses the economy client calls, apart from `Deployment`'s (which it also needs: `Challenge`). */
export interface EconomyDeployment {
  /** The game's deployment: `Challenge` takes the purchase. */
  base: Deployment;
  addresses: Record<Exclude<EconomyContractName, "Challenge">, string>;
  /**
   * True when the base deployment is configured and the four economy addresses are known: the only case where the
   * economy screens read or offer a write. False on every deployment until CORE's E2/E3 add the addresses.
   */
  configured: boolean;
  missing: string[];
  /**
   * The only router `Economy.router()` may name for a purchase to be sent (E-9b, ruling 2): `MAINNET_ROUTER` on mainnet,
   * the file's `MockRouter` on devnet and Sepolia, an empty string where none is known (every purchase is refused then).
   * Not part of `configured`: the screens still read.
   */
  expectedRouter: string;
  /**
   * Mainnet, by name or by `chain_id` (`SN_MAIN`), the same test as the router pin's: a guard rate of 0 then refuses
   * every purchase (unexpected, the constructor refuses it: E-9c, ruling 3).
   */
  mainnet: boolean;
}

/**
 * Ekubo's "Router V3.0.13", the router `Economy` must swap through on mainnet (E-9b, CORE's ruling 2, economy.md "For
 * CLIENT"). Never Nums' Router V3.0.3 (`0x04505a…c066`), which has no `quote_swap`. No on-chain pin: when Ekubo
 * publishes a new router, CORE re-runs its fork test and the client updates this constant in the same release.
 */
export const MAINNET_ROUTER = "0x0199741822c2dc722f6f605204f35e56dbc23bceed54818168c4c49e4fb8737e";

/** Starknet mainnet's chain id, `SN_MAIN` as a short string. */
const SN_MAIN = 0x534e5f4d41494en;

function isAddress(value: string | undefined): value is string {
  if (!value) return false;
  try {
    return BigInt(value) !== 0n;
  } catch {
    return false;
  }
}

/**
 * The economy's addresses from the deployments file and the env, the env first. USDC is `contracts.USDC`, else the
 * devnet's `contracts.MockUSDC`. Nothing is assumed: a missing address leaves the economy not configured.
 */
export function resolveEconomyDeployment(input: { base: Deployment; file?: EconomyDeploymentFile | null; env?: EconomyEnv }): EconomyDeployment {
  const contracts = input.file?.contracts ?? {};
  const env = input.env ?? {};
  const pick = (...values: Array<string | undefined>) => values.find(isAddress) ?? "";
  const addresses = {
    Economy: pick(env.economy, contracts.Economy?.address),
    PavedToken: pick(env.pavedToken, contracts.PavedToken?.address),
    Vault: pick(env.vault, contracts.Vault?.address),
    USDC: pick(env.usdc, contracts.USDC?.address, contracts.MockUSDC?.address),
  };
  const missing = [
    ...(input.base.configured ? [] : input.base.missing),
    ...Object.entries(addresses)
      .filter(([, address]) => !address)
      .map(([name]) => `${name} address`),
  ];
  return { base: input.base, addresses, configured: missing.length === 0, missing, expectedRouter: expectedRouterOf(input.base, contracts.MockRouter?.address), mainnet: isMainnet(input.base) };
}

/**
 * Mainnet (by name, or by its chain id whatever the name) pins `MAINNET_ROUTER`. Devnet and Sepolia run on the mocks:
 * the file's `MockRouter`, never the env (a router is not a setting the build may change). Any other network, or a mock
 * network whose file has no `MockRouter`, has none, and refuses every purchase: an unknown router is never accepted.
 */
function expectedRouterOf(base: Deployment, mockRouter: string | undefined): string {
  if (isMainnet(base)) return MAINNET_ROUTER;
  if (MOCK_USDC_NETWORKS.includes(base.network) && isAddress(mockRouter)) return mockRouter;
  return "";
}

/** Mainnet by its name, or by its chain id (`SN_MAIN`) whatever the name. */
function isMainnet(base: Deployment): boolean {
  return base.network === "mainnet" || isMainnetChain(base.chainId);
}

function isMainnetChain(chainId: string): boolean {
  try {
    return chainId !== "" && BigInt(chainId) === SN_MAIN;
  } catch {
    return false;
  }
}
