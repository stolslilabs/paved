/**
 * Test setup only: connects to a local starknet-devnet that `scripts/deploy.sh devnet` has already deployed to, and
 * reads the deployment file it wrote (the same file and the same accounts as `e2e-devnet.test.ts`). It starts and
 * deploys nothing: the economy (Economy, Faucet, PAVED token, Vault, router) is deployed by the script, not rebuilt here.
 *
 *   starknet-devnet --host 127.0.0.1 --port 5050 --seed 42     # fresh node (DEVNET_BIN where it is an asdf shim)
 *   scripts/deploy.sh devnet                                   # or `--unmerged` for a PR's tree (file in a temp dir)
 *
 * Env: `E2E_DEPLOYMENT` (the file; default contracts/deployments/devnet.json), shared with the e2e test.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { Account, RpcProvider } from "starknet";
import { resolveDeployment, type Deployment, type DeploymentFile } from "../../src/deployment";
import { resolveEconomyDeployment, type EconomyDeploymentFile } from "../../src/economy";

const REPO = resolve(__dirname, "../../../..");

export interface DevAccount {
  address: string;
  privateKey: string;
  account: Account;
}

export interface Devnet {
  file: DeploymentFile;
  deployment: Deployment;
  economy: ReturnType<typeof resolveEconomyDeployment>;
  rpcUrl: string;
  provider: RpcProvider;
  /** The predeployed accounts: 0 is the deployer (its smoke game stays in the chain), 1 and up are free for tests. */
  accounts: DevAccount[];
}

export async function rpc(url: string, method: string, params: unknown = {}): Promise<any> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });
  const body = await res.json();
  if (body.error) throw new Error(`${method}: ${JSON.stringify(body.error)}`);
  return body.result;
}

/** Reads the deployment file and connects to the node it names. Throws when the node does not answer. */
export async function connectDevnet(): Promise<Devnet> {
  const path = process.env.E2E_DEPLOYMENT ?? resolve(REPO, "contracts/deployments/devnet.json");
  const file = JSON.parse(readFileSync(path, "utf8")) as DeploymentFile;
  const deployment = resolveDeployment({ network: "devnet", file });
  const economy = resolveEconomyDeployment({ base: deployment, file: file as EconomyDeploymentFile });
  const rpcUrl = deployment.rpcUrl;
  const provider = new RpcProvider({ nodeUrl: rpcUrl });
  const predeployed: Array<{ address: string; private_key: string }> = await rpc(rpcUrl, "devnet_getPredeployedAccounts");
  const accounts = predeployed.map((a) => ({
    address: a.address,
    privateKey: a.private_key,
    account: new Account({ provider, address: a.address, signer: a.private_key }),
  }));
  return { file, deployment, economy, rpcUrl, provider, accounts };
}
