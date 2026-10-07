import { describe, expect, test } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { DeploymentError, defaultRpcUrl, parseDeployment, readDeployment } from "./deployment.ts";

const committed = resolve(import.meta.dirname, "../../../contracts/deployments/devnet.json");

describe("the deployment file", () => {
  test("the committed devnet.json gives the three addresses, the start block and the chain", () => {
    const deployment = readDeployment(committed);
    const file = JSON.parse(readFileSync(committed, "utf8"));
    expect(deployment).toMatchObject({
      network: "devnet",
      chainId: "0x534e5f5345504f4c4941",
      deployedBlock: file.deployed_block,
      daily: BigInt(file.contracts.Daily.address) === 0n ? "" : `0x${BigInt(file.contracts.Daily.address).toString(16)}`,
    });
    expect(deployment.tutorial).not.toBe(deployment.daily);
    expect(defaultRpcUrl(deployment)).toBe("http://127.0.0.1:5050");
  });

  test("what is missing is named, and nothing else", () => {
    const ok = JSON.parse(readFileSync(committed, "utf8"));
    expect(() => parseDeployment(null)).toThrow(DeploymentError);
    expect(() => parseDeployment({ ...ok, deployed_block: "5" })).toThrow(/deployed_block/);
    expect(() => parseDeployment({ ...ok, chain_id: 5 })).toThrow(/chain_id/);
    expect(() => parseDeployment({ ...ok, contracts: { ...ok.contracts, Daily: {} } })).toThrow(/Daily/);
    expect(() => parseDeployment({ ...ok, contracts: { ...ok.contracts, Account: { address: "0x0" } } })).toThrow(/Account/);
    expect(() => readDeployment("/nonexistent/devnet.json")).toThrow(/cannot read/);
  });

  test("only a local network gives a default node", () => {
    const base = parseDeployment(JSON.parse(readFileSync(committed, "utf8")));
    expect(defaultRpcUrl({ ...base, network: "sepolia", rpcUrl: "http://127.0.0.1:5050" })).toBeUndefined();
    expect(defaultRpcUrl({ ...base, rpcUrl: "https://rpc.example.com" })).toBeUndefined();
    expect(defaultRpcUrl({ ...base, rpcUrl: "http://127.0.0.1:5050@evil:80" })).toBeUndefined();
    expect(defaultRpcUrl({ ...base, rpcUrl: undefined })).toBeUndefined();
  });
});
