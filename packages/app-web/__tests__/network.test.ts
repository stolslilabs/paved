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
    // The faucet is a property of the network; it still needs a MockUSDC (none without a file).
    expect(supportsMint).toBe(true);
    expect(deployment.mockUsdc).toBe("");
    expect(tip).toBeUndefined();
  });

  it("env alone can configure the app", () => {
    const { deployment } = resolveAppNetwork(
      { VITE_RPC_URL: "http://x", VITE_CHALLENGE_ADDRESS: "0x2", VITE_SETUP_ADDRESS: "0x3", VITE_TOKEN_ADDRESS: "0x4" },
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

  it("reads every other address from sepolia.json and is not configured while it keys Daily: Challenge is missing", () => {
    expect(SEPOLIA.contracts.Challenge).toBeUndefined();
    const { deployment, indexer } = resolveAppNetwork(env, SEPOLIA_FILES);
    expect(deployment).toMatchObject({ network: "sepolia", configured: false, missing: ["Challenge address"], rpcUrl: SEPOLIA_RPC, deployedBlock: 16421420 });
    expect(deployment.addresses.Challenge).toBe("");
    // Sepolia's file is from before step D: no Setup until the fresh deployment (P-53).
    expect(deployment.addresses.Setup).toBe(SEPOLIA.contracts.Setup?.address ?? "");
    expect(indexer).not.toBeNull();
    const economy = resolveEconomyNetwork(deployment, {}, SEPOLIA_FILES);
    expect(economy.configured).toBe(false);
    expect(economy.missing).toEqual(["Challenge address"]);
    expect(economy.addresses.Economy).toBe(SEPOLIA.contracts.Economy.address);
    expect(economy.addresses.USDC).toBe(SEPOLIA.contracts.MockUSDC.address);
  });

  it("without VITE_RPC_URL it is not connected and says it plainly: the file's placeholder is not a URL", () => {
    const { deployment, supportsMint } = resolveAppNetwork({ VITE_NETWORK: "sepolia" }, SEPOLIA_FILES);
    expect(deployment.configured).toBe(false);
    expect(deployment.rpcUrl).toBe("");
    expect(deployment.missing).toEqual(["Challenge address", "RPC URL"]);
    expect(signerOf(deployment)).toBe("none");
    expect(supportsMint).toBe(true);
  });

  it("offers the faucet, with the MockUSDC of the file, and starknet.js's own tip; no signer while it is not configured", () => {
    const { deployment, supportsMint, tip } = resolveAppNetwork(env, SEPOLIA_FILES);
    expect(deployment.mockUsdc).toBe(SEPOLIA.contracts.MockUSDC.address);
    expect(supportsMint).toBe(true);
    expect(tip).toBeUndefined();
    // The controller signs on a configured Sepolia deployment: the fixture rows below ("elsewhere returns the controller's account").
    expect(signerOf(deployment)).toBe("none");
  });

  it("the faucet can be turned off by VITE_SUPPORTS_TOKEN_MINT=false", () => {
    expect(resolveAppNetwork({ ...env, VITE_SUPPORTS_TOKEN_MINT: "false" }, SEPOLIA_FILES).supportsMint).toBe(false);
  });
});

describe("mainnet never has the faucet", () => {
  const MAINNET = { rpc_url: "http://m/rpc", contracts: { ...DEVNET.contracts, MockUSDC: { address: "0x9" } } };
  const files = { "x/mainnet.json": { default: MAINNET } };

  it("resolves no MockUSDC from its file or from VITE_MOCK_USDC_ADDRESS, and does not offer the faucet", () => {
    for (const env of [{}, { VITE_MOCK_USDC_ADDRESS: "0xa" }]) {
      const { deployment, supportsMint, tip } = resolveAppNetwork({ VITE_NETWORK: "mainnet", ...env }, files);
      expect(deployment.configured).toBe(true);
      expect(deployment.mockUsdc).toBe("");
      expect(supportsMint).toBe(false);
      expect(tip).toBeUndefined();
    }
  });

  it("even with VITE_SUPPORTS_TOKEN_MINT=true there is no MockUSDC, so the Landing (supportsMint && mockUsdc) offers none", () => {
    const { deployment, supportsMint } = resolveAppNetwork({ VITE_NETWORK: "mainnet", VITE_SUPPORTS_TOKEN_MINT: "true", VITE_MOCK_USDC_ADDRESS: "0xa" }, files);
    expect(supportsMint).toBe(true);
    expect(deployment.mockUsdc).toBe("");
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
