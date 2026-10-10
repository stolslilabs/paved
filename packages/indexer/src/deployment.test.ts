import { describe, expect, test } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { DeploymentError, defaultRpcUrl, parseDeployment, readDeployment } from "./deployment.ts";

const committed = resolve(import.meta.dirname, "../../../contracts/deployments/devnet.json");

/** A deployment file as `scripts/deploy.sh devnet` writes it (the fields the indexer reads). */
const FILE = {
  network: "devnet",
  chain_id: "0x534e5f5345504f4c4941",
  rpc_url: "http://127.0.0.1:5050",
  deployed_block: 6,
  contracts: {
    Account: { address: "0x0003" },
    Daily: { address: "0x1" },
    Tutorial: { address: "0x2" },
    Economy: { address: "0x4" },
    Collection: { address: "0x6" },
    PavedToken: { address: "0x5" },
  },
};

describe("the deployment file", () => {
  test("the committed devnet.json gives the five addresses, the start block and the chain", () => {
    const file = JSON.parse(readFileSync(committed, "utf8"));
    // The file is regenerated from main once E3 has merged (scripts/deploy.sh deploys main-equivalent sources only):
    // until then it predates Economy, and the indexer refuses it.
    if (file.contracts?.Economy === undefined) {
      expect(() => readDeployment(committed)).toThrow("the deployment file has no address for Economy");
      return;
    }
    // The file is regenerated from main once E5b has merged: until then it has no Collection, which is optional.
    if (file.contracts?.Collection === undefined) {
      expect(readDeployment(committed).collection).toBeUndefined();
      return;
    }
    const deployment = readDeployment(committed);
    const of = (name: string) => `0x${BigInt(file.contracts[name].address).toString(16)}`;
    expect(deployment).toMatchObject({
      network: "devnet",
      chainId: "0x534e5f5345504f4c4941",
      deployedBlock: file.deployed_block,
      daily: of("Daily"),
      tutorial: of("Tutorial"),
      account: of("Account"),
      economy: of("Economy"),
      collection: of("Collection"),
    });
    expect(new Set([deployment.daily, deployment.tutorial, deployment.account, deployment.economy, deployment.collection]).size).toBe(5);
    expect(defaultRpcUrl(deployment)).toBe("http://127.0.0.1:5050");
  });

  test("the addresses are canonical; the other contracts of the file are not read", () => {
    expect(parseDeployment(FILE)).toEqual({
      network: "devnet",
      chainId: "0x534e5f5345504f4c4941",
      rpcUrl: "http://127.0.0.1:5050",
      deployedBlock: 6,
      daily: "0x1",
      tutorial: "0x2",
      account: "0x3",
      economy: "0x4",
      collection: "0x6",
    });
  });

  test("what is missing is named, and nothing else", () => {
    const ok = FILE;
    expect(() => parseDeployment(null)).toThrow(DeploymentError);
    expect(() => parseDeployment({ ...ok, deployed_block: "5" })).toThrow(/deployed_block/);
    expect(() => parseDeployment({ ...ok, chain_id: 5 })).toThrow(/chain_id/);
    expect(() => parseDeployment({ ...ok, contracts: { ...ok.contracts, Daily: {} } })).toThrow(/Daily/);
    expect(() => parseDeployment({ ...ok, contracts: { ...ok.contracts, Account: { address: "0x0" } } })).toThrow(/Account/);
    // Required since E3: a deployment without its Economy would index half of each paid game.
    const { Economy: _economy, ...before } = ok.contracts;
    expect(() => parseDeployment({ ...ok, contracts: before })).toThrow(/Economy/);
    expect(() => parseDeployment({ ...ok, contracts: { ...ok.contracts, Economy: { address: "0x0" } } })).toThrow(/Economy/);
    // Optional since E5b: without a Collection the mints are not read, but a bad address is still refused.
    const { Collection: _collection, ...without } = ok.contracts;
    expect(parseDeployment({ ...ok, contracts: without }).collection).toBeUndefined();
    expect(() => parseDeployment({ ...ok, contracts: { ...ok.contracts, Collection: { address: "0x0" } } })).toThrow(/Collection/);
    expect(() => readDeployment("/nonexistent/devnet.json")).toThrow(/cannot read/);
  });

  test("only a local network gives a default node", () => {
    const base = parseDeployment(FILE);
    expect(defaultRpcUrl(base)).toBe("http://127.0.0.1:5050");
    expect(defaultRpcUrl({ ...base, network: "sepolia", rpcUrl: "http://127.0.0.1:5050" })).toBeUndefined();
    expect(defaultRpcUrl({ ...base, rpcUrl: "https://rpc.example.com" })).toBeUndefined();
    expect(defaultRpcUrl({ ...base, rpcUrl: "http://127.0.0.1:5050@evil:80" })).toBeUndefined();
    expect(defaultRpcUrl({ ...base, rpcUrl: undefined })).toBeUndefined();
  });
});
