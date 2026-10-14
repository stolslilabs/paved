import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { resolveEconomyNetwork } from "../src/utils/economy-network";
import { resolveAppNetwork, resolvePlayerAccount, signerOf } from "../src/utils/network";

const DEVNET = {
  rpc_url: "http://127.0.0.1:5050/rpc",
  deployed_block: 3,
  contracts: { Challenge: { address: "0x2" }, Setup: { address: "0x3" }, Token: { address: "0x4" } },
};
const FILES = { "../../../../contracts/deployments/devnet.json": { default: DEVNET } };

describe("resolveAppNetwork", () => {
  it("reads contracts/deployments/devnet.json by default", () => {
    const { deployment, supportsMint, tip } = resolveAppNetwork({}, FILES);
    expect(deployment).toMatchObject({ network: "devnet", configured: true, deployedBlock: 3, rpcUrl: DEVNET.rpc_url });
    expect(supportsMint).toBe(true);
    expect(tip).toBe(0n);
  });

  it("env overrides the file", () => {
    const { deployment } = resolveAppNetwork({ VITE_CHALLENGE_ADDRESS: "0x22", VITE_RPC_URL: "http://x/rpc" }, FILES);
    expect(deployment.addresses.Challenge).toBe("0x22");
    expect(deployment.rpcUrl).toBe("http://x/rpc");
  });

  it("no file for the network and no env: not configured", () => {
    const { deployment, supportsMint, tip } = resolveAppNetwork({ VITE_NETWORK: "sepolia" }, FILES);
    expect(deployment.configured).toBe(false);
    expect(deployment.missing).toContain("Challenge address");
    // The faucet is a property of the network; it still needs a Faucet (none without a file).
    expect(supportsMint).toBe(true);
    expect(deployment.faucet).toBe("");
    expect(tip).toBeUndefined();
  });

  it("env alone can configure the app", () => {
    const { deployment } = resolveAppNetwork(
      { VITE_RPC_URL: "http://x", VITE_CHALLENGE_ADDRESS: "0x2", VITE_SETUP_ADDRESS: "0x3" },
      {},
    );
    expect(deployment.configured).toBe(true);
    expect(deployment.addresses.Setup).toBe("0x3");
  });
});

// The committed sepolia.json keeps the `Daily` key until the fresh deployment F (PM's ruling, P-53): main's client never goes
// to Sepolia before F, so it is read as it is and resolves as not configured, with only the Challenge address missing.
const SEPOLIA = JSON.parse(readFileSync(resolve(__dirname, "../../../contracts/deployments/sepolia.json"), "utf8")) as { contracts: Record<string, { address: string }> };
const SEPOLIA_FILES = { "../../../contracts/deployments/sepolia.json": { default: SEPOLIA }, ...FILES };
const SEPOLIA_RPC = "https://api.cartridge.gg/x/starknet/sepolia/rpc/v0_10";

describe("the Sepolia build (VITE_NETWORK=sepolia, D-16)", () => {
  const env = { VITE_NETWORK: "sepolia", VITE_RPC_URL: SEPOLIA_RPC, VITE_INDEXER_URL: "https://api.paved.bal7hazar.com" };

  it("reads every other address from sepolia.json and is not configured while it keys Daily and MockUSDC: Challenge and USDC are missing", () => {
    expect(SEPOLIA.contracts.Challenge).toBeUndefined();
    const { deployment, indexer } = resolveAppNetwork(env, SEPOLIA_FILES);
    expect(deployment).toMatchObject({ network: "sepolia", configured: false, missing: ["Challenge address"], rpcUrl: SEPOLIA_RPC, deployedBlock: 16421420 });
    expect(deployment.addresses.Challenge).toBe("");
    // Sepolia's file is from before step D: no Setup until the fresh deployment (P-53).
    expect(deployment.addresses.Setup).toBe(SEPOLIA.contracts.Setup?.address ?? "");
    expect(indexer).not.toBeNull();
    const economy = resolveEconomyNetwork(deployment, {}, SEPOLIA_FILES);
    expect(economy.configured).toBe(false);
    // The file keys the old MockUSDC, which the client no longer reads (`contracts.Faucet` only): no USDC until F writes it.
    expect(SEPOLIA.contracts.Faucet).toBeUndefined();
    expect(economy.missing).toEqual(["Challenge address", "USDC address"]);
    expect(economy.addresses.Economy).toBe(SEPOLIA.contracts.Economy.address);
    expect(economy.addresses.USDC).toBe("");
  });

  it("without VITE_RPC_URL it is not connected and says it plainly: the file's placeholder is not a URL", () => {
    const { deployment, supportsMint } = resolveAppNetwork({ VITE_NETWORK: "sepolia" }, SEPOLIA_FILES);
    expect(deployment.configured).toBe(false);
    expect(deployment.rpcUrl).toBe("");
    expect(deployment.missing).toEqual(["Challenge address", "RPC URL"]);
    expect(signerOf(deployment)).toBe("none");
    expect(supportsMint).toBe(true);
  });

  it("the faucet is a property of the network (on), but the file keys MockUSDC so no faucet address resolves until F; starknet.js's own tip; no signer while it is not configured", () => {
    const { deployment, supportsMint, tip } = resolveAppNetwork(env, SEPOLIA_FILES);
    expect(deployment.faucet).toBe("");
    expect(supportsMint).toBe(true);
    expect(tip).toBeUndefined();
    // The controller signs on a configured Sepolia deployment: the fixture rows below ("elsewhere returns the controller's account").
    expect(signerOf(deployment)).toBe("none");
  });

  it("the faucet can be turned off by VITE_SUPPORTS_TOKEN_MINT=false", () => {
    expect(resolveAppNetwork({ ...env, VITE_SUPPORTS_TOKEN_MINT: "false" }, SEPOLIA_FILES).supportsMint).toBe(false);
  });
});

describe("the faucet is the file's contracts.Faucet and nothing else", () => {
  it("VITE_FAUCET_ADDRESS (no longer a setting) changes nothing on devnet or Sepolia", () => {
    const file = { rpc_url: "http://n/rpc", contracts: { ...DEVNET.contracts, Faucet: { address: "0x9" } } };
    for (const network of ["devnet", "sepolia"]) {
      const files = { [`x/${network}.json`]: { default: file } };
      const plain = resolveAppNetwork({ VITE_NETWORK: network, VITE_RPC_URL: "http://n/rpc" }, files).deployment;
      const stray = resolveAppNetwork({ VITE_NETWORK: network, VITE_RPC_URL: "http://n/rpc", VITE_FAUCET_ADDRESS: "0xa" }, files).deployment;
      expect(plain.faucet, network).toBe("0x9");
      expect(stray.faucet, network).toBe("0x9");
    }
  });
});

describe("mainnet never has the faucet", () => {
  const MAINNET = { rpc_url: "http://m/rpc", contracts: { ...DEVNET.contracts, Faucet: { address: "0x9" } } };
  const files = { "x/mainnet.json": { default: MAINNET } };

  it("resolves no Faucet from its file, and does not offer the faucet", () => {
    for (const env of [{}, { VITE_FAUCET_ADDRESS: "0xa" }]) {
      const { deployment, supportsMint, tip } = resolveAppNetwork({ VITE_NETWORK: "mainnet", ...env }, files);
      expect(deployment.configured).toBe(true);
      expect(deployment.faucet).toBe("");
      expect(supportsMint).toBe(false);
      expect(tip).toBeUndefined();
    }
  });

  it("even with VITE_SUPPORTS_TOKEN_MINT=true there is no Faucet, so the Landing (supportsMint && faucet) offers none", () => {
    const { deployment, supportsMint } = resolveAppNetwork({ VITE_NETWORK: "mainnet", VITE_SUPPORTS_TOKEN_MINT: "true" }, files);
    expect(supportsMint).toBe(true);
    expect(deployment.faucet).toBe("");
  });
});

describe("resolvePlayerAccount", () => {
  it("reads the indexer URL from VITE_INDEXER_URL, and has no client without it", () => {
    expect(resolveAppNetwork({}, FILES).indexer).toBeNull();
    expect(resolveAppNetwork({ VITE_INDEXER_URL: "  " }, FILES).indexer).toBeNull();
    expect(resolveAppNetwork({ VITE_INDEXER_URL: "http://localhost:8080" }, FILES).indexer).not.toBeNull();
  });

  it("is null without a key, or when the deployment is not configured", () => {
    const { deployment } = resolveAppNetwork({}, FILES);
    expect(resolvePlayerAccount({}, deployment)).toBeNull();
    const off = resolveAppNetwork({ VITE_NETWORK: "none" }, {}).deployment;
    expect(resolvePlayerAccount({ VITE_PLAYER_ADDRESS: "0x5", VITE_PLAYER_PRIVATE_KEY: "0x6" }, off)).toBeNull();
  });

  it("takes a key from the env on devnet only", () => {
    const sepolia = { rpc_url: "http://s/rpc", contracts: DEVNET.contracts };
    const { deployment } = resolveAppNetwork({ VITE_NETWORK: "sepolia" }, { "x/sepolia.json": { default: sepolia } });
    expect(deployment.configured).toBe(true);
    expect(resolvePlayerAccount({ VITE_PLAYER_ADDRESS: "0x5", VITE_PLAYER_PRIVATE_KEY: "0x6" }, deployment)).toBeNull();
  });

  it("builds an account from the player's address and key", () => {
    const { deployment } = resolveAppNetwork({}, FILES);
    expect(resolvePlayerAccount({ VITE_PLAYER_ADDRESS: "0x5", VITE_PLAYER_PRIVATE_KEY: "0x6" }, deployment)?.address).toBe("0x5");
  });

  it("elsewhere returns the controller's account once connected, and never the env's key (P-14)", () => {
    const sepolia = { rpc_url: "http://s/rpc", contracts: DEVNET.contracts };
    const { deployment } = resolveAppNetwork({ VITE_NETWORK: "sepolia" }, { "x/sepolia.json": { default: sepolia } });
    const controller = { address: "0xc", execute: async () => ({ transaction_hash: "0x0" }) };
    const keys = { VITE_PLAYER_ADDRESS: "0x5", VITE_PLAYER_PRIVATE_KEY: "0x6" };
    expect(signerOf(deployment)).toBe("controller");
    expect(resolvePlayerAccount(keys, deployment, controller)).toBe(controller);
    expect(resolvePlayerAccount(keys, deployment, null)).toBeNull();
  });

  it("devnet keeps the burner; a deployment not configured has no signer", () => {
    const { deployment } = resolveAppNetwork({}, FILES);
    const controller = { address: "0xc", execute: async () => ({ transaction_hash: "0x0" }) };
    expect(signerOf(deployment)).toBe("burner");
    expect(resolvePlayerAccount({ VITE_PLAYER_ADDRESS: "0x5", VITE_PLAYER_PRIVATE_KEY: "0x6" }, deployment, controller)?.address).toBe("0x5");
    const off = resolveAppNetwork({ VITE_NETWORK: "sepolia" }, {}).deployment;
    expect(signerOf(off)).toBe("none");
    expect(resolvePlayerAccount({}, off, controller)).toBeNull();
  });
});
