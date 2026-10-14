import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { DeploymentFile } from "../src/deployment";

/** CORE's committed `contracts/deployments/<network>.json`, as it is. */
export function committedFile(network: "devnet" | "sepolia"): DeploymentFile {
  return JSON.parse(readFileSync(resolve(__dirname, `../../../contracts/deployments/${network}.json`), "utf8")) as DeploymentFile;
}

/** True while the committed file still keys the game contract `Daily` (D-23b renamed it `Challenge`). */
export function namesDaily(file: DeploymentFile): boolean {
  const contracts = (file.contracts ?? {}) as Record<string, unknown>;
  return contracts.Challenge === undefined && contracts.Daily !== undefined;
}

/**
 * The committed file under D-23b's key: `deploy.sh` writes `contracts.Challenge` since D-23b, but the committed devnet.json
 * and sepolia.json are rewritten only by the next deployment (the fresh Sepolia one, P-53). Until then the tests read the
 * old file under the new key; the client itself reads `contracts.Challenge` only (`namesDaily` files are not configured).
 */
export function asChallenge(file: DeploymentFile): DeploymentFile {
  if (!namesDaily(file)) return file;
  const { Daily, ...rest } = file.contracts as Record<string, { address?: string; class_hash?: string }>;
  return { ...file, contracts: { ...rest, Challenge: Daily } } as DeploymentFile;
}
