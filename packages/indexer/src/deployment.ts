// Reads `contracts/deployments/<network>.json` (contracts/deployments/README.md): the five addresses the indexer
// filters on (Daily, Tutorial, Account and Economy are required: every deployment has an Economy since E3, and a file
// without one is refused, since its paid games would be half indexed; Collection, since E5b, is optional: without it the
// mints are not read and no game has a token id), the block it starts from, the chain id, and the node's URL. Nothing else of the file is used.
import { readFileSync } from "node:fs";
import { canonical } from "./events.ts";

export type Deployment = {
  network: string;
  chainId: string;
  rpcUrl: string | undefined;
  /** The first block indexed: the block of the first deploy transaction. */
  deployedBlock: number;
  daily: string;
  tutorial: string;
  account: string;
  economy: string;
  /** Optional: a deployment before E5b has none, and its games carry no token id. */
  collection: string | undefined;
};

const ADDRESS = /^0x[0-9a-fA-F]{1,64}$/;

export class DeploymentError extends Error {}

/** The deployment of a parsed file; a DeploymentError says what is missing, never anything else. */
export function parseDeployment(file: unknown): Deployment {
  const doc = file as Record<string, unknown> | null;
  if (typeof doc !== "object" || doc === null) {
    throw new DeploymentError("the deployment file is not a JSON object");
  }
  const contracts = (doc.contracts ?? {}) as Record<string, { address?: unknown }>;
  const address = (name: string): string => {
    const value = contracts[name]?.address;
    if (typeof value !== "string" || !ADDRESS.test(value) || BigInt(value) === 0n) {
      throw new DeploymentError(`the deployment file has no address for ${name}`);
    }
    return canonical(value);
  };
  const block = doc.deployed_block;
  if (typeof block !== "number" || !Number.isSafeInteger(block) || block < 0) {
    throw new DeploymentError("the deployment file has no deployed_block");
  }
  const chainId = doc.chain_id;
  if (typeof chainId !== "string" || !ADDRESS.test(chainId)) {
    throw new DeploymentError("the deployment file has no chain_id");
  }
  return {
    network: typeof doc.network === "string" ? doc.network : "",
    chainId: canonical(chainId),
    rpcUrl: typeof doc.rpc_url === "string" ? doc.rpc_url : undefined,
    deployedBlock: block,
    daily: address("Daily"),
    tutorial: address("Tutorial"),
    account: address("Account"),
    economy: address("Economy"),
    collection: contracts.Collection === undefined ? undefined : address("Collection"),
  };
}

export function readDeployment(path: string): Deployment {
  let text: string;
  try {
    text = readFileSync(path, "utf8");
  } catch {
    throw new DeploymentError(`cannot read the deployment file ${path}`);
  }
  try {
    return parseDeployment(JSON.parse(text));
  } catch (error) {
    if (error instanceof DeploymentError) throw error;
    throw new DeploymentError("the deployment file is not JSON");
  }
}

const LOCAL = /^https?:\/\/(127\.0\.0\.1|localhost|\[::1\])(:\d+)?(\/.*)?$/;

/** The deployment file's `rpc_url` as a default node: only on a local network, only at localhost. */
export function defaultRpcUrl(deployment: Deployment): string | undefined {
  return deployment.network === "devnet" &&
    deployment.rpcUrl !== undefined &&
    LOCAL.test(deployment.rpcUrl)
    ? deployment.rpcUrl
    : undefined;
}
