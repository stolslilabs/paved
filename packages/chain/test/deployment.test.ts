import { describe, expect, test } from "vitest";
import { resolveDeployment, type DeploymentFile } from "../src/deployment";

const FILE: DeploymentFile = {
  chain_id: "0x534e5f5345504f4c4941",
  rpc_url: "http://file:5050/rpc",
  deployed_at: "2026-10-07T00:00:00Z",
  deployed_block: 12,
  token: { decimals: 18, symbol: "TKN" },
  contracts: {
    Account: { address: "0x1", class_hash: "0xa" },
    Daily: { address: "0x2", class_hash: "0xb" },
    Tutorial: { address: "0x3", class_hash: "0xc" },
    Token: { address: "0x4", class_hash: "0xd" },
  },
};

describe("resolveDeployment", () => {
  test("reads the deployments file", () => {
    const d = resolveDeployment({ network: "devnet", file: FILE });
    expect(d).toMatchObject({
      rpcUrl: "http://file:5050/rpc",
      deployedBlock: 12,
      tokenDecimals: 18,
      addresses: { Account: "0x1", Daily: "0x2", Tutorial: "0x3", Token: "0x4" },
      configured: true,
      missing: [],
    });
  });

  test("the environment overrides the file", () => {
    const d = resolveDeployment({
      network: "devnet",
      file: FILE,
      env: { rpcUrl: "http://env/rpc", deployedBlock: "40", addresses: { Daily: "0x22" } },
    });
    expect(d.rpcUrl).toBe("http://env/rpc");
    expect(d.deployedBlock).toBe(40);
    expect(d.addresses).toEqual({ Account: "0x1", Daily: "0x22", Tutorial: "0x3", Token: "0x4" });
  });

  test("no file and no env: not configured, with what is missing", () => {
    const d = resolveDeployment({ network: "devnet", file: null });
    expect(d.configured).toBe(false);
    expect(d.missing).toEqual(["Account address", "Daily address", "Tutorial address", "Token address", "RPC URL"]);
    expect(d.deployedBlock).toBe(0);
  });

  test("one missing or zero address is enough to be not configured", () => {
    const d = resolveDeployment({
      network: "devnet",
      file: { ...FILE, contracts: { ...FILE.contracts, Token: { address: "0x0" } } },
    });
    expect(d.configured).toBe(false);
    expect(d.missing).toEqual(["Token address"]);
    expect(d.addresses.Token).toBe("");
  });

  test("an empty or invalid env value does not override", () => {
    const d = resolveDeployment({ network: "devnet", file: FILE, env: { rpcUrl: "", deployedBlock: "x", addresses: { Account: "" } } });
    expect(d.rpcUrl).toBe(FILE.rpc_url);
    expect(d.deployedBlock).toBe(12);
    expect(d.addresses.Account).toBe("0x1");
  });
});

describe("controllerPolicies", () => {
  test("lists the writes of the game on the deployment's addresses", async () => {
    const { controllerPolicies } = await import("../src/auth/controller");
    const policies = controllerPolicies(resolveDeployment({ network: "devnet", file: FILE }));
    expect(policies).toContainEqual({ target: "0x2", method: "build" });
    expect(policies).toContainEqual({ target: "0x3", method: "spawn" });
    expect(policies).toContainEqual({ target: "0x4", method: "approve" });
    expect(policies.filter((p) => p.target === "0x3").map((p) => p.method)).not.toContain("claim");
  });
});
