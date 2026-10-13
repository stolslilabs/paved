import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, test } from "vitest";
import { resolveDeployment, type DeploymentFile } from "../src/deployment";
import { USDC_LABEL, resolveEconomyDeployment } from "../src/economy";

const FILE: DeploymentFile = {
  chain_id: "0x534e5f5345504f4c4941",
  rpc_url: "http://file:5050/rpc",
  deployed_at: "2026-10-07T00:00:00Z",
  deployed_block: 12,
  token: { decimals: 18, symbol: "TKN" },
  contracts: {
    Account: { address: "0x1", class_hash: "0xa" },
    Daily: { address: "0x2", class_hash: "0xb" },
    Setup: { address: "0x3", class_hash: "0xc" },
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
      addresses: { Account: "0x1", Daily: "0x2", Setup: "0x3", Token: "0x4" },
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
    expect(d.addresses).toEqual({ Account: "0x1", Daily: "0x22", Setup: "0x3", Token: "0x4" });
  });

  test("no file and no env: not configured, with what is missing", () => {
    const d = resolveDeployment({ network: "devnet", file: null });
    expect(d.configured).toBe(false);
    expect(d.missing).toEqual(["Account address", "Daily address", "Token address", "RPC URL"]);
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

  test("Setup (D-24) is optional: a file without it stays configured, with an empty Setup address; the env sets it", () => {
    const { Setup: _, ...before } = FILE.contracts!;
    const d = resolveDeployment({ network: "devnet", file: { ...FILE, contracts: before } });
    expect(d.configured).toBe(true);
    expect(d.missing).toEqual([]);
    expect(d.addresses.Setup).toBe("");
    expect(resolveDeployment({ network: "devnet", file: { ...FILE, contracts: before }, env: { addresses: { Setup: "0x33" } } }).addresses.Setup).toBe("0x33");
    // An old file's Tutorial key is not read (D-21).
    const old = { ...FILE, contracts: { ...before, Tutorial: { address: "0x9" } } } as DeploymentFile;
    expect(Object.keys(resolveDeployment({ network: "devnet", file: old }).addresses).sort()).toEqual(["Account", "Daily", "Setup", "Token"]);
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
    expect(policies.filter((p) => p.target === "0x3").map((p) => p.method)).toEqual(["claim_tutorial"]);
    expect(policies.filter((p) => p.method === "approve")).toEqual([]);
    expect(policies.map((p) => p.method)).not.toContain("claim");
  });
});

describe("CORE's real contracts/deployments/devnet.json (O-19, #206)", () => {
  const real = JSON.parse(readFileSync(resolve(__dirname, "../../../contracts/deployments/devnet.json"), "utf8")) as DeploymentFile;

  test("is read as it is: the addresses, rpc url, deployed block, decimals", () => {
    const d = resolveDeployment({ network: "devnet", file: real });
    expect(d.configured).toBe(true);
    expect(d.missing).toEqual([]);
    expect(d.rpcUrl).toBe(real.rpc_url);
    expect(d.chainId).toBe(real.chain_id);
    expect(d.deployedBlock).toBe(real.deployed_block);
    expect(real.token!.decimals).toBe(6); // the entry token is USDC since E3 (MockUSDC on devnet)
    expect(d.tokenDecimals).toBe(real.token!.decimals);
    for (const name of ["Account", "Daily", "Token"] as const) {
      expect(d.addresses[name]).toBe(real.contracts![name]!.address);
    }
    // Setup when the file has one (step D's deploy.sh writes it; a file from before has none).
    expect(d.addresses.Setup).toBe(real.contracts!.Setup?.address ?? "");
    // The top-level token is the entry token, USDC: MockUSDC on devnet (not contracts.Token, the old mock).
    const contracts = real.contracts as Record<string, { address?: string }>;
    expect(BigInt(real.token!.address!)).toBe(BigInt(contracts.MockUSDC.address!));
  });

  test("the env still overrides it", () => {
    const d = resolveDeployment({
      network: "devnet",
      file: real,
      env: { rpcUrl: "http://other:5050", deployedBlock: 99, addresses: { Daily: "0xdead" } },
    });
    expect(d.rpcUrl).toBe("http://other:5050");
    expect(d.deployedBlock).toBe(99);
    expect(d.addresses.Daily).toBe("0xdead");
    expect(d.addresses.Account).toBe(real.contracts!.Account!.address);
  });

  test("a `classes` key (P-26: classes.Lobby, a declared class with no address) changes nothing", () => {
    const withClasses = { ...real, classes: { Lobby: "0x123", Other: "0x456" } } as DeploymentFile;
    const env = { addresses: { Setup: "0x77" } };
    expect(resolveDeployment({ network: "devnet", file: withClasses })).toEqual(resolveDeployment({ network: "devnet", file: real }));
    expect(resolveDeployment({ network: "devnet", file: withClasses, env })).toEqual(resolveDeployment({ network: "devnet", file: real, env }));
    const d = resolveDeployment({ network: "devnet", file: withClasses });
    expect(d.configured).toBe(true);
    expect(d.tokenDecimals).toBe(real.token!.decimals);
    expect(Object.keys(d.addresses).sort()).toEqual(["Account", "Daily", "Setup", "Token"]);
  });

  test("the symbol is never read for display: the label is the client's USDC constant (E3)", () => {
    expect(USDC_LABEL).toBe("USDC");
    expect(Object.keys(resolveDeployment({ network: "devnet", file: real }))).not.toContain("tokenSymbol");
    // Whatever symbol the file carries, the resolved deployment is the same: it is not read.
    const renamed = { ...real, token: { ...real.token, symbol: "LORDS" } } as DeploymentFile;
    expect(resolveDeployment({ network: "devnet", file: renamed })).toEqual(resolveDeployment({ network: "devnet", file: real }));
  });
});

describe("CORE's real contracts/deployments/sepolia.json (S-1, D-16)", () => {
  const real = JSON.parse(readFileSync(resolve(__dirname, "../../../contracts/deployments/sepolia.json"), "utf8")) as DeploymentFile;
  const RPC = "https://api.cartridge.gg/x/starknet/sepolia/rpc/v0_10";
  const contracts = real.contracts as Record<string, { address: string }>;

  test("the file's rpc_url is a placeholder, which is the premise of the tests below", () => {
    expect(real.rpc_url).toBe("$STARKNET_RPC_URL");
  });

  test("with VITE_RPC_URL: every address comes from the file, and the deployment is connected", () => {
    const d = resolveDeployment({ network: "sepolia", file: real, env: { rpcUrl: RPC } });
    expect(d.configured).toBe(true);
    expect(d.missing).toEqual([]);
    expect(d.rpcUrl).toBe(RPC);
    expect(d.chainId).toBe("0x534e5f5345504f4c4941");
    expect(d.deployedBlock).toBe(real.deployed_block);
    expect(d.tokenDecimals).toBe(6);
    for (const name of ["Account", "Daily"] as const) expect(d.addresses[name]).toBe(contracts[name].address);
    // Sepolia's file is from before step D: its Tutorial is not read, and Setup is empty until the fresh deployment (P-53).
    expect(d.addresses.Setup).toBe(contracts.Setup?.address ?? "");
    // The file has no contracts.Token (the old mock was never deployed there): Token is the entry token, the top-level `token`.
    expect(contracts.Token).toBeUndefined();
    expect(d.addresses.Token).toBe(real.token!.address);
    expect(d.collection).toBe(contracts.Collection.address);
  });

  test("the entry token of the file is the MockUSDC, which is the faucet's token", () => {
    const d = resolveDeployment({ network: "sepolia", file: real, env: { rpcUrl: RPC } });
    expect(BigInt(real.token!.address!)).toBe(BigInt(contracts.MockUSDC.address));
    expect(d.mockUsdc).toBe(contracts.MockUSDC.address);
  });

  test("the economy is configured from the same file, on the MockUSDC", () => {
    const base = resolveDeployment({ network: "sepolia", file: real, env: { rpcUrl: RPC } });
    const economy = resolveEconomyDeployment({ base, file: real });
    expect(economy.configured).toBe(true);
    expect(economy.missing).toEqual([]);
    expect(economy.addresses).toEqual({
      Economy: contracts.Economy.address,
      PavedToken: contracts.PavedToken.address,
      Vault: contracts.Vault.address,
      USDC: contracts.MockUSDC.address,
    });
  });

  test("without VITE_RPC_URL the placeholder is never used as a URL: not connected, and it says so", () => {
    for (const env of [undefined, {}, { rpcUrl: "" }, { rpcUrl: "   " }]) {
      const d = resolveDeployment({ network: "sepolia", file: real, env });
      expect(d.rpcUrl).toBe("");
      expect(d.configured).toBe(false);
      expect(d.missing).toEqual(["RPC URL"]);
    }
  });

  test("an unusable rpc_url is skipped for the next source; a URL in the file is used", () => {
    const base = { network: "sepolia", env: { addresses: { Account: "0x1" } } };
    for (const rpc_url of ["$STARKNET_RPC_URL", "${RPC}", "https://x/$KEY", "not a url", "ftp://x", " "]) {
      expect(resolveDeployment({ ...base, file: { ...real, rpc_url } }).rpcUrl, rpc_url).toBe("");
      expect(resolveDeployment({ ...base, file: { ...real, rpc_url }, env: { ...base.env, rpcUrl: RPC } }).rpcUrl, rpc_url).toBe(RPC);
    }
    expect(resolveDeployment({ ...base, file: { ...real, rpc_url: "http://127.0.0.1:5050/rpc" } }).rpcUrl).toBe("http://127.0.0.1:5050/rpc");
  });

  test("mainnet never resolves a MockUSDC, even from this very file", () => {
    const d = resolveDeployment({ network: "mainnet", file: real, env: { rpcUrl: RPC, mockUsdc: contracts.MockUSDC.address } });
    expect(d.mockUsdc).toBe("");
  });
});

describe("the Token address", () => {
  const base = { network: "devnet", env: { rpcUrl: "http://x", addresses: { Account: "0x1", Daily: "0x2" } } };
  const token = { address: "0x7", decimals: 6 };

  test("contracts.Token wins over the top-level token, and the env over both", () => {
    const file = { token, contracts: { Token: { address: "0x4" } } };
    expect(resolveDeployment({ ...base, file }).addresses.Token).toBe("0x4");
    expect(resolveDeployment({ ...base, file, env: { ...base.env, addresses: { ...base.env.addresses, Token: "0x5" } } }).addresses.Token).toBe("0x5");
  });

  test("without contracts.Token the entry token is the top-level token; without either, not connected", () => {
    const d = resolveDeployment({ ...base, file: { token } });
    expect(d.addresses.Token).toBe("0x7");
    expect(d.configured).toBe(true);
    const none = resolveDeployment({ ...base, file: { token: { decimals: 6 } } });
    expect(none.configured).toBe(false);
    expect(none.missing).toEqual(["Token address"]);
  });
});
