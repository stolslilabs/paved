import type { EconomyContractName } from "../abis";
import type { Deployment, DeploymentFile } from "../deployment";

/** The deployments file as E3 extends it (economy.md section 6): the economy's contracts under `contracts`. */
export interface EconomyDeploymentFile extends DeploymentFile {
  contracts?: DeploymentFile["contracts"] & Partial<Record<"Economy" | "PavedToken" | "Vault" | "MockUSDC" | "USDC", { address?: string }>>;
}

export interface EconomyEnv {
  economy?: string;
  pavedToken?: string;
  vault?: string;
  usdc?: string;
}

/** The addresses the economy client calls, apart from `Deployment`'s four (which it also needs: `Daily`, `Account`). */
export interface EconomyDeployment {
  /** The four contracts' deployment: `Daily` takes the purchase, `Account` registers referrers. */
  base: Deployment;
  addresses: Record<Exclude<EconomyContractName, "DailyPaid">, string>;
  /**
   * True when the base deployment is configured and the four economy addresses are known: the only case where the
   * economy screens read or offer a write. False on every deployment until CORE's E2/E3 add the addresses.
   */
  configured: boolean;
  missing: string[];
}

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
  return { base: input.base, addresses, configured: missing.length === 0, missing };
}
