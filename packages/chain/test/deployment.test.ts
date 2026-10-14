import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, test } from "vitest";
import { resolveDeployment, type DeploymentFile } from "../src/deployment";
import { USDC_LABEL, resolveEconomyDeployment } from "../src/economy";

/** CORE's committed `contracts/deployments/<network>.json`, as it is. */
const committedFile = (network: "devnet" | "sepolia") =>
  JSON.parse(readFileSync(resolve(__dirname, `../../../contracts/deployments/${network}.json`), "utf8")) as DeploymentFile;


const FILE: DeploymentFile = {
  chain_id: "0x534e5f5345504f4c4941",
  rpc_url: "http://file:5050/rpc",
  deployed_at: "2026-10-07T00:00:00Z",
  deployed_block: 12,
  token: { decimals: 18, symbol: "TKN" },
  contracts: {
    Challenge: { address: "0x2", class_hash: "0xb" },
    Setup: { address: "0x3", class_hash: "0xc" },
  },
};

describe("resolveDeployment", () => {
  test("reads the deployments file", () => {
    const d = resolveDeployment({ network: "devnet", file: FILE });
    expect(d).toMatchObject({
      rpcUrl: "http://file:5050/rpc",
      deployedBlock: 12,
      tokenDecimals: 18,
      addresses: { Challenge: "0x2", Setup: "0x3" },
      configured: true,
      missing: [],
    });
  });

  test("the environment overrides the file", () => {
    const d = resolveDeployment({
      network: "devnet",
      file: FILE,
      env: { rpcUrl: "http://env/rpc", deployedBlock: "40", addresses: { Challenge: "0x22" } },
    });
    expect(d.rpcUrl).toBe("http://env/rpc");
    expect(d.deployedBlock).toBe(40);
    expect(d.addresses).toEqual({ Challenge: "0x22", Setup: "0x3" });
  });

  test("no file and no env: not configured, with what is missing", () => {
    const d = resolveDeployment({ network: "devnet", file: null });
    expect(d.configured).toBe(false);
    expect(d.missing).toEqual(["Challenge address", "RPC URL"]);
    expect(d.deployedBlock).toBe(0);
  });

  test("a missing or zero Challenge address is enough to be not configured", () => {
    const d = resolveDeployment({
      network: "devnet",
      file: { ...FILE, contracts: { ...FILE.contracts, Challenge: { address: "0x0" } } },
    });
    expect(d.configured).toBe(false);
    expect(d.missing).toEqual(["Challenge address"]);
    expect(d.addresses.Challenge).toBe("");
  });

  test("Setup (D-24) is optional: a file without it stays configured, with an empty Setup address; the env sets it", () => {
    const { Setup: _, ...before } = FILE.contracts!;
    const d = resolveDeployment({ network: "devnet", file: { ...FILE, contracts: before } });
    expect(d.configured).toBe(true);
    expect(d.missing).toEqual([]);
    expect(d.addresses.Setup).toBe("");
    expect(resolveDeployment({ network: "devnet", file: { ...FILE, contracts: before }, env: { addresses: { Setup: "0x33" } } }).addresses.Setup).toBe("0x33");
    // An old file's Tutorial (D-21) and Account (D-25 (E)) keys are not read.
    const old = { ...FILE, contracts: { ...before, Tutorial: { address: "0x9" }, Account: { address: "0x1" } } } as DeploymentFile;
    expect(Object.keys(resolveDeployment({ network: "devnet", file: old }).addresses).sort()).toEqual(["Challenge", "Setup"]);
  });

  test("Account is not required since D-25 (E): a file without it is configured, one with it is read without it", () => {
    const d = resolveDeployment({ network: "devnet", file: FILE });
    expect(d.configured).toBe(true);
    expect(d.addresses).not.toHaveProperty("Account");
    const old = { ...FILE, contracts: { ...FILE.contracts, Account: { address: "0x1" } } } as DeploymentFile;
    expect(resolveDeployment({ network: "devnet", file: old })).toEqual(d);
  });

  test("an empty or invalid env value does not override", () => {
    const d = resolveDeployment({ network: "devnet", file: FILE, env: { rpcUrl: "", deployedBlock: "x", addresses: { Challenge: "" } } });
    expect(d.rpcUrl).toBe(FILE.rpc_url);
    expect(d.deployedBlock).toBe(12);
    expect(d.addresses.Challenge).toBe("0x2");
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
  const real = committedFile("devnet");

  test("is read as it is: the addresses, rpc url, deployed block, decimals", () => {
    const d = resolveDeployment({ network: "devnet", file: real });
    expect(d.configured).toBe(true);
    expect(d.missing).toEqual([]);
    expect(d.rpcUrl).toBe(real.rpc_url);
    expect(d.chainId).toBe(real.chain_id);
    expect(d.deployedBlock).toBe(real.deployed_block);
    expect(real.token!.decimals).toBe(6); // the entry token is USDC since E3 (Faucet on devnet)
    expect(d.tokenDecimals).toBe(real.token!.decimals);
    expect(d.addresses.Challenge).toBe(real.contracts!.Challenge!.address);
    // The old Token is gone from CORE's file (one key per contract): the client has no Token address to read.
    expect(Object.keys(real.contracts!)).not.toContain("Token");
    expect(d.faucet).toBe(real.contracts!.Faucet!.address);
    // Setup when the file has one (step D's deploy.sh writes it; a file from before has none).
    expect(d.addresses.Setup).toBe(real.contracts!.Setup?.address ?? "");
    // The top-level token is the entry token, USDC: Faucet on devnet (not contracts.Token, the old mock).
    const contracts = real.contracts as Record<string, { address?: string }>;
    expect(BigInt(real.token!.address!)).toBe(BigInt(contracts.Faucet.address!));
  });

  test("the env still overrides it", () => {
    const d = resolveDeployment({
      network: "devnet",
      file: real,
      env: { rpcUrl: "http://other:5050", deployedBlock: 99, addresses: { Challenge: "0xdead" } },
    });
    expect(d.rpcUrl).toBe("http://other:5050");
    expect(d.deployedBlock).toBe(99);
    expect(d.addresses.Challenge).toBe("0xdead");
  });

  test("a `classes` key (P-26: classes.Lobby, a declared class with no address) changes nothing", () => {
    const withClasses = { ...real, classes: { Lobby: "0x123", Other: "0x456" } } as DeploymentFile;
    const env = { addresses: { Setup: "0x77" } };
    expect(resolveDeployment({ network: "devnet", file: withClasses })).toEqual(resolveDeployment({ network: "devnet", file: real }));
    expect(resolveDeployment({ network: "devnet", file: withClasses, env })).toEqual(resolveDeployment({ network: "devnet", file: real, env }));
    const d = resolveDeployment({ network: "devnet", file: withClasses });
    expect(d.configured).toBe(true);
    expect(d.tokenDecimals).toBe(real.token!.decimals);
    expect(Object.keys(d.addresses).sort()).toEqual(["Challenge", "Setup"]);
  });

  test("the symbol is never read for display: the label is the client's USDC constant (E3)", () => {
    expect(USDC_LABEL).toBe("USDC");
    expect(Object.keys(resolveDeployment({ network: "devnet", file: real }))).not.toContain("tokenSymbol");
    // Whatever symbol the file carries, the resolved deployment is the same: it is not read.
    const renamed = { ...real, token: { ...real.token, symbol: "LORDS" } } as DeploymentFile;
    expect(resolveDeployment({ network: "devnet", file: renamed })).toEqual(resolveDeployment({ network: "devnet", file: real }));
  });
});

// The committed sepolia.json is the fresh deployment F (part B): one key per contract. These tests read every value from the file;
// the only pinned values are the network, its chain id (a constant of the network, not of the file) and the key set.
describe("CORE's real contracts/deployments/sepolia.json (S-1, D-16), the fresh deployment F", () => {
  const real = committedFile("sepolia");
  const RPC = "https://api.cartridge.gg/x/starknet/sepolia/rpc/v0_10";
  const contracts = real.contracts as Record<string, { address: string }>;
  const SEPOLIA_CHAIN_ID = "0x534e5f5345504f4c4941";

  test("the file is the fresh one: one key per contract, none of the old keys, and a placeholder rpc_url", () => {
    expect(Object.keys(contracts).sort()).toEqual(["Challenge", "Collection", "Economy", "Faucet", "MockRouter", "PavedToken", "Setup", "Vault"]);
    expect(real.chain_id).toBe(SEPOLIA_CHAIN_ID);
    expect(real.rpc_url).toBe("$STARKNET_RPC_URL");
  });

  test("with VITE_RPC_URL: configured, with the file's Challenge, Setup and Collection", () => {
    const d = resolveDeployment({ network: "sepolia", file: real, env: { rpcUrl: RPC } });
    expect(d.configured).toBe(true);
    expect(d.missing).toEqual([]);
    expect(d.rpcUrl).toBe(RPC);
    expect(d.chainId).toBe(real.chain_id);
    expect(d.deployedBlock).toBe(real.deployed_block);
    expect(d.tokenDecimals).toBe(real.token!.decimals);
    expect(d.addresses.Challenge).toBe(contracts.Challenge.address);
    expect(d.addresses.Setup).toBe(contracts.Setup.address);
    // The entry token is read from Challenge.entry_price at run time, not from the file.
    expect(Object.keys(d.addresses).sort()).toEqual(["Challenge", "Setup"]);
    expect(d.collection).toBe(contracts.Collection.address);
  });

  test("the faucet is the file's contracts.Faucet, whatever the env says", () => {
    const d = resolveDeployment({ network: "sepolia", file: real, env: { rpcUrl: RPC } });
    expect(d.faucet).toBe(contracts.Faucet.address);
    expect(d.faucet).toBe(real.token!.address);
    expect(resolveDeployment({ network: "sepolia", file: real, env: { rpcUrl: RPC, faucet: "0x1234" } as never }).faucet).toBe(contracts.Faucet.address);
  });

  test("the economy is configured on the Faucet, with the file's Economy, PavedToken and Vault, and the router is MockRouter", () => {
    const base = resolveDeployment({ network: "sepolia", file: real, env: { rpcUrl: RPC } });
    const economy = resolveEconomyDeployment({ base, file: real });
    expect(economy.configured).toBe(true);
    expect(economy.missing).toEqual([]);
    expect(economy.addresses).toEqual({
      Economy: contracts.Economy.address,
      PavedToken: contracts.PavedToken.address,
      Vault: contracts.Vault.address,
      USDC: contracts.Faucet.address,
    });
    expect(economy.expectedRouter).toBe(contracts.MockRouter.address);
    expect(economy.mainnet).toBe(false);
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
    const base = { network: "sepolia", env: { addresses: { Challenge: "0x2" } } };
    for (const rpc_url of ["$STARKNET_RPC_URL", "${RPC}", "https://x/$KEY", "not a url", "ftp://x", " "]) {
      expect(resolveDeployment({ ...base, file: { ...real, rpc_url } }).rpcUrl, rpc_url).toBe("");
      expect(resolveDeployment({ ...base, file: { ...real, rpc_url }, env: { ...base.env, rpcUrl: RPC } }).rpcUrl, rpc_url).toBe(RPC);
    }
    expect(resolveDeployment({ ...base, file: { ...real, rpc_url: "http://127.0.0.1:5050/rpc" } }).rpcUrl).toBe("http://127.0.0.1:5050/rpc");
  });

  test("mainnet never resolves a Faucet, even from this very file", () => {
    const d = resolveDeployment({ network: "mainnet", file: real, env: { rpcUrl: RPC } });
    expect(d.faucet).toBe("");
  });
});

// The file from before F (keys `Daily` and `MockUSDC`, no Challenge, Faucet or Setup), kept as a fixture: the not-configured path.
describe("a Sepolia file from before F (fixture): not configured, nothing guessed", () => {
  const RPC = "https://api.cartridge.gg/x/starknet/sepolia/rpc/v0_10";
  const OLD: DeploymentFile = {
    chain_id: "0x534e5f5345504f4c4941",
    rpc_url: "$STARKNET_RPC_URL",
    deployed_block: 16421420,
    token: { address: "0x5", decimals: 6, symbol: "USDC" },
    contracts: {
      Daily: { address: "0x1" },
      MockUSDC: { address: "0x5" },
      Collection: { address: "0x6" },
      Economy: { address: "0x7" },
      PavedToken: { address: "0x8" },
      Vault: { address: "0x9" },
    } as DeploymentFile["contracts"],
  };

  test("Challenge is missing, no Setup and no faucet: the old MockUSDC is not read", () => {
    const d = resolveDeployment({ network: "sepolia", file: OLD, env: { rpcUrl: RPC } });
    expect(d.configured).toBe(false);
    expect(d.missing).toEqual(["Challenge address"]);
    expect(d.addresses).toEqual({ Challenge: "", Setup: "" });
    expect(d.faucet).toBe("");
    expect(d.collection).toBe("0x6");
  });

  test("the economy is not configured either: Challenge and USDC are missing", () => {
    const base = resolveDeployment({ network: "sepolia", file: OLD, env: { rpcUrl: RPC } });
    const economy = resolveEconomyDeployment({ base, file: OLD });
    expect(economy.configured).toBe(false);
    expect(economy.missing).toEqual(["Challenge address", "USDC address"]);
    expect(economy.expectedRouter).toBe("");
  });
});

describe("the entry token", () => {
  test("the old Token key is not read: a file or env naming it changes nothing", () => {
    const base = { network: "devnet", env: { rpcUrl: "http://x", addresses: { Challenge: "0x2" } } };
    const withToken = { token: { address: "0x7", decimals: 6 }, contracts: { Token: { address: "0x4" } } } as unknown as DeploymentFile;
    const d = resolveDeployment({ ...base, file: withToken });
    expect(d.configured).toBe(true);
    expect(Object.keys(d.addresses).sort()).toEqual(["Challenge", "Setup"]);
  });
});
